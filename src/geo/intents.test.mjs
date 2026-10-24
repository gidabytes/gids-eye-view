import test from 'node:test';
import assert from 'node:assert/strict';
import { geoIntent } from './intents.js';
import { record } from './core.js';

function fakeGeo(over = {}) {
  const calls = [];
  const rec =
    (name, data, meta = {}) =>
    (...args) => {
      calls.push([name, ...args]);
      return Promise.resolve(
        record(typeof data === 'function' ? data(...args) : data, {
          provider: 'test',
          ...meta,
        }),
      );
    };
  return {
    calls,
    geocode: rec('geocode', (q) =>
      q === 'nowhere land'
        ? []
        : [
            {
              name: q.replace(/\b\w/g, (c) => c.toUpperCase()),
              lat: 10.3,
              lon: 123.9,
            },
          ],
    ),
    nearby: rec('nearby', [
      {
        name: 'Philippine General Hospital',
        lat: 14.578,
        lon: 120.985,
        distanceM: 1234,
      },
    ]),
    route: rec('route', {
      available: true,
      routes: [
        {
          distanceM: 12500,
          durationS: 1800,
          geometry: [],
          steps: [{ instruction: 'Head north on Taft Avenue' }],
        },
        { distanceM: 13000, durationS: 2000, geometry: [], steps: [] },
      ],
    }),
    weather: rec('weather', {
      current: {
        condition: 'Light rain',
        temperatureC: 27.6,
        feelsLikeC: 31.2,
        windKmh: 12.4,
      },
    }),
    airQuality: rec('airQuality', {
      usAqi: 64,
      usAqiCategory: 'Moderate',
      pm2_5: 18.2,
      pollenAvailable: false,
      pollen: null,
    }),
    timezone: rec('timezone', {
      tzid: 'Asia/Tokyo',
      localTime: '17 Oct 2026, 20:00',
    }),
    elevation: rec('elevation', [{ elevationM: 2953.4 }]),
    streetImagery: rec('streetImagery', []),
    ...over,
  };
}
const ctx = (geo) => ({
  geo,
  here: async () => ({ lat: 14.6, lon: 120.98, label: 'the map centre' }),
  center: () => ({ lat: 14.6, lon: 120.98 }),
});

test('non-geo phrases fall through (null) so existing voice handling is untouched', async () => {
  const geo = fakeGeo();
  assert.equal(await geoIntent('take me to Manila Bay', ctx(geo)), null);
  assert.equal(await geoIntent('turn on live flights', ctx(geo)), null);
  assert.equal(await geoIntent('dive to 2000 meters', ctx(geo)), null);
  assert.equal(geo.calls.length, 0);
});

test('nearest hospital uses Overpass result and names the source', async () => {
  const geo = fakeGeo();
  const r = await geoIntent('find the nearest hospital', ctx(geo));
  assert.match(
    r.say,
    /nearest hospital mapped in OpenStreetMap is Philippine General Hospital, 1\.2 kilometres from the map centre/,
  );
  assert.deepEqual(geo.calls[0].slice(0, 4), [
    'nearby',
    14.6,
    120.98,
    'hospital',
  ]);
});

test('nearby with a named place geocodes it first', async () => {
  const geo = fakeGeo();
  await geoIntent('nearest police station near Cebu City', ctx(geo));
  assert.equal(geo.calls[0][0], 'geocode');
  assert.equal(geo.calls[1][3], 'police');
  assert.equal(geo.calls[1][1], 10.3);
});

test('directions pick the travel mode and never claim live traffic', async () => {
  const geo = fakeGeo();
  const r = await geoIntent('directions to Intramuros by walking', ctx(geo));
  assert.equal(geo.calls.find((c) => c[0] === 'route')[2].profile, 'foot');
  assert.match(
    r.say,
    /^Walking to Intramuros: 12\.5 kilometres, about 30 minutes without live traffic\. Head north on Taft Avenue\. There is one alternative\./,
  );
  const geo2 = fakeGeo();
  await geoIntent('route to Makati', ctx(geo2));
  assert.equal(geo2.calls.find((c) => c[0] === 'route')[2].profile, 'car');
});

test('unknown destination is reported, not invented', async () => {
  const r = await geoIntent('route to nowhere land', ctx(fakeGeo())).catch(
    (e) => e,
  );
  assert.match(r.message, /couldn't find nowhere land/);
});

test('weather says it is a model estimate', async () => {
  const r = await geoIntent('what is the weather in Baguio', ctx(fakeGeo()));
  assert.match(
    r.say,
    /^Model estimate for Baguio: light rain, 28 degrees, feels like 31/,
  );
});

test('air quality and pollen answer honestly about coverage', async () => {
  const a = await geoIntent('air quality here', ctx(fakeGeo()));
  assert.match(a.say, /US AQI 64, Moderate/);
  const p = await geoIntent('pollen in Manila', ctx(fakeGeo()));
  assert.match(p.say, /isn't available .* only covers Europe/);
});

test('time zone and elevation intents', async () => {
  assert.match(
    (await geoIntent('what time is it in Tokyo', ctx(fakeGeo()))).say,
    /It's 17 Oct 2026, 20:00 in Tokyo, time zone Asia\/Tokyo/,
  );
  assert.match(
    (await geoIntent('elevation of Mount Pulag', ctx(fakeGeo()))).say,
    /about 2953 metres, from a 90 metre resolution model/,
  );
});

test('street imagery with no coverage says so', async () => {
  assert.match(
    (await geoIntent('show street view here', ctx(fakeGeo()))).say,
    /No street-level photos within 500 metres of the map centre/,
  );
});
