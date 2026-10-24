import test from 'node:test';
import assert from 'node:assert/strict';
import { installZeroSizeRenderGuard } from './renderGuard.js';

function fakeViewer({ width = 819, height = 460, dbw = width, dbh = height } = {}) {
  const listeners = [];
  const scene = {
    canvas: { width, height },
    context: { drawingBufferWidth: dbw, drawingBufferHeight: dbh },
    frames: 0,
    render() {
      if (this.context.drawingBufferWidth < 1) throw new Error('Expected width to be greater than 0, actual value was 0');
      this.frames++;
    },
    renderError: { addEventListener: (f) => listeners.push(f) },
    requestRender() {
      this.requested = (this.requested || 0) + 1;
    },
  };
  const viewer = { scene, useDefaultRenderLoop: true, resized: 0, resize() { this.resized++; }, isDestroyed: () => false };
  return { viewer, scene, fire: (e) => listeners.forEach((f) => f(scene, e)) };
}

test('frames into a 0-px drawing buffer are skipped instead of throwing', () => {
  const { viewer, scene } = fakeViewer();
  assert.equal(installZeroSizeRenderGuard(viewer, { doc: null }), true);
  scene.render(0);
  assert.equal(scene.frames, 1);
  scene.canvas.width = 0; // 1 px × 0.6 resolution scale, truncated
  scene.context.drawingBufferWidth = 0;
  assert.doesNotThrow(() => scene.render(1));
  assert.equal(scene.frames, 1);
  assert.equal(viewer.__gevRenderGuardStats().skipped, 1);
  scene.canvas.width = 819;
  scene.context.drawingBufferWidth = 819;
  scene.render(2);
  assert.equal(scene.frames, 2);
});

test('a buffer that is non-zero on the canvas but zero in WebGL is also skipped', () => {
  const { viewer, scene } = fakeViewer({ dbh: 0 });
  installZeroSizeRenderGuard(viewer, { doc: null });
  scene.render(0);
  assert.equal(scene.frames, 0);
});

test('after a zero-size render error the loop restarts once the canvas has a size', () => {
  const { viewer, scene, fire } = fakeViewer({ width: 0, dbw: 0 });
  const timers = [];
  installZeroSizeRenderGuard(viewer, { doc: null, setTimeoutImpl: (f) => timers.push(f) });
  viewer.useDefaultRenderLoop = false; // what Cesium does when a frame throws
  fire(new Error('Expected width to be greater than 0, actual value was 0'));
  timers.shift()(); // still collapsed → resize attempted, retry scheduled
  assert.equal(viewer.useDefaultRenderLoop, false);
  assert.equal(viewer.resized, 1);
  assert.equal(timers.length, 1);
  scene.canvas.width = 819;
  scene.context.drawingBufferWidth = 819;
  timers.shift()();
  assert.equal(viewer.useDefaultRenderLoop, true);
  assert.equal(scene.requested, 1);
});

test('unrelated render errors are left to the app', () => {
  const { viewer, fire } = fakeViewer();
  const timers = [];
  installZeroSizeRenderGuard(viewer, { doc: null, setTimeoutImpl: (f) => timers.push(f) });
  fire(new Error('Shader failed to compile'));
  assert.equal(timers.length, 0);
});

test('installing twice is a no-op and bad input is ignored', () => {
  const { viewer } = fakeViewer();
  assert.equal(installZeroSizeRenderGuard(viewer, { doc: null }), true);
  assert.equal(installZeroSizeRenderGuard(viewer, { doc: null }), false);
  assert.equal(installZeroSizeRenderGuard(null), false);
});
