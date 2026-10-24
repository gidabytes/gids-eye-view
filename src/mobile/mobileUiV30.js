// =========================================================================
// Mobile UI v30.9 - floating drawer + panel modal + thumb clusters
// =========================================================================
(function initMobileUiV30() {
  if (!window.matchMedia('(max-width: 768px)').matches &&
      !window.matchMedia('(pointer: coarse)').matches) return;
  if (window.__gevUiV30) return;
  window.__gevUiV30 = true;

  try {
    __gevBootV30();
  } catch (e) {
    console.error('[Gids Eyes View] UI v30.9 failed (app continues):', e);
    window.__gevUiV30 = false;
  }
})();

function __gevBootV30() {
  const imp = 'important';

  function haptic(ms = 8) {
    try { navigator.vibrate && navigator.vibrate(ms); } catch {}
  }

  const KILL = [
    '.mobile-icon-rail','.mobile-icon-btn','.mobile-icon-position',
    '.mobile-fab','.mobile-fab-fan','.mobile-fab-item','.mobile-fab-position',
    '.mobile-panel-overlay','.mobile-drawer-expand',
    '#side-aware-drawer','#bottom-action-bar','#floating-drawer',
    '#bottom-sheet','#thumb-cluster-left','#thumb-cluster-right',
    '#street-view-overlay','#submarine-toggle','#gps-btn','#preset-btn',
    '#exploration-panel','#panel-modal',
  ].join(',');
  document.querySelectorAll(KILL).forEach(el => el.remove());
  document.querySelectorAll('.mobile-drawer-panel').forEach(el => {
    el.classList.remove('mobile-drawer-panel','is-mobile-open');
    el.removeAttribute('style');
  });

  const collected = [], seenIds = new Set();

  function containsAny(el) {
    return collected.some(({el:o}) => {
      if (!o) return false;
      return o === el || o.contains(el) || el.contains(o);
    });
  }

  function addPanel(el, meta) {
    if (!el || !(el instanceof Element)) return;
    if (el.matches('script,style,link,meta,template')) return;
    if (seenIds.has(meta.id) || containsAny(el)) return;
    seenIds.add(meta.id);
    collected.push({ el, ...meta });
  }

  function iconFor(label) {
    const L = label.toLowerCase();
    if (L.includes('layer'))   return '\u25A4';
    if (L.includes('scene'))   return '\u25C6';
    if (L.includes('display')) return '\u25D1';
    if (L.includes('cctv'))    return '\u25C9';
    if (L.includes('context')) return '\u2318';
    if (L.includes('weather')) return '\u2601';
    if (L.includes('radio'))   return '\u266B';
    if (L.includes('music'))   return '\u266B';
    if (L.includes('transit')) return '\u2263';
    if (L.includes('slider'))  return '\u2261';
    if (L.includes('imagery')) return '\u25A3';
    return '\u25AA';
  }

  const KNOWN = [
    ['data-panel','\u25A4','Layers'], ['scene-panel','\u25C6','Scenes'],
    ['display-panel','\u25D1','Display'], ['cctv-panel','\u25C9','CCTV'],
    ['context-panel','\u2318','Context'], ['param-slider-panel','\u2261','Sliders'],
    ['weather-panel','\u2601','Weather'], ['transit-panel','\u2263','Transit'],
    ['radio-panel','\u266B','Radio'], ['music-panel','\u266B','Music'],
    ['audio-panel','\u266B','Audio'], ['radio-dock','\u266B','Radio'],
  ];
  for (const [id, icon, label] of KNOWN) {
    const el = document.getElementById(id);
    if (el) addPanel(el, { icon, label, id });
  }

  const hosts = [document.getElementById('left-panel-stack'),
                 document.getElementById('right-context-rail')].filter(Boolean);
  for (const h of hosts) {
    h.querySelectorAll(':scope > [data-panel-id]').forEach(el => {
      const id = el.getAttribute('data-panel-id') || el.id || 'panel';
      const label = id.replace(/-?panel$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      addPanel(el, { icon: iconFor(label), label, id });
    });
  }
  for (const h of hosts) {
    h.querySelectorAll(':scope > *').forEach(el => {
      if (seenIds.has(el.id) || containsAny(el)) return;
      const t = el.querySelector('.panel-title');
      const raw = (t ? t.textContent.trim() : (el.id || 'Panel')).slice(0, 16);
      addPanel(el, { icon: iconFor(raw), label: raw || 'Panel', id: el.id || ('panel-' + collected.length) });
    });
  }
  if (!seenIds.has('radio-fallback')) {
    let radio = document.querySelector('[class*="radio" i]:not(script):not(style), [id*="radio" i]');
    if (radio && radio.getBoundingClientRect().width < 100) radio = null;
    if (!radio) {
      const a = document.querySelector('audio');
      if (a) { let cur=a; for (let i=0;i<4&&cur;i++){cur=cur.parentElement;if(cur&&cur.getBoundingClientRect().width>150){radio=cur;break;}} }
    }
    if (radio && !containsAny(radio)) addPanel(radio, { icon: '\u266B', label: 'Radio', id: 'radio-fallback' });
  }

  const TRIGGERS = [
    { sels: ['#provider-settings', '#power-up', '.provider-settings-trigger',
             'button[aria-label*="power" i]', '[data-action="power-up"]',
             '#keys-button', '[data-open="provider-settings"]'],
      icon: '\u26A1', label: 'Power Up' },
    { sels: ['button[aria-label*="settings" i]', '#settings-button'],
      icon: '\u2699', label: 'Settings' },
  ];
  for (const trig of TRIGGERS) {
    let btn = null;
    for (const sel of trig.sels) { btn = document.querySelector(sel); if (btn) break; }
    if (!btn) {
      for (const el of document.querySelectorAll('button, [role="button"], .dock-item, [class*="power"]')) {
        const t = (el.textContent || '').toUpperCase();
        if (t.includes('POWER UP')) { btn = el; break; }
      }
    }
    if (btn && !containsAny(btn)) {
      collected.push({ el: null, trigger: btn, icon: trig.icon, label: trig.label, id: 'trigger-' + trig.label });
    }
  }

  const explorationPanel = document.createElement('div');
  explorationPanel.id = 'exploration-panel';
  explorationPanel.className = 'app-panel';
  explorationPanel.style.display = 'none';
  explorationPanel.innerHTML = [
    '<div class="panel-header">',
    '  <span class="panel-icon">\uD83E\uDDED</span>',
    '  <h3>Exploration Modes</h3>',
    '</div>',
    '<div class="settings-group">',
    '  <div class="group-title">',
    '    <span class="group-icon">\uD83C\uDF0A</span>',
    '    <span>Submarine View</span>',
    '  </div>',
    '  <label class="setting-row">',
    '    <div class="setting-info">',
    '      <span class="setting-name">Ocean Floor Terrain</span>',
    '      <span class="setting-desc">Load high-res bathymetry data</span>',
    '    </div>',
    '    <div class="toggle-switch">',
    '      <input type="checkbox" id="toggle-bathymetry">',
    '      <span class="slider"></span>',
    '    </div>',
    '  </label>',
    '  <label class="setting-row">',
    '    <div class="setting-info">',
    '      <span class="setting-name">Water Translucency</span>',
    '      <span class="setting-desc">See through the ocean surface</span>',
    '    </div>',
    '    <div class="toggle-switch">',
    '      <input type="checkbox" id="toggle-water-alpha">',
    '      <span class="slider"></span>',
    '    </div>',
    '  </label>',
    '</div>',
    '<hr class="panel-divider">',
    '<div class="settings-group">',
    '  <div class="group-title">',
    '    <span class="group-icon">\uD83D\uDEE3\uFE0F</span>',
    '    <span>Street Level</span>',
    '  </div>',
    '  <label class="setting-row">',
    '    <div class="setting-info">',
    '      <span class="setting-name">Auto-Transition</span>',
    '      <span class="setting-desc">Switch to panoramas below 50m</span>',
    '    </div>',
    '    <div class="toggle-switch">',
    '      <input type="checkbox" id="toggle-street-view-auto" checked>',
    '      <span class="slider"></span>',
    '    </div>',
    '  </label>',
    '</div>'
  ].join('\n');
  document.body.appendChild(explorationPanel);
  addPanel(explorationPanel, { icon: '\uD83E\uDDED', label: 'Exploration', id: 'exploration-panel' });

  console.info('[Gids Eyes View] v30.9 discovered', collected.length, 'entries');

  const _viewerRef = () => window.viewer || window.cesiumViewer || window.gev?.viewer;
  const _cesiumRef = () => window.Cesium;

  window.__gevStreetViewAuto = true;
  try { if (localStorage.getItem('gev.streetViewAuto') === '0') window.__gevStreetViewAuto = false; } catch {}

  const toggleBathymetry = explorationPanel.querySelector('#toggle-bathymetry');
  const toggleWaterAlpha = explorationPanel.querySelector('#toggle-water-alpha');
  const toggleStreetAuto = explorationPanel.querySelector('#toggle-street-view-auto');
  if (!window.__gevStreetViewAuto) toggleStreetAuto.checked = false;

  toggleBathymetry.addEventListener('change', (e) => {
    const on = e.target.checked;
    console.info('[Gids Eyes View] bathymetry toggle', on ? 'ON' : 'OFF');
    try { localStorage.setItem('gev.bathymetry', on ? '1' : '0'); } catch {}
  });

  toggleWaterAlpha.addEventListener('change', (e) => {
    const viewer = _viewerRef();
    const C = _cesiumRef();
    if (!viewer || !C) { console.warn('[Gids Eyes View] no viewer for translucency'); return; }
    try {
      if (e.target.checked) {
        viewer.scene.globe.translucency.enabled = true;
        viewer.scene.globe.translucency.frontFaceAlphaByDistance = new C.NearFarScalar(400.0, 0.35, 3000.0, 1.0);
        viewer.scene.globe.translucency.backFaceAlphaByDistance  = new C.NearFarScalar(400.0, 0.7,  3000.0, 1.0);
        viewer.scene.globe.undergroundColor = C.Color.fromCssColorString('#001a2e');
        viewer.scene.globe.undergroundColorAlphaByDistance = new C.NearFarScalar(100.0, 0.9, 2000.0, 0.2);
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        console.info('[Gids Eyes View] water translucency ON');
      } else {
        viewer.scene.globe.translucency.enabled = false;
        viewer.scene.globe.undergroundColor = undefined;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        console.info('[Gids Eyes View] water translucency OFF');
      }
    } catch (err) { console.warn('[Gids Eyes View] translucency toggle failed:', err); }
  });

  toggleStreetAuto.addEventListener('change', (e) => {
    window.__gevStreetViewAuto = e.target.checked;
    try { localStorage.setItem('gev.streetViewAuto', e.target.checked ? '1' : '0'); } catch {}
    console.info('[Gids Eyes View] street view auto-transition', e.target.checked ? 'ON' : 'OFF');
  });

  let activePanel = null;
  const restoreMap = new Map();

  const panelModal = document.createElement('div');
  panelModal.id = 'panel-modal';
  panelModal.className = 'panel-modal-hidden';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'panel-modal-header';
  modalHeader.innerHTML = '<span class="panel-modal-title"></span><button class="panel-modal-close" type="button" aria-label="Close">\u2715</button>';

  const modalContent = document.createElement('div');
  modalContent.className = 'panel-modal-content';

  panelModal.appendChild(modalHeader);
  panelModal.appendChild(modalContent);
  document.body.appendChild(panelModal);

  panelModal.querySelector('.panel-modal-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeActivePanel();
  });

  function inlineStylePanel(el) {
    const S = el.style;
    ['position','top','left','right','bottom','max-width','height','max-height',
     'overflow','margin','background','backdrop-filter','-webkit-backdrop-filter',
     'border','border-radius','box-shadow','z-index','transform','visibility',
     'opacity','pointer-events'].forEach(p => S.removeProperty(p));
    S.setProperty('position','relative',imp);
    S.setProperty('width','100%',imp);
    S.setProperty('padding','8px 4px 0 4px',imp);
    S.setProperty('display','block',imp);
    S.setProperty('visibility','visible',imp);
    S.setProperty('opacity','1',imp);
    S.setProperty('pointer-events','auto',imp);
    S.setProperty('color','#e6f3ff',imp);
  }

  function revealContent(el) {
    el.querySelectorAll('.collapsed').forEach(c => c.classList.remove('collapsed'));
    el.querySelectorAll('*').forEach(c => {
      const cs = getComputedStyle(c);
      if (cs.display === 'none' && !c.matches('input[type="hidden"], script, style')) {
        c.style.setProperty('display','revert',imp);
      }
      if (cs.visibility === 'hidden') c.style.setProperty('visibility','visible',imp);
      if (cs.opacity === '0') {
        const r = c.getBoundingClientRect();
        if (r.width > 20 && r.height > 20) c.style.setProperty('opacity','1',imp);
      }
    });
  }

  function findAppToggle(panelId, label) {
    let el = document.querySelector(`[aria-controls="${panelId}"], [aria-owns="${panelId}"], [aria-controls="#${panelId}"]`);
    if (el) return el;
    for (const attr of ['data-panel-target','data-panel-toggle','data-target','data-opens']) {
      el = document.querySelector(`[${attr}="${panelId}"], [${attr}="#${panelId}"]`);
      if (el) return el;
    }
    const want = (label || '').toLowerCase();
    for (const b of document.querySelectorAll('.command-dock button, .dock button, [class*="dock"] button')) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t && (t === want || t.includes(want))) return b;
    }
    return null;
  }

  function closeActivePanel() {
    if (!activePanel) return;
    const restore = restoreMap.get(activePanel);
    if (restore) { try { restore(); } catch {} restoreMap.delete(activePanel); }
    modalContent.innerHTML = '';
    activePanel = null;
    panelModal.classList.remove('panel-modal-visible');
    panelModal.classList.add('panel-modal-hidden');
    console.info('[Gids Eyes View] panel modal closed');
  }

  function openPanel(entry) {
    if (entry.trigger) {
      try { entry.trigger.click(); console.info('[Gids Eyes View] triggered', entry.label); }
      catch (e) { console.warn('[Gids Eyes View] trigger click failed:', e); }
      return;
    }
    const panel = entry.el;
    if (!panel) return;

    closeActivePanel();
    if (!restoreMap.has(panel)) {
      const parent = panel.parentNode;
      const next = panel.nextSibling;
      restoreMap.set(panel, () => {
        if (next && next.parentNode === parent) parent.insertBefore(panel, next);
        else if (parent) parent.appendChild(panel);
      });
    }
    modalContent.innerHTML = '';
    modalContent.appendChild(panel);
    panel.style.display = 'block';
    inlineStylePanel(panel);
    activePanel = panel;

    panelModal.querySelector('.panel-modal-title').textContent = entry.label;
    panelModal.classList.remove('panel-modal-hidden');
    panelModal.classList.add('panel-modal-visible');

    const t = findAppToggle(entry.id, entry.label);
    const finish = () => { if (activePanel === panel) revealContent(panel); };
    if (t && !panel.contains(t)) {
      setTimeout(() => { if (activePanel !== panel) return; try { t.click(); } catch {}; setTimeout(finish, 150); }, 60);
    } else {
      setTimeout(finish, 140);
    }
    console.info('[Gids Eyes View] panel modal open:', entry.label);
  }

  const floatingDrawer = document.createElement('div');
  floatingDrawer.id = 'floating-drawer';
  floatingDrawer.className = 'floating-drawer';

  const fdHandle = document.createElement('div');
  fdHandle.className = 'floating-drawer-handle';
  fdHandle.textContent = '\u22EE\u22EE';
  fdHandle.setAttribute('aria-label', 'Drag drawer');
  floatingDrawer.appendChild(fdHandle);

  for (const entry of collected) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'floating-drawer-item';
    b.title = entry.label;
    b.textContent = entry.icon;
    b.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      haptic(6);
      openPanel(entry);
    });
    floatingDrawer.appendChild(b);
  }
  document.body.appendChild(floatingDrawer);

  const FD_BOTTOM_GAP = 40;
  const FD_EDGE_PAD   = 10;

  function fdCenteredX() {
    const w = floatingDrawer.offsetWidth || 56;
    return Math.max(FD_EDGE_PAD, (window.innerWidth - w) / 2);
  }
  function fdDefaultY() {
    const h = floatingDrawer.offsetHeight || 200;
    return Math.max(20, window.innerHeight - h - FD_BOTTOM_GAP);
  }
  function applyFdAt(x, y) {
    const w = floatingDrawer.offsetWidth || 56;
    const h = floatingDrawer.offsetHeight || 200;
    x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
    y = Math.max(20, Math.min(window.innerHeight - h - 20, y));
    floatingDrawer.style.left = x + 'px';
    floatingDrawer.style.top = y + 'px';
    floatingDrawer.style.right = 'auto';
    floatingDrawer.style.bottom = 'auto';
    floatingDrawer.style.transform = 'none';
  }

  applyFdAt(fdCenteredX(), fdDefaultY());

  (() => {
    const savedSide = (() => {
      try { return localStorage.getItem('gev.floatingDrawerSide') || ''; }
      catch { return ''; }
    })();
    const savedY = (() => {
      try { return parseFloat(localStorage.getItem('gev.floatingDrawerY') || '0') || 0; }
      catch { return 0; }
    })();
    if (!savedSide || !(savedY > 0)) return;
    const w = floatingDrawer.offsetWidth || 56;
    let x;
    if (savedSide === 'left')        x = FD_EDGE_PAD;
    else if (savedSide === 'right')  x = window.innerWidth - w - FD_EDGE_PAD;
    else                              x = (window.innerWidth - w) / 2;
    applyFdAt(x, savedY);
  })();

  window.addEventListener('resize', () => {
    const r = floatingDrawer.getBoundingClientRect();
    applyFdAt(r.left, r.top);
  }, { passive: true });

  window.__gevFloatingDrawer = floatingDrawer;

  let fdDrag = null;
  fdHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    haptic(6);
    try { fdHandle.setPointerCapture(e.pointerId); } catch {}
    const r = floatingDrawer.getBoundingClientRect();
    fdDrag = { px: e.clientX, py: e.clientY, fx: r.left, fy: r.top,
               id: e.pointerId, moved: false };
    floatingDrawer.style.transition = 'none';
  });

  fdHandle.addEventListener('pointermove', (e) => {
    if (!fdDrag || e.pointerId !== fdDrag.id) return;
    const dx = e.clientX - fdDrag.px;
    const dy = e.clientY - fdDrag.py;
    if (!fdDrag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) fdDrag.moved = true;
    if (!fdDrag.moved) return;
    applyFdAt(fdDrag.fx + dx, fdDrag.fy + dy);
  });

  fdHandle.addEventListener('pointerup', (e) => {
    if (!fdDrag || e.pointerId !== fdDrag.id) return;
    const { fx, fy, px, py, moved } = fdDrag;
    fdDrag = null;
    try { fdHandle.releasePointerCapture(e.pointerId); } catch {}
    floatingDrawer.style.transition = 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
    if (!moved) return;

    const w = floatingDrawer.offsetWidth || 56;
    const h = floatingDrawer.offsetHeight || 200;
    const finalX = fx + (e.clientX - px);
    const finalY = Math.max(20,
      Math.min(window.innerHeight - h - 20, fy + (e.clientY - py)));

    const third = window.innerWidth / 3;
    let snap, snapX;
    if (finalX + w / 2 < third) {
      snap = 'left';  snapX = FD_EDGE_PAD;
    } else if (finalX + w / 2 > window.innerWidth - third) {
      snap = 'right'; snapX = window.innerWidth - w - FD_EDGE_PAD;
    } else {
      snap = 'center'; snapX = (window.innerWidth - w) / 2;
    }

    applyFdAt(snapX, finalY);
    try { localStorage.setItem('gev.floatingDrawerSide', snap); } catch {}
    try { localStorage.setItem('gev.floatingDrawerY', String(finalY)); } catch {}
  });

  fdHandle.addEventListener('pointercancel', () => {
    fdDrag = null;
    floatingDrawer.style.transition = 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
  });

  console.info('[Gids Eyes View] floating drawer ready with',
               collected.length, 'entries');

  const clusterL = document.createElement('div');
  clusterL.id = 'thumb-cluster-left';
  clusterL.className = 'thumb-cluster';
  const tools = [
    { id: 'measure-btn', icon: '\uD83D\uDCCF', label: 'Measure' },
    { id: 'draw-btn',    icon: '\u270F\uFE0F', label: 'Draw' },
    { id: 'layers-btn',  icon: '\uD83D\uDDFA\uFE0F', label: 'Layers' },
  ];
  for (const tool of tools) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'thumb-btn'; b.id = tool.id;
    b.title = tool.label; b.textContent = tool.icon;
    b.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      haptic(6);
      const target = document.querySelector(
        `#${tool.id.replace('-btn','')}-button, .${tool.id}, [data-action="${tool.id.replace('-btn','')}"]`
      );
      if (target) { try { target.click(); return; } catch {} }
      const entry = collected.find(c => c.label.toLowerCase().includes(tool.label.toLowerCase()));
      if (entry) openPanel(entry);
    });
    clusterL.appendChild(b);
  }
  document.body.appendChild(clusterL);

  const clusterR = document.createElement('div');
  clusterR.id = 'thumb-cluster-right';
  clusterR.className = 'thumb-cluster';
  const viewBtns = [
    { id: 'compass-btn',  icon: '\uD83E\uDDED', label: 'Compass / North' },
    { id: 'toggle-2d3d',  icon: '\uD83C\uDF10', label: '2D / 3D' },
    { id: 'zoom-in-btn',  icon: '\u2795', label: 'Zoom in' },
    { id: 'zoom-out-btn', icon: '\u2796', label: 'Zoom out' },
  ];
  for (const vb of viewBtns) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'thumb-btn'; b.id = vb.id;
    b.title = vb.label; b.textContent = vb.icon;
    b.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      haptic(6);
      const app = _viewerRef();
      if (!app) { console.info('[Gids Eyes View] no viewer for', vb.label); return; }
      try {
        if (vb.id === 'compass-btn') {
          app.camera.flyTo({ destination: app.camera.position, orientation: { heading: 0, pitch: app.camera.pitch, roll: 0 }, duration: 0.6 });
        } else if (vb.id === 'zoom-in-btn') {
          app.camera.zoomIn(app.camera.positionCartographic.height * 0.4);
        } else if (vb.id === 'zoom-out-btn') {
          app.camera.zoomOut(app.camera.positionCartographic.height * 0.6);
        } else if (vb.id === 'toggle-2d3d') {
          const C = _cesiumRef();
          if (C) {
            const m = app.scene.mode;
            if (m === C.SceneMode.SCENE3D) app.scene.morphTo2D(0.6);
            else app.scene.morphTo3D(0.6);
          }
        }
      } catch (err) { console.warn('[Gids Eyes View] viewer control failed:', err); }
    });
    clusterR.appendChild(b);
  }
  document.body.appendChild(clusterR);

  const subBtn = document.createElement('button');
  subBtn.type = 'button'; subBtn.className = 'thumb-btn'; subBtn.id = 'submarine-toggle';
  subBtn.title = 'Submarine view'; subBtn.textContent = '\uD83C\uDF0A';
  subBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    haptic(6);
    const entry = collected.find(c => c.id === 'exploration-panel');
    if (entry) openPanel(entry);
  });
  clusterL.appendChild(subBtn);

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
  svStatus.textContent = 'Looking for a nearby panorama...';
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

  async function maybeShowStreetView(viewer, lat, lon, heading) {
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
        console.warn('[Gids Eyes View] MapillaryJS unavailable, static image:', err?.message || err);
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

  (async () => {
    try {
      const mod = await import('@capacitor/app');
      const CapApp = mod.App || mod.default;
      if (!CapApp || !CapApp.addListener) return;
      CapApp.addListener('backButton', () => {
        if (activePanel) { closeActivePanel(); return; }
        if (svActive) { hideStreetView(); return; }
        CapApp.exitApp();
      });
      console.info('[Gids Eyes View] back button handler attached');
    } catch (e) {
      console.info('[Gids Eyes View] @capacitor/app not present — using system back');
    }
  })();

  console.info('[Gids Eyes View] Mobile UI v30.9 ready');
}
