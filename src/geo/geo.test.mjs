import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeoError,
  point,
  parseCoordinates,
  haversineM,
  bboxAround,
  TtlCache,
  HostPacer,
  createHttp,
  memo,
  record,
} from './core.js';
import {
  createProviders,
  decodePolyline6,
  categoryFromText,
  osrmInstruction,
  usAqiCategory,
  weatherCodeText,
} from './providers.js';
import { geoConfig, getGeoServices } from './index.js';

/* ---------------------------------------------------------------- helpers */

const noSleep = () => Promise.resolve();

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, reply] of routes) {
      if (String(url).includes(match)) {
        const r =
          typeof reply === 'function' ? await reply(String(url), init) : reply;
        if (r instanceof Error) throw r;
        const status = r.status ?? 200;
        return {
          status,
          headers: new Map(Object.entries(r.headers || {})),
          json: async () => {
            if (r.raw !== undefined) return JSON.parse(r.raw);
            return r.body;
          },
        };
      }
    }
    return { status: 404, headers: new Map(), json: async () => ({}) };
  };
  return { impl, calls };
}

function providersWith(routes, opts = {}) {
  const f = fakeFetch(routes);
  const http = createHttp({
    fetchImpl: f.impl,
    sleep: noSleep,
    retries: opts.retries ?? 1,
    timeoutMs: opts.timeoutMs ?? 2000,
  });
  return {
    geo: createProviders({ http, cache: new TtlCache(50) }),
    calls: f.calls,
  };
}

function encodePolyline6(coords) {
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lon, lat] of coords) {
    const la = Math.round(lat * 1e6);
    const lo = Math.round(lon * 1e6);
    out += enc(la - pLat) + enc(lo - pLon);
    pLat = la;
    pLon = lo;
  }
  return out;
}

/* ---------------------------------------------------------------- core */

test('point() validates coordinates', () => {
  assert.deepEqual(point('14.5', '121'), { lat: 14.5, lon: 121 });
  assert.throws(
    () => point(91, 0),
    (e) => e instanceof GeoError && e.code === 'invalid_input',
  );
  assert.throws(() => point(0, 181), GeoError);
  assert.throws(() => point('x', 0), GeoError);
});

test('parseCoordinates handles decimal and DMS, rejects junk', () => {
  assert.deepEqual(parseCoordinates('14.5995, 120.9842'), {
    lat: 14.5995,
    lon: 120.9842,
  });
  assert.deepEqual(parseCoordinates('-33.86 151.2'), {
    lat: -33.86,
    lon: 151.2,
  });
  const dms = parseCoordinates(`14°35'58"N 120°59'3"E`);
  assert.ok(
    Math.abs(dms.lat - 14.5994) < 1e-3 && Math.abs(dms.lon - 120.9842) < 1e-3,
  );
  assert.equal(parseCoordinates('Manila'), null);
  assert.equal(parseCoordinates('95, 10'), null);
});

test('haversine and bbox are sane', () => {
  const d = haversineM(
    { lat: 14.5995, lon: 120.9842 },
    { lat: 14.676, lon: 121.0437 },
  );
  assert.ok(d > 10_000 && d < 11_000, String(d));
  const bb = bboxAround({ lat: 0, lon: 0 }, 1113.2);
  assert.ok(Math.abs(bb[3] - 0.01) < 1e-4 && Math.abs(bb[2] - 0.01) < 1e-4);
});

test('TtlCache expires entries and evicts LRU', () => {
  const c = new TtlCache(2);
  c.set('a', 1, 1000, 0);
  c.set('b', 2, 1000, 0);
  assert.equal(c.get('a', 500), 1); // touch a
  c.set('c', 3, 1000, 600); // evicts b (least recently used)
  assert.equal(c.get('b', 700), undefined);
  assert.equal(c.get('a', 700), 1);
  assert.equal(c.get('a', 1500), undefined); // expired
});

test('memo de-duplicates in-flight requests and marks cache hits', async () => {
  const cached = memo(new TtlCache(10));
  let n = 0;
  const produce = async () => {
    n++;
    await new Promise((r) => setTimeout(r, 10));
    return record({ v: 1 }, { provider: 'x' });
  };
  const [a, b] = await Promise.all([
    cached('k', 1000, produce),
    cached('k', 1000, produce),
  ]);
  assert.equal(n, 1);
  assert.equal(a.meta.cached, false);
  assert.equal(b.meta.cached, false);
  const c = await cached('k', 1000, produce);
  assert.equal(c.meta.cached, true);
  assert.equal(n, 1);
});

