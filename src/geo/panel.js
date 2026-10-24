/**
 * GEO INTEL panel: Search · Nearby · Route · Environment · Imagery · Sources.
 * Every control calls a real provider; failures and coverage gaps are shown
 * as such. All external text is inserted with textContent (never innerHTML).
 *
 * Desktop: floating panel toggled by a "GEO" button in the top action bar.
 * Phone: docked into the floating orb sheet by the gids-android.sh mobile UI
 * (registry id "gev-geo-panel").
 */
import { getGeoServices } from './index.js';
import { parseCoordinates, GeoError } from './core.js';
import { PLACE_CATEGORIES } from './providers.js';
import {
  currentPosition,
  ensureLocationConsent,
  locationSharingConsent,
  setLocationSharingConsent,
} from './location.js';
import * as overlay from './overlay.js';

/* ------------------------------------------------------------ tiny DOM kit */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat())
    if (k != null && k !== false)
      n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
const safeUrl = (u) =>
  typeof u === 'string' && /^https:\/\//.test(u) ? u : null;
const km = (m) =>
  m >= 1000
    ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`
    : `${Math.round(m)} m`;
const dur = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const ago = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : '—';
};

function provenance(meta) {
  if (!meta) return null;
  const kind =
    {
      model: 'Model estimate',
      forecast: 'Forecast',
      historical: 'Historical',
      static: 'Map data',
      live: 'Live check',
    }[meta.kind] || meta.kind;
  return el(
    'div',
    { class: 'gg-prov' },
    `${kind} · ${meta.provider}${meta.cached ? ' (cached)' : ''} · retrieved ${ago(meta.retrievedAt)}`,
    meta.observedAt ? ` · valid ${meta.observedAt}` : '',
    meta.note ? el('div', { class: 'gg-note', text: meta.note }) : null,
    meta.attribution
      ? el('div', { class: 'gg-attr', text: meta.attribution })
      : null,
  );
}

function errorBox(e) {
  const msg =
    e instanceof GeoError
      ? {
          timeout: 'The service took too long to answer.',
          rate_limited:
            'The service is rate-limiting requests — try again shortly.',
          permission_denied: 'Location permission was denied.',
          unavailable: e.message,
          invalid_input: e.message,
          aborted: 'Cancelled.',
        }[e.code] || e.message
      : String(e?.message || e);
  return el('div', { class: 'gg-error', role: 'alert', text: msg });
}

/* ------------------------------------------------------------ panel */
export function mountGeoPanel({ root = document.body } = {}) {
  if (document.getElementById('gev-geo-panel'))
    return document.getElementById('gev-geo-panel');
  const geo = getGeoServices();
  injectStyles();

  const body = el('div', { class: 'gg-body', 'data-rail-scroller': true });
  const consentHost = el('div', { class: 'gg-consent', hidden: true });
  const tabs = [
    'Search',
    'Nearby',
    'Route',
    'Environment',
    'Imagery',
    'Sources',
  ];
  const tabBar = el('div', { class: 'gg-tabs', role: 'tablist' });
  const views = {};
  let ctl = null; // AbortController for the running request

  const panel = el(
    'div',
    {
      id: 'gev-geo-panel',
      class: 'panel-collapsible collapsed',
      'data-panel-id': 'gev-geo-panel',
      'aria-label': 'Geo intelligence',
    },
    el(
      'div',
      { class: 'gg-inner' },
      el(
        'div',
        { class: 'panel-header' },
        el('span', { class: 'panel-title', text: 'GEO INTEL' }),
        el('span', { class: 'panel-divider' }),
        el('button', {
          class: 'panel-collapse-btn',
          type: 'button',
          title: 'Close',
          'aria-label': 'Close geo panel',
          text: '✕',
          onclick: () => toggle(), // flips: also lets the phone orb sheet expand/collapse it
        }),
      ),
      tabBar,
      consentHost,
      body,
    ),
  );
  root.append(panel);

  function toggle(open = panel.classList.contains('collapsed')) {
    panel.classList.toggle('collapsed', !open);
    if (open && !body.firstChild) show('Search');
  }
  function show(name) {
    for (const b of tabBar.children)
      b.setAttribute('aria-selected', String(b.dataset.tab === name));
    body.replaceChildren(views[name]());
  }
  for (const t of tabs)
    tabBar.append(
      el('button', {
        type: 'button',
        role: 'tab',
        'data-tab': t,
        text: t,
        onclick: () => show(t),
      }),
    );

  /* ---------- helpers bound to the panel ---------- */
  function fresh() {
    ctl?.abort();
    ctl = new AbortController();
    return ctl.signal;
  }
  async function run(out, fn) {
    out.replaceChildren(el('div', { class: 'gg-busy', text: 'Loading…' }));
    try {
      await fn(fresh());
    } catch (e) {
      if (e?.code === 'aborted') return;
      out.replaceChildren(errorBox(e));
    }
  }
  function askConsent() {
    return new Promise((resolve) => {
      consentHost.hidden = false;
      consentHost.replaceChildren(
        el('div', {
          text: 'Use your precise location? It will be sent to the selected map/weather providers (OpenStreetMap services, Open-Meteo) only for this request type. You can change this in Sources.',
        }),
        el(
          'div',
          { class: 'gg-row' },
          el('button', {
            type: 'button',
            class: 'gg-btn',
            text: 'Allow',
            onclick: () => {
              consentHost.hidden = true;
              resolve(true);
            },
          }),
          el('button', {
            type: 'button',
            class: 'gg-btn gg-ghost',
            text: 'Don’t allow',
            onclick: () => {
              consentHost.hidden = true;
              resolve(false);
            },
          }),
        ),
      );
    });
  }
  async function myLocation() {
    if (!(await ensureLocationConsent(askConsent)))
      throw new GeoError(
        'permission_denied',
        'Location sharing is turned off (Sources tab).',
      );
    const p = await currentPosition();
    return p;
  }
  async function targetPoint(mode) {
    if (mode === 'me') return myLocation();
    const c = overlay.viewCenter();
    if (!c) throw new GeoError('unavailable', 'Map view not ready yet.');
    return c;
  }
  const whereSelect = () =>
    el(
      'select',
      { class: 'gg-in', 'aria-label': 'Location' },
      el('option', { value: 'center', text: 'Map centre' }),
      el('option', { value: 'me', text: 'My location' }),
    );
  function placeRow(p, { onPick } = {}) {
    return el(
      'button',
      { type: 'button', class: 'gg-item', onclick: () => onPick?.(p) },
      el('div', {
        class: 'gg-item-t',
        text: p.name || p.label || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`,
      }),
      el('div', {
        class: 'gg-item-s',
        text: [
          p.label && p.label !== p.name ? p.label : null,
          Number.isFinite(p.distanceM) ? km(p.distanceM) : null,
          p.kind || p.category || null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    );
  }

  /* ---------- Search ---------- */
  views.Search = () => {
    const q = el('input', {
      class: 'gg-in',
      type: 'search',
      placeholder: 'Place, address or 14.5995, 120.9842',
      'aria-label': 'Search places',
    });
    const out = el('div');
    const go = () =>
      run(out, async (signal) => {
        const text = q.value.trim();
        const c = parseCoordinates(text);
        if (c) {
          const r = await geo.reverseGeocode(c.lat, c.lon, { signal });
          overlay.markers([{ ...c, name: r.data?.name || text }], {
            kind: 'search',
          });
          overlay.flyTo(c.lat, c.lon);
          out.replaceChildren(
            r.data
              ? placeRow(r.data)
              : el('div', { text: 'No address found for these coordinates.' }),
            provenance(r.meta),
          );
          return;
        }
        const r = await geo.geocode(text, {
          bias: overlay.viewCenter(),
          signal,
        });
        if (!r.data.length)
          return out.replaceChildren(
            el('div', { text: 'No matches.' }),
            provenance(r.meta),
          );
        overlay.markers(r.data, { kind: 'search' });
        out.replaceChildren(
          ...r.data.map((p) =>
            placeRow(p, {
              onPick: (x) => {
                overlay.markers([x], { kind: 'search' });
                overlay.flyTo(x.lat, x.lon, { bbox: x.bbox });
              },
            }),
          ),
          provenance(r.meta),
        );
      });
    q.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    const rev = () =>
      run(out, async (signal) => {
        const c = overlay.viewCenter();
        if (!c) throw new GeoError('unavailable', 'Map view not ready yet.');
        const r = await geo.reverseGeocode(c.lat, c.lon, { signal });
        out.replaceChildren(
          el('div', {
            class: 'gg-kv',
            text: `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`,
          }),
          r.data ? placeRow(r.data) : el('div', { text: 'No address here.' }),
          provenance(r.meta),
        );
      });
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'gg-row' },
        q,
        el('button', {
          type: 'button',
          class: 'gg-btn',
          text: 'Go',
          onclick: go,
        }),
      ),
      el('button', {
        type: 'button',
        class: 'gg-btn gg-ghost',
        text: 'What’s at the map centre?',
        onclick: rev,
      }),
      out,
    );
  };

  /* ---------- Nearby ---------- */
  views.Nearby = () => {
    const cat = el(
      'select',
      { class: 'gg-in', 'aria-label': 'Category' },
      ...Object.keys(PLACE_CATEGORIES).map((k) =>
        el('option', { value: k, text: k.replace('_', ' ') }),
      ),
    );
    const radius = el(
      'select',
      { class: 'gg-in', 'aria-label': 'Radius' },
      ...[1000, 3000, 5000, 10000].map((r) =>
        el('option', { value: r, text: km(r), selected: r === 3000 }),
      ),
    );
    const where = whereSelect();
    const out = el('div');
    const go = () =>
      run(out, async (signal) => {
        const c = await targetPoint(where.value);
        const r = await geo.nearby(c.lat, c.lon, cat.value, {
          radiusM: Number(radius.value),
          signal,
        });
        overlay.markers(r.data, { kind: 'nearby', color: '#ffb84d' });
        if (!r.data.length)
          return out.replaceChildren(
            el('div', {
              text: `No mapped ${cat.value.replace('_', ' ')} within ${km(Number(radius.value))}.`,
            }),
            provenance(r.meta),
          );
        out.replaceChildren(
          ...r.data.slice(0, 40).map((p) =>
            placeRow(p, {
              onPick: (x) => overlay.flyTo(x.lat, x.lon, { heightM: 900 }),
            }),
          ),
          provenance(r.meta),
        );
      });
    return el(
      'div',
      {},
      el('div', { class: 'gg-row' }, cat, radius),
      el(
        'div',
        { class: 'gg-row' },
        where,
        el('button', {
          type: 'button',
          class: 'gg-btn',
          text: 'Find',
          onclick: go,
        }),
      ),
      out,
    );
  };

  /* ---------- Route ---------- */
  views.Route = () => {
    const from = el('input', {
      class: 'gg-in',
      placeholder: 'From: place / lat,lon — empty = my location',
      'aria-label': 'From',
    });
    const to = el('input', {
      class: 'gg-in',
      placeholder: 'To: place / lat,lon',
      'aria-label': 'To',
    });
    const mode = el(
      'select',
      { class: 'gg-in', 'aria-label': 'Travel mode' },
      el('option', { value: 'car', text: 'Drive' }),
      el('option', { value: 'foot', text: 'Walk' }),
      el('option', { value: 'bike', text: 'Cycle' }),
    );
    const stops = el('textarea', {
      class: 'gg-in',
      rows: 3,
      placeholder: 'Optimize: one stop per line (3-20)',
      'aria-label': 'Stops to optimize',
    });
    const out = el('div');
    async function resolve(text, signal, fallbackMe) {
      const t = text.trim();
      if (!t && fallbackMe) return myLocation();
      const c = parseCoordinates(t);
      if (c) return c;
      const r = await geo.geocode(t, {
        limit: 1,
        bias: overlay.viewCenter(),
        signal,
      });
      if (!r.data[0])
        throw new GeoError('invalid_input', `Couldn’t find “${t}”.`);
      return r.data[0];
    }
    function showRoutes(res, a, b) {
      const list = res.data.routes;
      const pick = (r) => {
        overlay.routeLine(r.geometry);
        overlay.markers(
          [
            { ...a, name: 'Start' },
            { ...b, name: 'Destination' },
          ],
          { kind: 'route-ends', color: '#7cff9b' },
        );
        overlay.flyToLine(r.geometry);
        out.replaceChildren(
          ...list.map((x) =>
            el(
              'button',
              {
                type: 'button',
                class: `gg-item${x === r ? ' gg-sel' : ''}`,
                onclick: () => pick(x),
              },
              el('div', {
                class: 'gg-item-t',
                text: `${x.index === 0 ? 'Fastest' : `Alternative ${x.index}`} · ${dur(x.durationS)}`,
              }),
              el('div', { class: 'gg-item-s', text: km(x.distanceM) }),
            ),
          ),
          el(
            'div',
            { class: 'gg-row' },
            el('button', {
              type: 'button',
              class: 'gg-btn gg-ghost',
              text: '🔊 Speak',
              onclick: () => speakSteps(r),
            }),
            el('button', {
              type: 'button',
              class: 'gg-btn gg-ghost',
              text: 'Elevation',
              onclick: () => profile(r),
            }),
            el('button', {
              type: 'button',
              class: 'gg-btn gg-ghost',
              text: 'Clear',
              onclick: () => {
                overlay.clear('route');
                overlay.clear('route-ends');
                out.replaceChildren();
              },
            }),
          ),
          el(
            'ol',
            { class: 'gg-steps' },
            ...r.steps.map((s) =>
              el(
                'li',
                {},
                el('span', { text: s.instruction }),
                s.distanceM
                  ? el('small', { text: ` · ${km(s.distanceM)}` })
                  : null,
              ),
            ),
          ),
          provenance(res.meta),
        );
      };
      pick(list[0]);
    }
    function speakSteps(r) {
      const text = [
        `Route: ${km(r.distanceM)}, about ${dur(r.durationS)}.`,
        ...r.steps.slice(0, 8).map((s) => s.instruction),
      ].join('. ');
      if (globalThis.gevSpeak) globalThis.gevSpeak(text);
      else if (globalThis.speechSynthesis)
        globalThis.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
    async function profile(r) {
      const box = el('div', { class: 'gg-busy', text: 'Loading elevation…' });
      out.append(box);
      try {
        const p = await geo.elevationProfile(r.geometry, { samples: 60 });
        box.replaceWith(elevationChart(p.data), provenance(p.meta));
      } catch (e) {
        box.replaceWith(errorBox(e));
      }
    }
    const go = () =>
      run(out, async (signal) => {
        const a = await resolve(from.value, signal, true);
        const b = await resolve(to.value, signal, false);
        const res = await geo.route([a, b], { profile: mode.value, signal });
        if (!res.data.available)
          return out.replaceChildren(
            el('div', { text: `No route: ${res.data.reason}` }),
            provenance(res.meta),
          );
        showRoutes(res, a, b);
      });
    const opt = () =>
      run(out, async (signal) => {
        const lines = stops.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        const pts = [];
        for (const l of lines)
          pts.push({ ...(await resolve(l, signal, false)), name: l });
        const res = await geo.optimize(pts, { profile: mode.value, signal });
        if (!res.data.available)
          return out.replaceChildren(
            el('div', { text: `Optimization failed: ${res.data.reason}` }),
            provenance(res.meta),
          );
        overlay.routeLine(res.data.geometry);
        overlay.markers(
          res.data.order.map((i, k) => ({
            ...pts[i],
            name: `${k + 1}. ${pts[i].name}`,
          })),
          { kind: 'route-ends', color: '#7cff9b' },
        );
        overlay.flyToLine(res.data.geometry);
        out.replaceChildren(
          el('div', {
            class: 'gg-kv',
            text: `${km(res.data.distanceM)} · ${dur(res.data.durationS)}`,
          }),
          el(
            'ol',
            { class: 'gg-steps' },
            ...res.data.order.map((i) => el('li', { text: pts[i].name })),
          ),
          el('div', { class: 'gg-note', text: res.data.note }),
          provenance(res.meta),
        );
      });
    const snap = () =>
      run(out, async (signal) => {
        const me = await myLocation();
        const r = await geo.snapToRoad(me.lat, me.lon, {
          profile: mode.value,
          signal,
        });
        if (!r.data.available)
          return out.replaceChildren(
            el('div', { text: r.data.reason }),
            provenance(r.meta),
          );
        overlay.markers(
          [{ lat: r.data.lat, lon: r.data.lon, name: r.data.road || 'Road' }],
          { kind: 'snap', color: '#ff7ad9' },
        );
        overlay.flyTo(r.data.lat, r.data.lon, { heightM: 600 });
        out.replaceChildren(
          el('div', {
            class: 'gg-kv',
            text: `Nearest road: ${r.data.road || 'unnamed'} (${km(r.data.offsetM)} away; GPS ±${me.accuracyM ?? '?'} m${me.stale ? ', stale fix' : ''})`,
          }),
          provenance(r.meta),
        );
      });
    return el(
      'div',
      {},
      from,
      to,
      el(
        'div',
        { class: 'gg-row' },
        mode,
        el('button', {
          type: 'button',
          class: 'gg-btn',
          text: 'Route',
          onclick: go,
        }),
      ),
      el(
        'details',
        {},
        el('summary', { text: 'More: optimize stops · snap to road' }),
        stops,
        el(
          'div',
          { class: 'gg-row' },
          el('button', {
            type: 'button',
            class: 'gg-btn gg-ghost',
            text: 'Optimize order',
            onclick: opt,
          }),
          el('button', {
            type: 'button',
            class: 'gg-btn gg-ghost',
            text: 'Snap me to road',
            onclick: snap,
          }),
        ),
      ),
      out,
    );
  };

  /* ---------- Environment ---------- */
  views.Environment = () => {
    const where = whereSelect();
    const out = el('div');
    const card = (title, rows, meta, extra) =>
      el(
        'section',
        { class: 'gg-card' },
        el('h4', { text: title }),
        ...rows
          .filter(Boolean)
          .map(([k, v]) =>
            el(
              'div',
              { class: 'gg-kv' },
              el('span', { text: k }),
              el('b', { text: v == null || v === '' ? 'n/a' : String(v) }),
            ),
          ),
        extra || null,
        provenance(meta),
      );
    const go = () =>
      run(out, async (signal) => {
        const c = await targetPoint(where.value);
        const head = el('div', {
          class: 'gg-kv',
          text: `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`,
        });
        out.replaceChildren(head);
        const jobs = [
          geo
            .weather(c.lat, c.lon, { signal })
            .then((w) =>
              card(
                'Weather',
                [
                  ['Now', w.data.current.condition],
                  [
                    'Temperature',
                    `${w.data.current.temperatureC} °C (feels ${w.data.current.feelsLikeC} °C)`,
                  ],
                  ['Humidity', `${w.data.current.humidityPct} %`],
                  [
                    'Wind',
                    `${w.data.current.windKmh} km/h, gusts ${w.data.current.windGustKmh}`,
                  ],
                  ['Precipitation', `${w.data.current.precipitationMm} mm`],
                  ...w.data.daily.map((d) => [
                    d.date,
                    `${d.minC}–${d.maxC} °C · rain ${d.precipitationProbabilityPct ?? 'n/a'}%`,
                  ]),
                ],
                w.meta,
              ),
            ),
          geo.airQuality(c.lat, c.lon, { signal }).then((a) =>
            card(
              'Air quality',
              [
                [
                  'US AQI',
                  a.data.usAqi != null
                    ? `${a.data.usAqi} (${a.data.usAqiCategory})`
                    : null,
                ],
                [
                  'PM2.5',
                  a.data.pm2_5 != null ? `${a.data.pm2_5} μg/m³` : null,
                ],
                ['PM10', a.data.pm10 != null ? `${a.data.pm10} μg/m³` : null],
                [
                  'Ozone',
                  a.data.ozone != null ? `${a.data.ozone} μg/m³` : null,
                ],
                ['NO₂', a.data.no2 != null ? `${a.data.no2} μg/m³` : null],
                [
                  'Pollen',
                  a.data.pollenAvailable
                    ? Object.entries(a.data.pollen)
                        .filter(([, v]) => v != null)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(', ')
                    : a.data.pollenReason,
                ],
              ],
              a.meta,
            ),
          ),
          geo
            .solar(c.lat, c.lon, { signal })
            .then((s) =>
              card(
                'Solar',
                [
                  [
                    'Shortwave now',
                    s.data.now.shortwaveWm2 != null
                      ? `${s.data.now.shortwaveWm2} W/m²`
                      : null,
                  ],
                  [
                    'Direct / diffuse',
                    `${s.data.now.directWm2 ?? 'n/a'} / ${s.data.now.diffuseWm2 ?? 'n/a'} W/m²`,
                  ],
                  ['UV index', s.data.now.uvIndex],
                  ...s.data.daily.map((d) => [
                    d.date,
                    `${d.shortwaveSumMJm2 ?? 'n/a'} MJ/m² · sun ${String(d.sunrise).slice(11)}–${String(d.sunset).slice(11)}`,
                  ]),
                ],
                s.meta,
              ),
            ),
          geo
            .elevation([c], { signal })
            .then((e) =>
              card(
                'Elevation',
                [
                  [
                    'Ground',
                    e.data[0].elevationM != null
                      ? `${Math.round(e.data[0].elevationM)} m`
                      : null,
                  ],
                ],
                e.meta,
              ),
            ),
          geo.timezone(c.lat, c.lon, { signal }).then((t) =>
            card(
              'Time zone',
              [
                ['Zone', `${t.data.tzid} (${t.data.abbreviation})`],
                [
                  'UTC offset',
                  `${t.data.utcOffsetSeconds >= 0 ? '+' : '−'}${Math.abs(t.data.utcOffsetSeconds / 3600)} h`,
                ],
                ['Local time', t.data.localTime],
              ],
              t.meta,
            ),
          ),
        ];
        for (const j of jobs) {
          const slot = el('div', { class: 'gg-busy', text: 'Loading…' });
          out.append(slot);
          j.then(
            (node) => slot.replaceWith(node),
            (e) => e?.code !== 'aborted' && slot.replaceWith(errorBox(e)),
          );
        }
        await Promise.allSettled(jobs);
      });
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'gg-row' },
        where,
        el('button', {
          type: 'button',
          class: 'gg-btn',
          text: 'Check',
          onclick: go,
        }),
      ),
      out,
    );
  };

  /* ---------- Imagery ---------- */
  views.Imagery = () => {
    const where = whereSelect();
    const out = el('div');
    const go = () =>
      run(out, async (signal) => {
        const c = await targetPoint(where.value);
        const [st, ae] = await Promise.allSettled([
          geo.streetImagery(c.lat, c.lon, { radiusM: 500, signal }),
          geo.aerialImagery(c.lat, c.lon, { radiusM: 10000, signal }),
        ]);
        const parts = [el('h4', { text: 'Street level (Panoramax)' })];
        if (st.status === 'fulfilled') {
          if (!st.value.data.length)
            parts.push(
              el('div', { text: 'No street-level photos within 500 m.' }),
            );
          overlay.markers(
            st.value.data.map((p) => ({ ...p, name: '' })),
            { kind: 'street', color: '#c084fc' },
          );
          for (const p of st.value.data.slice(0, 12)) {
            const href = safeUrl(p.imageUrl);
            const thumb = safeUrl(p.thumbUrl);
            parts.push(
              el(
                'a',
                {
                  class: 'gg-thumb',
                  href,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                thumb
                  ? el('img', {
                      src: thumb,
                      alt: 'Street photo',
                      loading: 'lazy',
                    })
                  : null,
                el('span', {
                  text: `${p.capturedAt ? new Date(p.capturedAt).toLocaleDateString() : 'date unknown'} · ${km(p.distanceM)}${p.headingDeg != null ? ` · ${p.headingDeg}°` : ''} · ${p.license || 'licence n/a'}${p.author ? ` · ${p.author}` : ''}`,
                }),
              ),
            );
          }
          parts.push(provenance(st.value.meta));
        } else parts.push(errorBox(st.reason));
        parts.push(el('h4', { text: 'Aerial (OpenAerialMap)' }));
        if (ae.status === 'fulfilled') {
          if (!ae.value.data.length)
            parts.push(
              el('div', { text: 'No OpenAerialMap imagery within 10 km.' }),
            );
          for (const a of ae.value.data) {
            parts.push(
              el(
                'div',
                { class: 'gg-item' },
                el('div', { class: 'gg-item-t', text: a.title }),
                el('div', {
                  class: 'gg-item-s',
                  text: `${a.acquiredTo ? `acquired ${String(a.acquiredTo).slice(0, 10)}` : 'date unknown'} · ${a.provider || 'provider n/a'}${a.gsdM ? ` · ${a.gsdM} m/px` : ''} · ${a.license || 'licence n/a'}`,
                }),
                a.tmsUrl
                  ? el('button', {
                      type: 'button',
                      class: 'gg-btn gg-ghost',
                      text: 'Show on globe',
                      onclick: () => {
                        overlay.setImageryLayer(
                          a.tmsUrl,
                          `OpenAerialMap · ${a.provider || ''} · ${String(a.acquiredTo || '').slice(0, 10)}`,
                        );
                        if (a.bbox) overlay.flyTo(0, 0, { bbox: a.bbox });
                      },
                    })
                  : null,
              ),
            );
          }
          parts.push(
            el('button', {
              type: 'button',
              class: 'gg-btn gg-ghost',
              text: 'Remove aerial layer',
              onclick: () => overlay.setImageryLayer(null),
            }),
            provenance(ae.value.meta),
          );
        } else parts.push(errorBox(ae.reason));
        out.replaceChildren(...parts);
      });
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'gg-row' },
        where,
        el('button', {
          type: 'button',
          class: 'gg-btn',
          text: 'Find imagery',
          onclick: go,
        }),
      ),
      out,
    );
  };

  /* ---------- Sources ---------- */
  views.Sources = () => {
    const out = el('div');
    const consent = el(
      'select',
      { class: 'gg-in', 'aria-label': 'Location sharing' },
      ...[
        ['ask', 'Ask each time it is needed'],
        ['granted', 'Allowed'],
        ['denied', 'Never share my location'],
      ].map(([v, t]) =>
        el('option', {
          value: v,
          text: t,
          selected: locationSharingConsent() === v,
        }),
      ),
    );
    consent.addEventListener('change', () =>
      setLocationSharingConsent(consent.value),
    );
    const check = () =>
      run(out, async () => {
        const h = await geo.health();
        out.replaceChildren(
          ...h.data.map((x) =>
            el(
              'div',
              { class: 'gg-kv' },
              el('span', { text: x.name }),
              el('b', {
                class: x.ok ? 'gg-ok' : 'gg-bad',
                text: x.ok ? `OK · ${x.latencyMs} ms` : `DOWN (${x.error})`,
              }),
            ),
          ),
          provenance(h.meta),
        );
      });
    return el(
      'div',
      {},
      el('h4', { text: 'Location sharing' }),
      consent,
      el('h4', { text: 'Provider status' }),
      el('button', {
        type: 'button',
        class: 'gg-btn',
        text: 'Check services',
        onclick: check,
      }),
      out,
      el('h4', { text: 'Endpoints' }),
      ...Object.entries(geo.endpoints).map(([k, v]) =>
        el(
          'div',
          { class: 'gg-kv' },
          el('span', { text: k }),
          el('b', { text: [].concat(v).join(', ') }),
        ),
      ),
      el('h4', { text: 'Attribution' }),
      ...Object.values(geo.attribution).map((a) =>
        el('div', { class: 'gg-attr', text: a }),
      ),
      el('button', {
        type: 'button',
        class: 'gg-btn gg-ghost',
        text: `Clear cache (${geo.cache.size})`,
        onclick: (e) => {
          geo.cache.clear();
          e.currentTarget.textContent = 'Clear cache (0)';
        },
      }),
    );
  };

  /* ---------- desktop entry point ---------- */
  const bar = document.getElementById('top-center-actions');
  if (bar && !document.getElementById('gev-geo-toggle')) {
    bar.append(
      el('button', {
        id: 'gev-geo-toggle',
        type: 'button',
        'aria-label': 'Geo intelligence',
        title: 'Geo intelligence: search, nearby, route, environment, imagery',
        text: 'GEO',
        onclick: () => toggle(),
      }),
    );
  }

  panel.gevToggle = toggle;
  panel.gevShow = (t) => {
    toggle(true);
    show(t);
  };
  return panel;
}

