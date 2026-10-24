#!/usr/bin/env bash
# =============================================================================
#  Gids Eyes View - Sidebar Purge Hotfix v30.1
#  Removes the legacy left vertical icon rail on mobile.
# =============================================================================
set -euo pipefail
info() { printf '\033[34m[INFO]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ OK ]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[WARN]\033[0m %s\n' "$*"; }

MAIN_JS=""
for cand in src/main.js src/main.ts src/index.js src/app.js; do
    [ -f "$cand" ] && MAIN_JS="$cand" && break
done
[ -z "$MAIN_JS" ] && { echo "No main.js"; exit 1; }

CSS="src/ui/styles/responsive.css"
cp "$MAIN_JS" "${MAIN_JS}.purge.$(date +%s)"
[ -f "$CSS" ] && cp "$CSS" "${CSS}.purge.$(date +%s)"

# ---- 1. Append sidebar-purge IIFE to main.js --------------------------------
# Idempotent: removes any prior purge block first.
python3 - "$MAIN_JS" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text()
marker = "// === GEV SIDEBAR PURGE v30.1 ==="
i = s.find(marker)
if i >= 0:
    s = s[:i].rstrip() + "\n"
    p.write_text(s)
    print("  removed previous purge block")
PY

cat >> "$MAIN_JS" <<'JSPURGE'

// === GEV SIDEBAR PURGE v30.1 ===
// Aggressively removes the legacy left vertical icon rail on mobile.
// Runs continuously via MutationObserver so it survives panel re-renders.
(function gevSidebarPurge() {
  if (window.__gevSidebarPurged) return;
  window.__gevSidebarPurged = true;

  const LOG = (m) => console.info('[Gids Purge] ' + m);

  // Known selectors — add yours here if you find it survives.
  const SELECTORS = [
    // Generic names
    '#left-sidebar', '.left-sidebar', '#sidebar-left', '.sidebar-left',
    '#side-bar', '.side-bar', '#side-bar-left', '.side-bar-left',
    '#icon-rail', '.icon-rail', '#icon-sidebar', '.icon-sidebar',
    '#tool-rail', '.tool-rail', '#tool-bar-left', '.tool-bar-left',
    '#left-toolbar', '.left-toolbar', '#vertical-toolbar', '.vertical-toolbar',
    '#dock-left', '.dock-left', '#left-dock', '.left-dock',
    '#command-dock-left', '.command-dock-left',
    '#nav-rail', '.nav-rail', '#nav-sidebar', '.nav-sidebar',
    // Common app-specific
    '#side-aware-drawer', '.side-aware-drawer',
    '#left-panel-stack', '.left-panel-stack',
    '#mobile-left-rail', '.mobile-left-rail',
    // Catch legacy mobile leftovers
    '.mobile-icon-rail', '.mobile-icon-btn',
  ];

  function looksLikeSidebar(el) {
    // Must be a direct child of body or a top-level container
    if (!el || el === document.body) return false;
    if (el.matches('script, style, link, meta, template, html, head')) return false;

    // Skip if it contains the app's main map or an obvious map canvas
    if (el.querySelector('canvas') && el.querySelector('canvas').width > 400) return false;
    if (el.id === 'gev-tactical-core' || el.closest('#gev-tactical-core')) return false;
    if (el.id === 'bottom-sheet' || el.closest('#bottom-sheet')) return false;
    if (el.id === 'street-view-overlay' || el.closest('#street-view-overlay')) return false;

    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);

    // Must be positioned/visible
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;

    // Vertical shape: tall, narrow, hugging the left edge
    const isVertical  = r.height > 180 && r.width > 0 && r.width < 90;
    const hugsLeft    = r.left < 20;
    const isFixedLeft = (cs.position === 'fixed' || cs.position === 'absolute') && r.left < 30;

    // Or contains ≥3 vertically stacked icon-sized children
    const kids = el.querySelectorAll(':scope > button, :scope > a, :scope > [role="button"], :scope > .icon, :scope > .btn');
    const manyIcons = kids.length >= 3;

    return (isVertical && hugsLeft) || (isFixedLeft && manyIcons);
  }

  function purge() {
    let removed = 0;

    // Pass 1: known selectors
    for (const sel of SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          LOG('Removing known: ' + sel);
          el.remove();
          removed++;
        });
      } catch {}
    }

    // Pass 2: heuristic sweep — check direct children of body
    Array.from(document.body.children).forEach(el => {
      if (looksLikeSidebar(el)) {
        LOG('Removing heuristic: <' + el.tagName.toLowerCase() +
            '> id=' + (el.id || '-') + ' class=' + (el.className || '-'));
        el.remove();
        removed++;
      }
    });

    // Pass 3: one level deeper (some apps wrap the rail in a container)
    Array.from(document.body.children).forEach(parent => {
      if (parent.id === 'gev-tactical-core') return;
      if (parent.querySelector('#gev-tactical-core')) return;
      Array.from(parent.children).forEach(el => {
        if (looksLikeSidebar(el)) {
          LOG('Removing nested heuristic: <' + el.tagName.toLowerCase() + '>');
          el.remove();
          removed++;
        }
      });
    });

    if (removed > 0) LOG('Total removed this pass: ' + removed);
  }

  // Immediate purge
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purge);
  } else {
    purge();
  }

  // Continuous purge — catches late mounts, SPA re-renders, panel opens
  const mo = new MutationObserver(() => {
    // Debounce
    if (window.__gevPurgeTimer) return;
    window.__gevPurgeTimer = setTimeout(() => {
      window.__gevPurgeTimer = null;
      purge();
    }, 300);
  });
  try {
    mo.observe(document.body, { childList: true, subtree: true });
  } catch {}

  // Safety net: retry at 1s, 3s, 6s in case the app mounts late
  [1000, 3000, 6000].forEach(ms => setTimeout(purge, ms));

  LOG('Sidebar purge armed.');
})();
JSPURGE