test('HostPacer spaces requests to rate-limited hosts', async () => {
  const waits = [];
  const pacer = new HostPacer({ 'nominatim.openstreetmap.org': 1000 });
  const sleep = async (ms) => waits.push(ms);
  await pacer.wait('nominatim.openstreetmap.org', null, sleep);
  await pacer.wait('nominatim.openstreetmap.org', null, sleep);
  await pacer.wait('other.host', null, sleep);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 900 && waits[0] <= 1000);
});

test('http retries 429/5xx with bounded attempts then fails with a code', async () => {
  let n = 0;
  const f = fakeFetch([
    ['x.test', () => (++n < 3 ? { status: 503 } : { body: { ok: 1 } })],
  ]);
  const http = createHttp({ fetchImpl: f.impl, sleep: noSleep, retries: 2 });
  assert.deepEqual(await http('https://x.test/a'), { ok: 1 });
  assert.equal(n, 3);
  const g = fakeFetch([
    ['y.test', { status: 429, headers: { 'retry-after': '1' } }],
  ]);
  const http2 = createHttp({ fetchImpl: g.impl, sleep: noSleep, retries: 1 });
  await assert.rejects(
    http2('https://y.test/'),
    (e) => e.code === 'rate_limited',
  );
  assert.equal(g.calls.length, 2);
});

test('http does not retry 4xx and reports bad JSON', async () => {
  const f = fakeFetch([
    ['a.test', { status: 400 }],
    ['b.test', { raw: '<html>' }],
  ]);
  const http = createHttp({ fetchImpl: f.impl, sleep: noSleep, retries: 3 });
  await assert.rejects(
    http('https://a.test/'),
    (e) => e.code === 'upstream' && e.status === 400,
  );
  assert.equal(f.calls.filter((c) => c.url.includes('a.test')).length, 1);
  await assert.rejects(
    http('https://b.test/'),
    (e) => e.code === 'bad_response',
  );
});

test('http times out and honours cancellation', async () => {
  const hang = (url, init) =>
    new Promise((_, rej) =>
      init.signal.addEventListener('abort', () => rej(new Error('aborted'))),
    );
  const http = createHttp({
    fetchImpl: hang,
    sleep: noSleep,
    retries: 0,
    timeoutMs: 30,
  });
  await assert.rejects(http('https://slow.test/'), (e) => e.code === 'timeout');
  const ctl = new AbortController();
  const p = createHttp({
    fetchImpl: hang,
    sleep: noSleep,
    retries: 0,
    timeoutMs: 5000,
  })('https://slow.test/', { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, (e) => e.code === 'aborted');
});

/* ---------------------------------------------------------------- geocoding */

const PHOTON_MANILA = {
  features: [
    {
      geometry: { coordinates: [120.9842, 14.5995] },
      properties: {
        name: 'Manila',
        country: 'Philippines',
        countrycode: 'PH',
        osm_key: 'place',
        osm_value: 'city',
        osm_type: 'R',
        osm_id: 1,
        extent: [120.9, 14.7, 121.1, 14.5],
      },
    },
    {
      geometry: { coordinates: [120.9842, 14.5995] },
      properties: {
        name: 'Manila',
        country: 'Philippines',
        osm_key: 'place',
        osm_value: 'city',
      },
    },
  ],
};

test('geocode normalizes Photon, de-duplicates and adds provenance', async () => {
  const { geo } = providersWith([
    ['photon.komoot.io/api/', { body: PHOTON_MANILA }],
  ]);
  const r = await geo.geocode('Manila', { bias: { lat: 14.6, lon: 121 } });
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].label, 'Manila, Philippines');
  assert.deepEqual(r.data[0].bbox, [120.9, 14.5, 121.1, 14.7]);
  assert.ok(Number.isFinite(r.data[0].distanceM));
  assert.equal(r.meta.provider, 'photon');
  assert.match(r.meta.attribution, /OpenStreetMap/);
  assert.match(r.meta.note, /not a verified postal address/);
});

