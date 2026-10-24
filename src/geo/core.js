/**
 * GEV-GEO core: validation, HTTP with timeouts/retries/cancellation, caching,
 * per-host rate limiting and provenance records.
 *
 * Zero dependencies. Runs in the browser, the Capacitor APK (no local server)
 * and Node tests. In the APK, requests go through CapacitorHttp when present so
 * hosts without CORS still work.
 */

export class GeoError extends Error {
  /**
   * @param {string} code machine-readable reason (invalid_input, timeout,
   *   rate_limited, upstream, bad_response, unavailable, aborted)
   * @param {string} message human-readable message
   * @param {object} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'GeoError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/* ------------------------------------------------------------ validation */

export function isLatLon(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/** Return a normalized {lat, lon} or throw GeoError('invalid_input'). */
export function point(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!isLatLon(la, lo))
    throw new GeoError('invalid_input', `Invalid coordinate: ${lat}, ${lon}`);
  return { lat: la, lon: lo };
}

/** Parse "14.5995, 120.9842" / "14.5995 120.9842" / "14°35'N 120°59'E". */
export function parseCoordinates(text) {
  const s = String(text || '').trim();
  const dec = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (dec) {
    const lat = Number(dec[1]);
    const lon = Number(dec[2]);
    return isLatLon(lat, lon) ? { lat, lon } : null;
  }
  const dms = s.match(
    /^(\d{1,2})[°\s]+(\d{1,2})?['′\s]*(\d{1,2}(?:\.\d+)?)?["″\s]*([NS])[\s,]+(\d{1,3})[°\s]+(\d{1,2})?['′\s]*(\d{1,2}(?:\.\d+)?)?["″\s]*([EW])$/i,
  );
  if (dms) {
    const conv = (d, m, sec, h) =>
      (Number(d) + Number(m || 0) / 60 + Number(sec || 0) / 3600) *
      (/[SW]/i.test(h) ? -1 : 1);
    const lat = conv(dms[1], dms[2], dms[3], dms[4]);
    const lon = conv(dms[5], dms[6], dms[7], dms[8]);
    return isLatLon(lat, lon) ? { lat, lon } : null;
  }
  return null;
}

export function clampRadius(m, max = 10000) {
  const r = Number(m);
  if (!Number.isFinite(r) || r <= 0)
    throw new GeoError('invalid_input', 'Radius must be a positive number');
  return Math.min(r, max);
}

/** Great-circle distance in metres. */
export function haversineM(a, b) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box around a point, [west, south, east, north]. */
export function bboxAround(p, radiusM) {
  const dLat = radiusM / 111320;
  const dLon =
    radiusM / (111320 * Math.max(0.01, Math.cos((p.lat * Math.PI) / 180)));
  return [
    Math.max(-180, p.lon - dLon),
    Math.max(-90, p.lat - dLat),
    Math.min(180, p.lon + dLon),
    Math.min(90, p.lat + dLat),
  ];
}

/* ------------------------------------------------------------ provenance */

/**
 * Wrap provider output with provenance. `kind` distinguishes live,
 * forecast, observation, static and historical data so the UI / AI never
 * presents a forecast as a measurement or old imagery as current.
 */
export function record(data, meta) {
  return {
    data,
    meta: {
      provider: meta.provider,
      source: meta.source || meta.provider,
      attribution: meta.attribution || null,
      kind: meta.kind || 'static',
      retrievedAt: new Date(meta.retrievedAt || Date.now()).toISOString(),
      observedAt: meta.observedAt || null,
      units: meta.units || null,
      cached: Boolean(meta.cached),
      expiresAt: meta.ttlMs
        ? new Date((meta.retrievedAt || Date.now()) + meta.ttlMs).toISOString()
        : null,
      note: meta.note || null,
    },
  };
}

/* ------------------------------------------------------------ cache */

export class TtlCache {
  constructor(max = 200) {
    this.max = max;
    this.map = new Map();
  }
  get(key, now = Date.now()) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key); // LRU touch
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value, ttlMs, now = Date.now()) {
    this.map.delete(key);
    this.map.set(key, { value, expires: now + ttlMs });
    while (this.map.size > this.max)
      this.map.delete(this.map.keys().next().value);
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
}

/* ------------------------------------------------------------ rate limit */

/** Enforce a minimum spacing between requests to the same host. */
export class HostPacer {
  constructor(spacingByHost = {}) {
    this.spacing = spacingByHost;
    this.next = new Map();
  }
  async wait(host, signal, sleep = defaultSleep) {
    const gap = this.spacing[host];
    if (!gap) return;
    const now = Date.now();
    const at = Math.max(now, this.next.get(host) || 0);
    this.next.set(host, at + gap);
    if (at > now) await sleep(at - now, signal);
  }
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new GeoError('aborted', 'Request cancelled'));
      },
      { once: true },
    );
  });
}

