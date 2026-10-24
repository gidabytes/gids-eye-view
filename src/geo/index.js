/**
 * GEV-GEO service facade. Wires HTTP (timeouts, retries, per-host pacing),
 * cache and providers; reads optional endpoint overrides from Vite env so a
 * self-hosted Nominatim/Photon/OSRM/Valhalla/Overpass can be swapped in
 * without code changes. Disable entirely with VITE_GEO_ENABLED=false.
 */
import { createHttp, HostPacer, TtlCache } from './core.js';
import {
  createProviders,
  HOST_SPACING_MS,
  DEFAULT_ENDPOINTS,
  ATTRIBUTION,
} from './providers.js';

function env() {
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

export function geoConfig(e = env()) {
  const pick = (k) =>
    typeof e[k] === 'string' && e[k].trim() ? e[k].trim() : undefined;
  const endpoints = {};
  const map = {
    VITE_GEO_PHOTON_URL: 'photon',
    VITE_GEO_NOMINATIM_URL: 'nominatim',
    VITE_GEO_OSRM_URL: 'osrm',
    VITE_GEO_VALHALLA_URL: 'valhalla',
    VITE_GEO_OPEN_METEO_URL: 'openMeteo',
    VITE_GEO_AIR_QUALITY_URL: 'airQuality',
    VITE_GEO_PANORAMAX_URL: 'panoramax',
  };
  for (const [k, name] of Object.entries(map))
    if (pick(k)) endpoints[name] = pick(k);
  if (pick('VITE_GEO_OVERPASS_URL'))
    endpoints.overpass = pick('VITE_GEO_OVERPASS_URL')
      .split(',')
      .map((s) => s.trim());
  return {
    enabled: String(e.VITE_GEO_ENABLED ?? 'true').toLowerCase() !== 'false',
    endpoints,
  };
}

let singleton = null;

export function getGeoServices(options = {}) {
  if (singleton && !options.fresh) return singleton;
  const cfg = geoConfig(options.env);
  const http =
    options.http ||
    createHttp({
      pacer: new HostPacer(HOST_SPACING_MS),
      fetchImpl: options.fetchImpl,
    });
  const providers = createProviders({
    http,
    endpoints: cfg.endpoints,
    cache: new TtlCache(400),
  });
  const services = {
    ...providers,
    config: cfg,
    endpoints: { ...DEFAULT_ENDPOINTS, ...cfg.endpoints },
    attribution: ATTRIBUTION,
  };
  if (!options.fresh) singleton = services;
  return services;
}

export { ATTRIBUTION };
