import { Capacitor, CapacitorHttp } from '@capacitor/core';
const NATIVE_HOSTS = ['opensky-network.org','firms.modaps.eosdis.nasa.gov','ll.thespacedevs.com','celestrak.org','celestrak.com','api.wheretheiss.at','api.open-notify.org','graph.mapillary.com','api.tomtom.com','inciweb.wildfire.gov','services3.arcgis.com','www.nhc.noaa.gov','transit.land','de1.api.radio-browser.info','overpass-api.de','nominatim.openstreetmap.org'];
function needsNative(url) {
  try { const host = new URL(url, window.location.origin).hostname;
    return NATIVE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}
export async function nativeFetch(url, options = {}) {
  if (!Capacitor?.isNativePlatform?.() || !needsNative(url)) return fetch(url, options);
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};
  const res = await CapacitorHttp.request({
    url, method,
    headers: headers instanceof Headers ? Object.fromEntries(headers) : headers,
    data: options.body || undefined,
  });
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return {
    ok: res.status >= 200 && res.status < 300, status: res.status, statusText: String(res.status),
    headers: new Headers(res.headers || {}),
    text: async () => body, json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}
