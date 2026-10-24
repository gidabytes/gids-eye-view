#!/usr/bin/env bash
# =============================================================================
#  Gids Eyes View - Hotfix v31.1
#  Fixes: floating drawer does not open (CSS !important overrides inline style)
# =============================================================================
set -euo pipefail

info() { printf '\033[34m[INFO]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ OK ]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[WARN]\033[0m %s\n' "$*"; }

# ---- Locate main JS ---------------------------------------------------------
MAIN_JS=""
for cand in src/main.js src/main.ts src/index.js src/app.js; do
    [ -f "$cand" ] && MAIN_JS="$cand" && break
done
[ -z "$MAIN_JS" ] && { echo "No main.js found"; exit 1; }
info "Patching $MAIN_JS"

cp "$MAIN_JS" "${MAIN_JS}.hotfix.$(date +%s)"

# ---- Fix 1: Replace inline style toggle with class-based toggle ------------
python3 - "$MAIN_JS" <<'PYJS'
import pathlib, sys, re
p = pathlib.Path(sys.argv[1])
s = p.read_text()

# Fix the coreNode click handler to toggle class on container, not inline style
s = s.replace(
"""  coreNode.addEventListener('click', () => {
    if (coreContainer.classList.contains('core-closed')) {
      coreContainer.classList.remove('core-closed');
      coreContainer.classList.add('core-open');
      radialMenu.style.display = 'flex';
      if (navigator.vibrate) navigator.vibrate(20);
    } else {
      closeAll();
    }
  });""",
"""  coreNode.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    console.info('[Gids Eyes View] Core Node tapped');
    const isClosed = coreContainer.classList.contains('core-closed');
    if (isClosed) {
      coreContainer.classList.remove('core-closed');
      coreContainer.classList.add('core-open');
      radialMenu.style.setProperty('display', 'flex', 'important');
      if (navigator.vibrate) navigator.vibrate(20);
      console.info('[Gids Eyes View] Radial menu OPEN');
    } else {
      closeAll();
    }
  });""")

# Fix closeAll to use setProperty with important
s = s.replace(
"""    radialMenu.style.display = 'none';""",
"""    radialMenu.style.setProperty('display', 'none', 'important');""")

# Broaden the mobile detection - allow touch devices and narrow viewports
s = s.replace(
"""  if (!window.matchMedia('(max-width: 768px)').matches) return;""",
"""  const isNarrow = window.matchMedia('(max-width: 900px)').matches;
  const isTouch  = ('ontouchstart' in window) ||
                   (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const isNative = Boolean(window.Capacitor &&
                   ((window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
                    window.Capacitor.platform === 'android' ||
                    window.Capacitor.platform === 'ios'));
  if (!isNarrow && !isTouch && !isNative) {
    console.info('[Gids Eyes View] Tactical UI skipped (desktop viewport)');
    return;
  }
  console.info('[Gids Eyes View] Tactical UI activating (narrow=' + isNarrow +
              ' touch=' + isTouch + ' native=' + isNative + ')');""")

p.write_text(s)
print("  JS hotfix applied")
PYJS
ok "JS handler patched"

# ---- Fix 2: Ensure CSS uses class-based visibility -------------------------
CSS="src/ui/styles/responsive.css"
if [ -f "$CSS" ] && grep -qF 'v31.1 HOTFIX — ensure radial menu actually displays' "$CSS"; then
    ok "$CSS already has the v31.1 hotfix block (not appended again)"
elif [ -f "$CSS" ]; then
    cp "$CSS" "${CSS}.hotfix.$(date +%s)"
    info "Patching $CSS"

    # Append an override block at the very end so it beats any earlier rule
    cat >> "$CSS" <<'CSSCSS'

/* =========================================================================
   v31.1 HOTFIX — ensure radial menu actually displays
   ========================================================================= */
@media (max-width: 900px), (pointer: coarse) {
  #gev-tactical-core.core-closed #gev-radial-menu { display: none !important; }
  #gev-tactical-core.core-open   #gev-radial-menu { display: flex !important; }

  /* Ensure core node is above everything, including Cesium canvas */
  #gev-tactical-core {
    z-index: 2147483600 !important;
    pointer-events: auto !important;
  }
  #gev-core-node {
    pointer-events: auto !important;
    touch-action: manipulation !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  #gev-radial-menu {
    pointer-events: none !important;
  }
  #gev-radial-menu > * {
    pointer-events: auto !important;
  }

  /* Fallback in case inline styles somehow still lose */
  #gev-tactical-core.core-open .radial-cat-btn {
    transform: translateX(0) scale(1) !important;
    opacity: 1 !important;
  }
  #gev-tactical-core.core-closed .radial-cat-btn {
    transform: translateX(120%) scale(0.8) !important;
    opacity: 0 !important;
  }
}
CSSCSS
    ok "CSS hotfix appended"
else
    warn "CSS file not found at $CSS — skipping CSS patch"
fi

# ---- Verify markers ---------------------------------------------------------
info "Verifying markers..."
for marker in "Core Node tapped" "Radial menu OPEN" "core-open"; do
    if grep -q "$marker" "$MAIN_JS" "$CSS" 2>/dev/null; then
        ok "Found marker: $marker"
    else
        warn "Marker missing: $marker"
    fi
done

echo ""
ok "Hotfix applied. Now run:"
echo "    ./gids-android.sh --build --install"
echo "    ./gids-android.sh --verify"
echo ""
echo "Then watch the logcat output for:"
echo "    [Gids Eyes View] Core Node tapped"
echo "    [Gids Eyes View] Radial menu OPEN"