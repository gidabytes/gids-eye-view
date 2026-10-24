/**
 * GEV-GEO bootstrap, imported once from src/main.js. Mounts the GEO INTEL
 * panel and publishes window.gevGeo for the voice layer. Fully optional:
 * set VITE_GEO_ENABLED=false to skip everything.
 */
import { getGeoServices } from './index.js';
import { mountGeoPanel } from './panel.js';
import { geoIntent } from './intents.js';
import { currentPosition, ensureLocationConsent } from './location.js';
import * as overlay from './overlay.js';

function start() {
  const geo = getGeoServices();
  if (!geo.config.enabled) {
    console.info('[GEV-Geo] disabled by VITE_GEO_ENABLED=false');
    return;
  }
  let panel = null;
  try {
    panel = mountGeoPanel();
  } catch (e) {
    console.warn('[GEV-Geo] panel failed to mount:', e);
  }

  async function here() {
    // Voice has no dialog: share precise location only if already allowed.
    const ok = await ensureLocationConsent(async () => false).catch(
      () => false,
    );
    if (ok) {
      try {
        const p = await currentPosition();
        return { ...p, label: 'your location' };
      } catch {
        /* fall back to map centre */
      }
    }
    const c = overlay.viewCenter();
    if (!c)
      throw Object.assign(new Error('The map is not ready yet.'), {
        spoken: true,
      });
    return { ...c, label: 'the map centre' };
  }

  const ctx = {
    geo,
    here,
    center: () => overlay.viewCenter(),
    show(kind, payload) {
      if (kind === 'nearby') {
        overlay.markers(payload.items, { kind: 'nearby', color: '#ffb84d' });
        if (payload.items[0])
          overlay.flyTo(payload.items[0].lat, payload.items[0].lon, {
            heightM: 1500,
          });
      } else if (kind === 'route') {
        const best = payload.result.data.routes[0];
        overlay.routeLine(best.geometry);
        overlay.markers(
          [
            { ...payload.from, name: 'Start' },
            { ...payload.to, name: payload.to.label },
          ],
          { kind: 'route-ends', color: '#7cff9b' },
        );
        overlay.flyToLine(best.geometry);
      } else if (kind === 'environment' || kind === 'imagery') {
        panel?.gevShow?.(kind === 'environment' ? 'Environment' : 'Imagery');
      }
    },
  };

  globalThis.gevGeo = {
    services: geo,
    overlay,
    panel,
    /** Answer a spoken/typed geo question; null when it is not a geo question. */
    async ask(text) {
      try {
        return await geoIntent(text, ctx);
      } catch (e) {
        return {
          say: e?.spoken
            ? e.message
            : `Sorry, the geo service failed: ${e?.message || e}`,
        };
      }
    },
  };
  console.info('[GEV-Geo] ready');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else setTimeout(start, 0);
}
