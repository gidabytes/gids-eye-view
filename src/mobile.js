/**
 * Mobile runtime tuning for Gid's Eye View.
 *
 * Detects whether the app is running inside a Capacitor Android/iOS shell
 * (or on a touch device with limited GPU resources) and applies conservative
 * Cesium viewer settings that keep the globe responsive without crashing.
 *
 * Import this once from your main entry point (e.g. src/main.js):
 *
 *     import { applyMobileTuning } from './mobile.js';
 *     applyMobileTuning(viewer);
 */

function isCapacitorNative() {
  return Boolean(
    typeof window !== 'undefined' &&
    (window.Capacitor?.isNativePlatform?.() ||
     window.Capacitor?.platform === 'android' ||
     window.Capacitor?.platform === 'ios')
  );
}

function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return mem <= 3 || cores <= 4;
}

export function applyMobileTuning(viewer) {
  if (!viewer) return;

  const native = isCapacitorNative();
  const low = isLowEndDevice();

  if (!native && !low) {
    // Desktop - leave the defaults alone.
    return;
  }

  // ---- Rendering cost reduction ----------------------------------------
  // Cap the rendering resolution at 1.0x the CSS pixel size. On phones this
  // drops fragment work by 3-9x compared to the native DPR (often 3x).
  viewer.resolutionScale = 1.0;

  // ---- Terrain + imagery budget ----------------------------------------
  // Higher SSE = less detail = fewer tiles = less memory pressure.
  viewer.scene.globe.maximumScreenSpaceError = 4;
  viewer.scene.globe.tileCacheSize = 100;

  // ---- Expensive visual features off -----------------------------------
  if (viewer.scene.fog) viewer.scene.fog.enabled = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.highDynamicRange = false;
  viewer.scene.postProcessStages.fxaa.enabled = false;
  if (viewer.scene.msaaSamples !== undefined) viewer.scene.msaaSamples = 1;

  // ---- Request render mode for battery ---------------------------------
  // Only render when the camera moves or data changes.
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;

  // ---- Touch-friendly camera -------------------------------------------
  const c = viewer.scene.screenSpaceCameraController;
  c.minimumZoomDistance = 10;
  c.maximumZoomDistance = 20000000;
  c.inertiaSpin = 0.7;
  c.inertiaTranslate = 0.7;
  c.inertiaZoom = 0.6;

  // ---- Memory pressure hooks -------------------------------------------
  // When the app is backgrounded, Cesium should stop rendering.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      viewer.useDefaultRenderLoop = false;
    } else {
      viewer.useDefaultRenderLoop = true;
      viewer.scene.requestRender();
    }
  });

  console.info(
    `[Gid's Eye View] Mobile tuning applied ` +
    `(native=${native}, lowEnd=${low}, DPR=${window.devicePixelRatio})`
  );
}
