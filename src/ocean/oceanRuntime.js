/**
 * Ocean view + pilotable exploration submarine for Gid's Eye View.
 *
 * - Ocean view: Cesium World Bathymetry terrain (ion asset 2426648, needs the
 *   Cesium ion token) + keyless GEBCO WMS shaded relief. Google 3D tiles are
 *   hidden while it is on and restored afterwards.
 * - Submarine: simulation over public bathymetry. Keys (captured only while the
 *   sub is active, so app shortcuts F/D/C are untouched otherwise):
 *     W/S throttle · A/D steer · Q rise · E dive · Shift explore speed · X camera
 *   Space is left to push-to-talk voice.
 *
 * Public API: window.__gevOcean (used by the voice action `control_ocean`).
 */
import * as Cesium from 'cesium';
import {
  stepSub,
  lightAtDepth,
  zoneName,
  DIVE_SITES,
  findDiveSite,
} from './subPhysics.js';

export const BATHYMETRY_ASSET_ID = 2426648;
const GEBCO_WMS = 'https://wms.gebco.net/mapserv';
const SUB_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyX',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/** Ocean view: seafloor terrain + GEBCO relief, 3D tiles hidden. */
export class OceanView {
  constructor(viewer, { ionToken } = {}) {
    this.viewer = viewer;
    this.ionToken = ionToken || Cesium.Ion.defaultAccessToken || '';
    this.active = false;
    this.bathy = null;
    this.gebco = null;
    this.saved = null;
  }

  hasBathymetry() {
    return !!this.bathy;
  }

  async enable() {
    if (this.active) return;
    const v = this.viewer;
    const sc = v.scene;
    const tilesets = [];
    for (let i = 0; i < sc.primitives.length; i++) {
      const p = sc.primitives.get(i);
      if (p instanceof Cesium.Cesium3DTileset) tilesets.push([p, p.show]);
    }
    this.saved = {
      terrain: v.terrainProvider,
      globeShow: sc.globe.show,
      depthTest: sc.globe.depthTestAgainstTerrain,
      lighting: sc.globe.enableLighting,
      tilesets,
    };
    if (!this.bathy && this.ionToken) {
      try {
        this.bathy = await Cesium.CesiumTerrainProvider.fromIonAssetId(
          BATHYMETRY_ASSET_ID,
          {
            requestVertexNormals: true,
            accessToken: this.ionToken,
          },
        );
      } catch (err) {
        console.warn(
          '[GEV ocean] bathymetry asset unavailable - add "Cesium World Bathymetry" to My Assets in Cesium ion',
          err,
        );
      }
    }
    if (this.bathy) v.terrainProvider = this.bathy;
    if (!this.gebco) {
      this.gebco = v.imageryLayers.addImageryProvider(
        new Cesium.WebMapServiceImageryProvider({
          url: GEBCO_WMS,
          layers: 'GEBCO_LATEST',
          parameters: { format: 'image/png', transparent: true },
          credit: 'Bathymetry: GEBCO Compilation Group',
        }),
      );
    }
    this.gebco.show = true;
    this.gebco.alpha = 0.9;
    for (const [t] of tilesets) t.show = false;
    sc.globe.show = true;
    sc.globe.depthTestAgainstTerrain = true;
    sc.globe.enableLighting = true;
    this.active = true;
  }

  disable() {
    if (!this.active || !this.saved) return;
    const v = this.viewer;
    const sc = v.scene;
    v.terrainProvider = this.saved.terrain;
    sc.globe.show = this.saved.globeShow;
    sc.globe.depthTestAgainstTerrain = this.saved.depthTest;
    sc.globe.enableLighting = this.saved.lighting;
    for (const [t, show] of this.saved.tilesets)
      if (!t.isDestroyed()) t.show = show;
    if (this.gebco) this.gebco.show = false;
    this.active = false;
  }
}

/** Seafloor depth (positive m) at a point from current terrain; null if unknown. */
export async function sampleSeafloor(viewer, lat, lon) {
  try {
    const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [
      Cesium.Cartographic.fromDegrees(lon, lat),
    ]);
    return c.height == null || Number.isNaN(c.height) ? null : -c.height;
  } catch {
    return null;
  }
}

