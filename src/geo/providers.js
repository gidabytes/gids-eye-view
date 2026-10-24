/**
 * GEV-GEO providers. Each provider normalizes one external source into the
 * shared record() shape (data + provenance). No provider fabricates data:
 * missing coverage is returned as { available: false, reason }.
 *
 * Default sources (all keyless, open data; see docs/GEO.md for policies):
 *   geocode   Photon (komoot, OSM)        fallback Nominatim (OSMF, 1 req/s)
 *   places    Overpass API (OSM)
 *   routing   OSRM @ routing.openstreetmap.de (FOSSGIS) — same as the app's /api/route
 *   optimize  Valhalla @ valhalla1.openstreetmap.de (FOSSGIS)
 *   elevation Open-Meteo (Copernicus GLO-90)  fallback OpenTopoData (SRTM 90 m)
 *   weather / solar / timezone  Open-Meteo forecast API
 *   air quality / pollen        Open-Meteo air-quality API (CAMS)
 *   imagery   Panoramax (street level), OpenAerialMap (aerial)
 */
import {
  GeoError,
  point,
  clampRadius,
  haversineM,
  bboxAround,
  record,
  TtlCache,
  memo,
} from './core.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

export const DEFAULT_ENDPOINTS = Object.freeze({
  photon: 'https://photon.komoot.io',
  nominatim: 'https://nominatim.openstreetmap.org',
  overpass: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],
  osrm: 'https://routing.openstreetmap.de',
  valhalla: 'https://valhalla1.openstreetmap.de',
  openMeteo: 'https://api.open-meteo.com',
  airQuality: 'https://air-quality-api.open-meteo.com',
  openTopoData: 'https://api.opentopodata.org',
  panoramax: 'https://api.panoramax.xyz',
  openAerialMap: 'https://api.openaerialmap.org',
});

/** Minimum spacing per host, from each service's published usage policy. */
export const HOST_SPACING_MS = Object.freeze({
  'nominatim.openstreetmap.org': 1100, // OSMF policy: max 1 req/s
  'api.opentopodata.org': 1100, // public API: 1 req/s
  'overpass-api.de': 1000,
  'overpass.kumi.systems': 1000,
  'valhalla1.openstreetmap.de': 1000,
  'routing.openstreetmap.de': 300,
});

export const ATTRIBUTION = Object.freeze({
  osm: '© OpenStreetMap contributors (ODbL)',
  photon: 'Search: Photon by komoot · © OpenStreetMap contributors',
  nominatim: 'Search: Nominatim · © OpenStreetMap contributors',
  overpass: 'Places: Overpass API · © OpenStreetMap contributors',
  osrm: 'Routing: OSRM (FOSSGIS) · © OpenStreetMap contributors',
  valhalla: 'Optimization: Valhalla (FOSSGIS) · © OpenStreetMap contributors',
  openMeteo: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  cams: 'Air quality: Open-Meteo / Copernicus CAMS (CC BY 4.0)',
  glo90: 'Elevation: Copernicus GLO-90 DEM via Open-Meteo',
  srtm: 'Elevation: SRTM 90 m via OpenTopoData',
  panoramax: 'Street imagery: Panoramax (per-picture licence)',
  oam: 'Aerial imagery: OpenAerialMap (per-image licence)',
});

/* ===================================================================== */

export const PLACE_CATEGORIES = Object.freeze({
  hospital: ['amenity', 'hospital'],
  clinic: ['amenity', 'clinic'],
  pharmacy: ['amenity', 'pharmacy'],
  police: ['amenity', 'police'],
  fire_station: ['amenity', 'fire_station'],
  school: ['amenity', 'school'],
  university: ['amenity', 'university'],
  fuel: ['amenity', 'fuel'],
  atm: ['amenity', 'atm'],
  bank: ['amenity', 'bank'],
  restaurant: ['amenity', 'restaurant'],
  cafe: ['amenity', 'cafe'],
  hotel: ['tourism', 'hotel'],
  parking: ['amenity', 'parking'],
  townhall: ['amenity', 'townhall'],
  evacuation: ['emergency', 'assembly_point'],
  bus_stop: ['highway', 'bus_stop'],
  supermarket: ['shop', 'supermarket'],
  church: ['amenity', 'place_of_worship'],
  airport: ['aeroway', 'aerodrome'],
});

const CATEGORY_WORDS = [
  [/hospital|emergency room|\ber\b/, 'hospital'],
  [/clinic|health cent(er|re)/, 'clinic'],
  [/pharmac|drug ?store|botika/, 'pharmacy'],
  [/police|precinct/, 'police'],
  [/fire ?station|firefight/, 'fire_station'],
  [/universit|college/, 'university'],
  [/school/, 'school'],
  [/gas station|petrol|fuel/, 'fuel'],
  [/\batm\b|cash machine/, 'atm'],
  [/\bbank\b/, 'bank'],
  [/restaurant|food|eat/, 'restaurant'],
  [/caf[eé]|coffee/, 'cafe'],
  [/hotel|lodging/, 'hotel'],
  [/parking/, 'parking'],
  [/town ?hall|city hall|municipal hall/, 'townhall'],
  [/evacuation|assembly point/, 'evacuation'],
  [/bus stop/, 'bus_stop'],
  [/supermarket|grocery/, 'supermarket'],
  [/church|mosque|temple|place of worship/, 'church'],
  [/airport/, 'airport'],
];

