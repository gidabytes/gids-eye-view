/**
 * Globe overlays for GEV-GEO on the app's existing Cesium viewer (no second
 * renderer). The viewer is published by src/app/viewer.js as
 * globalThis.__gevViewer; without it every function is a safe no-op and the
 * panels still work as lists.
 */
import * as Cesium from 'cesium';
import { setOverlayEntries } from '../overlays/worldOverlay.js';

const NAME = 'gev-geo';
let source = null;
let imageryLayer = null;

export function viewer() {
  const v = globalThis.__gevViewer;
  return v && !v.isDestroyed?.() ? v : null;
}

function ds() {
  const v = viewer();
  if (!v) return null;
  if (source && v.dataSources.contains(source)) return source;
  source = new Cesium.CustomDataSource(NAME);
  v.dataSources.add(source);
  return source;
}

/** Centre of the current view (globe pick at screen centre, else camera ground point). */
export function viewCenter() {
  const v = viewer();
  if (!v) return null;
  const canvas = v.scene.canvas;
  const c = new Cesium.Cartesian2(
    canvas.clientWidth / 2,
    canvas.clientHeight / 2,
  );
  let cart = null;
  try {
    const ray = v.camera.getPickRay(c);
    const hit = ray && v.scene.globe.pick(ray, v.scene);
    if (hit) cart = Cesium.Cartographic.fromCartesian(hit);
  } catch {
    /* fall through */
  }
  if (!cart) cart = v.camera.positionCartographic;
  return {
    lat: Cesium.Math.toDegrees(cart.latitude),
    lon: Cesium.Math.toDegrees(cart.longitude),
  };
}

// Text goes through the app's world-overlay host (repo rule: no Cesium labels).
function setTitles(kind, items) {
  try {
    setOverlayEntries(`gev-geo-${kind}`, items);
  } catch (e) {
    console.warn('[GEV-Geo] world overlay unavailable:', e?.message || e);
  }
}

export function clear(kind) {
  if (kind) setTitles(kind, []);
  const s = ds();
  if (!s) return;
  for (const e of [...s.entities.values])
    if (!kind || e.properties?.gevKind?.getValue() === kind)
      s.entities.remove(e);
  viewer()?.scene.requestRender();
}

export function markers(items, { kind = 'marker', color = '#5ad2ff' } = {}) {
  const s = ds();
  if (!s) return false;
  clear(kind);
  for (const it of items) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lon)) continue;
    s.entities.add({
      position: Cesium.Cartesian3.fromDegrees(it.lon, it.lat),
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { gevKind: kind },
    });
  }
  setTitles(
    kind,
    items
      .filter(
        (it) => it.name && Number.isFinite(it.lat) && Number.isFinite(it.lon),
      )
      .slice(0, 60)
      .map((it, i) => ({
        id: `${kind}-${i}`,
        position: Cesium.Cartesian3.fromDegrees(it.lon, it.lat),
        variant: 'label',
        title: String(it.name).slice(0, 40),
        details: Number.isFinite(it.distanceM)
          ? [
              `${it.distanceM >= 1000 ? (it.distanceM / 1000).toFixed(1) + ' km' : it.distanceM + ' m'}`,
            ]
          : [],
        accent: color,
      })),
  );
  viewer().scene.requestRender();
  return true;
}

export function routeLine(
  lonLat,
  { kind = 'route', color = '#00e5ff', width = 6 } = {},
) {
  const s = ds();
  if (!s || !lonLat?.length) return false;
  clear(kind);
  s.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(lonLat.flat()),
      width,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.fromCssColorString(color),
      }),
      clampToGround: true,
    },
    properties: { gevKind: kind },
  });
  viewer().scene.requestRender();
  return true;
}

export function flyTo(lat, lon, { heightM = 2500, bbox = null } = {}) {
  const v = viewer();
  if (!v) return false;
  if (bbox && bbox.every(Number.isFinite)) {
    v.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(...bbox),
      duration: 2,
    });
  } else {
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
      duration: 2,
    });
  }
  return true;
}

export function flyToLine(lonLat) {
  const v = viewer();
  if (!v || !lonLat?.length) return false;
  const lons = lonLat.map((p) => p[0]);
  const lats = lonLat.map((p) => p[1]);
  const pad = 0.15;
  const w = Math.min(...lons),
    e = Math.max(...lons),
    s = Math.min(...lats),
    n = Math.max(...lats);
  const dx = (e - w) * pad + 0.002,
    dy = (n - s) * pad + 0.002;
  v.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(w - dx, s - dy, e + dx, n + dy),
    duration: 2,
  });
  return true;
}

/** Add/remove an XYZ/TMS imagery layer (e.g. OpenAerialMap) with credit. */
export function setImageryLayer(url, credit) {
  const v = viewer();
  if (!v) return false;
  if (imageryLayer) {
    v.imageryLayers.remove(imageryLayer, true);
    imageryLayer = null;
  }
  if (url && /^https?:\/\//.test(url)) {
    imageryLayer = v.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: url.replace(/^http:/, 'https:'),
        credit: new Cesium.Credit(String(credit || 'OpenAerialMap')),
        maximumLevel: 22,
      }),
    );
  }
  v.scene.requestRender();
  return true;
}