/** Pilotable exploration submarine. */
export class Submarine {
  constructor(viewer, start, { onTelemetry } = {}) {
    this.viewer = viewer;
    this.state = {
      lat: start.lat,
      lon: start.lon,
      depth: 0,
      heading: 0,
      speed: 0,
      vSpeed: 0,
    };
    this.input = { throttle: 0, rudder: 0, ballast: 0, boost: false };
    this.keys = new Set();
    this.trail = [];
    this.floor = null;
    this.sampling = false;
    this.lastSample = 0;
    this.lastFrame = 0;
    this.camMode = 'chase';
    this.diveTarget = null;
    this.onTelemetry = onTelemetry;
    this.cleanup = [];

    const position = () => this.cartesian();
    this.entity = viewer.entities.add({
      id: 'gev-exploration-submarine',
      name: 'Exploration submarine (simulation)',
      position: new Cesium.CallbackProperty(position, false),
      orientation: new Cesium.CallbackProperty(
        () =>
          Cesium.Transforms.headingPitchRollQuaternion(
            this.cartesian(),
            new Cesium.HeadingPitchRoll(
              Cesium.Math.toRadians(this.state.heading - 90),
              0,
              0,
            ),
          ),
        false,
      ),
      ellipsoid: {
        radii: new Cesium.Cartesian3(22, 4, 4),
        material: Cesium.Color.fromCssColorString('#ffcc33'),
      },
      polyline: {
        positions: new Cesium.CallbackProperty(() => this.trail, false),
        width: 2,
        material: Cesium.Color.CYAN.withAlpha(0.7),
      },
    });

    this.overlay = document.createElement('div');
    this.overlay.className = 'gev-underwater';
    (viewer.container || document.body).appendChild(this.overlay);

    // Capture phase on window runs before the app's document listeners.
    const isTyping = (e) =>
      e.target?.matches?.('input, textarea, select, [contenteditable="true"]');
    const down = (e) => {
      if (
        isTyping(e) ||
        !SUB_KEYS.has(e.code) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.keys.add(e.code);
      if (e.code === 'KeyX' && !e.repeat) this.cycleCamera();
    };
    const up = (e) => {
      if (SUB_KEYS.has(e.code)) {
        this.keys.delete(e.code);
        e.stopImmediatePropagation();
      }
    };
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    this.cleanup.push(() => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    });

    const remove = viewer.scene.preRender.addEventListener(() => this.tick());
    this.cleanup.push(remove);
  }

  cartesian() {
    return Cesium.Cartesian3.fromDegrees(
      this.state.lon,
      this.state.lat,
      -this.state.depth,
    );
  }

  readInput() {
    const k = this.keys;
    const has = (...c) => c.some((x) => k.has(x));
    const ballastKeys = has('KeyE') ? 1 : has('KeyQ') ? -1 : 0;
    let ballast = ballastKeys || this.input.ballast;
    if (this.diveTarget != null && !ballastKeys) {
      const d = this.diveTarget - this.state.depth;
      if (Math.abs(d) < 3) this.diveTarget = null;
      ballast = this.diveTarget == null ? 0 : Math.sign(d);
    }
    return {
      throttle:
        (has('KeyW', 'ArrowUp') ? 1 : has('KeyS', 'ArrowDown') ? -0.3 : 0) ||
        this.input.throttle,
      rudder:
        (has('KeyD', 'ArrowRight') ? 1 : has('KeyA', 'ArrowLeft') ? -1 : 0) ||
        this.input.rudder,
      ballast,
      boost: has('ShiftLeft', 'ShiftRight') || this.input.boost,
    };
  }

  tick() {
    const now = performance.now();
    const dt = this.lastFrame
      ? Math.min((now - this.lastFrame) / 1000, 0.1)
      : 0;
    this.lastFrame = now;
    if (dt <= 0) return;

    if (!this.sampling && now - this.lastSample > 500) {
      this.sampling = true;
      this.lastSample = now;
      sampleSeafloor(this.viewer, this.state.lat, this.state.lon).then((f) => {
        this.floor = f;
        this.sampling = false;
      });
    }

    const { blocked, ...next } = stepSub(
      this.state,
      this.readInput(),
      dt,
      this.floor,
    );
    this.state = next;

    const p = this.cartesian();
    const last = this.trail[this.trail.length - 1];
    if (!last || Cesium.Cartesian3.distance(last, p) > 50) {
      this.trail.push(p);
      if (this.trail.length > 2000) this.trail.shift();
    }
    this.updateCamera(p);
    const light = lightAtDepth(next.depth);
    this.applyUnderwater(light);
    this.onTelemetry?.({
      ...next,
      floor: this.floor,
      blocked,
      light,
      zone: zoneName(next.depth),
      camMode: this.camMode,
      boost: !!this.input.boost,
    });
  }

