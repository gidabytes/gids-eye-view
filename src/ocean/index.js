/**
 * Boots the ocean module once the application's Cesium viewer exists
 * (src/app/viewer.js publishes it as window.__gevViewer), and makes the
 * existing "Ocean Floor Terrain" exploration toggle drive the real ocean view.
 */
import './ocean.css';
import { mountOcean } from './oceanRuntime.js';

const TOKEN = import.meta.env.CESIUM_ION_TOKEN;

function whenViewer(cb, tries = 0) {
  const v = window.__gevViewer;
  if (v && !v.isDestroyed?.()) return cb(v);
  if (tries > 600)
    return console.warn('[GEV ocean] viewer not found; ocean module idle');
  setTimeout(() => whenViewer(cb, tries + 1), 250);
}

function hookExplorationToggle(api, tries = 0) {
  const original = window.__gevExplorationToggle;
  if (typeof original !== 'function') {
    if (tries < 120)
      setTimeout(() => hookExplorationToggle(api, tries + 1), 500);
    return;
  }
  if (original.__gevOceanWrapped) return;
  const wrapped = function (which, on) {
    const result = original.apply(this, arguments);
    if (which === 'bathymetry') api.setOcean(!!on);
    return result;
  };
  wrapped.__gevOceanWrapped = true;
  window.__gevExplorationToggle = wrapped;
}

whenViewer((viewer) => {
  const api = mountOcean(viewer, { ionToken: TOKEN });
  hookExplorationToggle(api);
  let saved = null;
  try {
    saved = localStorage.getItem('gev.bathymetry');
  } catch {}
  if (saved === '1') api.setOcean(true);
});
