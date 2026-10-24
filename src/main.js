import './lib/embeddedApiProxy.js'; // installed first — must run before layer code
import './voice/voiceBridge.js'; // native speech-to-text (must load before voice code)
import "./mobile/mobileUiV30.css";
import "./mobile/mobileUiV30.js";
import './ocean/index.js'; // ocean view + exploration submarine

import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import './geo/boot.js'; // GEV-GEO: optional geo intelligence (VITE_GEO_ENABLED=false disables)
import { deviceKey } from './lib/deviceKeys.js';

// A key the user saved on the phone (POWER UP) wins over a build-time key;
// the public APK has no build-time keys.
const application = createStandaloneApplication({
  googleApiKey: deviceKey('GOOGLE_MAPS_API_KEY', import.meta.env.GOOGLE_MAPS_API_KEY),
  cesiumToken: deviceKey('CESIUM_ION_TOKEN', import.meta.env.CESIUM_ION_TOKEN),
  allowQaRegistration: import.meta.env.DEV,
});

application.start().catch((error) => {
  console.error("God's Eye View initialization failed:", error);
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  loaderStatus.textContent = `Error: ${describeError(error)}`;
  loaderStatus.style.color = '#ff4444';
});

export { application };

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================

// =========================================================================
// Mobile UI v31 — Tactical Core & Radial Bloom (God's Eye View)
// =========================================================================
(function initTacticalUI() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__gevTacticalUI) return;
  window.__gevTacticalUI = true;

  // ---- Cleanup Legacy UI ----------------------------------------
  const KILL = [
    '.mobile-icon-rail','.mobile-icon-btn','.mobile-fab','.mobile-panel-overlay',
    '#bottom-sheet','#thumb-cluster-left','#thumb-cluster-right',
    '#bottom-action-bar','#exploration-panel','.bs-handle','.bs-header',
    '.bs-strip','.bs-content','.mobile-drawer-expand',
    '#side-aware-drawer','#street-view-overlay','#submarine-toggle',
    '#gps-btn','#preset-btn'
  ].join(',');
  document.querySelectorAll(KILL).forEach(el => el.remove());
  document.querySelectorAll('.mobile-drawer-panel').forEach(el => {
    el.classList.remove('mobile-drawer-panel','is-mobile-open');
    el.removeAttribute('style');
  });

  // ---- Panel Discovery ------------------------------------------
  const collected = [];
  const seenIds = new Set();
  function addPanel(id, label, icon, category) {
    const el = document.getElementById(id);
    if (el && !seenIds.has(id)) {
      seenIds.add(id);
      collected.push({ el, id, label, icon, category });
    }
  }

  // Map existing DOM panels to our tactical categories
  addPanel('data-panel',        'Layers',    '\uD83D\uDCDA', 'Exploration');
  addPanel('scene-panel',       'Scenes',    '\uD83D\uDDBC\uFE0F', 'Exploration');
  addPanel('context-panel',     'Context',   '\uD83D\uDD0D', 'Exploration');
  addPanel('weather-panel',     'Weather',   '\uD83C\uDF24\uFE0F', 'Exploration');
  addPanel('transit-panel',     'Transit',   '\uD83D\uDE86', 'Exploration');
  addPanel('cctv-panel',        'CCTV',      '\uD83D\uDCF9', 'Mission');
  addPanel('radio-panel',       'Radio',     '\uD83D\uDCFB', 'Mission');
  addPanel('audio-panel',       'Audio',     '\uD83C\uDFB5', 'Mission');
  addPanel('display-panel',     'Display',   '\uD83D\uDDA5\uFE0F', 'System');
  addPanel('param-slider-panel','Sliders',   '\uD83C\uDF9A\uFE0F', 'System');

  // Include dynamic panels found in left/right stacks
  ['left-panel-stack', 'right-context-rail'].forEach(hid => {
    const host = document.getElementById(hid);
    if (host) {
      host.querySelectorAll(':scope > [data-panel-id]').forEach(el => {
        const id = el.getAttribute('data-panel-id') || el.id;
        if (id && !seenIds.has(id)) addPanel(id, id.replace(/-/g, ' '), '\uD83D\uDD39', 'System');
      });
    }
  });

  // ---- Create Core Node & Radial Menu ---------------------------
  const coreContainer = document.createElement('div');
  coreContainer.id = 'gev-tactical-core';
  coreContainer.className = 'core-closed';
  document.body.appendChild(coreContainer);

  // 1. The Single Core Node
  const coreNode = document.createElement('button');
  coreNode.id = 'gev-core-node';
  coreNode.type = 'button';
  coreNode.setAttribute('aria-label', 'Open tactical menu');
  coreNode.innerHTML = '<div class="core-orb"></div><div class="core-icon">\uD83D\uDEF0\uFE0F</div>';
  coreContainer.appendChild(coreNode);

  // 2. The Radial Menu Container
  const radialMenu = document.createElement('div');
  radialMenu.id = 'gev-radial-menu';
  coreContainer.appendChild(radialMenu);

  // 3. Main Categories
  const categories = [
    { id: 'cat-explore', icon: '\uD83E\uDDED', label: 'Exploration', items: collected.filter(c => c.category === 'Exploration') },
    { id: 'cat-mission', icon: '\uD83C\uDFAF', label: 'Mission Control', items: collected.filter(c => c.category === 'Mission') },
    { id: 'cat-system',  icon: '\u2699\uFE0F', label: 'System & Tools', items: collected.filter(c => c.category === 'System') }
  ];

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'radial-cat-btn';
    btn.id = cat.id;
    btn.type = 'button';
    btn.innerHTML = `<span class="cat-icon">${cat.icon}</span><span class="cat-label">${cat.label}</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSubMenu(cat);
    });
    radialMenu.appendChild(btn);
  });

  // ---- State & Animation Logic ----------------------------------
  let activePanel = null;
  let activeSubMenu = null;

  coreNode.addEventListener('click', () => {
    if (coreContainer.classList.contains('core-closed')) {
      coreContainer.classList.remove('core-closed');
      coreContainer.classList.add('core-open');
      radialMenu.style.display = 'flex';
      if (navigator.vibrate) navigator.vibrate(20);
    } else {
      closeAll();
    }
  });

  function closeAll() {
    coreContainer.classList.remove('core-open');
    coreContainer.classList.add('core-closed');
    radialMenu.style.display = 'none';
    if (activeSubMenu) {
      activeSubMenu.remove();
      activeSubMenu = null;
    }
    if (activePanel) {
      activePanel.style.display = 'none';
      activePanel = null;
    }
  }

  // ---- Sub-menu Logic -------------------------------------------
  function openSubMenu(category) {
    if (activeSubMenu) activeSubMenu.remove();

    activeSubMenu = document.createElement('div');
    activeSubMenu.className = 'radial-sub-menu';

    const header = document.createElement('div');
    header.className = 'sub-menu-header';
    header.innerHTML = `<span>${category.label}</span>`;
    activeSubMenu.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sub-menu-list';

    if (category.items.length === 0) {
      list.innerHTML = '<div class="sub-item empty">No modules active</div>';
    } else {
      category.items.forEach(item => {
        const subBtn = document.createElement('button');
        subBtn.className = 'sub-item';
        subBtn.type = 'button';
        subBtn.innerHTML = `<span class="sub-icon">${item.icon}</span> <span class="sub-text">${item.label}</span>`;
        subBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerPanel(item);
          closeAll();
        });
        list.appendChild(subBtn);
      });
    }
    activeSubMenu.appendChild(list);
    coreContainer.appendChild(activeSubMenu);

    requestAnimationFrame(() => {
      activeSubMenu.style.opacity = '1';
      activeSubMenu.style.transform = 'translateY(0) scale(1)';
    });
  }

  // ---- Panel Handoff Logic --------------------------------------
  function triggerPanel(entry) {
    if (entry.el) {
      collected.forEach(c => { if (c.el && c.el !== entry.el) c.el.style.display = 'none'; });

      activePanel = entry.el;
      activePanel.style.display = 'block';
      activePanel.style.position = 'fixed';
      activePanel.style.bottom = '20px';
      activePanel.style.left = '20px';
      activePanel.style.right = '20px';
      activePanel.style.maxHeight = '60vh';
      activePanel.style.zIndex = '999999';
      activePanel.style.background = 'rgba(10, 18, 32, 0.9)';
      activePanel.style.backdropFilter = 'blur(16px)';
      activePanel.style.webkitBackdropFilter = 'blur(16px)';
      activePanel.style.border = '1px solid rgba(0, 255, 255, 0.3)';
      activePanel.style.borderRadius = '16px';
      activePanel.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.6)';
      activePanel.style.color = '#e6f3ff';
      activePanel.style.overflowY = 'auto';
      activePanel.style.padding = '16px';

      console.info('[Gids Eyes View] Tactical Panel activated:', entry.label);
    } else {
      const trigger = document.querySelector(`[aria-controls="${entry.id}"], [data-panel-target="${entry.id}"]`);
      if (trigger) trigger.click();
    }
  }

  // =============================================================
  //  Exploration toggles (bathymetry, water alpha, street auto)
  // =============================================================
  const _viewerRef = () => window.viewer || window.cesiumViewer || (window.gev && window.gev.viewer);
  const _cesiumRef = () => window.Cesium;

  window.__gevStreetViewAuto = true;
  try { if (localStorage.getItem('gev.streetViewAuto') === '0') window.__gevStreetViewAuto = false; } catch {}

  window.__gevExplorationToggle = function (which, on) {
    console.info('[Gids Eyes View] exploration toggle', which, on ? 'ON' : 'OFF');
    if (which === 'bathymetry') {
      try { localStorage.setItem('gev.bathymetry', on ? '1' : '0'); } catch {}
      return;
    }
    if (which === 'streetAuto') {
      window.__gevStreetViewAuto = on;
      try { localStorage.setItem('gev.streetViewAuto', on ? '1' : '0'); } catch {}
      return;
    }
    if (which === 'waterAlpha') {
      const viewer = _viewerRef(); const C = _cesiumRef();
      if (!viewer || !C) { console.warn('[Gids Eyes View] no viewer for translucency'); return; }
      try {
        if (on) {
          viewer.scene.globe.translucency.enabled = true;
          viewer.scene.globe.translucency.frontFaceAlphaByDistance = new C.NearFarScalar(400.0, 0.35, 3000.0, 1.0);
          viewer.scene.globe.translucency.backFaceAlphaByDistance  = new C.NearFarScalar(400.0, 0.7,  3000.0, 1.0);
          viewer.scene.globe.undergroundColor = C.Color.fromCssColorString('#001a2e');
          viewer.scene.globe.undergroundColorAlphaByDistance = new C.NearFarScalar(100.0, 0.9, 2000.0, 0.2);
          viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
          viewer.scene.globe.depthTestAgainstTerrain = false;
        } else {
          viewer.scene.globe.translucency.enabled = false;
          viewer.scene.globe.undergroundColor = undefined;
          viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
          viewer.scene.globe.depthTestAgainstTerrain = true;
        }
      } catch (err) { console.warn('[Gids Eyes View] translucency toggle failed:', err); }
    }
  };

  // =============================================================
  //  Street view overlay (Mapillary auto-transition ~60m)
  // =============================================================
  const svOverlay = document.createElement('div');
  svOverlay.id = 'street-view-overlay';
  svOverlay.className = 'sv-hidden';

  const svFrame = document.createElement('div');
  svFrame.id = 'sv-frame';
  svOverlay.appendChild(svFrame);

  const svClose = document.createElement('button');
  svClose.id = 'sv-close';
  svClose.type = 'button';
  svClose.setAttribute('aria-label', 'Close street view');
  svClose.textContent = '\u2715';
  svOverlay.appendChild(svClose);

  const svStatus = document.createElement('div');
  svStatus.id = 'sv-status';
  svStatus.textContent = 'Looking for a nearby panorama\u2026';
  svOverlay.appendChild(svStatus);

  document.body.appendChild(svOverlay);

  let svViewer = null;
  let svActive = false;

  function hideStreetView() {
    if (!svActive) return;
    svActive = false;
    svOverlay.classList.remove('sv-visible');
    svOverlay.classList.add('sv-hidden');
    if (svViewer) { try { svViewer.remove(); } catch {} svViewer = null; }
    svFrame.innerHTML = '';
    console.info('[Gids Eyes View] street view closed');
  }
  svClose.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); hideStreetView(); });

  let lastCheck = 0;
  function attachCameraListener(viewer) {
    if (!viewer || !viewer.camera) return;
    viewer.camera.moveEnd.addEventListener(() => {
      if (svActive) return;
      if (window.__gevStreetViewAuto === false) return;
      const now = Date.now();
      if (now - lastCheck < 1500) return;
      lastCheck = now;
      const carto = viewer.camera.positionCartographic;
      if (!carto) return;
      const h = carto.height;
      if (h > 60 || h < 2) return;
      maybeShowStreetView(viewer, carto.latitude, carto.longitude, viewer.camera.heading);
    });
    console.info('[Gids Eyes View] street view camera listener attached');
  }

  async function maybeShowStreetView(viewer, lat, lon) {
    const token = (window.__GEV_MAPILLARY__ || '')
      || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPILLARY_TOKEN)
      || '';
    if (!token) { console.info('[Gids Eye] no Mapillary token'); return; }
    const dLat = 50 / 111320;
    const dLon = 50 / (111320 * Math.cos(lat * Math.PI / 180));
    const bbox = `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`;
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,thumb_1024_url,compass_angle,geometry&bbox=${bbox}&limit=1`;
    try {
      const res = await fetch(url);
      if (!res.ok) { console.info('[Gids Eye] Mapillary HTTP', res.status); return; }
      const data = await res.json();
      if (!data || !data.data || !data.data.length) { console.info('[Gids Eye] no panorama nearby'); return; }
      showStreetViewWithImage(data.data[0]);
    } catch (err) { console.warn('[Gids Eye] Mapillary lookup failed:', err); }
  }

  function showStreetViewWithImage(img) {
    if (svActive) return;
    svActive = true;
    svStatus.textContent = 'Street view: ' + img.id;
    (async () => {
      try {
        const mod = await import('mapillary-js');
        const Viewer = mod.Viewer;
        if (!Viewer) throw new Error('MapillaryJS Viewer missing');
        const token = (window.__GEV_MAPILLARY__ || '')
          || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPILLARY_TOKEN)
          || '';
        svOverlay.classList.remove('sv-hidden');
        svOverlay.classList.add('sv-visible');
        await new Promise(r => setTimeout(r, 30));
        svViewer = new Viewer({
          accessToken: token, container: svFrame, imageId: img.id,
          component: { cover: false },
        });
        console.info('[Gids Eyes View] Mapillary viewer opened for', img.id);
      } catch (err) {
        console.warn('[Gids Eyes View] MapillaryJS unavailable, static image:', err && err.message ? err.message : err);
        svFrame.innerHTML = '';
        const imgEl = document.createElement('img');
        imgEl.src = img.thumb_1024_url;
        imgEl.alt = 'Street view';
        imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        svFrame.appendChild(imgEl);
        svOverlay.classList.remove('sv-hidden');
        svOverlay.classList.add('sv-visible');
      }
    })();
  }

  function tryAttach() {
    const viewer = _viewerRef();
    if (viewer && viewer.camera && !viewer.__gevStreetViewAttached) {
      viewer.__gevStreetViewAttached = true;
      attachCameraListener(viewer);
      return true;
    }
    return false;
  }
  if (!tryAttach()) {
    let tries = 0;
    const id = setInterval(() => { tries++; if (tryAttach() || tries > 40) clearInterval(id); }, 500);
  }
  new MutationObserver(() => { tryAttach(); }).observe(document.body, { childList: true, subtree: true });

  // =============================================================
  //  Custom dropdown converter (replaces native <select>)
  // =============================================================
  function convertSelect(select) {
    if (!select || select.dataset.gevConverted === '1') return;
    select.dataset.gevConverted = '1';
    select.style.display = 'none';
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    const sel = document.createElement('div');
    sel.className = 'dropdown-selected';
    const cur = select.options[select.selectedIndex];
    sel.textContent = cur ? cur.textContent : '';
    wrapper.appendChild(sel);
    const list = document.createElement('div');
    list.className = 'dropdown-items dropdown-hide';
    Array.from(select.options).forEach(opt => {
      const item = document.createElement('div');
      item.textContent = opt.textContent;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sel.textContent = opt.textContent;
        list.classList.add('dropdown-hide');
      });
      list.appendChild(item);
    });
    wrapper.appendChild(list);
    sel.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown-items').forEach(el => {
        if (el !== list) el.classList.add('dropdown-hide');
      });
      list.classList.toggle('dropdown-hide');
    });
    document.addEventListener('click', () => list.classList.add('dropdown-hide'));
  }
  document.querySelectorAll('select').forEach(convertSelect);
  new MutationObserver(() => {
    document.querySelectorAll('select:not([data-gev-converted])').forEach(convertSelect);
  }).observe(document.body, { childList: true, subtree: true });

  console.info('[Gids Eyes View] Tactical Core UI v31 ready with', collected.length, 'modules');
})();