test('geocode falls back to Nominatim when Photon fails', async () => {
  const { geo } = providersWith([
    ['photon.komoot.io', { status: 500 }],
    [
      'nominatim.openstreetmap.org/search',
      {
        body: [
          {
            lat: '10.3157',
            lon: '123.8854',
            display_name: 'Cebu City, Cebu, Philippines',
            name: 'Cebu City',
            category: 'place',
            type: 'city',
            boundingbox: ['10.2', '10.5', '123.7', '124.0'],
          },
        ],
      },
    ],
  ]);
  const r = await geo.geocode('Cebu City');
  assert.equal(r.meta.provider, 'nominatim');
  assert.equal(r.data[0].name, 'Cebu City');
  assert.deepEqual(r.data[0].bbox, [123.7, 10.2, 124.0, 10.5]);
});

test('geocode handles empty results and rejects bad queries', async () => {
  const { geo } = providersWith([
    ['photon.komoot.io', { body: { features: [] } }],
  ]);
  const r = await geo.geocode('zzzzqqq');
  assert.deepEqual(r.data, []);
  await assert.rejects(geo.geocode('a'), (e) => e.code === 'invalid_input');
});

test('geocode caches repeat queries', async () => {
  const { geo, calls } = providersWith([
    ['photon.komoot.io', { body: PHOTON_MANILA }],
  ]);
  await geo.geocode('Manila');
  const again = await geo.geocode('manila');
  assert.equal(calls.length, 1);
  assert.equal(again.meta.cached, true);
});

test('reverse geocode validates and normalizes', async () => {
  const { geo } = providersWith([
    [
      'photon.komoot.io/reverse',
      {
        body: {
          features: [
            {
              geometry: { coordinates: [121.0437, 14.676] },
              properties: {
                name: 'Quezon City Hall',
                city: 'Quezon City',
                country: 'Philippines',
              },
            },
          ],
        },
      },
    ],
  ]);
  const r = await geo.reverseGeocode(14.676, 121.0437);
  assert.equal(r.data.name, 'Quezon City Hall');
  assert.equal(r.data.distanceM, 0);
  await assert.rejects(
    geo.reverseGeocode(100, 0),
    (e) => e.code === 'invalid_input',
  );
});

/* ---------------------------------------------------------------- places */

test('nearby queries Overpass, normalizes and sorts by distance', async () => {
  const { geo, calls } = providersWith([
    [
      'overpass-api.de',
      {
        body: {
          elements: [
            {
              type: 'node',
              id: 2,
              lat: 14.62,
              lon: 121.0,
              tags: { name: 'Far Hospital' },
            },
            {
              type: 'way',
              id: 1,
              center: { lat: 14.601, lon: 120.985 },
              tags: { name: 'Near Hospital', phone: '+63 2 1234' },
            },
            { type: 'node', id: 3, tags: {} },
          ],
        },
      },
    ],
  ]);
  const r = await geo.nearby(14.6, 120.984, 'hospital', { radiusM: 50000 });
  assert.equal(r.data.length, 2);
  assert.equal(r.data[0].name, 'Near Hospital');
  assert.equal(r.data[0].osm, 'way/1');
  assert.ok(r.data[0].distanceM < r.data[1].distanceM);
  const body = decodeURIComponent(calls[0].init.body);
  assert.match(body, /\["amenity"="hospital"\]\(around:10000,/); // radius clamped to 10 km
  assert.equal(calls[0].init.method, 'POST');
});

test('nearby rejects unknown categories and falls back to a second Overpass', async () => {
  const { geo, calls } = providersWith(
    [
      ['overpass-api.de', { status: 504 }],
      ['overpass.kumi.systems', { body: { elements: [] } }],
    ],
    { retries: 0 },
  );
  await assert.rejects(
    geo.nearby(14.6, 121, 'spaceport'),
    (e) => e.code === 'invalid_input',
  );
  const r = await geo.nearby(14.6, 121, 'police');
  assert.deepEqual(r.data, []);
  assert.ok(calls.some((c) => c.url.includes('kumi')));
});

test('categoryFromText maps natural language', () => {
  assert.equal(categoryFromText('nearest hospital please'), 'hospital');
  assert.equal(categoryFromText('find a gas station'), 'fuel');
  assert.equal(categoryFromText('evacuation center'), 'evacuation');
  assert.equal(categoryFromText('a pizza'), null);
});

/* ---------------------------------------------------------------- routing */

const OSRM_OK = {
  code: 'Ok',
  routes: [
    {
      distance: 5234.4,
      duration: 900.2,
      geometry: {
        coordinates: [
          [120.98, 14.59],
          [121.0, 14.6],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 100,
              duration: 20,
              name: 'Roxas Blvd',
              maneuver: {
                type: 'depart',
                bearing_after: 0,
                location: [120.98, 14.59],
              },
            },
            {
              distance: 5000,
              duration: 870,
              name: 'EDSA',
              maneuver: {
                type: 'turn',
                modifier: 'right',
                location: [120.99, 14.595],
              },
            },
            {
              distance: 0,
              duration: 0,
              name: '',
              maneuver: { type: 'arrive', location: [121.0, 14.6] },
            },
          ],
        },
      ],
    },
    {
      distance: 6000,
      duration: 1000,
      geometry: {
        coordinates: [
          [120.98, 14.59],
          [121.0, 14.6],
        ],
      },
      legs: [],
    },
  ],
};