/* ------------------------------------------------------------ http */

function nativeHttp() {
  const cap = globalThis.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.CapacitorHttp || null;
}

/**
 * JSON GET/POST with timeout, cancellation, bounded retries (429/5xx) and
 * optional per-host pacing. Never retries 4xx other than 429.
 */
export function createHttp({
  fetchImpl = (...a) => globalThis.fetch(...a),
  pacer = new HostPacer(),
  timeoutMs = 12000,
  retries = 2,
  userAgent = 'gids-eye-view/1.0 (+https://github.com/electronictechshow-netizen/gods-eye-view-free)',
  sleep = defaultSleep,
} = {}) {
  async function once(url, { method = 'GET', body, headers = {}, signal }) {
    const ctl = new AbortController();
    const timer = setTimeout(
      () => ctl.abort(new GeoError('timeout', 'Request timed out')),
      timeoutMs,
    );
    const onAbort = () => ctl.abort(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const native = nativeHttp();
      if (native) {
        const res = await native.request({
          url,
          method,
          headers: {
            Accept: 'application/json',
            'User-Agent': userAgent,
            ...headers,
          },
          data: body,
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
        });
        return {
          status: res.status,
          headers: res.headers || {},
          json: async () =>
            typeof res.data === 'string' ? JSON.parse(res.data) : res.data,
        };
      }
      const res = await fetchImpl(url, {
        method,
        body:
          body === undefined
            ? undefined
            : typeof body === 'string'
              ? body
              : JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        signal: ctl.signal,
        redirect: 'follow',
      });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers?.entries?.() || []),
        json: () => res.json(),
      };
    } catch (e) {
      if (signal?.aborted) throw new GeoError('aborted', 'Request cancelled');
      if (ctl.signal.aborted)
        throw new GeoError('timeout', 'Request timed out', { url });
      throw new GeoError('upstream', `Network error: ${e?.message || e}`, {
        url,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return async function http(url, opts = {}) {
    const host = new URL(url).host;
    let attempt = 0;
    for (;;) {
      await pacer.wait(host, opts.signal, sleep);
      let res;
      try {
        res = await once(url, opts);
      } catch (e) {
        if (e.code === 'upstream' && attempt < retries) {
          await sleep(400 * 2 ** attempt, opts.signal);
          attempt++;
          continue;
        }
        throw e;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const ra = Number(
            res.headers['retry-after'] || res.headers['Retry-After'],
          );
          await sleep(
            Number.isFinite(ra) && ra > 0
              ? Math.min(ra, 10) * 1000
              : 500 * 2 ** attempt,
            opts.signal,
          );
          attempt++;
          continue;
        }
        throw new GeoError(
          res.status === 429 ? 'rate_limited' : 'upstream',
          `${host} answered ${res.status}`,
          { status: res.status },
        );
      }
      if (res.status >= 400)
        throw new GeoError('upstream', `${host} answered ${res.status}`, {
          status: res.status,
        });
      try {
        return await res.json();
      } catch {
        throw new GeoError('bad_response', `${host} returned invalid JSON`);
      }
    }
  };
}

/** Cache + in-flight de-duplication around an async producer. */
export function memo(cache) {
  const inflight = new Map();
  return async function cached(key, ttlMs, produce) {
    const hit = cache.get(key);
    if (hit !== undefined)
      return { ...hit, meta: { ...hit.meta, cached: true } };
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      const value = await produce();
      cache.set(key, value, ttlMs);
      return value;
    })();
    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  };
}

/** Debounce returning a promise; earlier calls are cancelled via AbortSignal. */
export function debounceLatest(fn, ms = 350) {
  let timer = 0;
  let ctl = null;
  return (...args) => {
    clearTimeout(timer);
    ctl?.abort();
    ctl = new AbortController();
    const signal = ctl.signal;
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => fn(...args, signal).then(resolve, reject), ms);
    });
  };
}
