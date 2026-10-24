/**
 * Zero-size render guard.
 *
 * Cesium sizes the drawing buffer as clientSize × pixelRatio (pixelRatio
 * includes viewer.resolutionScale) and decides it "can render" from that
 * UNROUNDED product. With the app's reduced resolution scale (e.g. 0.6), a
 * canvas that is momentarily 1 px wide or tall (window minimised or snapped
 * to a sliver, devtools docked over it, a panel layout pass) gives 0.6 → the
 * browser truncates the buffer to 0 px, yet Cesium still renders. GlobeDepth
 * then allocates a 0-wide texture and throws
 *   "DeveloperError: Expected width to be greater than 0"
 * and the default render loop stops permanently ("Rendering has stopped").
 *
 * The guard (1) skips frames while the drawing buffer is empty and
 * (2) restarts the render loop if such an error already happened, once the
 * canvas has a real size again.
 */
export function installZeroSizeRenderGuard(
  viewer,
  { setTimeoutImpl = setTimeout, doc = globalThis.document } = {},
) {
  const scene = viewer?.scene;
  const widget = viewer?.cesiumWidget;
  if (!scene || typeof scene.render !== 'function' || scene.__gevZeroSizeGuard)
    return false;
  scene.__gevZeroSizeGuard = true;

  const canvas = () => scene.canvas || widget?.canvas;
  const empty = () => {
    const c = canvas();
    const gl = scene.context;
    return (
      !c ||
      !(c.width >= 1) ||
      !(c.height >= 1) ||
      (gl && (!(gl.drawingBufferWidth >= 1) || !(gl.drawingBufferHeight >= 1)))
    );
  };

  let skipped = 0;
  const render = scene.render.bind(scene);
  scene.render = function guardedRender(time) {
    if (empty()) {
      skipped++;
      return undefined; // nothing visible to draw; try again on the next frame
    }
    return render(time);
  };

  let recovering = false;
  scene.renderError?.addEventListener?.((_scene, error) => {
    const msg = String(error?.message || error || '');
    if (!/greater than 0|drawingBuffer|framebuffer/i.test(msg) || recovering)
      return;
    recovering = true;
    const retry = () => {
      if (viewer.isDestroyed?.()) return;
      if (empty()) {
        try {
          viewer.resize?.();
        } catch {
          /* size still collapsed */
        }
        if (empty()) return setTimeoutImpl(retry, 250);
      }
      viewer.useDefaultRenderLoop = true;
      doc
        ?.querySelectorAll?.('.cesium-widget-errorPanel')
        .forEach((el) => el.remove());
      recovering = false;
      scene.requestRender?.();
      console.info('[GEV] render loop restarted after a zero-size frame');
    };
    setTimeoutImpl(retry, 250);
  });

  viewer.__gevRenderGuardStats = () => ({ skipped });
  return true;
}