ok "Sidebar purge IIFE appended to $MAIN_JS"

# ---- 2. Add CSS as a belt-and-suspenders hide -------------------------------
if [ -f "$CSS" ] && grep -qF '/* === GEV SIDEBAR PURGE v30.1 === */' "$CSS"; then
    ok "Sidebar-purge CSS already present in $CSS (not appended again)"
elif [ -f "$CSS" ]; then
    cat >> "$CSS" <<'CSSPURGE'

/* === GEV SIDEBAR PURGE v30.1 === */
@media (max-width: 768px) {
  /* Legacy selectors — hidden, not removed, in case JS misses them */
  #left-sidebar, .left-sidebar, #sidebar-left, .sidebar-left,
  #side-bar, .side-bar, #side-bar-left, .side-bar-left,
  #icon-rail, .icon-rail, #icon-sidebar, .icon-sidebar,
  #tool-rail, .tool-rail, #tool-bar-left, .tool-bar-left,
  #left-toolbar, .left-toolbar, #vertical-toolbar, .vertical-toolbar,
  #dock-left, .dock-left, #left-dock, .left-dock,
  #nav-rail, .nav-rail, #nav-sidebar, .nav-sidebar,
  #side-aware-drawer, .side-aware-drawer,
  #left-panel-stack, .left-panel-stack,
  #mobile-left-rail, .mobile-left-rail,
  .mobile-icon-rail, .mobile-icon-btn, .mobile-icon-position {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    flex: 0 0 0 !important;
    position: absolute !important;
    left: -9999px !important;
  }
}
CSSPURGE
    ok "Sidebar-purge CSS appended to $CSS"
else
    warn "CSS not found — JS purge will still run"
fi

echo ""
ok "Sidebar purge applied."
echo ""
echo "Next:"
echo "    ./gids-android.sh --build --install"
echo "    adb logcat -c && adb logcat | grep -iE 'Gids Purge|Removing'"
echo ""
echo "You should see lines like:"
echo "    [Gids Purge] Removing known: #icon-rail"
echo "    [Gids Purge] Removing heuristic: <div> id=left-toolbar ..."