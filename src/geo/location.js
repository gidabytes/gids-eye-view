/**
 * Device location with explicit consent for sharing precise coordinates with
 * external providers. Uses the Capacitor Geolocation plugin when the APK has
 * it, else the WebView/browser Geolocation API. No background tracking.
 */
import { GeoError } from './core.js';

const CONSENT_KEY = 'gev.geo.shareLocation';
const STALE_MS = 2 * 60_000;

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** 'granted' | 'denied' | 'ask' — user's choice about sending coordinates out. */
export function locationSharingConsent() {
  const v = store()?.getItem(CONSENT_KEY);
  return v === 'granted' || v === 'denied' ? v : 'ask';
}

export function setLocationSharingConsent(value) {
  if (!['granted', 'denied', 'ask'].includes(value))
    throw new GeoError('invalid_input', 'Bad consent value');
  try {
    if (value === 'ask') store()?.removeItem(CONSENT_KEY);
    else store()?.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked: consent will be asked again */
  }
}

/**
 * Resolve consent, asking the user once when needed. `ask` is an async
 * function returning true/false (the UI supplies a dialog).
 */
export async function ensureLocationConsent(ask) {
  const c = locationSharingConsent();
  if (c === 'granted') return true;
  if (c === 'denied') return false;
  const ok = typeof ask === 'function' ? await ask() : false;
  setLocationSharingConsent(ok ? 'granted' : 'denied');
  return ok;
}

function capGeo() {
  const cap = globalThis.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Geolocation || null;
}

/**
 * One-shot current position. Returns { lat, lon, accuracyM, timestamp, stale }.
 * Throws GeoError: 'permission_denied' | 'unavailable' | 'timeout'.
 */
export async function currentPosition({
  highAccuracy = true,
  timeoutMs = 15000,
  maxAgeMs = 30000,
} = {}) {
  const native = capGeo();
  let pos;
  if (native) {
    try {
      const perm = await native.checkPermissions?.();
      if (perm && perm.location !== 'granted') {
        const req = await native.requestPermissions?.({
          permissions: ['location'],
        });
        if (
          req &&
          req.location !== 'granted' &&
          req.coarseLocation !== 'granted'
        )
          throw new GeoError('permission_denied', 'Location permission denied');
      }
      pos = await native.getCurrentPosition({
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: maxAgeMs,
      });
    } catch (e) {
      if (e instanceof GeoError) throw e;
      const msg = String(e?.message || e);
      if (/denied|permission/i.test(msg))
        throw new GeoError('permission_denied', 'Location permission denied');
      if (/disabled|services|unavailable/i.test(msg))
        throw new GeoError('unavailable', 'Location services are turned off');
      throw new GeoError('unavailable', msg);
    }
  } else {
    const geo = globalThis.navigator?.geolocation;
    if (!geo)
      throw new GeoError('unavailable', 'Geolocation is not supported here');
    pos = await new Promise((resolve, reject) =>
      geo.getCurrentPosition(
        resolve,
        (err) => {
          if (err.code === 1)
            reject(
              new GeoError('permission_denied', 'Location permission denied'),
            );
          else if (err.code === 3)
            reject(new GeoError('timeout', 'Location request timed out'));
          else
            reject(
              new GeoError(
                'unavailable',
                'Location unavailable (GPS off or no fix)',
              ),
            );
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: timeoutMs,
          maximumAge: maxAgeMs,
        },
      ),
    );
  }
  const c = pos.coords || {};
  const ts = Number(pos.timestamp) || Date.now();
  return {
    lat: c.latitude,
    lon: c.longitude,
    accuracyM: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
    timestamp: new Date(ts).toISOString(),
    stale: Date.now() - ts > STALE_MS,
  };
}
