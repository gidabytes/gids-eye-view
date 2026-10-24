/**
 * Embedded API proxy — makes the standalone APK work without a Vite server.
 * NOTE: keys shipped in the APK are extractable. Route private credentials
 * through a backend for production.
 */
import { Capacitor } from '@capacitor/core';
import { nativeFetch } from './nativeFetch.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const APK_MODE =
  Boolean(Capacitor?.isNativePlatform?.()) ||
  env.VITE_API_PROXY === 'embedded' ||
  env.API_PROXY === 'embedded';

if (!APK_MODE) {
  console.info('[APK-Proxy] disabled (not in native mode)');
} else {
  const FIRMS_KEY   = env.VITE_FIRMS_MAP_KEY        || env.FIRMS_MAP_KEY        || '';
  const TOMTOM_KEY  = env.VITE_TOMTOM_API_KEY       || env.TOMTOM_API_KEY       || '';
  const MAPILLARY   = env.VITE_MAPILLARY_TOKEN      || env.MAPILLARY_ACCESS_TOKEN || '';
  const OPENSKY_ID  = env.VITE_OPENSKY_CLIENT_ID    || env.OPENSKY_CLIENT_ID    || '';
  const OPENSKY_SEC = env.VITE_OPENSKY_CLIENT_SECRET|| env.OPENSKY_CLIENT_SECRET|| '';

  // same result shape as the app's server (src/nominatimGeocode.js)
  function nominatimToGoogle(rows) {
    const h = Array.isArray(rows) ? rows[0] : null;
    const lat = Number(h?.lat), lng = Number(h?.lon);
    if (!h || !Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'ZERO_RESULTS', results: [] };
    const bb = (h.boundingbox || []).map(Number);
    const viewport = bb.length === 4 && bb.every(Number.isFinite)
      ? { southwest: { lat: bb[0], lng: bb[2] }, northeast: { lat: bb[1], lng: bb[3] } } : null;
    const name = String(h.name || '').trim();
    return { status: 'OK', results: [{
      geometry: { location: { lat, lng }, ...(viewport ? { bounds: viewport, viewport } : {}) },
      formatted_address: String(h.display_name || name),
      types: [h.type || h.addresstype || 'geocode'].filter(Boolean),
      address_components: name ? [{ long_name: name, short_name: name, types: [h.type || 'geocode'] }] : [],
    }] };
  }
  const RULES = [
    { match: /^\/api\/firms(?:\?|$)/, build: () => ({
        url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`,
    })},
    { match: /^\/api\/fire-perimeters\/inciweb/, build: () => ({ url: 'https://inciweb.wildfire.gov/incidents/rss.xml' })},
    { match: /^\/api\/fire-perimeters/, build: () => ({
        url: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson',
    })},
    { match: /^\/api\/tomtom\/flow\/(.+)$/, build: (_u, m) => ({
        url: `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${m[1]}.png?key=${TOMTOM_KEY}`,
    })},
    { match: /^\/api\/tomtom\/status/, build: () => ({
        url: `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=0,0&key=${TOMTOM_KEY}`,
    })},
    { match: /^\/api\/geocode(?:\?|$)/, build: (u) => {
        const q = new URL(u, 'https://x').searchParams;
        const params = new URLSearchParams({ format: 'jsonv2', q: q.get('q') || '', addressdetails: '1', limit: '1', 'accept-language': 'en' });
        return { url: 'https://nominatim.openstreetmap.org/search?' + params,
                 init: { headers: { 'User-Agent': 'gids-eyes-view/1.0 (Android)', 'Accept': 'application/json' } },
                 transform: nominatimToGoogle };
    }},
    { match: /^\/api\/launches/, build: () => ({ url: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=50&mode=list' })},
    { match: /^\/api\/celestrak\/active/, build: () => ({ url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json' })},
    { match: /^\/api\/radio\/stations/, build: () => ({ url: 'https://de1.api.radio-browser.info/json/stations/topvote/200' })},
    { match: /^\/api\/overpass/, build: (_u, _m, init) => {
        const body = init?.body || '';
        return { url: 'https://overpass-api.de/api/interpreter',
                 init: { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } } };
    }},
    { match: /^\/api\/cyclones/, build: () => ({ url: 'https://www.nhc.noaa.gov/CurrentStorms.json' })},
    { match: /^\/api\/transit\/feeds/, build: () => ({ url: 'https://transit.land/api/v2/rest/feeds?limit=200' })},
    { match: /^\/api\/gbfs\/(.+)$/, build: (_u, m) => ({ url: decodeURIComponent(m[1]) })},
    { match: /^\/api\/cctv\/sources/, build: () => ({ url: 'https://raw.githubusercontent.com/opencctv/cameras/main/cameras.json' })},
    { match: /^\/api\/cctv\/health/,  build: () => null },
    { match: /^\/api\/opensky|^\/api\/flights/, build: () => {
        const creds = (OPENSKY_ID && OPENSKY_SEC)
          ? `&client_id=${encodeURIComponent(OPENSKY_ID)}&client_secret=${encodeURIComponent(OPENSKY_SEC)}`
          : '';
        return { url: `https://opensky-network.org/api/states/all?_=1${creds}` };
    }},
    { match: /^\/api\/ais/, build: () => null },
    { match: /^\/api\/mapillary/, build: (u) => ({
        url: 'https://graph.mapillary.com' + u.replace(/^\/api\/mapillary/, '') +
             (u.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(MAPILLARY),
    })},
    { match: /^\/api\/local-receivers/, build: () => null },
  ];

  function resolve(originalUrl, init) {
    const m = originalUrl.match(/^https?:\/\/[^/]+(\/api\/[^\s]*)$/);
    const path = m ? m[1] : originalUrl;
    for (const rule of RULES) {
      const rx = rule.match instanceof RegExp ? rule.match : new RegExp('^' + rule.match + '$');
      const matched = path.match(rx);
      if (!matched) continue;
      try {
        const out = rule.build(path, matched, init || {});
        if (out && out.url) return out;
      } catch (err) { console.warn('[APK-Proxy] builder threw for', path, err); }
      return null;
    }
    return null;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    let url, realInit = init;
    if (typeof input === 'string') url = input;
    else if (input instanceof Request) url = input.url;
    else if (input && input.url) url = input.url;
    else return originalFetch(input, init);

    if (!url.startsWith('/api/')) return originalFetch(input, init);
    const resolved = resolve(url, init);
    if (!resolved) { console.warn('[APK-Proxy] no rewrite for', url); return originalFetch(input, init); }
    if (resolved.init) realInit = { ...(init || {}), ...resolved.init };
    console.info('[APK-Proxy]', url, '->', resolved.url.slice(0, 80) + (resolved.url.length > 80 ? '…' : ''));
    if (resolved.transform) {
      try {
        const res = await nativeFetch(resolved.url, realInit);
        const out = await resolved.transform(await res.json());
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [], error: String(e?.message || e) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return nativeFetch(resolved.url, realInit);
  };

  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    const open = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      if (typeof url === 'string' && url.startsWith('/api/')) {
        const r = resolve(url, { method });
        if (r) return open(method, r.url, ...rest);
      }
      return open(method, url, ...rest);
    };
    return xhr;
  }
  PatchedXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  console.info('[APK-Proxy] installed. Rules:', RULES.length);
  console.info('[APK-Proxy] keys present:',
    'firms=' + Boolean(FIRMS_KEY),
    'tomtom=' + Boolean(TOMTOM_KEY),
    'mapillary=' + Boolean(MAPILLARY),
    'opensky=' + Boolean(OPENSKY_ID && OPENSKY_SEC));
}