test('route normalizes OSRM alternatives and maneuvers, flags no live traffic', async () => {
  const { geo, calls } = providersWith([
    [
      'routing.openstreetmap.de/routed-car/route/v1/driving/',
      { body: OSRM_OK },
    ],
  ]);
  const r = await geo.route([
    { lat: 14.59, lon: 120.98 },
    { lat: 14.6, lon: 121.0 },
  ]);
  assert.equal(r.data.routes.length, 2);
  assert.equal(r.data.routes[0].distanceM, 5234);
  assert.deepEqual(
    r.data.routes[0].steps.map((s) => s.instruction),
    [
      'Head north on Roxas Blvd',
      'Turn right onto EDSA',
      'Arrive at destination',
    ],
  );
  assert.match(r.meta.note, /No live traffic/);
  assert.match(calls[0].url, /alternatives=true/);
  assert.match(calls[0].url, /120\.980000,14\.590000;121\.000000,14\.600000/);
});

test('route reports no-route honestly and validates input', async () => {
  const { geo } = providersWith([
    [
      'routing.openstreetmap.de',
      { body: { code: 'NoRoute', message: 'Impossible route between points' } },
    ],
  ]);
  const r = await geo.route(
    [
      { lat: 14.59, lon: 120.98 },
      { lat: 14.6, lon: 121.0 },
    ],
    { profile: 'foot' },
  );
  assert.equal(r.data.available, false);
  assert.match(r.data.reason, /Impossible/);
  await assert.rejects(
    geo.route([{ lat: 1, lon: 1 }]),
    (e) => e.code === 'invalid_input',
  );
  await assert.rejects(
    geo.route(
      [
        { lat: 1, lon: 1 },
        { lat: 2, lon: 2 },
      ],
      { profile: 'jet' },
    ),
    (e) => e.code === 'invalid_input',
  );
  await assert.rejects(
    geo.route([
      { lat: 14.6, lon: 121 },
      { lat: 51.5, lon: -0.1 },
    ]),
    (e) => /too long/.test(e.message),
  );
});

test('snapToRoad and matrix normalize OSRM', async () => {
  const { geo } = providersWith([
    [
      '/nearest/',
      {
        body: {
          code: 'Ok',
          waypoints: [
            {
              location: [120.9843, 14.5996],
              name: 'Taft Avenue',
              distance: 12.4,
            },
          ],
        },
      },
    ],
    [
      '/table/',
      {
        body: {
          code: 'Ok',
          durations: [
            [0, 60],
            [62, 0],
          ],
          distances: [
            [0, 500],
            [510, 0],
          ],
        },
      },
    ],
  ]);
  const s = await geo.snapToRoad(14.5995, 120.9842);
  assert.equal(s.data.road, 'Taft Avenue');
  assert.equal(s.data.offsetM, 12);
  const m = await geo.matrix([
    { lat: 14.6, lon: 121 },
    { lat: 14.61, lon: 121.01 },
  ]);
  assert.deepEqual(m.data.durationsS, [
    [0, 60],
    [62, 0],
  ]);
});