  applyUnderwater(light) {
    const sc = this.viewer.scene;
    const under = this.state.depth > 0.5;
    this.overlay.style.opacity = under ? String(0.25 + (1 - light) * 0.7) : '0';
    sc.fog.enabled = true;
    sc.fog.density = under ? 2e-3 * (2 - light) : 2e-4;
    if (sc.skyAtmosphere) sc.skyAtmosphere.show = !under;
  }

  cycleCamera() {
    this.camMode =
      this.camMode === 'chase'
        ? 'cockpit'
        : this.camMode === 'cockpit'
          ? 'free'
          : 'chase';
    if (this.camMode !== 'chase')
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  updateCamera(p) {
    const cam = this.viewer.camera;
    const h = Cesium.Math.toRadians(this.state.heading);
    if (this.camMode === 'chase') {
      cam.lookAt(
        p,
        new Cesium.HeadingPitchRange(h, Cesium.Math.toRadians(-12), 140),
      );
    } else if (this.camMode === 'cockpit') {
      cam.setView({
        destination: p,
        orientation: { heading: h, pitch: Cesium.Math.toRadians(-5), roll: 0 },
      });
    }
  }

  teleport(lat, lon, depth = 0) {
    this.state = { ...this.state, lat, lon, depth, speed: 0, vSpeed: 0 };
    this.trail = [];
    this.floor = null;
  }

  destroy() {
    this.cleanup.forEach((fn) => fn());
    this.viewer.entities.remove(this.entity);
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    this.overlay.remove();
    const sc = this.viewer.scene;
    if (sc.skyAtmosphere) sc.skyAtmosphere.show = true;
    sc.fog.density = 2e-4;
  }
}

const fmt = (n, d = 0) =>
  Number(n).toLocaleString(undefined, {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });

/** Mount the ocean dock + HUD and expose window.__gevOcean. */
export function mountOcean(viewer, { ionToken } = {}) {
  const ocean = new OceanView(viewer, { ionToken });
  let sub = null;

  const dock = document.createElement('div');
  dock.className = 'gev-ocean-dock';
  dock.innerHTML = `
    <button type="button" data-act="ocean" title="Ocean view: seafloor bathymetry">🌊 Ocean</button>
    <button type="button" data-act="sub" title="Launch the exploration submarine">🛥 Sub</button>
    <select data-act="site" title="Jump to a dive site"><option value="">Dive site…</option>${Object.entries(
      DIVE_SITES,
    )
      .map(([k, s]) => `<option value="${k}" title="${s.note}">${k}</option>`)
      .join('')}</select>`;
  document.body.appendChild(dock);

  const hud = document.createElement('div');
  hud.className = 'gev-subhud';
  hud.hidden = true;
  hud.innerHTML = `
    <div class="gev-subhud-grid">
      <div><small>DEPTH</small><b data-k="depth">0 m</b></div>
      <div><small>SEAFLOOR</small><b data-k="floor">—</b></div>
      <div><small>HEADING</small><b data-k="heading">0°</b></div>
      <div><small>SPEED</small><b data-k="speed">0 kn</b></div>
      <div><small>POSITION</small><b data-k="pos">—</b></div>
      <div><small>ZONE</small><b data-k="zone">Surface</b></div>
    </div>
    <div class="gev-subhud-alert" data-k="alert" hidden></div>
    <div class="gev-subhud-pad">
      <button type="button" data-hold="throttle:1">▲ Fwd</button>
      <button type="button" data-hold="rudder:-1">◀</button>
      <button type="button" data-hold="rudder:1">▶</button>
      <button type="button" data-hold="throttle:-0.3">▼ Rev</button>
      <button type="button" data-hold="ballast:-1">⇡ Rise</button>
      <button type="button" data-hold="ballast:1">⇣ Dive</button>
      <button type="button" data-act="boost">⚡ Explore</button>
      <button type="button" data-act="cam">🎥 chase</button>
    </div>
    <small class="gev-subhud-keys">W/S throttle · A/D steer · Q/E rise/dive · Shift explore · X camera · Space still talks</small>`;
  document.body.appendChild(hud);
  const q = (k) => hud.querySelector(`[data-k="${k}"]`);

  const render = (t) => {
    q('depth').textContent = `${fmt(t.depth)} m`;
    q('floor').textContent =
      t.floor == null ? '—' : t.floor <= 0 ? 'LAND' : `${fmt(t.floor)} m`;
    q('heading').textContent = `${fmt(t.heading)}°`;
    q('speed').textContent = `${fmt(t.speed * 1.944, 1)} kn`;
    q('pos').textContent = `${fmt(t.lat, 3)}, ${fmt(t.lon, 3)}`;
    q('zone').textContent = t.zone;
    hud.querySelector('[data-act="cam"]').textContent = `🎥 ${t.camMode}`;
    hud.querySelector('[data-act="boost"]').classList.toggle('on', t.boost);
    const alert = q('alert');
    const msg = t.blocked
      ? '⚠ SHALLOW / LAND - turn away'
      : !ocean.hasBathymetry()
        ? 'No bathymetry terrain: depth limit 10,935 m everywhere. Add "Cesium World Bathymetry" in Cesium ion.'
        : '';
    alert.hidden = !msg;
    alert.textContent = msg;
  };

  const syncButtons = () => {
    dock
      .querySelector('[data-act="ocean"]')
      .classList.toggle('on', ocean.active);
    dock.querySelector('[data-act="sub"]').classList.toggle('on', !!sub);
    hud.hidden = !sub;
  };

  const api = {
    get oceanActive() {
      return ocean.active;
    },
    get subActive() {
      return !!sub;
    },
    async setOcean(on) {
      if (on) await ocean.enable();
      else {
        api.recallSub();
        ocean.disable();
      }
      syncButtons();
      return {
        ok: true,
        ocean: ocean.active,
        bathymetry: ocean.hasBathymetry(),
      };
    },
    async launchSub(at) {
      if (!ocean.active) await api.setOcean(true);
      viewer.trackedEntity = undefined;
      if (!sub) {
        let start = at;
        if (!start) {
          const c = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
          start = {
            lat: Cesium.Math.toDegrees(c.latitude),
            lon: Cesium.Math.toDegrees(c.longitude),
          };
        }
        sub = new Submarine(viewer, start, { onTelemetry: render });
      } else if (at) sub.teleport(at.lat, at.lon);
      syncButtons();
      return { ok: true, sub: true, ...api.status() };
    },
    recallSub() {
      sub?.destroy();
      sub = null;
      syncButtons();
      return { ok: true, sub: false };
    },
    async diveTo(depth) {
      await api.launchSub();
      sub.diveTarget = Number.isFinite(depth)
        ? Math.max(0, depth)
        : sub.state.depth + 100;
      return { ok: true, targetDepth: sub.diveTarget };
    },
    surface() {
      if (!sub) return { ok: false, error: 'Submarine is not launched.' };
      sub.diveTarget = 0;
      return { ok: true, targetDepth: 0 };
    },
    async goToSite(text) {
      const site = findDiveSite(text);
      if (!site)
        return {
          ok: false,
          error: `Unknown dive site. Known: ${Object.keys(DIVE_SITES).join(', ')}`,
        };
      await api.launchSub({ lat: site.lat, lon: site.lon });
      return { ok: true, site: site.key, note: site.note };
    },
    status() {
      if (!sub) return { ocean: ocean.active, sub: false };
      const s = sub.state;
      return {
        ocean: ocean.active,
        sub: true,
        lat: +s.lat.toFixed(4),
        lon: +s.lon.toFixed(4),
        depthM: Math.round(s.depth),
        headingDeg: Math.round(s.heading),
        speedKn: +(s.speed * 1.944).toFixed(1),
        seafloorM: sub.floor == null ? null : Math.round(sub.floor),
        zone: zoneName(s.depth),
      };
    },
  };

  dock.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'ocean') api.setOcean(!ocean.active);
    if (act === 'sub') sub ? api.recallSub() : api.launchSub();
  });
  dock.querySelector('select').addEventListener('change', (e) => {
    if (e.target.value) api.goToSite(e.target.value);
    e.target.value = '';
  });
  hud.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!sub) return;
    if (act === 'boost') sub.input.boost = !sub.input.boost;
    if (act === 'cam') sub.cycleCamera();
  });
  for (const btn of hud.querySelectorAll('[data-hold]')) {
    const [axis, val] = btn.dataset.hold.split(':');
    const set = (v) => () => {
      if (sub) sub.input[axis] = v;
    };
    btn.addEventListener('pointerdown', set(Number(val)));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'])
      btn.addEventListener(ev, set(0));
  }

  window.__gevOcean = api;
  return api;
}
