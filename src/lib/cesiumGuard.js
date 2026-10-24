export function installCesiumGuard(viewer) {
  if (!viewer || !viewer.scene) return;
  try {
    viewer.scene.renderError.addEventListener((scene, error) => {
      console.error('[Cesium] renderError:', String(error?.message || error), error);
      try { scene.requestRender(); } catch {}
    });
  } catch (err) { console.warn('[Cesium] renderError listener failed:', err); }
  const canvas = viewer.canvas || viewer.scene.canvas;
  if (canvas) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('[Cesium] WebGL context lost'); });
    canvas.addEventListener('webglcontextrestored', () => { console.info('[Cesium] WebGL context restored'); try { viewer.scene.requestRender(); } catch {} });
  }
}