export function categoryFromText(text) {
  const t = String(text || '').toLowerCase();
  for (const [rx, cat] of CATEGORY_WORDS) if (rx.test(t)) return cat;
  return null;
}

/* ------------------------------------------------------------ helpers */

function photonLabel(p) {
  const parts = [
    p.name,
    [p.housenumber, p.street].filter(Boolean).join(' '),
    p.district || p.locality,
    p.city || p.town || p.village,
    p.state,
    p.country,
  ].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((r) => {
    const k = `${r.name}|${r.lat.toFixed(4)}|${r.lon.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Decode a Valhalla polyline6 string to [[lon, lat], ...]. */
export function decodePolyline6(str) {
  const out = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lon += d;
    }
    out.push([lon / 1e6, lat / 1e6]);
  }
  return out;
}

/* ===================================================================== */

export function createProviders({
  http,
  endpoints = {},
  cache = new TtlCache(300),
} = {}) {
  if (typeof http !== 'function')
    throw new TypeError('createProviders needs http');
  const E = { ...DEFAULT_ENDPOINTS, ...endpoints };
  const cached = memo(cache);
  const now = () => Date.now();

  /* ---------------------------------------------------------- geocoding */
  async function photonSearch(q, { limit, bias, signal }) {
    const u = new URL('/api/', E.photon);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', String(limit));
    if (bias) {
      u.searchParams.set('lat', String(bias.lat));
      u.searchParams.set('lon', String(bias.lon));
    }
    const j = await http(u.toString(), { signal });
    if (!Array.isArray(j?.features))
      throw new GeoError('bad_response', 'Photon: no features');
    return j.features
      .filter((f) => Array.isArray(f?.geometry?.coordinates))
      .map((f) => {
        const p = f.properties || {};
        const [lon, lat] = f.geometry.coordinates.map(Number);
        const ext = Array.isArray(p.extent) ? p.extent.map(Number) : null;
        return {
          name: p.name || photonLabel(p),
          label: photonLabel(p),
          lat,
          lon,
          kind: [p.osm_key, p.osm_value].filter(Boolean).join(':') || 'place',
          countryCode: p.countrycode || null,
          bbox:
            ext && ext.length === 4 ? [ext[0], ext[3], ext[2], ext[1]] : null,
          osm: p.osm_type && p.osm_id ? `${p.osm_type}/${p.osm_id}` : null,
        };
      })
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  }

  async function nominatimSearch(q, { limit, signal }) {
    const u = new URL('/search', E.nominatim);
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('q', q);
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('addressdetails', '1');
    const j = await http(u.toString(), { signal });
    if (!Array.isArray(j))
      throw new GeoError('bad_response', 'Nominatim: unexpected payload');
    return j.map((h) => ({
      name: h.name || String(h.display_name || '').split(',')[0],
      label: h.display_name,
      lat: Number(h.lat),
      lon: Number(h.lon),
      kind: [h.category || h.class, h.type].filter(Boolean).join(':'),
      countryCode: h.address?.country_code || null,
      bbox: Array.isArray(h.boundingbox)
        ? [
            Number(h.boundingbox[2]),
            Number(h.boundingbox[0]),
            Number(h.boundingbox[3]),
            Number(h.boundingbox[1]),
          ]
        : null,
      osm: h.osm_type && h.osm_id ? `${h.osm_type}/${h.osm_id}` : null,
      importance: h.importance ?? null,
    }));
  }

  /** Forward geocode: place names, addresses. Not postal validation. */
  async function geocode(query, { limit = 5, bias = null, signal } = {}) {
    const q = String(query || '').trim();
    if (q.length < 2 || q.length > 200)
      throw new GeoError('invalid_input', 'Query must be 2-200 characters');
    const n = Math.min(Math.max(1, limit | 0), 10);
    const key = `geo|${q.toLowerCase()}|${n}|${bias ? `${bias.lat.toFixed(2)},${bias.lon.toFixed(2)}` : ''}`;
    return cached(key, 24 * HOUR, async () => {
      let results;
      let provider = 'photon';
      try {
        results = await photonSearch(q, { limit: n, bias, signal });
      } catch (e) {
        if (e.code === 'aborted' || e.code === 'invalid_input') throw e;
        provider = 'nominatim';
        results = await nominatimSearch(q, { limit: n, signal });
      }
      results = dedupe(
        results.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)),
      );
      if (bias)
        for (const r of results) r.distanceM = Math.round(haversineM(bias, r));
      return record(results, {
        provider,
        attribution: ATTRIBUTION[provider],
        kind: 'static',
        ttlMs: 24 * HOUR,
        note: 'Geocoder match, not a verified postal address.',
      });
    });
  }

  async function reverseGeocode(lat, lon, { signal } = {}) {
    const p = point(lat, lon);
    const key = `rev|${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    return cached(key, 24 * HOUR, async () => {
      let r = null;
      let provider = 'photon';
      try {
        const u = new URL('/reverse', E.photon);
        u.searchParams.set('lat', String(p.lat));
        u.searchParams.set('lon', String(p.lon));
        const j = await http(u.toString(), { signal });
        const f = j?.features?.[0];
        if (f) {
          const pr = f.properties || {};
          const [flon, flat] = f.geometry.coordinates.map(Number);
          r = {
            name: pr.name || photonLabel(pr),
            label: photonLabel(pr),
            lat: flat,
            lon: flon,
            countryCode: pr.countrycode || null,
          };
        }
      } catch (e) {
        if (e.code === 'aborted') throw e;
        provider = 'nominatim';
        const u = new URL('/reverse', E.nominatim);
        u.searchParams.set('format', 'jsonv2');
        u.searchParams.set('lat', String(p.lat));
        u.searchParams.set('lon', String(p.lon));
        const h = await http(u.toString(), { signal });
        if (h && h.lat)
          r = {
            name: h.name || '',
            label: h.display_name,
            lat: Number(h.lat),
            lon: Number(h.lon),
            countryCode: h.address?.country_code || null,
          };
      }
      if (r) r.distanceM = Math.round(haversineM(p, r));
      return record(r, {
        provider,
        attribution: ATTRIBUTION[provider],
        kind: 'static',
        ttlMs: 24 * HOUR,
      });
    });
  }

  /* ---------------------------------------------------------- places */
  /** Nearby OSM features of a category within radius (≤ 10 km). */
  async function nearby(
    lat,
    lon,
    category,
    { radiusM = 3000, limit = 25, signal } = {},
  ) {
    const p = point(lat, lon);
    const tag = PLACE_CATEGORIES[category];
    if (!tag)
      throw new GeoError('invalid_input', `Unknown category: ${category}`);
    const r = Math.round(clampRadius(radiusM, 10000));
    const n = Math.min(Math.max(1, limit | 0), 100);
    // Round the centre (~100 m) so panning slightly reuses the cached answer.
    const key = `near|${category}|${p.lat.toFixed(3)},${p.lon.toFixed(3)}|${r}|${n}`;
    return cached(key, 30 * MIN, async () => {
      const [k, v] = tag;
      const ql = `[out:json][timeout:25];nwr["${k}"="${v}"](around:${r},${p.lat},${p.lon});out center tags ${n};`;
      let j;
      let lastErr;
      for (const ep of [].concat(E.overpass)) {
        try {
          j = await http(ep, {
            method: 'POST',
            body: `data=${encodeURIComponent(ql)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal,
          });
          break;
        } catch (e) {
          if (e.code === 'aborted') throw e;
          lastErr = e;
        }
      }
      if (!j)
        throw lastErr || new GeoError('unavailable', 'Overpass unavailable');
      if (!Array.isArray(j.elements))
        throw new GeoError('bad_response', 'Overpass: no elements');
      const items = j.elements
        .map((el) => {
          const la = Number(el.lat ?? el.center?.lat);
          const lo = Number(el.lon ?? el.center?.lon);
          if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
          const t = el.tags || {};
          return {
            name:
              t.name || t['name:en'] || `Unnamed ${category.replace('_', ' ')}`,
            lat: la,
            lon: lo,
            category,
            address:
              [t['addr:housenumber'], t['addr:street'], t['addr:city']]
                .filter(Boolean)
                .join(' ') || null,
            phone: t.phone || t['contact:phone'] || null,
            website: t.website || t['contact:website'] || null,
            openingHours: t.opening_hours || null,
            osm: `${el.type}/${el.id}`,
            distanceM: Math.round(haversineM(p, { lat: la, lon: lo })),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceM - b.distanceM);
      return record(items, {
        provider: 'overpass',
        attribution: ATTRIBUTION.overpass,
        kind: 'static',
        ttlMs: 30 * MIN,
        note: 'Only features mapped in OpenStreetMap are listed.',
      });
    });
  }

  /* ---------------------------------------------------------- routing */
  const PROFILES = {
    car: ['car', 'driving'],
    foot: ['foot', 'foot'],
    bike: ['bike', 'bike'],
  };

  function coordsParam(stops) {
    return stops
      .map((s) => `${s.lon.toFixed(6)},${s.lat.toFixed(6)}`)
      .join(';');
  }

  /** Route with up to 3 alternatives and maneuver steps (OSRM). */
  async function route(
    stops,
    { profile = 'car', alternatives = true, signal } = {},
  ) {
    if (!Array.isArray(stops) || stops.length < 2 || stops.length > 12)
      throw new GeoError('invalid_input', 'A route needs 2-12 stops');
    const pts = stops.map((s) => point(s.lat, s.lon));
    const prof = PROFILES[profile];
    if (!prof)
      throw new GeoError('invalid_input', `Unknown profile: ${profile}`);
    let total = 0;
    for (let i = 1; i < pts.length; i++)
      total += haversineM(pts[i - 1], pts[i]);
    if (total > 3_000_000)
      throw new GeoError('invalid_input', 'Route span too long (> 3000 km)');
    const key = `route|${profile}|${coordsParam(pts)}|${alternatives}`;
    return cached(key, 10 * MIN, async () => {
      const u = `${E.osrm}/routed-${prof[0]}/route/v1/${prof[1]}/${coordsParam(pts)}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives && pts.length === 2 ? 'true' : 'false'}`;
      const j = await http(u, { signal });
      if (j?.code !== 'Ok' || !Array.isArray(j.routes) || !j.routes.length)
        return record(
          {
            routes: [],
            available: false,
            reason: j?.message || 'No route found',
          },
          { provider: 'osrm', attribution: ATTRIBUTION.osrm, kind: 'static' },
        );
      const routes = j.routes.slice(0, 3).map((r, i) => ({
        index: i,
        distanceM: Math.round(r.distance),
        durationS: Math.round(r.duration),
        geometry: r.geometry?.coordinates || [],
        steps: (r.legs || []).flatMap((leg) =>
          (leg.steps || []).map((s) => ({
            instruction: osrmInstruction(s),
            distanceM: Math.round(s.distance),
            durationS: Math.round(s.duration),
            location: s.maneuver?.location || null,
          })),
        ),
      }));
      return record(
        { profile, routes, available: true },
        {
          provider: 'osrm',
          attribution: ATTRIBUTION.osrm,
          kind: 'static',
          ttlMs: 10 * MIN,
          note: 'No live traffic: durations are typical, not current.',
        },
      );
    });
  }

  /** Snap a point to the nearest routable road (OSRM nearest). */
  async function snapToRoad(lat, lon, { profile = 'car', signal } = {}) {
    const p = point(lat, lon);
    const prof = PROFILES[profile] || PROFILES.car;
    const j = await http(
      `${E.osrm}/routed-${prof[0]}/nearest/v1/${prof[1]}/${p.lon},${p.lat}?number=1`,
      { signal },
    );
    const w = j?.waypoints?.[0];
    if (j?.code !== 'Ok' || !w)
      return record(
        { available: false, reason: 'No road nearby' },
        { provider: 'osrm', attribution: ATTRIBUTION.osrm },
      );
    return record(
      {
        available: true,
        lat: w.location[1],
        lon: w.location[0],
        road: w.name || null,
        offsetM: Math.round(w.distance),
      },
      { provider: 'osrm', attribution: ATTRIBUTION.osrm, kind: 'static' },
    );
  }

  /** Travel-time / distance matrix (OSRM table). */
  async function matrix(points, { profile = 'car', signal } = {}) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 25)
      throw new GeoError('invalid_input', 'Matrix needs 2-25 points');
    const pts = points.map((s) => point(s.lat, s.lon));
    const prof = PROFILES[profile] || PROFILES.car;
    const j = await http(
      `${E.osrm}/routed-${prof[0]}/table/v1/${prof[1]}/${coordsParam(pts)}?annotations=duration,distance`,
      { signal },
    );
    if (j?.code !== 'Ok')
      return record(
        { available: false, reason: j?.message || 'Matrix failed' },
        { provider: 'osrm', attribution: ATTRIBUTION.osrm },
      );
    return record(
      { available: true, durationsS: j.durations, distancesM: j.distances },
      {
        provider: 'osrm',
        attribution: ATTRIBUTION.osrm,
        note: 'No live traffic.',
      },
    );
  }

  /** Multi-stop order optimization (Valhalla optimized_route, TSP). */
  async function optimize(stops, { profile = 'car', signal } = {}) {
    if (!Array.isArray(stops) || stops.length < 3 || stops.length > 20)
      throw new GeoError('invalid_input', 'Optimization needs 3-20 stops');
    const pts = stops.map((s) => point(s.lat, s.lon));
    const costing =
      { car: 'auto', foot: 'pedestrian', bike: 'bicycle' }[profile] || 'auto';
    const body = {
      locations: pts.map((p) => ({ lat: p.lat, lon: p.lon })),
      costing,
      units: 'kilometers',
    };
    const j = await http(
      `${E.valhalla}/optimized_route?json=${encodeURIComponent(JSON.stringify(body))}`,
      { signal },
    );
    const trip = j?.trip;
    if (!trip?.locations)
      return record(
        { available: false, reason: j?.error || 'Optimization failed' },
        { provider: 'valhalla', attribution: ATTRIBUTION.valhalla },
      );
    return record(
      {
        available: true,
        order: trip.locations.map((l) => l.original_index),
        distanceM: Math.round((trip.summary?.length || 0) * 1000),
        durationS: Math.round(trip.summary?.time || 0),
        geometry: (trip.legs || []).flatMap((l) =>
          l.shape ? decodePolyline6(l.shape) : [],
        ),
        note: 'Order minimises travel time; time windows and vehicle capacity are not supported by this service.',
      },
      {
        provider: 'valhalla',
        attribution: ATTRIBUTION.valhalla,
        kind: 'static',
      },
    );
  }

  /* ---------------------------------------------------------- elevation */
  async function elevation(points, { signal } = {}) {
    if (!Array.isArray(points) || !points.length || points.length > 100)
      throw new GeoError('invalid_input', 'Elevation needs 1-100 points');
    const pts = points.map((s) => point(s.lat, s.lon));
    const key = `elev|${pts.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';')}`;
    return cached(key, 7 * 24 * HOUR, async () => {
      try {
        const u = new URL('/v1/elevation', E.openMeteo);
        u.searchParams.set(
          'latitude',
          pts.map((p) => p.lat.toFixed(5)).join(','),
        );
        u.searchParams.set(
          'longitude',
          pts.map((p) => p.lon.toFixed(5)).join(','),
        );
        const j = await http(u.toString(), { signal });
        if (!Array.isArray(j?.elevation))
          throw new GeoError(
            'bad_response',
            'Open-Meteo elevation: bad payload',
          );
        return record(
          pts.map((p, i) => ({
            ...p,
            elevationM: Number.isFinite(j.elevation[i]) ? j.elevation[i] : null,
          })),
          {
            provider: 'open-meteo',
            source: 'Copernicus GLO-90',
            attribution: ATTRIBUTION.glo90,
            units: 'm',
            ttlMs: 7 * 24 * HOUR,
            note: '90 m resolution DEM; not survey grade.',
          },
        );
      } catch (e) {
        if (e.code === 'aborted') throw e;
        const u = `${E.openTopoData}/v1/srtm90m?locations=${pts.map((p) => `${p.lat},${p.lon}`).join('|')}`;
        const j = await http(u, { signal });
        if (!Array.isArray(j?.results))
          throw new GeoError('bad_response', 'OpenTopoData: bad payload');
        return record(
          j.results.map((r, i) => ({
            ...pts[i],
            elevationM: Number.isFinite(r.elevation) ? r.elevation : null,
          })),
          {
            provider: 'opentopodata',
            source: 'SRTM 90 m',
            attribution: ATTRIBUTION.srtm,
            units: 'm',
            ttlMs: 7 * 24 * HOUR,
            note: '90 m resolution DEM; not survey grade.',
          },
        );
      }
    });
  }

  /** Elevation profile along a [lon,lat] line, sampled to ≤ 100 points. */
  async function elevationProfile(lineLonLat, { samples = 60, signal } = {}) {
    if (!Array.isArray(lineLonLat) || lineLonLat.length < 2)
      throw new GeoError('invalid_input', 'Profile needs a line');
    const n = Math.min(100, Math.max(2, samples));
    const pts = lineLonLat.map(([lo, la]) => ({ lat: la, lon: lo }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    const picks = [];
    for (let k = 0; k < n; k++) {
      const d = (total * k) / (n - 1);
      let i = cum.findIndex((c) => c >= d);
      if (i <= 0) i = 1;
      const t = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      picks.push({
        lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t,
        lon: pts[i - 1].lon + (pts[i].lon - pts[i - 1].lon) * t,
        distanceM: Math.round(d),
      });
    }
    const res = await elevation(picks, { signal });
    const data = res.data.map((p, i) => ({
      ...p,
      distanceM: picks[i].distanceM,
    }));
    const vals = data.map((d) => d.elevationM).filter(Number.isFinite);
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < data.length; i++) {
      const a = data[i - 1].elevationM;
      const b = data[i].elevationM;
      if (Number.isFinite(a) && Number.isFinite(b))
        b > a ? (gain += b - a) : (loss += a - b);
    }
    return record(
      {
        samples: data,
        totalM: Math.round(total),
        minM: vals.length ? Math.min(...vals) : null,
        maxM: vals.length ? Math.max(...vals) : null,
        gainM: Math.round(gain),
        lossM: Math.round(loss),
      },
      { ...res.meta, retrievedAt: Date.parse(res.meta.retrievedAt) },
    );
  }

  /* ---------------------------------------------------------- weather + tz + solar */
  async function forecastRaw(p, signal) {
    const u = new URL('/v1/forecast', E.openMeteo);
    u.searchParams.set('latitude', p.lat.toFixed(4));
    u.searchParams.set('longitude', p.lon.toFixed(4));
    u.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
    );
    u.searchParams.set(
      'hourly',
      'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,shortwave_radiation,direct_radiation,diffuse_radiation,uv_index',
    );
    u.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,shortwave_radiation_sum',
    );
    u.searchParams.set('timezone', 'auto');
    u.searchParams.set('forecast_days', '3');
    const j = await http(u.toString(), { signal });
    if (!j?.current || !j?.timezone)
      throw new GeoError('bad_response', 'Open-Meteo forecast: bad payload');
    return j;
  }
  const forecastKey = (p) => `fc|${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  const getForecast = (p, signal) =>
    cached(forecastKey(p), 15 * MIN, async () => ({
      raw: await forecastRaw(p, signal),
      meta: { retrievedAt: new Date().toISOString(), cached: false },
    }));

  async function weather(lat, lon, { signal } = {}) {
    const p = point(lat, lon);
    const { raw: j, meta } = await getForecast(p, signal);
    const c = j.current;
    const cu = j.current_units || {};
    return record(
      {
        current: {
          time: c.time,
          temperatureC: c.temperature_2m,
          feelsLikeC: c.apparent_temperature,
          humidityPct: c.relative_humidity_2m,
          precipitationMm: c.precipitation,
          cloudCoverPct: c.cloud_cover,
          windKmh: c.wind_speed_10m,
          windGustKmh: c.wind_gusts_10m,
          windDirDeg: c.wind_direction_10m,
          weatherCode: c.weather_code,
          condition: weatherCodeText(c.weather_code),
          isDay: c.is_day === 1,
        },
        daily: (j.daily?.time || []).map((d, i) => ({
          date: d,
          maxC: j.daily.temperature_2m_max?.[i],
          minC: j.daily.temperature_2m_min?.[i],
          precipitationMm: j.daily.precipitation_sum?.[i],
          precipitationProbabilityPct:
            j.daily.precipitation_probability_max?.[i],
          uvIndexMax: j.daily.uv_index_max?.[i],
          sunrise: j.daily.sunrise?.[i],
          sunset: j.daily.sunset?.[i],
        })),
        timezone: j.timezone,
        elevationM: j.elevation,
      },
      {
        provider: 'open-meteo',
        attribution: ATTRIBUTION.openMeteo,
        kind: 'model',
        observedAt: c.time,
        units: cu,
        cached: meta.cached,
        retrievedAt: Date.parse(meta.retrievedAt),
        ttlMs: 15 * MIN,
        note: '"Current" values are numerical-model estimates for the hour, not station observations. Daily values are forecasts.',
      },
    );
  }

  async function solar(lat, lon, { signal } = {}) {
    const p = point(lat, lon);
    const { raw: j, meta } = await getForecast(p, signal);
    const h = j.hourly || {};
    const idx = Math.max(
      0,
      (h.time || []).findIndex((t) => t >= j.current.time.slice(0, 13)),
    );
    return record(
      {
        now: {
          time: h.time?.[idx],
          shortwaveWm2: h.shortwave_radiation?.[idx],
          directWm2: h.direct_radiation?.[idx],
          diffuseWm2: h.diffuse_radiation?.[idx],
          uvIndex: h.uv_index?.[idx],
        },
        daily: (j.daily?.time || []).map((d, i) => ({
          date: d,
          shortwaveSumMJm2: j.daily.shortwave_radiation_sum?.[i],
          sunrise: j.daily.sunrise?.[i],
          sunset: j.daily.sunset?.[i],
        })),
      },
      {
        provider: 'open-meteo',
        attribution: ATTRIBUTION.openMeteo,
        kind: 'forecast',
        units: { radiation: 'W/m²', daily: 'MJ/m²' },
        cached: meta.cached,
        retrievedAt: Date.parse(meta.retrievedAt),
        ttlMs: 15 * MIN,
        note: 'Modelled irradiance (preceding-hour mean), not a pyranometer measurement.',
      },
    );
  }

  /** IANA time zone from Open-Meteo's geographic lookup (not longitude math). */
  async function timezone(lat, lon, { signal, now: nowMs = now() } = {}) {
    const p = point(lat, lon);
    const { raw: j, meta } = await getForecast(p, signal);
    let localTime = null;
    try {
      localTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: j.timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(nowMs);
    } catch {
      /* unknown zone in this runtime */
    }
    return record(
      {
        tzid: j.timezone,
        abbreviation: j.timezone_abbreviation,
        utcOffsetSeconds: j.utc_offset_seconds,
        localTime,
      },
      {
        provider: 'open-meteo',
        source: 'Open-Meteo time-zone lookup',
        attribution: ATTRIBUTION.openMeteo,
        kind: 'static',
        cached: meta.cached,
        retrievedAt: Date.parse(meta.retrievedAt),
      },
    );
  }

  /* ---------------------------------------------------------- air quality + pollen */
  const POLLEN = [
    'alder_pollen',
    'birch_pollen',
    'grass_pollen',
    'mugwort_pollen',
    'olive_pollen',
    'ragweed_pollen',
  ];
  async function airQuality(lat, lon, { signal } = {}) {
    const p = point(lat, lon);
    return cached(
      `aq|${p.lat.toFixed(2)},${p.lon.toFixed(2)}`,
      30 * MIN,
      async () => {
        const u = new URL('/v1/air-quality', E.airQuality);
        u.searchParams.set('latitude', p.lat.toFixed(4));
        u.searchParams.set('longitude', p.lon.toFixed(4));
        u.searchParams.set(
          'current',
          [
            'pm10',
            'pm2_5',
            'ozone',
            'nitrogen_dioxide',
            'sulphur_dioxide',
            'carbon_monoxide',
            'us_aqi',
            'european_aqi',
            'uv_index',
            ...POLLEN,
          ].join(','),
        );
        u.searchParams.set('timezone', 'auto');
        const j = await http(u.toString(), { signal });
        const c = j?.current;
        if (!c)
          throw new GeoError(
            'bad_response',
            'Open-Meteo air quality: bad payload',
          );
        const pollen = Object.fromEntries(
          POLLEN.map((k) => [k.replace('_pollen', ''), c[k] ?? null]),
        );
        const pollenAvailable = Object.values(pollen).some((v) => v !== null);
        return record(
          {
            time: c.time,
            pm2_5: c.pm2_5 ?? null,
            pm10: c.pm10 ?? null,
            ozone: c.ozone ?? null,
            no2: c.nitrogen_dioxide ?? null,
            so2: c.sulphur_dioxide ?? null,
            co: c.carbon_monoxide ?? null,
            usAqi: c.us_aqi ?? null,
            usAqiCategory: usAqiCategory(c.us_aqi),
            europeanAqi: c.european_aqi ?? null,
            pollen: pollenAvailable ? pollen : null,
            pollenAvailable,
            pollenReason: pollenAvailable
              ? null
              : 'Pollen forecasts cover Europe only (CAMS Europe); not available here.',
          },
          {
            provider: 'open-meteo',
            source: 'Copernicus CAMS',
            attribution: ATTRIBUTION.cams,
            kind: 'model',
            observedAt: c.time,
            units: j.current_units || {},
            ttlMs: 30 * MIN,
            note: 'Model estimates (CAMS), not monitoring-station readings. US AQI per US EPA breakpoints as computed by Open-Meteo.',
          },
        );
      },
    );
  }

  /* ---------------------------------------------------------- imagery */
  async function streetImagery(
    lat,
    lon,
    { radiusM = 300, limit = 12, signal } = {},
  ) {
    const p = point(lat, lon);
    const bb = bboxAround(p, clampRadius(radiusM, 2000));
    return cached(
      `pnx|${bb.map((v) => v.toFixed(4)).join(',')}|${limit}`,
      30 * MIN,
      async () => {
        const u = new URL('/api/search', E.panoramax);
        u.searchParams.set('bbox', bb.join(','));
        u.searchParams.set('limit', String(Math.min(50, limit)));
        const j = await http(u.toString(), { signal });
        if (!Array.isArray(j?.features))
          throw new GeoError('bad_response', 'Panoramax: bad payload');
        const items = j.features
          .map((f) => {
            const [lo, la] = f.geometry?.coordinates || [];
            if (!Number.isFinite(la)) return null;
            const pr = f.properties || {};
            return {
              id: f.id,
              lat: la,
              lon: lo,
              capturedAt: pr.datetime || null,
              headingDeg: pr['view:azimuth'] ?? null,
              thumbUrl: f.assets?.thumb?.href || null,
              imageUrl: f.assets?.hd?.href || f.assets?.sd?.href || null,
              license: pr.license || f.license || null,
              author:
                (f.providers || pr.providers || [])
                  .map((x) => x.name)
                  .filter(Boolean)
                  .join(', ') || null,
              distanceM: Math.round(haversineM(p, { lat: la, lon: lo })),
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.distanceM - b.distanceM);
        return record(items, {
          provider: 'panoramax',
          attribution: ATTRIBUTION.panoramax,
          kind: 'historical',
          ttlMs: 30 * MIN,
          note: 'Photos show conditions on their capture date, not now.',
        });
      },
    );
  }

  async function aerialImagery(
    lat,
    lon,
    { radiusM = 5000, limit = 10, signal } = {},
  ) {
    const p = point(lat, lon);
    const bb = bboxAround(p, clampRadius(radiusM, 50000));
    return cached(
      `oam|${bb.map((v) => v.toFixed(3)).join(',')}|${limit}`,
      6 * HOUR,
      async () => {
        const u = new URL('/meta', E.openAerialMap);
        u.searchParams.set('bbox', bb.join(','));
        u.searchParams.set('limit', String(Math.min(50, limit)));
        u.searchParams.set('order_by', 'acquisition_end');
        u.searchParams.set('sort', 'desc');
        const j = await http(u.toString(), { signal });
        if (!Array.isArray(j?.results))
          throw new GeoError('bad_response', 'OpenAerialMap: bad payload');
        const items = j.results.map((r) => ({
          id: r._id || r.uuid,
          title: r.title || 'Untitled',
          provider: r.provider || null,
          acquiredFrom: r.acquisition_start || null,
          acquiredTo: r.acquisition_end || null,
          // Some OAM records store gsd in degrees (e.g. 3.4e-7); only values that
          // are plausibly metres are reported as metres.
          gsdM:
            Number.isFinite(r.gsd) && r.gsd >= 0.005 && r.gsd < 1000
              ? r.gsd
              : null,
          thumbUrl: r.properties?.thumbnail || null,
          tmsUrl: r.properties?.tms || null,
          // OAM states the licence once for the catalogue (meta.license).
          license:
            r.properties?.license || r.license || j.meta?.license || null,
          bbox: Array.isArray(r.bbox) ? r.bbox : null,
          platform: r.platform || null,
        }));
        return record(items, {
          provider: 'openaerialmap',
          attribution: ATTRIBUTION.oam,
          kind: 'historical',
          ttlMs: 6 * HOUR,
          note: 'Archived aerial imagery with its acquisition dates; not live satellite imagery.',
        });
      },
    );
  }

  /* ---------------------------------------------------------- health */
  const PROBES = {
    photon: () => http(`${E.photon}/api/?q=Manila&limit=1`),
    overpass: () =>
      http([].concat(E.overpass)[0], {
        method: 'POST',
        body: `data=${encodeURIComponent('[out:json][timeout:5];node(1);out ids;')}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    osrm: () =>
      http(`${E.osrm}/routed-car/nearest/v1/driving/120.9842,14.5995?number=1`),
    'open-meteo': () =>
      http(
        `${E.openMeteo}/v1/forecast?latitude=14.6&longitude=121&current=temperature_2m`,
      ),
    'air-quality': () =>
      http(
        `${E.airQuality}/v1/air-quality?latitude=14.6&longitude=121&current=pm2_5`,
      ),
    panoramax: () =>
      http(`${E.panoramax}/api/search?limit=1&bbox=120.98,14.59,120.99,14.60`),
    openaerialmap: () => http(`${E.openAerialMap}/meta?limit=1`),
    valhalla: () => http(`${E.valhalla}/status`),
  };
  async function health() {
    const out = await Promise.all(
      Object.entries(PROBES).map(async ([name, probe]) => {
        const t0 = now();
        try {
          await probe();
          return { name, ok: true, latencyMs: now() - t0 };
        } catch (e) {
          return {
            name,
            ok: false,
            latencyMs: now() - t0,
            error: e.code || 'error',
          };
        }
      }),
    );
    return record(out, { provider: 'gev-geo', kind: 'live' });
  }

  return {
    geocode,
    reverseGeocode,
    nearby,
    route,
    snapToRoad,
    matrix,
    optimize,
    elevation,
    elevationProfile,
    weather,
    solar,
    timezone,
    airQuality,
    streetImagery,
    aerialImagery,
    health,
    cache,
  };
}

/* ===================================================================== */

export function osrmInstruction(step) {
  const m = step?.maneuver || {};
  const road = step?.name ? ` onto ${step.name}` : '';
  const mod = m.modifier ? ` ${m.modifier}` : '';
  switch (m.type) {
    case 'depart':
      return `Head ${bearingWord(m.bearing_after)}${step.name ? ` on ${step.name}` : ''}`;
    case 'arrive':
      return 'Arrive at destination';
    case 'turn':
    case 'end of road':
      return `Turn${mod}${road}`;
    case 'continue':
    case 'new name':
      return `Continue${mod}${road}`;
    case 'merge':
      return `Merge${mod}${road}`;
    case 'on ramp':
      return `Take the ramp${mod}${road}`;
    case 'off ramp':
      return `Take the exit${mod}${road}`;
    case 'fork':
      return `Keep${mod} at the fork${road}`;
    case 'roundabout':
    case 'rotary':
      return `At the roundabout take exit ${m.exit ?? ''}${road}`.replace(
        '  ',
        ' ',
      );
    default:
      return `${m.type || 'Proceed'}${mod}${road}`;
  }
}

function bearingWord(b) {
  if (!Number.isFinite(b)) return 'out';
  return [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ][Math.round(b / 45) % 8];
}

/** WMO weather interpretation codes (Open-Meteo docs). */
export function weatherCodeText(code) {
  const map = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Dense drizzle',
    56: 'Freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Heavy freezing rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light showers',
    81: 'Showers',
    82: 'Violent showers',
    85: 'Snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with heavy hail',
  };
  return map[code] ?? (Number.isFinite(code) ? `Code ${code}` : 'Unknown');
}

/** US EPA AQI category names. */
export function usAqiCategory(aqi) {
  if (!Number.isFinite(aqi)) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}