test('optimize decodes Valhalla order and polyline6 geometry', async () => {
  const shape = encodePolyline6([
    [121.0, 14.6],
    [121.01, 14.61],
  ]);
  const { geo, calls } = providersWith([
    [
      'valhalla1.openstreetmap.de/optimized_route',
      {
        body: {
          trip: {
            locations: [
              { original_index: 0 },
              { original_index: 2 },
              { original_index: 1 },
            ],
            summary: { length: 12.3, time: 1500 },
            legs: [{ shape }],
          },
        },
      },
    ],
  ]);
  const r = await geo.optimize([
    { lat: 14.6, lon: 121 },
    { lat: 14.65, lon: 121.05 },
    { lat: 14.61, lon: 121.01 },
  ]);
  assert.deepEqual(r.data.order, [0, 2, 1]);
  assert.equal(r.data.distanceM, 12300);
  assert.deepEqual(r.data.geometry, [
    [121.0, 14.6],
    [121.01, 14.61],
  ]);
  assert.match(r.data.note, /time windows/);
  assert.match(decodeURIComponent(calls[0].url), /"costing":"auto"/);
});

test('decodePolyline6 round-trips negative coordinates', () => {
  const pts = [
    [-0.1278, 51.5074],
    [-0.1, 51.51],
    [151.2093, -33.8688],
  ];
  assert.deepEqual(decodePolyline6(encodePolyline6(pts)), pts);
});

test('osrmInstruction covers roundabouts and ramps', () => {
  assert.equal(
    osrmInstruction({
      name: 'Ayala Ave',
      maneuver: { type: 'roundabout', exit: 2 },
    }),
    'At the roundabout take exit 2 onto Ayala Ave',
  );
  assert.equal(
    osrmInstruction({
      name: '',
      maneuver: { type: 'off ramp', modifier: 'slight right' },
    }),
    'Take the exit slight right',
  );
});

/* ---------------------------------------------------------------- elevation */

test('elevation uses Open-Meteo and falls back to OpenTopoData', async () => {
  const a = providersWith([
    ['api.open-meteo.com/v1/elevation', { body: { elevation: [12, 2953] } }],
  ]);
  const r = await a.geo.elevation([
    { lat: 14.6, lon: 121 },
    { lat: 16.6, lon: 120.9 },
  ]);
  assert.deepEqual(
    r.data.map((p) => p.elevationM),
    [12, 2953],
  );
  assert.equal(r.meta.units, 'm');
  assert.match(r.meta.note, /90 m/);
  const b = providersWith(
    [
      ['api.open-meteo.com', { status: 500 }],
      [
        'api.opentopodata.org/v1/srtm90m',
        { body: { results: [{ elevation: 10 }] } },
      ],
    ],
    { retries: 0 },
  );
  const r2 = await b.geo.elevation([{ lat: 14.6, lon: 121 }]);
  assert.equal(r2.meta.provider, 'opentopodata');
  assert.equal(r2.data[0].elevationM, 10);
  await assert.rejects(a.geo.elevation([]), (e) => e.code === 'invalid_input');
});

test('elevationProfile samples a line and computes gain/loss', async () => {
  const { geo } = providersWith([
    [
      'v1/elevation',
      (url) => {
        const n = new URL(url).searchParams.get('latitude').split(',').length;
        return {
          body: {
            elevation: Array.from({ length: n }, (_, i) =>
              i < n / 2 ? i * 10 : (n - i) * 10,
            ),
          },
        };
      },
    ],
  ]);
  const r = await geo.elevationProfile(
    [
      [121, 14.6],
      [121.1, 14.7],
    ],
    { samples: 11 },
  );
  assert.equal(r.data.samples.length, 11);
  assert.ok(r.data.totalM > 15000);
  assert.ok(r.data.gainM > 0 && r.data.lossM > 0);
});

/* ---------------------------------------------------------------- environment */