function elevationChart(p) {
  const w = 300;
  const h = 90;
  const pts = p.samples.filter((s) => Number.isFinite(s.elevationM));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'gg-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Elevation profile ${p.minM ?? '?'} to ${p.maxM ?? '?'} m`,
  );
  if (pts.length > 1) {
    const min = p.minM;
    const span = Math.max(1, p.maxM - p.minM);
    const d = pts
      .map(
        (s, i) =>
          `${i ? 'L' : 'M'}${((s.distanceM / p.totalM) * w).toFixed(1)},${(h - 6 - ((s.elevationM - min) / span) * (h - 12)).toFixed(1)}`,
      )
      .join('');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#5ad2ff');
    path.setAttribute('stroke-width', '2');
    svg.append(path);
  }
  const wrap = document.createElement('div');
  wrap.className = 'gg-card';
  const cap = document.createElement('div');
  cap.className = 'gg-kv';
  cap.textContent = `${p.minM ?? '?'}–${p.maxM ?? '?'} m · gain ${p.gainM} m · loss ${p.lossM} m · ${(p.totalM / 1000).toFixed(1)} km`;
  wrap.append(svg, cap);
  return wrap;
}

function injectStyles() {
  if (document.getElementById('gev-geo-style')) return;
  const s = document.createElement('style');
  s.id = 'gev-geo-style';
  s.textContent = `
#gev-geo-toggle{font:600 11px/1 'JetBrains Mono',monospace;letter-spacing:1.5px;color:#9fe6ff;min-width:44px}
#gev-geo-panel{position:fixed;top:72px;right:16px;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 160px);z-index:160;
  background:rgba(8,14,26,.9);border:1px solid rgba(0,212,255,.25);border-radius:14px;color:#dff3ff;
  font:13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.5);display:flex;flex-direction:column}
#gev-geo-panel.collapsed{display:none}
#gev-geo-panel .gg-inner{display:flex;flex-direction:column;min-height:0;flex:1}
#gev-geo-panel .panel-header{display:flex;align-items:center;gap:8px;padding:10px 12px}
#gev-geo-panel .panel-title{font:600 11px 'JetBrains Mono',monospace;letter-spacing:2px;color:#8cc8ff}
#gev-geo-panel .panel-divider{flex:1;height:1px;background:rgba(0,212,255,.25)}
#gev-geo-panel .panel-collapse-btn{background:none;border:1px solid rgba(0,212,255,.3);color:#dff3ff;border-radius:6px;width:26px;height:26px}
.gg-tabs{display:flex;gap:4px;overflow-x:auto;padding:0 10px 8px;scrollbar-width:none}
.gg-tabs button{flex:0 0 auto;padding:6px 9px;border-radius:8px;border:1px solid rgba(0,212,255,.2);background:transparent;color:#8cc8ff;font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:1px;text-transform:uppercase}
.gg-tabs button[aria-selected=true]{background:rgba(0,212,255,.18);color:#fff;border-color:rgba(0,212,255,.55)}
.gg-body{overflow-y:auto;padding:0 12px 12px;min-height:0;flex:1}
.gg-row{display:flex;gap:6px;margin:6px 0;flex-wrap:wrap}
.gg-in{flex:1 1 120px;min-width:0;background:rgba(255,255,255,.05);border:1px solid rgba(0,212,255,.25);border-radius:8px;color:#dff3ff;padding:8px;font:inherit;margin:3px 0;width:100%;box-sizing:border-box}
.gg-row .gg-in{width:auto}
.gg-btn{padding:8px 12px;border-radius:8px;border:1px solid rgba(0,212,255,.45);background:rgba(0,212,255,.15);color:#fff;font:600 12px Inter,sans-serif;min-height:34px}
.gg-ghost{background:transparent}
.gg-item{display:block;width:100%;text-align:left;padding:8px;margin:4px 0;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:inherit}
.gg-item.gg-sel{border-color:rgba(0,229,255,.7)}
.gg-item-t{font-weight:600}.gg-item-s{opacity:.75;font-size:12px}
.gg-card{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px;margin:8px 0}
.gg-card h4,.gg-body h4{margin:10px 0 4px;font:600 11px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:#8cc8ff;text-transform:uppercase}
.gg-kv{display:flex;justify-content:space-between;gap:10px;padding:2px 0;font-size:12.5px}
.gg-kv b{font-weight:600;text-align:right}
.gg-prov{margin-top:6px;font-size:11px;opacity:.7}.gg-note{font-style:italic}.gg-attr{font-size:10.5px;opacity:.7}
.gg-error{color:#ff9b9b;padding:6px 0}.gg-busy{opacity:.7;padding:6px 0}
.gg-ok{color:#7cff9b}.gg-bad{color:#ff9b9b}
.gg-steps{padding-left:18px;margin:6px 0}.gg-steps li{margin:3px 0}
.gg-thumb{display:flex;gap:8px;align-items:center;margin:6px 0;color:inherit;text-decoration:none;font-size:12px}
.gg-thumb img{width:84px;height:56px;object-fit:cover;border-radius:6px;flex:0 0 auto}
.gg-chart{width:100%;height:90px;background:rgba(0,212,255,.05);border-radius:6px}
.gg-consent{margin:0 12px 8px;padding:10px;border:1px solid rgba(255,200,80,.5);border-radius:10px;background:rgba(255,200,80,.08);font-size:12.5px}
@media (max-width:768px){#gev-geo-panel{top:auto;bottom:90px;right:8px;left:8px;width:auto;max-height:70vh}}
`;
  document.head.append(s);
}
