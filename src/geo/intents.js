/**
 * Natural-language geo intents for voice / text commands. Every answer comes
 * from a provider call; nothing is invented. Returns null when the phrase is
 * not a geo question so the caller's existing handling (fly-to, layers, ocean)
 * keeps working unchanged.
 *
 * Location: "near me" / "from here" uses the device position only after
 * consent; otherwise the map centre is used and the answer says so.
 */
import { categoryFromText } from './providers.js';
import { parseCoordinates } from './core.js';

const fmtKm = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} kilometres` : `${Math.round(m)} metres`;
const fmtMin = (s) => {
  const m = Math.round(s / 60);
  return m >= 60
    ? `${Math.floor(m / 60)} hours ${m % 60} minutes`
    : `${m} minutes`;
};

/**
 * @param {string} text
 * @param {object} ctx { geo, here(): Promise<{lat,lon,label}>, center(): {lat,lon}|null, show?(kind,data) }
 */
export async function geoIntent(text, ctx) {
  const raw = String(text || '')
    .trim()
    .replace(/[.!?]+$/, '');
  const t = raw.toLowerCase();
  const { geo } = ctx;

  async function placeOrHere(phrase) {
    const p = (phrase || '').trim();
    if (!p || /^(here|me|my location|this area|the map)$/i.test(p))
      return ctx.here();
    const c = parseCoordinates(p);
    if (c) return { ...c, label: p };
    const r = await geo.geocode(p, { limit: 1, bias: ctx.center?.() || null });
    if (!r.data[0])
      throw Object.assign(new Error(`I couldn't find ${p}.`), { spoken: true });
    return { ...r.data[0], label: r.data[0].name };
  }

  // nearest / nearby <category> [near <place>]
  let m = t.match(
    /\b(?:nearest|closest|nearby|near me|find (?:a|the|some)?)\b/,
  );
  const cat = categoryFromText(t);
  if (m && cat && !/\b(route|directions)\b/.test(t)) {
    const near = raw.match(/\b(?:near|around|in)\s+(?!me\b)(.+)$/i)?.[1];
    const at = await placeOrHere(near);
    const r = await geo.nearby(at.lat, at.lon, cat, {
      radiusM: 5000,
      limit: 10,
    });
    ctx.show?.('nearby', { at, items: r.data, meta: r.meta });
    if (!r.data.length)
      return {
        say: `No mapped ${cat.replace('_', ' ')} within 5 kilometres of ${at.label}.`,
      };
    const f = r.data[0];
    return {
      say: `The nearest ${cat.replace('_', ' ')} mapped in OpenStreetMap is ${f.name}, ${fmtKm(f.distanceM)} from ${at.label}.`,
      data: r,
    };
  }

  // route / directions to X [from Y] [by car|walking|bike]
  m = raw.match(
    /\b(?:route|directions|how (?:do|can) i get|drive|walk|cycle|bike)\s+(?:me\s+)?to\s+(.+?)(?:\s+from\s+(.+?))?(?:\s+(?:by|on)\s+(car|foot|walking|bike|bicycle|cycling))?$/i,
  );
  if (m) {
    const modeWords = `${m[3] || ''} ${t.split(/\s+/)[0]}`;
    const profile = /walk|foot/.test(modeWords)
      ? 'foot'
      : /bike|bicycle|cycl/.test(modeWords)
        ? 'bike'
        : 'car';
    const to = await placeOrHere(m[1]);
    const from = await placeOrHere(m[2] || 'here');
    const r = await geo.route([from, to], { profile });
    if (!r.data.available)
      return { say: `I couldn't find a route: ${r.data.reason}.` };
    const best = r.data.routes[0];
    ctx.show?.('route', { from, to, result: r });
    const alt =
      r.data.routes.length > 1
        ? ` There ${r.data.routes.length === 2 ? 'is one alternative' : `are ${r.data.routes.length - 1} alternatives`}.`
        : '';
    return {
      say: `${{ car: 'Driving', foot: 'Walking', bike: 'Cycling' }[profile]} to ${to.label}: ${fmtKm(best.distanceM)}, about ${fmtMin(best.durationS)} without live traffic. ${best.steps[0]?.instruction || ''}.${alt}`,
      data: r,
    };
  }

  // weather
  m = raw.match(/\bweather\b(?:\s+(?:in|at|for|near)\s+(.+))?/i);
  if (m) {
    const at = await placeOrHere(m[1]);
    const w = await geo.weather(at.lat, at.lon);
    const c = w.data.current;
    ctx.show?.('environment', { at });
    return {
      say: `Model estimate for ${at.label}: ${c.condition.toLowerCase()}, ${Math.round(c.temperatureC)} degrees, feels like ${Math.round(c.feelsLikeC)}, wind ${Math.round(c.windKmh)} kilometres per hour.`,
      data: w,
    };
  }

  // air quality / pollen
  m = raw.match(
    /\b(air quality|aqi|pollution|pm ?2\.?5|pollen)\b(?:.*?\b(?:in|at|for|near)\s+(.+))?/i,
  );
  if (m) {
    const at = await placeOrHere(m[2]);
    const a = await geo.airQuality(at.lat, at.lon);
    if (/pollen/i.test(m[1]))
      return {
        say: a.data.pollenAvailable
          ? `Pollen at ${at.label}: ${
              Object.entries(a.data.pollen)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k} ${v}`)
                .join(', ') || 'none detected'
            }.`
          : `Pollen data isn't available for ${at.label}; the source only covers Europe.`,
        data: a,
      };
    return {
      say:
        a.data.usAqi != null
          ? `Air quality model estimate for ${at.label}: US AQI ${a.data.usAqi}, ${a.data.usAqiCategory}. PM2.5 ${a.data.pm2_5} micrograms per cubic metre.`
          : `No air-quality value is available for ${at.label}.`,
      data: a,
    };
  }

  // time zone / local time
  m = raw.match(
    /\b(?:what(?:'s| is) the )?(?:time|time zone|timezone|local time)\s+(?:is it\s+)?(?:in|at)\s+(.+)$/i,
  );
  if (m) {
    const at = await placeOrHere(m[1]);
    const z = await geo.timezone(at.lat, at.lon);
    return {
      say: `It's ${z.data.localTime} in ${at.label}, time zone ${z.data.tzid}.`,
      data: z,
    };
  }

  // elevation
  m = raw.match(
    /\b(?:elevation|altitude|how high)\b(?:\s+(?:of|at|is|in)\s+(.+))?/i,
  );
  if (m) {
    const at = await placeOrHere(m[1]);
    const e = await geo.elevation([at]);
    const v = e.data[0].elevationM;
    return {
      say:
        v == null
          ? `No elevation data for ${at.label}.`
          : `Ground elevation at ${at.label} is about ${Math.round(v)} metres, from a 90 metre resolution model.`,
      data: e,
    };
  }

  // street-level imagery
  if (/\b(street (?:view|level|photos?)|panoramax)\b/.test(t)) {
    const at = await placeOrHere(raw.match(/\b(?:at|in|near)\s+(.+)$/i)?.[1]);
    const s = await geo.streetImagery(at.lat, at.lon, { radiusM: 500 });
    ctx.show?.('imagery', { at });
    if (!s.data.length)
      return {
        say: `No street-level photos within 500 metres of ${at.label}.`,
      };
    return {
      say: `${s.data.length} street-level photos near ${at.label}; the closest was taken ${s.data[0].capturedAt ? new Date(s.data[0].capturedAt).toDateString() : 'on an unknown date'}.`,
      data: s,
    };
  }

  return null;
}