const FORECAST = {
  timezone: 'Asia/Manila',
  timezone_abbreviation: 'GMT+8',
  utc_offset_seconds: 28800,
  elevation: 13,
  current_units: { temperature_2m: '°C' },
  current: {
    time: '2026-10-17T18:00',
    temperature_2m: 28.4,
    apparent_temperature: 33.1,
    relative_humidity_2m: 80,
    precipitation: 0,
    cloud_cover: 75,
    wind_speed_10m: 9,
    wind_gusts_10m: 20,
    wind_direction_10m: 90,
    weather_code: 3,
    is_day: 0,
  },
  hourly: {
    time: ['2026-10-17T17:00', '2026-10-17T18:00'],
    shortwave_radiation: [120, 15],
    direct_radiation: [80, 5],
    diffuse_radiation: [40, 10],
    uv_index: [1, 0],
  },
  daily: {
    time: ['2026-10-17'],
    temperature_2m_max: [31],
    temperature_2m_min: [25],
    precipitation_sum: [4.2],
    precipitation_probability_max: [70],
    uv_index_max: [9],
    sunrise: ['2026-10-17T05:46'],
    sunset: ['2026-10-17T17:36'],
    shortwave_radiation_sum: [17.5],
  },
};

test('weather labels model data, decodes codes and shares one request with solar/timezone', async () => {
  const { geo, calls } = providersWith([
    ['api.open-meteo.com/v1/forecast', { body: FORECAST }],
  ]);
  const w = await geo.weather(14.6, 121);
  assert.equal(w.data.current.condition, 'Overcast');
  assert.equal(w.meta.kind, 'model');
  assert.match(w.meta.note, /not station observations/);
  const s = await geo.solar(14.6, 121);
  assert.equal(s.data.now.shortwaveWm2, 15);
  assert.equal(s.meta.kind, 'forecast');
  const tz = await geo.timezone(14.6, 121, {
    now: Date.UTC(2026, 9, 17, 10, 0),
  });
  assert.equal(tz.data.tzid, 'Asia/Manila');
  assert.equal(tz.data.utcOffsetSeconds, 28800);
  assert.match(tz.data.localTime, /18:00/);
  assert.equal(calls.length, 1);
});

test('air quality reports pollen as unavailable outside Europe', async () => {
  const { geo } = providersWith([
    [
      'air-quality-api.open-meteo.com',
      {
        body: {
          current_units: { pm2_5: 'μg/m³' },
          current: {
            time: '2026-10-17T18:00',
            pm2_5: 18.2,
            pm10: 30,
            ozone: 40,
            us_aqi: 64,
            european_aqi: 35,
            alder_pollen: null,
            grass_pollen: null,
          },
        },
      },
    ],
  ]);
  const r = await geo.airQuality(14.6, 121);
  assert.equal(r.data.usAqiCategory, 'Moderate');
  assert.equal(r.data.pollen, null);
  assert.equal(r.data.pollenAvailable, false);
  assert.match(r.data.pollenReason, /Europe only/);
  assert.equal(r.meta.kind, 'model');
});

test('air quality returns pollen where CAMS Europe covers it', async () => {
  const { geo } = providersWith([
    [
      'air-quality-api.open-meteo.com',
      {
        body: {
          current: { time: 't', pm2_5: 5, grass_pollen: 12.5, birch_pollen: 0 },
        },
      },
    ],
  ]);
  const r = await geo.airQuality(48.85, 2.35);
  assert.equal(r.data.pollenAvailable, true);
  assert.equal(r.data.pollen.grass, 12.5);
});

test('environment endpoints surface invalid payloads as errors', async () => {
  const { geo } = providersWith([
    ['open-meteo.com', { body: { error: true } }],
  ]);
  await assert.rejects(
    geo.weather(14.6, 121),
    (e) => e.code === 'bad_response',
  );
  await assert.rejects(
    geo.airQuality(14.6, 121),
    (e) => e.code === 'bad_response',
  );
});

test('AQI categories and WMO codes', () => {
  assert.equal(usAqiCategory(40), 'Good');
  assert.equal(usAqiCategory(175), 'Unhealthy');
  assert.equal(usAqiCategory(null), null);
  assert.equal(weatherCodeText(95), 'Thunderstorm');
  assert.equal(weatherCodeText(1234), 'Code 1234');
});

/* ---------------------------------------------------------------- imagery */