// =========================================================================
// Mobile UI v31 — bottom sheet + clusters + exploration + street view +
//                 submarine + custom dropdown + aggressive cleanup
// =========================================================================

// =========================================================================
// Mobile UI v31 — bottom sheet + clusters + exploration + street view +
//                 submarine + custom dropdown + aggressive cleanup
// =========================================================================

// =========================================================================
// Mobile UI v31 — bottom sheet + clusters + exploration + street view +
//                 submarine + custom dropdown + aggressive cleanup
// =========================================================================

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// ===== GEV-MOBILE-UI v34 (macOS Golden Gate) =====

// =========================================================================
// Mobile UI v30 — bottom sheet + thumb clusters + exploration panel +
//                 street view + submarine + custom dropdown
// =========================================================================

// ===== GEV-SAT-FAB v35 =====
(function initMobileSatelliteDrawer() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__gevSatFab) return;
  window.__gevSatFab = true;

  const SIZE = 48, EDGE = 16, TAP_MS = 300, MOVE_PX = 5;   // 75% of 64
  const LAYERS = [
    { id:'live-flights',     icon:'\u2708\uFE0F',       label:'Live Flights',     panels:['flights-panel','live-flights'] },
    { id:'military-flights', icon:'\uD83D\uDEE9\uFE0F', label:'Military Flights', panels:['military-panel'] },
    { id:'satellites',       icon:'\uD83D\uDEF0\uFE0F', label:'Satellites',       panels:['satellites-panel','sat-panel'] },
    { id:'space-missions',   icon:'\uD83D\uDE80',       label:'Space Missions',   panels:['launches-panel'] },
    { id:'fire-perimeters',  icon:'\uD83D\uDD25',       label:'Fire Perimeters',  panels:['perimeters-panel'] },
    { id:'wildfires',        icon:'\uD83C\uDF0B',       label:'Wildfires',        panels:['fire-panel','firms-panel'] },
    { id:'live-traffic',     icon:'\uD83D\uDE97',       label:'Live Traffic',     panels:['traffic-panel'] },
    { id:'cyclones',         icon:'\uD83C\uDF00',       label:'Cyclones',         panels:['cyclones-panel','storms-panel'] },
    { id:'radio-stations',   icon:'\uD83D\uDCFB',       label:'Radio Stations',   panels:['radio-panel','radio-dock'] },
    { id:'transit',          icon:'\uD83D\uDE86',       label:'Transit',          panels:['transit-panel'] },
    { id:'bike-share',       icon:'\uD83D\uDEB2',       label:'Bike Share',       panels:['bikes-panel','gbfs-panel'] },
    { id:'cctv',             icon:'\uD83D\uDCF9',       label:'CCTV',             panels:['cctv-panel'] },
    { id:'exploration',      icon:'\uD83E\uDDED',       label:'Exploration',      panels:['exploration-panel'] },
  ];

  // ---- Remove leftovers from older generations ----
  document.querySelectorAll([
    '#gev-sheet','#gev-streetview','.mobile-icon-rail','.mobile-fab','.mobile-fab-fan',
    '.mobile-drawer-expand','.vertical-drawer','#side-aware-drawer','.mobile-panel-overlay',
  ].join(',')).forEach(el => el.remove());

  // ---- DOM ----
  document.getElementById('sat-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sat-root';
  root.innerHTML = `
    <button id="sat-fab" type="button" aria-label="Satellite layers" aria-expanded="false" aria-controls="sat-drawer">
      <span class="sat-halo" aria-hidden="true"></span>
      <span class="sat-ring" aria-hidden="true"></span>
      <svg class="sat-svg" viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
        <defs><linearGradient id="satBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#eaf7ff"/><stop offset="1" stop-color="#8fc8ee"/>
        </linearGradient></defs>
        <g stroke="#bfe8ff" stroke-width="1.4" stroke-linejoin="round" fill="none">
          <rect x="25" y="24" width="14" height="16" rx="2.5" fill="url(#satBody)"/>
          <rect x="5" y="28" width="16" height="8" rx="1.5" fill="#7fc5f3"/>
          <rect x="43" y="28" width="16" height="8" rx="1.5" fill="#7fc5f3"/>
          <line x1="21" y1="32" x2="25" y2="32"/><line x1="39" y1="32" x2="43" y2="32"/>
          <line x1="32" y1="40" x2="32" y2="50"/>
          <circle cx="32" cy="53" r="2.2" fill="#bfe8ff" stroke="none"/>
        </g>
        <circle cx="32" cy="30" r="2.4" fill="#0b2c4a"/>
      </svg>
    </button>
    <div id="sat-drawer" class="sat-drawer-closed" role="menu" aria-hidden="true">
      <div class="sat-drawer-header">
        <span class="sat-drawer-title">Tactical Layers</span>
        <button class="sat-drawer-close" type="button" aria-label="Close">\u2715</button>
      </div>
      <div class="sat-drawer-list"></div>
    </div>`;
  document.body.appendChild(root);

  const fab      = root.querySelector('#sat-fab');
  const drawer   = root.querySelector('#sat-drawer');
  const list     = drawer.querySelector('.sat-drawer-list');
  const closeBtn = drawer.querySelector('.sat-drawer-close');

  // ---- Items + event wiring ----
  const active = new Set();
  function findPanel(L) {
    for (const id of L.panels) { const el = document.getElementById(id); if (el) return el; }
    return null;
  }
  function setItemState(btn, on) {
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-checked', String(!!on));
  }
  function requestLayer(L, btn) {
    const on = !active.has(L.id);
    on ? active.add(L.id) : active.delete(L.id);
    setItemState(btn, on);

    const evt = new CustomEvent('gev:layer-request', { detail: { id: L.id, active: on }, cancelable: true });
    const handled = !document.dispatchEvent(evt); // app calls preventDefault() when it handled it
    if (handled) return;

    if (on && window.gevPanels?.open) { window.gevPanels.open(L.id); return; }
    const panel = findPanel(L);
    if (panel) {
      panel.classList.toggle('sat-panel-visible', on);
      panel.style.display = on ? 'block' : 'none';
    } else {
      console.info('[Gids Eyes View] no handler/panel for', L.id);
    }
  }
  LAYERS.forEach(L => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sat-drawer-item';
    b.setAttribute('role', 'menuitemcheckbox');
    b.setAttribute('aria-checked', 'false');
    b.dataset.id = L.id;
    b.innerHTML = `<span class="sat-item-icon">${L.icon}</span><span class="sat-item-label">${L.label}</span><span class="sat-item-dot" aria-hidden="true"></span>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); requestLayer(L, b); });
    list.appendChild(b);
  });
  document.addEventListener('gev:layer-state', (e) => {
    const { id, active: on } = e.detail || {};
    const b = list.querySelector(`[data-id="${id}"]`);
    if (!b) return;
    on ? active.add(id) : active.delete(id);
    setItemState(b, on);
  });

  // ---- Position + smart orientation ----
  let pos = { x: window.innerWidth - (SIZE + EDGE), y: window.innerHeight - 150 };
  try {
    const s = JSON.parse(localStorage.getItem('gev.satFabPos') || 'null');
    if (s && typeof s.x === 'number') pos = { x: s.x * window.innerWidth, y: s.y * window.innerHeight };
  } catch {}
  let isDrawerOpen = false;

  function applyPosition() {
    pos.x = Math.max(EDGE, Math.min(window.innerWidth  - (SIZE + EDGE), pos.x));
    pos.y = Math.max(EDGE, Math.min(window.innerHeight - (SIZE + EDGE), pos.y));
    root.style.left = pos.x + 'px';
    root.style.top  = pos.y + 'px';
    const inTopHalf  = pos.y < window.innerHeight / 2;
    const inLeftHalf = pos.x < window.innerWidth  / 2;
    drawer.classList.toggle('sat-drawer-below',  inTopHalf);
    drawer.classList.toggle('sat-drawer-above', !inTopHalf);
    drawer.classList.toggle('sat-drawer-left',   inLeftHalf);
    drawer.classList.toggle('sat-drawer-right', !inLeftHalf);
    const room = inTopHalf ? window.innerHeight - pos.y - SIZE - 28 : pos.y - 28;
    drawer.style.maxHeight = Math.max(160, room) + 'px';
  }
  function savePosition() {
    try { localStorage.setItem('gev.satFabPos', JSON.stringify({ x: pos.x / window.innerWidth, y: pos.y / window.innerHeight })); } catch {}
  }
  function toggleDrawer(force) {
    isDrawerOpen = force !== undefined ? force : !isDrawerOpen;
    drawer.classList.toggle('sat-drawer-open',   isDrawerOpen);
    drawer.classList.toggle('sat-drawer-closed', !isDrawerOpen);
    drawer.setAttribute('aria-hidden', String(!isDrawerOpen));
    fab.classList.toggle('is-open', isDrawerOpen);
    fab.setAttribute('aria-expanded', String(isDrawerOpen));
  }
  applyPosition();

  // ---- PointerEvent drag + magnetic edge snap ----
  let drag = null, hasMoved = false;
  fab.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { fab.setPointerCapture(e.pointerId); } catch {}
    drag = { startX: e.clientX, startY: e.clientY, initPosX: pos.x, initPosY: pos.y, id: e.pointerId, time: Date.now() };
    hasMoved = false;
    root.style.transition = 'none';
    fab.classList.add('is-grabbing');
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!hasMoved && Math.hypot(dx, dy) > MOVE_PX) { hasMoved = true; if (isDrawerOpen) toggleDrawer(false); }
    if (hasMoved) { pos.x = drag.initPosX + dx; pos.y = drag.initPosY + dy; applyPosition(); }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    try { fab.releasePointerCapture(e.pointerId); } catch {}
    fab.classList.remove('is-grabbing');
    if (!hasMoved && (Date.now() - drag.time) < TAP_MS) {
      toggleDrawer();
    } else if (hasMoved) {
      pos.x = (pos.x + SIZE / 2 < window.innerWidth / 2) ? EDGE : (window.innerWidth - (SIZE + EDGE));
      root.style.transition = 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
      applyPosition();
      savePosition();
      setTimeout(() => { root.style.transition = 'none'; }, 300);
    }
    drag = null;
  }
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer(false); });
  document.addEventListener('pointerdown', (e) => {
    if (isDrawerOpen && !root.contains(e.target)) toggleDrawer(false);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isDrawerOpen) toggleDrawer(false); });
  window.addEventListener('resize', applyPosition);
  window.addEventListener('orientationchange', () => setTimeout(applyPosition, 250));

  window.gevSatFab = { open: () => toggleDrawer(true), close: () => toggleDrawer(false), layers: LAYERS, root };
  console.info('[Gids Eyes View] Satellite FAB v35 ready \u2014', LAYERS.length, 'layers');
})();

// ===== GEV-RAIL-FAB v41 =====
// Consolidates the left vertical rail into ONE draggable 56px glowing orb.
//  * Whole rail (incl. its outlined frame) is hidden with inline !important.
//  * Its icons are rebuilt as glowing orbs in a column anchored to the FAB;
//    tapping one fires the original button and auto-collapses the column.
//  * Panels that open are docked in a glass sheet anchored to the orb.
//  * Right-side DISPLAY / CCTV / CONTEXT panels are added as extra orbs.
// Overrides: window.GEV_RAIL_ADOPT = { rail: ['#rail'], panels: { DISPLAY: '#display-panel' } }
(function initRailFab() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  if (window.__gevRailFab) return;
  window.__gevRailFab = true;

  const SIZE = 42, EDGE = 16, TAP_MS = 300, MOVE_PX = 5, GAP = 10, SCAN_MS = 380;   // 75% of 56
  const cfg = window.GEV_RAIL_ADOPT || {};
  const RAIL_SELECTORS = cfg.rail || [
    '#icon-rail', '#side-rail', '#left-rail', '#nav-rail', '#sidebar', '#left-toolbar', '#dock',
    '.icon-rail', '.side-rail', '.left-rail', '.nav-rail', '.sidebar', '.left-toolbar',
    '.vertical-toolbar', '.side-dock', '[data-role="rail"]',
  ];
  // Real God's Eye View panels (ids verified from src/ui/templates/*.html).
  // Each becomes one orb; tapping docks the panel itself into the sheet.
  const SIDE_PANELS = [
    { id: 'data-panel',           label: 'Layers',  toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>' },
    { id: 'cctv-panel',           label: 'CCTV',    toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l13 4-2 5L3 12z"/><path d="M16 11l4-1M8 13.5V19H4"/></svg>' },
    { id: 'pp-toggles',           label: 'Display', toggle: '.pp-collapse-btn',    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>' },
    { id: 'global-context-panel', label: 'Context', toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>' },
    { id: 'scene-panel',          label: 'Scenes',  toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>' },
    { id: 'radio-panel',          label: 'Radio',   toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-5"/><circle cx="8" cy="14" r="2"/><path d="M14 13h4M14 16h4"/></svg>' },
    { id: 'weather-panel',        label: 'Weather', toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 17 18z"/></svg>', optional: true },
    { id: 'gev-geo-panel',        label: 'Geo',     toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/><circle cx="17" cy="7" r="2" fill="#7fc5f3"/></svg>' },
    { id: 'recent-imagery-panel', label: 'Imagery', toggle: '.panel-collapse-btn', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/></svg>', optional: true },
  ];
  const own = (el) => !!el.closest('#rail-root, #rail-col, #rail-sheet, #sat-root, #gev-sub-pad, #gev-voice-caption');

  // inline !important beats any app stylesheet rule (ids, !important, etc.)
  const HIDE = { position: 'fixed', left: '-10000px', top: '-10000px', opacity: '0',
                 'pointer-events': 'none', visibility: 'hidden', transform: 'none' };
  const saved = new WeakMap();
  // only touch the properties we set, so app changes made meanwhile (e.g. display:none on close) survive
  function hideEl(el) {
    if (!saved.has(el)) {
      const prev = {};
      for (const k of Object.keys(HIDE)) prev[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)];
      saved.set(el, prev);
    }
    for (const [k, v] of Object.entries(HIDE)) el.style.setProperty(k, v, 'important');
  }
  function restoreEl(el) {
    if (!saved.has(el)) return;
    const prev = saved.get(el); saved.delete(el);
    for (const [k, [v, pr]] of Object.entries(prev)) {
      if (v) el.style.setProperty(k, v, pr); else el.style.removeProperty(k);
    }
  }

  // ---------------------------------------------------------------- discovery
  function findRail() {
    let el = null;
    for (const sel of RAIL_SELECTORS) { const c = document.querySelector(sel); if (c && !own(c)) { el = c; break; } }
    if (!el) {
      const vh = innerHeight; let bestN = 0;
      for (const c of document.body.querySelectorAll('div, nav, aside, section, ul')) {
        if (own(c)) continue;
        const cs = getComputedStyle(c);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
        const r = c.getBoundingClientRect();
        if (r.left > 40 || r.width > 140 || r.width < 32 || r.height < vh * 0.3) continue;
        const n = c.querySelectorAll('button, [role="button"], a').length;
        if (n >= 4 && n > bestN) { el = c; bestN = n; }
      }
    }
    if (!el) return null;
    // climb to the outermost narrow left-edge frame (that's the outlined pill)
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const r = p.getBoundingClientRect();
      if (r.width > 170 || r.left > 60) break;
      el = p;
    }
    return el;
  }
  const panelEl = (sp) => {
    const sel = cfg.panels && (cfg.panels[sp.id] || cfg.panels[sp.label.toUpperCase()]);
    return sel ? document.querySelector(sel) : document.getElementById(sp.id);
  };
  const regFor = (node) => SIDE_PANELS.find(sp => {
    const el = panelEl(sp);
    return el && (el === node || el.contains(node) || node.contains(el));
  });
  function expandPanel(sp, el) {
    if (el.hasAttribute('hidden')) { el.removeAttribute('hidden'); el.dataset.gevUnhid = '1'; }
    if (!el.classList.contains('collapsed')) return;
    const t = [...el.querySelectorAll(sp.toggle)].find(b => b.dataset.collapseTarget === el.id) || el.querySelector(sp.toggle);
    try { t?.click(); } catch {}
    if (el.classList.contains('collapsed')) el.classList.remove('collapsed');   // app ignored the click
    el.dataset.gevExpanded = '1';
  }
  function collapsePanel(sp, el) {
    if (el.dataset.gevExpanded === '1') {
      delete el.dataset.gevExpanded;
      const t = [...el.querySelectorAll(sp.toggle)].find(b => b.dataset.collapseTarget === el.id) || el.querySelector(sp.toggle);
      try { t?.click(); } catch {}
      if (!el.classList.contains('collapsed')) el.classList.add('collapsed');
    }
    if (el.dataset.gevUnhid === '1') { delete el.dataset.gevUnhid; el.setAttribute('hidden', ''); }
  }
  function toTop(el) {
    const go = () => {
      sBody.scrollTop = 0;
      el.querySelectorAll('.data-toggle-list, [data-rail-scroller]').forEach(x => { x.scrollTop = 0; });
    };
    go(); requestAnimationFrame(go); setTimeout(go, 250); setTimeout(go, 700);   // app may restore old scroll
  }
  function openPanel(sp, orb) {
    const el = panelEl(sp);
    if (!el) return false;
    restoreEl(el);
    dock(el, sp.label, { side: true, reg: sp, orb });
    expandPanel(sp, el);
    toTop(el);
    watch();
    return true;
  }
  function findSidePanel(key) {
    const sel = cfg.panels && cfg.panels[key];
    if (sel) return document.querySelector(sel);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue.trim().toUpperCase() !== key) continue;
      let el = t.parentElement;
      if (!el || own(el) || (frame && frame.contains(el))) continue;
      for (let i = 0; el && i < 8; i++, el = el.parentElement) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width >= 220 && (cs.position === 'fixed' || cs.position === 'absolute' ||
            /panel|dock|card|drawer|section/i.test(el.className))) return el;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'rail-root';
  root.innerHTML = `
    <button id="rail-fab" type="button" aria-label="Tools menu" aria-expanded="false">
      <span class="sat-halo" aria-hidden="true"></span>
      <span class="sat-ring" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
           stroke="#bfe8ff" stroke-width="1.8" stroke-linecap="round">
        <rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/>
        <rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5" fill="#7fc5f3"/>
      </svg>
    </button>`;
  document.body.appendChild(root);
  const fab = root.querySelector('#rail-fab');

  const col = document.createElement('div');
  col.id = 'rail-col';
  col.setAttribute('role', 'menu');
  document.body.appendChild(col);

  const sheet = document.createElement('div');
  sheet.id = 'rail-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `
    <div class="rs-head"><button type="button" class="rs-back" aria-label="Back" hidden>\u2039</button><span class="rs-title"></span>
      <button type="button" class="rs-close" aria-label="Close">✕</button></div>
    <div class="rs-body"></div>`;
  document.body.appendChild(sheet);
  const sTitle = sheet.querySelector('.rs-title');
  const sBody  = sheet.querySelector('.rs-body');
  const sBack  = sheet.querySelector('.rs-back');

  let frame = null, open = false;

  // ---------------------------------------------------------------- position
  let pos = { x: EDGE, y: innerHeight - 190 };
  try {
    const s = JSON.parse(localStorage.getItem('gev.railFabPos') || 'null');
    if (s && typeof s.x === 'number') pos = { x: s.x * innerWidth, y: s.y * innerHeight };
  } catch {}
  const save = () => { try { localStorage.setItem('gev.railFabPos', JSON.stringify({ x: pos.x / innerWidth, y: pos.y / innerHeight })); } catch {} };

  function anchor(el, centre) {
    const vw = innerWidth, vh = innerHeight;
    const inTop = pos.y < vh / 2, inLeft = pos.x < vw / 2;
    const s = el.style;
    if (centre) { s.setProperty('--ax-l', (pos.x + SIZE / 2) + 'px'); s.setProperty('--ax-r', 'auto'); }
    else {
      s.setProperty('--ax-l', inLeft ? pos.x + 'px' : 'auto');
      s.setProperty('--ax-r', inLeft ? 'auto' : (vw - pos.x - SIZE) + 'px');
    }
    if (inTop) {
      s.setProperty('--ax-t', (pos.y + SIZE + GAP) + 'px'); s.setProperty('--ax-b', 'auto');
      s.setProperty('--ax-max', (vh - pos.y - SIZE - GAP - EDGE) + 'px');
    } else {
      s.setProperty('--ax-t', 'auto'); s.setProperty('--ax-b', (vh - pos.y + GAP) + 'px');
      s.setProperty('--ax-max', (pos.y - GAP - EDGE) + 'px');
    }
    el.classList.toggle('ax-top', inTop);
    el.classList.toggle('ax-right', !inLeft);
  }
  function apply() {
    pos.x = Math.max(EDGE, Math.min(innerWidth  - SIZE - EDGE, pos.x));
    pos.y = Math.max(EDGE, Math.min(innerHeight - SIZE - EDGE, pos.y));
    root.style.left = pos.x + 'px';
    root.style.top  = pos.y + 'px';
    anchor(col, true); anchor(sheet, false);
  }
  function setOpen(v) {
    open = v;
    if (v && stack.length) undock();
    anchor(col, true);
    col.classList.toggle('rc-open', v);
    fab.classList.toggle('is-open', v || stack.length > 0);
    fab.setAttribute('aria-expanded', String(v));
    if (v) window.gevSatFab?.close?.();
  }
  apply();

  // ---------------------------------------------------------------- docking (stack: menu > sub-menu > ...)
  const stack = [];          // [{ node, marker, style, side, closeBtn, trigger, title, tamed:[] }]
  const tamed = new Set();   // app overlays / headers hidden while our sheet is open
  function tame(el) {
    if (!el || own(el) || tamed.has(el)) return;
    tamed.add(el);
    hideEl(el);
  }
  function untameAll() { tamed.forEach(el => restoreEl(el)); tamed.clear(); }

  function render() {
    stack.forEach((e, i) => e.node.classList.toggle('rd-hidden', i !== stack.length - 1));
    const top = stack[stack.length - 1];
    sTitle.textContent = top ? top.title : '';
    sBack.hidden = stack.length < 2;
    sheet.classList.toggle('rs-open', !!top);
    sheet.setAttribute('aria-hidden', String(!top));
    fab.classList.toggle('is-open', open || !!top);
    if (top) {
      anchor(sheet, false);
      sheet.classList.add('rs-full');          // phones: use the whole screen height
      requestAnimationFrame(() => { clampSheet(); sBody.scrollTop = 0; });
      setTimeout(() => { clampSheet(); sBody.scrollTop = 0; }, 420);
    }
  }
  // make every option visible: nested scrollers / fixed heights are flattened so
  // the sheet body is the only scroll container; restored on undock
  const FIT = { height: 'auto', 'max-height': 'none', 'min-height': '0', 'overflow-y': 'visible', 'overflow-x': 'visible' };
  const fitSaved = new Map();
  function fit(root) {
    const els = [root, ...root.querySelectorAll('*')];
    for (const el of els) {
      if (el.closest('svg, canvas, video, iframe, img, input, select, textarea')) continue;
      const cs = getComputedStyle(el);
      const scrolls = /auto|scroll|hidden/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
      const capped  = cs.maxHeight !== 'none' && el.scrollHeight > el.clientHeight + 2;
      const fixedH  = el !== root && /px$/.test(el.style.height || '') && el.scrollHeight > el.clientHeight + 2;
      // layouts that push the first rows ABOVE the scroll origin (unreachable):
      // centred/bottom-aligned flex columns, column-reverse, negative offsets
      if (/column/.test(cs.flexDirection) && /center|end|space-/.test(cs.justifyContent) && el.scrollHeight > el.clientHeight + 2)
        el.style.setProperty('justify-content', 'flex-start', 'important');
      if (cs.flexDirection === 'column-reverse') el.style.setProperty('flex-direction', 'column', 'important');
      if (parseFloat(cs.marginTop) < 0) el.style.setProperty('margin-top', '0', 'important');
      if (el !== root && cs.transform !== 'none') {
        const m = cs.transform.match(/matrix\(([^)]+)\)/);
        if (m && parseFloat(m[1].split(',')[5]) < -4) el.style.setProperty('transform', 'none', 'important');
      }
      if (el !== root && (cs.position === 'absolute' || cs.position === 'fixed') && el.getBoundingClientRect().height > 120)
        el.style.setProperty('position', 'static', 'important');
      if (!(scrolls || capped || fixedH || el === root)) continue;
      if (!fitSaved.has(el)) {
        const prev = {};
        for (const k of Object.keys(FIT)) prev[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)];
        fitSaved.set(el, prev);
      }
      for (const [k, v] of Object.entries(FIT)) el.style.setProperty(k, v, 'important');
    }
  }
  function unfit(root) {
    for (const [el, prev] of fitSaved) {
      if (!(el === root || root.contains(el))) continue;
      for (const [k, [v, pr]] of Object.entries(prev)) { if (v) el.style.setProperty(k, v, pr); else el.style.removeProperty(k); }
      fitSaved.delete(el);
    }
  }

  // keep the whole sheet (header + first option) on screen, measured against
  // the visual viewport (status bar / keyboard aware)
  function clampSheet() {
    if (!sheet.classList.contains('rs-open')) return;
    if (sheet.classList.contains('rs-full')) return;
    const vv = window.visualViewport;
    const vTop = (vv ? vv.offsetTop : 0) + EDGE;
    const vBot = (vv ? vv.offsetTop + vv.height : innerHeight) - EDGE;
    const r = sheet.getBoundingClientRect();
    const room = sheet.classList.contains('ax-top') ? vBot - r.top : r.bottom - vTop;
    sheet.style.setProperty('--ax-max', Math.max(200, Math.floor(room)) + 'px');
    const r2 = sheet.getBoundingClientRect();
    if (r2.top < vTop) sheet.style.setProperty('--ax-max', Math.max(200, Math.floor(r2.height - (vTop - r2.top))) + 'px');
  }
  window.visualViewport?.addEventListener('resize', () => clampSheet());

  function dock(node, title, opts = {}) {
    if (stack.some(e => e.node === node || e.node.contains(node))) return;
    const marker = document.createComment('gev-rail-dock');
    node.before(marker);
    const entry = { node, marker, style: node.getAttribute('style'), title: title || '', ...opts };
    if (opts.side) restoreEl(node);
    node.classList.add('rail-docked');
    sBody.appendChild(node);
    fit(node);
    requestAnimationFrame(() => fit(node));        // lists that render a frame later
    setTimeout(() => node.isConnected && fit(node), 400);
    stack.push(entry);
    if (opts.orb && title) opts.orb.setLabel(title);
    render();
    watch();
  }
  function popOne(fireClose = true) {
    const d = stack.pop();
    if (!d) return;
    unfit(d.node);
    d.node.classList.remove('rail-docked', 'rd-hidden');
    if (d.marker.isConnected) d.marker.replaceWith(d.node); else d.node.remove();
    if (d.style === null) d.node.removeAttribute('style'); else d.node.setAttribute('style', d.style);
    if (d.reg) collapsePanel(d.reg, d.node);
    if (d.side) hideEl(d.node);
    if (fireClose && !d.reg) { try { (d.closeBtn && d.closeBtn.isConnected ? d.closeBtn : d.trigger)?.click(); } catch {} }
    else if (fireClose && d.closeBtn?.isConnected) { try { d.closeBtn.click(); } catch {} }
  }
  function undock() {                 // close everything
    unwatch();
    while (stack.length) popOne(true);
    setTimeout(untameAll, 50);        // let the app finish closing first
    render();
  }
  // in-place Data Layers (not docked): reset to MOVEMENT each time it opens
  (function keepLayersTop() {
    const dp = document.getElementById('data-panel');
    if (!dp) return setTimeout(keepLayersTop, 800);
    let was = dp.classList.contains('collapsed');
    new MutationObserver(() => {
      const now = dp.classList.contains('collapsed');
      if (was && !now) {
        const list = document.getElementById('data-toggles');
        const go = () => { if (list) list.scrollTop = 0; };
        go(); setTimeout(go, 250); setTimeout(go, 700);
        const r = dp.getBoundingClientRect();
        if (r.top < 0) dp.scrollIntoView({ block: 'start' });
      }
      was = now;
    }).observe(dp, { attributes: true, attributeFilter: ['class'] });
  })();
  Object.defineProperty(window, '__gevRailDocked', { get: () => stack.length > 0, configurable: true });
  sheet.querySelector('.rs-close').addEventListener('click', (e) => { e.stopPropagation(); undock(); });

  // Touch-drag scrolling that works even if something on the page swallows
  // native scrolling: if a vertical drag does not move the scroller, move it.
  function dragScroll(el) {
    if (!el || el.__gevDrag) return; el.__gevDrag = true;
    let y0 = 0, t0 = 0, x0 = 0, active = false, lastY = 0, lastT = 0, v = 0, raf = 0;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || e.target.closest('input[type="range"], [role="slider"]')) { active = false; return; }
      cancelAnimationFrame(raf);
      y0 = lastY = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = el.scrollTop; lastT = performance.now(); v = 0; active = true;
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!active) return;
      const y = e.touches[0].clientY, dy = y - y0;
      if (Math.abs(dy) < 6 || Math.abs(e.touches[0].clientX - x0) > Math.abs(dy)) return;
      if (el.scrollTop === t0 || el.__gevManual) {        // native scroll is not happening
        el.__gevManual = true;
        el.scrollTop = t0 - dy;
        if (e.cancelable) e.preventDefault();
      }
      const now = performance.now(); v = (y - lastY) / Math.max(1, now - lastT); lastY = y; lastT = now;
    }, { passive: false });
    el.addEventListener('touchend', () => {
      if (!active) return; active = false;
      if (!el.__gevManual) return;
      el.__gevManual = false;
      let vel = v * 16;                                   // fling
      const step = () => { if (Math.abs(vel) < 0.5) return; el.scrollTop -= vel; vel *= 0.94; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }, { passive: true });
  }
  dragScroll(sBody);
  // the same for the in-app panels (Data Layers list etc.) when not docked
  (function scrollers() {
    document.querySelectorAll('#data-toggles, #left-panel-stack, [data-rail-scroller]').forEach(dragScroll);
    setTimeout(scrollers, 1500);
  })();
  sBack.addEventListener('click', (e) => { e.stopPropagation(); popOne(true); render(); if (!stack.length) undock(); });

  // ---------------------------------------------------------------- panel detection
  const vis = (el) => {
    if (!el.isConnected || own(el) || el === frame || tamed.has(el)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 120 && r.height >= 40 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const candidates = () => [...document.body.querySelectorAll('div, section, aside, dialog, form, header')]
    .filter(el => { const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'absolute' || p === 'sticky') && vis(el); });
  const outermost = (els) => els.filter(a => !els.some(b => b !== a && b.contains(a)));
  const isCover = (el) => { const r = el.getBoundingClientRect(); return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.6; };
  const hasBlur = (el) => { const cs = getComputedStyle(el); return /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''); };
  function titleIn(el) {
    const h = el.querySelector('h1, h2, h3, h4, [class*="title"], header');
    return (h?.textContent || el.getAttribute('aria-label') || '').trim().split('\n')[0].trim().slice(0, 40);
  }
  function closeIn(el) {
    return [...el.querySelectorAll('button, [role="button"]')].find(b =>
      /close|dismiss/i.test(b.getAttribute('aria-label') || b.title || '') || /^[\u2715\u2716\u00D7xX]$/.test(b.textContent.trim()));
  }
  // real content card: biggest rounded / scrollable box that isn't full-screen
  function cardIn(scope) {
    let best = null, area = 0;
    for (const el of scope.querySelectorAll('div, section, form')) {
      const r = el.getBoundingClientRect();
      if (r.width >= innerWidth * 0.97 && r.height >= innerHeight * 0.9) continue;
      if (r.height < 120 || r.width < 200) continue;
      const cs = getComputedStyle(el);
      if (!(parseFloat(cs.borderTopLeftRadius) > 4 || /auto|scroll/.test(cs.overflowY))) continue;
      const a = r.width * r.height;
      if (a > area && !(best && best.contains(el))) { best = el; area = a; }
    }
    return best;
  }
  // handle whatever the app just showed: dock its card, hide every other layer
  function absorb(fresh, trigger, label, orb) {
    if (!fresh.length) return false;
    fresh.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
    let card = null, title = '', closeBtn = null;
    for (const f of fresh) {
      title = title || titleIn(f);
      closeBtn = closeBtn || closeIn(f);
      if (!card) card = (isCover(f) || hasBlur(f)) ? cardIn(f) : f;
    }
    if (!card) card = cardIn(document.body.lastElementChild || document.body);
    if (!card) return false;
    const sp = regFor(card);
    if (sp) {
      const el = panelEl(sp);
      // remember: this rail icon opens that panel; drop the duplicate registry orb
      if (orb && !orb.dataset.reg) {
        orb.dataset.reg = sp.id; orb.setLabel?.(sp.label);
        if (sp.orb && sp.orb !== orb) { sp.orb.remove(); sp.orb = orb; }
      }
      fresh.forEach(f => { if (!f.contains(el) && !el.contains(f)) tame(f); });
      candidates().forEach(c => { if ((isCover(c) || hasBlur(c)) && !c.contains(sheet) && !c.contains(el)) tame(c); });
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (isCover(a) || hasBlur(a)) tame(a);
      restoreEl(el);
      dock(el, sp.label, { side: true, reg: sp, orb, closeBtn, trigger });
      expandPanel(sp, el);
      toTop(el);
      return true;
    }
    dock(card, title || label, { closeBtn, trigger, orb });
    // every other new layer (blur backdrop, floating header, scrim) gets hidden
    fresh.forEach(f => { if (!f.contains(card) && !card.contains(f)) tame(f); else if (f !== card) tame(f); });
    candidates().forEach(el => { if ((isCover(el) || hasBlur(el)) && !el.contains(sheet)) tame(el); });
    return true;
  }
  function captureAfter(trigger, before, label, orb) {
    let n = 0;
    (function look() {
      const fresh = outermost(candidates().filter(el => !before.has(el)));
      if (absorb(fresh, trigger, label, orb)) return;
      if (++n < 4) setTimeout(look, 220);      // apps that animate in
    })();
    setTimeout(() => {}, 0);
  }
  // while the sheet is open: sub-menus / sub-panels the app opens get stacked in,
  // and any late overlay layer gets hidden
  let mo = null, known = null, moT = 0;
  function watch() {
    known = new Set(candidates());
    if (mo) return;
    mo = new MutationObserver(() => {
      clearTimeout(moT);
      moT = setTimeout(() => {
        if (!stack.length) return;
        fit(stack[stack.length - 1].node);
        const fresh = outermost(candidates().filter(el => !known.has(el)));
        if (!fresh.length) return;
        if (!absorb(fresh, null, '', null)) fresh.forEach(tame);
        known = new Set(candidates());
      }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
  }
  function unwatch() { if (mo) { mo.disconnect(); mo = null; } }

  // ---------------------------------------------------------------- orbs
  function makeOrb(iconNode, label, onTap, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail-orb ' + extraClass;
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-label', label);
    b.innerHTML = '<span class="rail-orb-halo" aria-hidden="true"></span><span class="rail-orb-ico"></span><span class="rail-orb-label"></span>';
    const lab = b.querySelector('.rail-orb-label');
    b.setLabel = (t) => { t = (t || '').trim(); if (!t || /^tool \d+$/i.test(t)) return; lab.textContent = t; b.setAttribute('aria-label', t); try { localStorage.setItem('gev.orbLabel.' + col.children.length + '.' + b.dataset.idx, t); } catch {} };
    b.dataset.idx = String(col.children.length);
    let stored = null; try { stored = localStorage.getItem('gev.orbLabel.' + col.children.length + '.' + b.dataset.idx); } catch {}
    lab.textContent = (/^tool \d+$/i.test(label) && stored) ? stored : label;
    b.querySelector('.rail-orb-ico').appendChild(iconNode);
    b.addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); if (stack.length) undock(); onTap(b); }); // auto-collapse
    col.appendChild(b);
    return b;
  }
  function iconOf(btn) {
    const g = btn.querySelector('svg, img, i, [class*="icon"]');
    let c;
    if (g) c = g.cloneNode(true);
    else { c = document.createElement('span'); c.textContent = (btn.textContent || '◉').trim().slice(0, 2); }
    c.removeAttribute?.('id'); c.querySelectorAll?.('[id]').forEach(n => n.removeAttribute('id'));
    c.removeAttribute?.('style');
    return c;
  }
  const isOn = (b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-expanded') === 'true' ||
                      /\b(active|is-active|selected|on)\b/.test(b.className);
  const proxies = [];

  function buildFromRail() {
    const btns = [...frame.querySelectorAll('button, [role="button"], a')].filter(b => {
      if (b.parentElement.closest('button, [role="button"]')) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    btns.forEach((btn, i) => {
      const label = (btn.getAttribute('aria-label') || btn.title || btn.dataset.tooltip || btn.dataset.label || btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) || `Tool ${i + 1}`;
      const orb = makeOrb(iconOf(btn), label, (o) => {
        const known = o.dataset.reg && SIDE_PANELS.find(sp => sp.id === o.dataset.reg);
        if (known && openPanel(known, o)) return;
        const before = new Set(candidates());
        const shown = (el) => el && !el.classList.contains('collapsed') && !el.hasAttribute('hidden');
        const regBefore = new Map(SIDE_PANELS.map(sp => [sp, shown(panelEl(sp))]));
        try { btn.click(); } catch {}
        setTimeout(() => {
          if (stack.length) return;
          const sp = SIDE_PANELS.find(x => !regBefore.get(x) && shown(panelEl(x)));
          if (!sp) return;
          o.dataset.reg = sp.id; o.setLabel?.(sp.label);
          if (sp.orb && sp.orb !== o) sp.orb.remove();
          sp.orb = o;
          const el = panelEl(sp);
          el.dataset.gevExpanded = '1';          // collapse it again when the sheet closes
          openPanel(sp, o);
        }, 160);
        captureAfter(btn, before, o.getAttribute('aria-label') || label, o);
      });
      proxies.push({ btn, orb });
    });
    return btns.length;
  }
  function adoptSidePanels() {
    let n = 0;
    SIDE_PANELS.forEach(sp => {
      if (sp.done) return;
      const el = panelEl(sp);
      if (!el || own(el)) return;
      if (sp.optional && el.hasAttribute('hidden')) return;   // only when the app shows it
      sp.done = true; n++;
      // a rail icon with the same name already exists -> link it, no duplicate orb
      const norm = (t) => (t || '').toLowerCase().replace(/data\s+layers?/, 'layers').replace(/[^a-z]/g, '');
      const twin = proxies.find(x => !x.orb.dataset.reg && norm(x.orb.getAttribute('aria-label')) === norm(sp.label));
      if (twin) {
        twin.orb.dataset.reg = sp.id; sp.orb = twin.orb;
        if (!SIDE_PANELS.some(o => o !== sp && panelEl(o)?.contains(el))) hideEl(el);
        return;
      }
      if (!SIDE_PANELS.some(o => o !== sp && panelEl(o)?.contains(el))) hideEl(el);  // nested panels move with their parent
      const tmp = document.createElement('span'); tmp.innerHTML = sp.icon;
      sp.orb = makeOrb(tmp.firstElementChild, sp.label, () => openPanel(sp, sp.orb), 'rail-side-orb');
      sp.orb.dataset.reg = sp.id;
    });
    return n;
  }
  // ---- Ocean integration: 🌊 Ocean + 🛥 Sub buttons (right edge) -> orbs ----
  const OCEAN = [
    { key: 'ocean', label: 'Ocean', emoji: '\uD83C\uDF0A', rx: /\uD83C\uDF0A|\bocean\b|seafloor|bathymetry/i },
    { key: 'sub',   label: 'Sub',   emoji: '\uD83D\uDEE5', rx: /\uD83D\uDEE5|\uD83D\uDEA4|\bsub(marine)?\b/i },
  ];
  function adoptOceanButtons() {
    OCEAN.forEach(o => {
      if (o.done) return;
      const sel = cfg.ocean && cfg.ocean[o.key];
      const btn = sel ? document.querySelector(sel) : [...document.querySelectorAll('button, [role="button"]')].find(b => {
        if (own(b) || (frame && frame.contains(b)) || b.closest('#rail-sheet, #data-panel, #pp-toggles, #global-context-panel')) return false;
        const t = [b.textContent, b.getAttribute('aria-label'), b.title, b.id].join(' ');
        if (!o.rx.test(t)) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.left > innerWidth * 0.5;          // right-edge buttons
      });
      if (!btn) return;
      o.done = true; o.btn = btn;
      hideEl(btn.closest('[class*="ocean"], [id*="ocean"], [class*="sub-"], [id*="sub-"]') || btn);
      const ico = document.createElement('span'); ico.textContent = o.emoji;
      o.orb = makeOrb(ico, o.label, (orb) => {
        const before = new Set(candidates());
        try { btn.click(); } catch {}
        if (o.key === 'sub') subPad.toggleAuto();
        captureAfter(btn, before, o.label, orb);
      }, 'rail-side-orb rail-ocean-orb');
      proxies.push({ btn, orb: o.orb });
    });
  }

  // Touch pad for the submarine (keyboard-only on desktop: W/S/A/D, Q/E, Shift, X).
  // Sends real KeyboardEvents so the app's own sub controls handle them.
  const subPad = (() => {
    const KEYS = { W: ['w', 'KeyW', 87], A: ['a', 'KeyA', 65], S: ['s', 'KeyS', 83], D: ['d', 'KeyD', 68],
                   Q: ['q', 'KeyQ', 81], E: ['e', 'KeyE', 69], X: ['x', 'KeyX', 88], SH: ['Shift', 'ShiftLeft', 16] };
    const send = (type, k) => {
      const [key, code, keyCode] = KEYS[k];
      const ev = () => new KeyboardEvent(type, { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, shiftKey: boost && k !== 'SH' });
      // dispatched once on the focused element (or body); it bubbles to document + window
      try { (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body).dispatchEvent(ev()); } catch {}
    };
    let boost = false, el = null, shown = false;
    function build() {
      el = document.createElement('div');
      el.id = 'gev-sub-pad';
      el.innerHTML = `
        <div class="sp-dpad">
          <button data-k="W" aria-label="Forward">\u25B2</button>
          <button data-k="A" aria-label="Turn left">\u25C0</button>
          <button data-k="S" aria-label="Reverse">\u25BC</button>
          <button data-k="D" aria-label="Turn right">\u25B6</button>
        </div>
        <div class="sp-side">
          <button data-k="Q" aria-label="Rise">RISE</button>
          <button data-k="E" aria-label="Dive">DIVE</button>
          <button data-t="SH" aria-label="Explore speed">FAST</button>
          <button data-tap="X" aria-label="Change camera">CAM</button>
          <button data-close aria-label="Hide sub controls">\u2715</button>
        </div>`;
      document.body.appendChild(el);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.querySelectorAll('[data-k]').forEach(b => {
        const k = b.dataset.k; let held = false;
        const down = (e) => { e.preventDefault(); if (held) return; held = true; b.classList.add('on');
          try { document.activeElement?.blur?.(); } catch {} send('keydown', k); };
        const up = (e) => { e?.preventDefault?.(); if (!held) return; held = false; b.classList.remove('on'); send('keyup', k); };
        b.addEventListener('pointerdown', (e) => { try { b.setPointerCapture(e.pointerId); } catch {} down(e); });
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      });
      el.querySelector('[data-t="SH"]').addEventListener('click', (e) => {
        boost = !boost; e.currentTarget.classList.toggle('on', boost); send(boost ? 'keydown' : 'keyup', 'SH'); });
      el.querySelector('[data-tap="X"]').addEventListener('click', () => { send('keydown', 'X'); setTimeout(() => send('keyup', 'X'), 60); });
      el.querySelector('[data-close]').addEventListener('click', () => show(false));
    }
    function show(v) { if (!el) build(); shown = v; el.classList.toggle('sp-on', v);
      if (!v && boost) { boost = false; send('keyup', 'SH'); el.querySelector('[data-t="SH"]').classList.remove('on'); } }
    return { show, toggleAuto: () => show(!shown), get shown() { return shown; } };
  })();
  window.gevSubPad = subPad;

  setInterval(() => proxies.forEach(({ btn, orb }) => orb.classList.toggle('is-active', isOn(btn))), 1000);

  // ---------------------------------------------------------------- drag
  let drag = null, moved = false;
  fab.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { fab.setPointerCapture(e.pointerId); } catch {}
    drag = { sx: e.clientX, sy: e.clientY, x0: pos.x, y0: pos.y, id: e.pointerId, t: Date.now() };
    moved = false;
    root.style.transition = 'none';
    fab.classList.add('is-grabbing');
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!moved && Math.hypot(dx, dy) > MOVE_PX) { moved = true; if (open) setOpen(false); }
    if (moved) { pos.x = drag.x0 + dx; pos.y = drag.y0 + dy; apply(); }
  });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    try { fab.releasePointerCapture(e.pointerId); } catch {}
    fab.classList.remove('is-grabbing');
    if (!moved && Date.now() - drag.t < TAP_MS) {
      if (stack.length) undock(); else setOpen(!open);
    } else if (moved) {
      pos.x = (pos.x + SIZE / 2 < innerWidth / 2) ? EDGE : innerWidth - SIZE - EDGE;
      root.style.transition = 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
      apply(); save();
      setTimeout(() => { root.style.transition = 'none'; }, 300);
    }
    drag = null;
  }
  fab.addEventListener('pointerup', end);
  fab.addEventListener('pointercancel', end);

  document.addEventListener('pointerdown', (e) => {
    if (!open || root.contains(e.target) || col.contains(e.target)) return;
    setOpen(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (stack.length > 1) { popOne(true); render(); } else if (stack.length) undock(); else if (open) setOpen(false);
  });
  document.getElementById('sat-fab')?.addEventListener('pointerup', () => { if (open) setOpen(false); if (stack.length) undock(); });
  addEventListener('resize', apply);
  addEventListener('orientationchange', () => setTimeout(apply, 250));

  // ---------------------------------------------------------------- boot
  let tries = 0;
  (function boot() {
    frame = findRail();
    if (frame) {
      const n = buildFromRail();      // read icons while the rail is still laid out
      hideEl(frame);
      // keep it hidden even if the app re-applies styles
      new MutationObserver(() => { if (frame.style.getPropertyValue('left') !== '-10000px') hideEl(frame); })
        .observe(frame, { attributes: true, attributeFilter: ['style'] });
      let sideTries = 0;
      (function sideBoot() {
        adoptSidePanels();
        adoptOceanButtons();
        if (SIDE_PANELS.some(s => !s.done) && ++sideTries < 10) setTimeout(sideBoot, 600);
      })();
      apply();
      console.info('[Gids Eyes View] Rail FAB v41 ready —', n, 'orbs');
      return;
    }
    if (++tries < 20) return setTimeout(boot, 500);
    root.remove(); col.remove(); sheet.remove();
    console.warn('[Gids Eyes View] Rail FAB: no left rail found. Set window.GEV_RAIL_ADOPT.rail.');
  })();

  window.gevRailFab = { open: () => setOpen(true), close: () => { setOpen(false); undock(); }, dock, undock, back: () => { popOne(true); render(); }, get rail() { return frame; } };
})();