test('street imagery is labelled historical with capture dates', async () => {
  const { geo, calls } = providersWith([
    [
      'api.panoramax.xyz/api/search',
      {
        body: {
          features: [
            {
              id: 'abc',
              geometry: { coordinates: [120.9843, 14.5996] },
              properties: {
                datetime: '2024-03-01T08:00:00Z',
                'view:azimuth': 90,
                license: 'CC-BY-SA-4.0',
              },
              assets: {
                thumb: { href: 'https://x/t.jpg' },
                hd: { href: 'https://x/h.jpg' },
              },
              providers: [{ name: 'alice' }],
            },
          ],
        },
      },
    ],
  ]);
  const r = await geo.streetImagery(14.5995, 120.9842);
  assert.equal(r.meta.kind, 'historical');
  assert.equal(r.data[0].capturedAt, '2024-03-01T08:00:00Z');
  assert.equal(r.data[0].license, 'CC-BY-SA-4.0');
  assert.equal(r.data[0].author, 'alice');
  assert.match(calls[0].url, /bbox=/);
});

test('aerial imagery takes the catalogue licence and rejects degree-valued gsd', async () => {
  const { geo } = providersWith([
    [
      'api.openaerialmap.org/meta',
      {
        body: {
          meta: { license: 'CC-BY 4.0' },
          results: [
            {
              _id: '59e6',
              title: 'tacloban_part_2.tif',
              gsd: 3.3787e-7,
              acquisition_end: '2013-11-16T00:00:00.000Z',
              bbox: [124.99, 11.24, 125.01, 11.25],
              properties: {
                tms: 'http://tiles.openaerialmap.org/1/0/x/{z}/{x}/{y}.png',
              },
            },
            { _id: '2', gsd: 0.08 },
          ],
        },
      },
    ],
  ]);
  const r = await geo.aerialImagery(11.245, 125.0);
  assert.equal(r.data[0].license, 'CC-BY 4.0');
  assert.equal(r.data[0].gsdM, null);
  assert.equal(r.data[1].gsdM, 0.08);
  assert.deepEqual(r.data[0].bbox, [124.99, 11.24, 125.01, 11.25]);
});

test('aerial imagery reports acquisition dates and never claims live imagery', async () => {
  const { geo } = providersWith([
    [
      'api.openaerialmap.org/meta',
      {
        body: {
          results: [
            {
              _id: '1',
              title: 'Tacloban post-Haiyan',
              provider: 'Drone team',
              acquisition_start: '2013-11-15',
              acquisition_end: '2013-11-16',
              gsd: 0.05,
              properties: { thumbnail: 't', tms: 'https://tiles/{z}/{x}/{y}' },
            },
          ],
        },
      },
    ],
  ]);
  const r = await geo.aerialImagery(11.24, 125.0);
  assert.equal(r.data[0].acquiredTo, '2013-11-16');
  assert.equal(r.data[0].license, null); // not fabricated when the source has none
  assert.match(r.meta.note, /not live satellite imagery/);
});

/* ---------------------------------------------------------------- facade */

test('geoConfig reads endpoint overrides and the disable flag', () => {
  const c = geoConfig({
    VITE_GEO_ENABLED: 'false',
    VITE_GEO_OSRM_URL: 'https://osrm.local',
    VITE_GEO_OVERPASS_URL: 'https://a, https://b',
  });
  assert.equal(c.enabled, false);
  assert.equal(c.endpoints.osrm, 'https://osrm.local');
  assert.deepEqual(c.endpoints.overpass, ['https://a', 'https://b']);
  assert.equal(geoConfig({}).enabled, true);
});

test('getGeoServices uses overrides and health() reports per provider', async () => {
  const f = fakeFetch([
    ['osrm.local', { body: { code: 'Ok', waypoints: [] } }],
  ]);
  const geo = getGeoServices({
    fresh: true,
    env: { VITE_GEO_OSRM_URL: 'https://osrm.local' },
    http: createHttp({ fetchImpl: f.impl, sleep: noSleep, retries: 0 }),
  });
  assert.equal(geo.endpoints.osrm, 'https://osrm.local');
  const h = await geo.health();
  const osrm = h.data.find((x) => x.name === 'osrm');
  assert.equal(osrm.ok, true);
  assert.ok(h.data.some((x) => !x.ok)); // everything else 404s in this fake
});
