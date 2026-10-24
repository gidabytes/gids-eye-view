#!/usr/bin/env bash
# =============================================================================
#  Gids Eyes View - Android build pipeline (v52)
#  Copyright (c) 2026 Gidabytes - MIT License
#
#  v52 over v51:
#    * The GEV mic is bound to Google speech recognition, hidden in the
#      background: the speech plugin's recognizer is created on Google's
#      RecognitionService (GevRecognizer.java patched into the plugin), even
#      when the phone's default voice input is another vendor's engine.
#    * FIX voice errors: one owner of the recognizer (the 1.2 s "safety net"
#      second capture caused "already running"/busy errors, and re-opened the
#      mic after you tapped it off); busy/client errors reset + retry quietly;
#      no-connection retries on-device; no-match goes idle without the error
#      tray. The Google popup dialog is no longer used.
#    * FASTER voice-to-fly: end of speech detected from Google's partials
#      (0.7 s after a complete command), text handed over without waiting for
#      the recognizer to shut down, destination geocoded WHILE you speak and
#      flown to by coordinates (no slow geocoder chain), replies spoken
#      without blocking the flight. Timings: adb logcat | grep GEV-Voice
#
#  v51 over v50:
#    * FIX desktop "Expected width to be greater than 0 / Rendering has
#      stopped": zero-size render guard (src/app/renderGuard.js) wired into
#      viewer.js; applied by --build, --geo and --render-guard.
#
#  v50 over v49:
#    * GEO INTEL module (src/geo, docs/GEO.md) embedded: search, reverse,
#      nearby POIs, routing + alternatives + steps, snap, matrix, optimize,
#      elevation profile, weather, air quality, pollen, solar, time zone,
#      Panoramax / OpenAerialMap imagery. --geo / --geo-remove; auto in
#      --build. Geo orb on phones, voice geo questions, foreground location.
#
#  v49 over v48:
#    * --ocean: applies gev-ocean-integration.patch (or merges
#      gids-eye-view-ocean.zip) with backups; bathymetry env; --ocean-tools runs
#      scripts/install-ocean-tools.sh. --build applies it automatically if found.
#    * Phone: Ocean + Sub orbs in the rail, submarine touch pad (W/A/S/D,
#      RISE/DIVE, FAST, CAM). Native voice uses control_ocean ("dive to 2000
#      meters", "take the sub to Challenger Deep").
#
#  v48 over v47:
#    * Plugin versions follow the installed Capacitor (8 -> text-to-speech ^8,
#      speech-recognition ^8). Plugins loaded via registerPlugin so a missing
#      package can no longer fail `vite build`.
#
#  v47 over v46:
#    * Panel sheet full-screen on phones (more room), text scaled to 86%,
#      touch-drag scrolling fallback (sheet + in-app panels).
#    * Rail orbs 32px with smaller labels.
#    * Voice: live caption of what was heard; silent-recognizer retry with the
#      system speech dialog; safety net on #gev-voice-button -> search.
#
#  v46 over v45:
#    * Floating orbs at 75% size (sat 48px, rail 42px, items 39px).
#    * VOICE ROOT CAUSE: stock voice streams audio to Gemini via the Node
#      server (/api/realtime/gemini-session) which the APK lacks. APK now
#      uses on-device STT + the app's own actions (fly_to_location, layers).
#      /api/geocode routed to Nominatim inside the APK.
#    * Layers opens at MOVEMENT (Satellites, Live Flights) every time.
#
#  v45 over v44:
#    * Orbs mapped to the REAL panels (ids from the God's Eye View source):
#      Layers #data-panel, CCTV #cctv-panel, Display #pp-toggles, Context
#      #global-context-panel, Scenes, Radio, Weather, Imagery. Panels are
#      expanded via their own toggles and fully un-clipped in the sheet.
#    * Root cause of cut-off tops fixed: #left-panel-stack bottom-pinned with
#      no top bound on phones. Voice search targets #location-search.
#
#  v44 over v43:
#    * Layers sheet: top options reachable (centred/reversed flex + negative
#      offsets neutralised; sheet clamped to the visual viewport).
#    * --voice-setup: installs/configures Speech Recognition & Synthesis +
#      Google Digital assistant on the phone; native TTS spoken replies.
#
#  v43 over v42:
#    * VOICE FIX: transcripts were discarded (stop() returns no matches when
#      partialResults=true). Now kept from partial events and finalized on
#      silence. Web Speech API shimmed to the native plugin (WebView never
#      returns results). Final text auto-typed into search + submitted.
#      Manifest gets <queries> RecognitionService for Android 11+.
#
#  v42 over v41:
#    * Docked panels fit all options: nested scrollers/fixed heights flattened
#      so the sheet scrolls as one; long rows wrap; sheet uses full width.
#
#  v41 over v40:
#    * App modal layers (blur backdrop, floating header/close) hidden when a
#      panel is docked — no more overlap. Sheet + FAB on top (max z-index).
#    * Sub-menus/sub-panels opened inside a docked panel stack into the sheet
#      with a back button. Each orb shows its label.
#
#  v40 over v39:
#    * Whole rail (incl. outlined frame) hidden via inline !important — app CSS
#      can no longer override it. Icons rebuilt as orbs in one column on the FAB.
#    * Tapping an orb auto-collapses the column.
#
#  v39 over v38:
#    * Rail column centred on the orb; rail outline removed.
#    * Panels opened from the rail (Layers, CCTV...) dock into a glass sheet
#      anchored to the orb; left offset + double outline removed.
#    * Right-side DISPLAY / CCTV / CONTEXT panels moved into the rail as orbs.
#
#  v38 over v37:
#    * Rail FAB is draggable with magnetic edge snap (position persisted).
#    * Rail drawer follows the orb (opens above/below) and every rail icon is
#      restyled as a glowing orb.
#    * Top toolbar RESTORED — v36 toolbar merge removed (still stripped on re-run).
#
#  v37 over v36:
#    * Top-left icon rail collapsed into one glowing button at the bottom-left;
#      tap opens the rail as a pop-up drawer. Override via window.GEV_RAIL_ADOPT.
#
#  v36 over v35:
#    * Top-right map toolbar + its sub-menus/sub-panels merged into the
#      Satellite FAB drawer ("Map Tools" tab). Sub-panels dock inside the
#      drawer with a back button. Override via window.GEV_SAT_ADOPT.
#
#  v35 over v34:
#    * Mobile UI: Satellite FAB (draggable, edge-snapping orb + glass drawer)
#      replaces the v34 docked sheet. Breakpoint 768px (JS + CSS agree).
#    * Layer taps dispatch cancelable `gev:layer-request` {id, active};
#      app can sync back with `gev:layer-state`. Falls back to gevPanels/ids.
#    * API keys removed from this script. Loaded from gids-keys.env
#      (or $GEV_KEYS_FILE / environment). --encode-keys now targets that file.
#
#  Modes:
#    --setup --init --tune-system --keys --force-keys --encode-keys --voice
#    --mobile-ui --icon --layers --doctor --build --release --install
#    --verify --devices --voice-setup --ocean [--ocean-tools] [--ocean-patch=P|--ocean-zip=Z]
#    --geo --geo-remove --render-guard --sync --clean --all --help
# =============================================================================

set -uo pipefail

APP_NAME="Gids Eyes View"
APP_ID="com.gidabytes.gidseyeview"
WEB_DIR="dist"
CAP_VERSION_MAJOR="6"
SPEECH_PLUGIN="@capgo/capacitor-speech-recognition"
TTS_PLUGIN="@capacitor-community/text-to-speech"               # version picked from installed Capacitor
GOOGLE_TTS_PKG="com.google.android.tts"                         # Speech Recognition & Synthesis
GOOGLE_APP_PKG="com.google.android.googlequicksearchbox"        # Google app (Digital assistant)
MAPILLARY_VIEWER_PKG="mapillary-js"
UI_VERSION="v52"

VOICE_PROVIDER_DEFAULT="${VOICE_PROVIDER_DEFAULT:-native}"
ENABLE_GEMINI_VOICE_DEFAULT="${ENABLE_GEMINI_VOICE_DEFAULT:-false}"
PRESERVE_REALTIME_SESSION="${PRESERVE_REALTIME_SESSION:-0}"   # 0 = native voice in APK (stock needs a server)

# =============================================================================
#  API KEYS — loaded from an external file, never hardcoded here.
#  File format (one per line):  KEY_GEMINI_API_KEY="..."   (or b64|<base64>)
#  Keep the file out of git. Anything shipped in an APK is extractable —
#  route private credentials (e.g. OpenSky secret) through a backend.
# =============================================================================
KEYS_FILE="${GEV_KEYS_FILE:-./gids-keys.env}"
KEY_NAMES=(
    KEY_CESIUM_ION_TOKEN KEY_GEMINI_API_KEY KEY_GROQ_API_KEY KEY_AISSTREAM_API_KEY
    KEY_FIRMS_MAP_KEY KEY_TOMTOM_API_KEY KEY_OPENSKY_CLIENT_ID KEY_OPENSKY_CLIENT_SECRET
    KEY_MAPILLARY_ACCESS_TOKEN KEY_GOOGLE_MAPS_API_KEY KEY_GOOGLE_MAPS_MAP_ID
)
if [ -f "$KEYS_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$KEYS_FILE"; set +a
fi
for _k in "${KEY_NAMES[@]}"; do : "${!_k:=}"; done
unset _k

# =============================================================================
#  OUTPUT
# =============================================================================
if [ -t 1 ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'
    RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
    BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi
info() { printf '%s[INFO]%s %s\n' "$BLUE"   "$RESET" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n' "$GREEN"  "$RESET" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail() { printf '%s[FAIL]%s %s\n' "$RED"    "$RESET" "$*"; }
die()  { fail "$*"; exit 1; }

unveil() {
    local v="$1"
    case "$v" in
        b64\|*)
            local enc="${v#b64|}"
            printf '%s' "$enc" | base64 -d 2>/dev/null || \
            printf '%s' "$enc" | base64 -D 2>/dev/null || \
            printf '%s' "$v"
            ;;
        *) printf '%s' "$v" ;;
    esac
}

UNAME_OUT="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME_OUT" in
    Linux*)               DETECTED_OS="Linux"   ;;
    Darwin*)              DETECTED_OS="macOS"   ;;
    MINGW*|MSYS*|CYGWIN*) DETECTED_OS="Windows" ;;
    *)                    DETECTED_OS="Unknown" ;;
esac

show_help() { sed -n '3,4p' "$0"; awk '/^#  Modes:/{f=1} f&&/^# ====/{exit} f' "$0"; exit 0; }

# ocean integration inputs (see do_ocean)
OCEAN_PATCH_NAME="gev-ocean-integration.patch"
OCEAN_ZIP_NAME="gids-eye-view-ocean.zip"
OCEAN_PATCH_ARG="${GEV_OCEAN_PATCH:-}"
OCEAN_ZIP_ARG="${GEV_OCEAN_ZIP:-}"
OCEAN_TOOLS=0
BATHYMETRY_ASSET_ID="2426648"
MODE=""
FORCE_KEYS=0
for arg in "$@"; do
    case "$arg" in
        --setup)        MODE="setup" ;;
        --init)         MODE="init" ;;
        --tune-system)  MODE="tune-system" ;;
        --keys)         MODE="keys" ;;
        --force-keys)   MODE="keys"; FORCE_KEYS=1 ;;
        --encode-keys)  MODE="encode-keys" ;;
        --voice)        MODE="voice" ;;
        --mobile-ui)    MODE="mobile-ui" ;;
        --icon)         MODE="icon" ;;
        --layers)       MODE="layers" ;;
        --doctor)       MODE="doctor" ;;
        --build)        MODE="build" ;;
        --release)      MODE="release" ;;
        --install)      MODE="install" ;;
        --verify)       MODE="verify" ;;
        --devices)      MODE="devices" ;;
        --voice-setup)  MODE="voice-setup" ;;
        --ocean)        MODE="ocean" ;;
        --geo)          MODE="geo" ;;
        --geo-remove)   MODE="geo-remove" ;;
        --render-guard) MODE="render-guard" ;;
        --ocean-tools)  MODE="ocean"; OCEAN_TOOLS=1 ;;
        --ocean-patch=*) OCEAN_PATCH_ARG="${arg#--ocean-patch=}"; [ -z "$MODE" ] && MODE="ocean" ;;
        --ocean-zip=*)   OCEAN_ZIP_ARG="${arg#--ocean-zip=}";   [ -z "$MODE" ] && MODE="ocean" ;;
        --sync)         MODE="sync" ;;
        --clean)        MODE="clean" ;;
        --all)          MODE="all" ;;
        --help|-h)      show_help ;;
        *) printf 'Unknown flag: %s\n' "$arg" >&2; exit 2 ;;
    esac
done

[ -z "$MODE" ] && { printf '%sNo mode specified.%s\n\n' "$YELLOW" "$RESET" >&2; show_help; }

# =============================================================================
#  PRE-FLIGHT  (system tuning is opt-in — see --tune-system)
# =============================================================================
do_tune_system() {
    [ "$DETECTED_OS" = "Linux" ] || { ok "Not Linux — nothing to tune."; return 0; }

    info "Raising inotify limits (opt-in) ..."
    if [ -f /proc/sys/fs/inotify/max_user_instances ]; then
        local cur; cur="$(cat /proc/sys/fs/inotify/max_user_instances 2>/dev/null || echo 0)"
        if (( cur < 8192 )); then
            sudo sysctl -w fs.inotify.max_user_instances=8192 >/dev/null 2>&1 || true
            sudo sysctl -w fs.inotify.max_user_watches=524288 >/dev/null 2>&1 || true
            sudo sysctl -w fs.inotify.max_queued_events=16384 >/dev/null 2>&1 || true
            if ! grep -q '^fs.inotify.max_user_instances' /etc/sysctl.conf 2>/dev/null; then
                echo 'fs.inotify.max_user_instances=8192' | sudo tee -a /etc/sysctl.conf >/dev/null 2>&1 || true
                echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf >/dev/null 2>&1 || true
                echo 'fs.inotify.max_queued_events=16384' | sudo tee -a /etc/sysctl.conf >/dev/null 2>&1 || true
            fi
            ok "inotify limits raised."
        else
            ok "inotify already >= 8192."
        fi
    fi

    info "Raising ulimit -n ..."
    ulimit -n 65536 2>/dev/null && ok "ulimit -n = $(ulimit -n)" || warn "Could not raise ulimit -n."

    local rc
    for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
        [ -f "$rc" ] || continue
        if ! grep -q '^ulimit -n 65536' "$rc" 2>/dev/null; then
            printf '\n# Added by gids-android.sh — prevents EMFILE\nulimit -n 65536\n' >> "$rc"
            ok "Appended ulimit to $rc"
        else
            ok "$rc already tuned."
        fi
    done
}

# =============================================================================
#  ENV HELPERS  (Python-based writer — safe for |, &, \, spaces)
# =============================================================================
write_env_key() {
    local key="$1" raw="$2"
    local val; val="$(unveil "$raw")"
    python3 - "$key" "$val" <<'PY'
import pathlib, re, sys
key, val = sys.argv[1], sys.argv[2]
p = pathlib.Path('.env')
lines = p.read_text().splitlines() if p.exists() else []
pat = re.compile(r'^' + re.escape(key) + r'=')
found = False
for i, line in enumerate(lines):
    if pat.match(line):
        lines[i] = f'{key}={val}'
        found = True
        break
if not found:
    lines.append(f'{key}={val}')
p.write_text('\n'.join(lines) + ('\n' if lines else ''))
PY
}
write_env_key_if_unset() {
    local key="$1" raw="$2"
    [ -f .env ] || : > .env
    if grep -qE "^${key}=.+" .env 2>/dev/null; then return 0; fi
    write_env_key "$key" "$raw"
}
env_has_key() {
    [ -f .env ] || return 1
    grep -qE "^${1}=.+" .env 2>/dev/null
}

write_keys_template() {
    [ -f "$KEYS_FILE" ] && return 0
    {
        echo '# Gids Eyes View — API keys (DO NOT COMMIT)'
        echo '# Values may be plain or b64|<base64>. Run --encode-keys to obfuscate.'
        for k in "${KEY_NAMES[@]}"; do printf '%s=""\n' "$k"; done
    } > "$KEYS_FILE"
    chmod 600 "$KEYS_FILE" 2>/dev/null || true
    warn "Created empty $KEYS_FILE — fill in your (rotated) keys and re-run."
}

do_keys() {
    info "Writing .env (preserve=$((1 - FORCE_KEYS))) from $KEYS_FILE ..."
    write_keys_template
    local missing=0 k
    for k in "${KEY_NAMES[@]}"; do [ -n "${!k}" ] || missing=$((missing+1)); done
    (( missing > 0 )) && warn "$missing key(s) empty in $KEYS_FILE — those layers will be disabled."

    [ -f .env ] && [ ! -f .env.example ] && cp .env .env.example || true

    if [ ! -f .env ] || ! grep -q '^#  Gids Eyes View - API keys' .env 2>/dev/null; then
        {
            printf '\n# ============================================================\n'
            printf '#  Gids Eyes View - API keys\n'
            printf '#  Generated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            printf '# ============================================================\n'
        } >> .env
    fi

    kw() {
        local k="$1" v="$2"
        [ -z "$v" ] && return 0
        if [ "$FORCE_KEYS" = "1" ]; then write_env_key "$k" "$v"; return; fi
        write_env_key_if_unset "$k" "$v"
    }

    kw "CESIUM_ION_TOKEN"               "$KEY_CESIUM_ION_TOKEN"
    kw "GEMINI_API_KEY"                 "$KEY_GEMINI_API_KEY"
    kw "GROQ_API_KEY"                   "$KEY_GROQ_API_KEY"
    kw "AISSTREAM_API_KEY"              "$KEY_AISSTREAM_API_KEY"
    kw "FIRMS_MAP_KEY"                  "$KEY_FIRMS_MAP_KEY"
    kw "TOMTOM_API_KEY"                 "$KEY_TOMTOM_API_KEY"
    kw "OPENSKY_CLIENT_ID"              "$KEY_OPENSKY_CLIENT_ID"
    kw "OPENSKY_CLIENT_SECRET"          "$KEY_OPENSKY_CLIENT_SECRET"
    kw "MAPILLARY_ACCESS_TOKEN"         "$KEY_MAPILLARY_ACCESS_TOKEN"
    kw "GOOGLE_MAPS_API_KEY"            "$KEY_GOOGLE_MAPS_API_KEY"
    kw "GOOGLE_MAPS_MAP_ID"             "$KEY_GOOGLE_MAPS_MAP_ID"
    kw "CESIUM_BATHYMETRY_ENABLED"      "true"
    kw "CESIUM_BATHYMETRY_ASSET_ID"     "2426648"
    kw "GEBCO_WMS_ENABLED"              "true"
    kw "GEBCO_WMS_URL"                  "https://wms.gebco.net/mapserv"
    kw "GEBCO_WMS_LAYER"                "GEBCO_Latest"
    kw "GOOGLE_3D_TILES_API_ROOT"       "https://tile.googleapis.com/v1/3dtiles/root.json"
    kw "CESIUM_GOOGLE_3D_TILES_ENABLED" "true"
    kw "MAPILLARY_VIEWER_ENABLED"       "true"
    kw "PANORAMAX_VIEWER_ENABLED"       "true"
    kw "CHOKIDAR_USEPOLLING"            "true"
    kw "VOICE_PROVIDER"                 "$VOICE_PROVIDER_DEFAULT"
    kw "ENABLE_GEMINI_VOICE"            "$ENABLE_GEMINI_VOICE_DEFAULT"
    kw "VITE_VOICE_PROVIDER"            "$VOICE_PROVIDER_DEFAULT"
    kw "VITE_ENABLE_GEMINI_VOICE"       "$ENABLE_GEMINI_VOICE_DEFAULT"

    # VITE_* mirrors (regenerated every run)
    mirror() { local name="$1" src="$2"; [ -n "$src" ] && write_env_key "$name" "$(unveil "$src")"; }
    mirror "VITE_CESIUM_ION_TOKEN"      "$KEY_CESIUM_ION_TOKEN"
    mirror "VITE_GEMINI_API_KEY"        "$KEY_GEMINI_API_KEY"
    mirror "VITE_GROQ_API_KEY"          "$KEY_GROQ_API_KEY"
    mirror "VITE_AISSTREAM_API_KEY"     "$KEY_AISSTREAM_API_KEY"
    mirror "VITE_FIRMS_MAP_KEY"         "$KEY_FIRMS_MAP_KEY"
    mirror "VITE_TOMTOM_API_KEY"        "$KEY_TOMTOM_API_KEY"
    mirror "VITE_OPENSKY_CLIENT_ID"     "$KEY_OPENSKY_CLIENT_ID"
    mirror "VITE_OPENSKY_CLIENT_SECRET" "$KEY_OPENSKY_CLIENT_SECRET"
    mirror "VITE_MAPILLARY_TOKEN"       "$KEY_MAPILLARY_ACCESS_TOKEN"
    mirror "VITE_GOOGLE_MAPS_API_KEY"   "$KEY_GOOGLE_MAPS_API_KEY"
    mirror "VITE_GOOGLE_MAPS_MAP_ID"    "$KEY_GOOGLE_MAPS_MAP_ID"
    write_env_key "VITE_API_PROXY" "embedded"

    if [ -d .git ]; then
        touch .gitignore
        # .env.example is the empty, committed template, so it is not ignored.
        for f in .env .env.bak.\* "$(basename "$KEYS_FILE")"; do
            grep -qxF "$f" .gitignore 2>/dev/null || echo "$f" >> .gitignore
        done
    fi
    chmod 600 .env 2>/dev/null || true
    ok ".env written (chmod 600)"
}

do_encode_keys() {
    write_keys_template
    info "Encoding plaintext KEY_* values in $KEYS_FILE ..."
    python3 - "$KEYS_FILE" <<'PY'
import pathlib, re, base64, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
pat = re.compile(r'^(KEY_[A-Z0-9_]+)="((?:[^"\\]|\\.)*)"$', re.M)
enc = 0; already = 0
def repl(m):
    global enc, already
    name, val = m.group(1), m.group(2)
    if val.startswith('b64|'): already += 1; return m.group(0)
    if not val: return m.group(0)
    enc += 1
    return f'{name}="b64|{base64.b64encode(val.encode()).decode()}"'
s2 = pat.sub(repl, s)
if s2 != s: p.write_text(s2)
print(f"Encoded: {enc}  Already: {already}")
PY
    ok "Encode pass complete (obfuscation only — not encryption)."
}

# =============================================================================
#  APP ICON
# =============================================================================
do_icon() {
    info "Generating 'Gid's Eye' launcher icon ..."
    [ -d android ] || die "android/ missing — run --init first."
    command -v python3 >/dev/null 2>&1 || { warn "python3 not found — skipping."; return 0; }
    python3 -c 'import PIL' 2>/dev/null || {
        info "Installing Pillow ..."
        python3 -m pip install --user --quiet Pillow 2>/dev/null || \
            python3 -m pip install --break-system-packages --user --quiet Pillow 2>/dev/null || true
    }
    python3 -c 'import PIL' 2>/dev/null || { warn "Pillow unavailable — skipping."; return 0; }

    local gen; gen="$(mktemp /tmp/gev-icon-gen.XXXXXX.py)"
    cat > "$gen" <<'PYICON'
import sys, os, math
from PIL import Image, ImageDraw, ImageFilter
def radial(size, inner, outer):
    img = Image.new('RGBA', (size, size), (0,0,0,0)); px = img.load()
    cx, cy = size/2, size/2; max_r = size/2
    for y in range(size):
        for x in range(size):
            d = min(1.0, math.hypot(x-cx, y-cy) / max_r)
            px[x,y] = tuple(int(a*(1-d) + b*d) for a,b in zip(inner, outer))
    return img
def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    cx, cy = size/2, size/2; r_outer = size * 0.46
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    for i in range(10, 0, -1):
        alpha = int(40 * (1 - i/10))
        gd.ellipse([cx-r_outer-i*2, cy-r_outer-i*2, cx+r_outer+i*2, cy+r_outer+i*2],
                   fill=(80, 190, 255, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(size/40)); img.alpha_composite(glow)
    r_main = size * 0.42
    body = radial(size, (20, 55, 100, 255), (5, 15, 35, 255))
    mask = Image.new('L', (size, size), 0); ImageDraw.Draw(mask).ellipse(
        [cx-r_main, cy-r_main, cx+r_main, cy+r_main], fill=255)
    img.paste(body, (0, 0), mask)
    rim = max(2, size // 60)
    d.ellipse([cx-r_main, cy-r_main, cx+r_main, cy+r_main],
              outline=(120, 210, 255, 255), width=rim)
    r_ring = r_main * 0.88
    d.ellipse([cx-r_ring, cy-r_ring, cx+r_ring, cy+r_ring],
              outline=(70, 150, 220, 130), width=max(1, size // 140))
    eye_w = r_main * 1.35; eye_h = r_main * 0.75; pts = []
    for i in range(81):
        t = i / 80 * 2 * math.pi
        x = eye_w/2 * math.cos(t)
        taper = 0.55 + 0.45 * (1 - abs(math.cos(t)))
        y = eye_h/2 * math.sin(t) * taper
        pts.append((cx + x, cy + y))
    d.polygon(pts, fill=(245, 250, 255, 255), outline=(80, 140, 200, 255))
    iris_r = r_main * 0.34
    iris = radial(int(iris_r*2) + 4, (0, 200, 255, 255), (20, 90, 160, 255))
    m2 = Image.new('L', iris.size, 0); ImageDraw.Draw(m2).ellipse(
        [0, 0, iris.size[0]-1, iris.size[1]-1], fill=255)
    img.paste(iris, (int(cx - iris.size[0]/2), int(cy - iris.size[1]/2)), m2)
    pupil_r = iris_r * 0.48
    d.ellipse([cx-pupil_r, cy-pupil_r, cx+pupil_r, cy+pupil_r], fill=(3, 8, 20, 255))
    hl_r = iris_r * 0.22
    d.ellipse([cx-iris_r*0.4-hl_r, cy-iris_r*0.4-hl_r, cx-iris_r*0.4+hl_r, cy-iris_r*0.4+hl_r],
              fill=(255, 255, 255, 230))
    hl_r2 = iris_r * 0.10
    d.ellipse([cx-iris_r*0.15-hl_r2, cy-iris_r*0.15-hl_r2, cx-iris_r*0.15+hl_r2, cy-iris_r*0.15+hl_r2],
              fill=(255, 255, 255, 180))
    return img
def main(out_dir):
    sizes = {'mipmap-mdpi':48,'mipmap-hdpi':72,'mipmap-xhdpi':96,'mipmap-xxhdpi':144,'mipmap-xxxhdpi':192}
    base = make_icon(1024)
    for folder, size in sizes.items():
        d = os.path.join(out_dir, folder); os.makedirs(d, exist_ok=True)
        for n in ('ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png'):
            base.resize((size, size), Image.LANCZOS).save(os.path.join(d, n))
        Image.new('RGBA', (size, size), (10, 22, 44, 255)).save(os.path.join(d, 'ic_launcher_background.png'))
    anydpi = os.path.join(out_dir, 'mipmap-anydpi-v26'); os.makedirs(anydpi, exist_ok=True)
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(anydpi, name), 'w') as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                    '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
                    '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
                    '</adaptive-icon>\n')
    print("Icon written to", out_dir)
if __name__ == '__main__':
    main(sys.argv[1])
PYICON
    local res_dir="android/app/src/main/res"
    mkdir -p "$res_dir"
    python3 "$gen" "$res_dir" || warn "Icon generation failed."
    rm -f "$gen"
    [ -f "$res_dir/mipmap-xxxhdpi/ic_launcher.png" ] && ok "Launcher icon installed." || warn "Icon missing."
}

# =============================================================================
#  PREREQS
# =============================================================================
require_node() {
    command -v node >/dev/null 2>&1 || die "Node.js not found."
    local major; major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    (( major >= 18 )) || die "Node.js $(node -v) too old."
    ok "Node.js $(node -v)"
}
require_npm() { command -v npm >/dev/null 2>&1 || die "npm not found."; ok "npm $(npm -v)"; }
require_java() {
    command -v java >/dev/null 2>&1 || { warn "Java not found."; return 1; }
    local ver; ver="$(java -version 2>&1 | head -1 | sed 's/.*version "\([^"]*\)".*/\1/')"
    ok "Java $ver"
    case "$ver" in 17*|21*) ;; *) warn "Java $ver detected. JDK 17/21 recommended." ;; esac
    return 0
}
require_android_sdk() {
    if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
        warn "ANDROID_HOME not set."; return 1
    fi
    local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT}}"
    [ -d "$sdk" ] || { warn "ANDROID_HOME=$sdk does not exist."; return 1; }
    ok "Android SDK: $sdk"; return 0
}
check_prereqs_full() {
    require_node; require_npm
    require_java || warn "Continuing without Java."
    require_android_sdk || warn "Continuing without Android SDK."
}
do_setup() {
    info "Environment check ..."
    command -v node >/dev/null 2>&1 && ok "Node $(node -v)" || warn "Node missing"
    command -v npm  >/dev/null 2>&1 && ok "npm $(npm -v)"  || warn "npm missing"
    command -v java >/dev/null 2>&1 && ok "Java present" || warn "Java missing"
    command -v adb  >/dev/null 2>&1 && ok "adb present" || warn "adb missing"
    command -v base64 >/dev/null 2>&1 && ok "base64 present" || warn "base64 missing"
    command -v python3 >/dev/null 2>&1 && ok "python3 present" || warn "python3 missing"
    python3 -c 'import PIL' 2>/dev/null && ok "Pillow present" || warn "Pillow missing"
    [ -n "${ANDROID_HOME:-}" ] && ok "ANDROID_HOME=$ANDROID_HOME" || warn "ANDROID_HOME not set"
    [ -f "$KEYS_FILE" ] && ok "Keys file: $KEYS_FILE" || warn "Keys file missing — run --keys to create template"
    info "System tuning is opt-in. Run: ./$(basename "$0") --tune-system"
}

# =============================================================================
#  CAPACITOR + ANDROID INIT
# =============================================================================
ensure_capacitor() {
    { [ -f capacitor.config.json ] || [ -f capacitor.config.ts ]; } && { ok "Capacitor configured."; return; }
    info "Installing Capacitor ..."
    npm install --save "@capacitor/core@^${CAP_VERSION_MAJOR}"
    npm install --save-dev "@capacitor/cli@^${CAP_VERSION_MAJOR}"
    npm install --save "@capacitor/android@^${CAP_VERSION_MAJOR}"
    npx cap init "$APP_NAME" "$APP_ID" --web-dir "$WEB_DIR"
    ok "Capacitor initialised."
}
ensure_android_platform() {
    [ -d android ] && { ok "Android platform present."; return; }
    info "Adding Android platform ..."
    npx cap add android
    ok "Android platform added."
}
apply_capacitor_config() {
    info "Writing capacitor.config.json ..."
    cat > capacitor.config.json <<'CFG'
{
  "appId": "com.gidabytes.gidseyeview",
  "appName": "Gids Eyes View",
  "webDir": "dist",
  "server": { "androidScheme": "https" },
  "android": {
    "allowMixedContent": false,
    "captureInput": true,
    "webContentsDebuggingEnabled": true
  }
}
CFG
    ok "capacitor.config.json written"
}
apply_android_manifest() {
    local mf="android/app/src/main/AndroidManifest.xml"
    [ -f "$mf" ] || { warn "AndroidManifest.xml not found."; return 0; }
    info "Patching AndroidManifest.xml ..."
    for perm in RECORD_AUDIO INTERNET ACCESS_NETWORK_STATE MODIFY_AUDIO_SETTINGS ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION; do
        if ! grep -q "android.permission.$perm" "$mf"; then
            sed -i.bak "s|</manifest>|    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>|" "$mf" && rm -f "$mf.bak"
            ok "Added $perm."
        fi
    done
    if ! grep -q 'android.intent.action.TTS_SERVICE' "$mf" && grep -q 'android.speech.RecognitionService' "$mf"; then
        sed -i.bak 's|<action android:name="android.speech.RecognitionService" />|<action android:name="android.speech.RecognitionService" />\n        </intent>\n        <intent>\n            <action android:name="android.intent.action.TTS_SERVICE" />|' "$mf" && rm -f "$mf.bak"
        ok "Added <queries> TTS_SERVICE."
    fi
    if ! grep -q 'android.speech.RecognitionService' "$mf"; then
        python3 - "$mf" <<'PYQ'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
q = ('    <queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n'
     '        </intent>\n        <intent>\n            <action android:name="android.intent.action.TTS_SERVICE" />\n'
     '        </intent>\n    </queries>\n')
s = s.replace('<application', q + '    <application', 1) if '<queries>' not in s else \
    s.replace('<queries>', '<queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n        </intent>', 1)
p.write_text(s)
PYQ
        ok "Added <queries> RecognitionService (Android 11+ speech visibility)."
    fi
    if ! grep -q 'android:hardwareAccelerated' "$mf"; then
        sed -i.bak 's|<application|<application android:hardwareAccelerated="true"|' "$mf" && rm -f "$mf.bak"
        ok "Enabled hardwareAccelerated."
    else
        ok "hardwareAccelerated already set."
    fi
}
apply_strings_xml() {
    local f="android/app/src/main/res/values/strings.xml"
    [ -f "$f" ] || return 0
    cat > "$f" <<'XML'
<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Gids Eyes View</string>
    <string name="title_activity_main">Gids Eyes View</string>
    <string name="package_name">com.gidabytes.gidseyeview</string>
    <string name="custom_url_scheme">com.gidabytes.gidseyeview</string>
</resources>
XML
    ok "strings.xml updated."
}
apply_local_properties() {
    if [ -d android ] && [ -n "${ANDROID_HOME:-}" ] && [ -d "${ANDROID_HOME}" ]; then
        printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
    fi
}
do_init() {
    info "First-time setup ..."
    check_prereqs_full
    apply_local_properties
    ensure_capacitor
    ensure_android_platform
    apply_capacitor_config
    apply_android_manifest
    apply_strings_xml
    apply_local_properties
    ok "Init complete."
}

# =============================================================================
#  MOBILE UI  —  v35 (Satellite FAB)
# =============================================================================
find_main_js() {
    local cand
    for cand in src/main.js src/main.ts src/index.js src/app.js; do
        [ -f "$cand" ] && { printf '%s' "$cand"; return 0; }
    done
    return 1
}

apply_mobile_ui_patches() {
    info "Applying mobile UI $UI_VERSION (Satellite FAB) ..."

    local main_js; main_js="$(find_main_js)" || { warn "No main.js found."; return 0; }
    cp "$main_js" "${main_js}.bak.$(date +%s)"

    # Strip every previous generation (v31–v35) — markers cut to EOF.
    python3 - "$main_js" <<'PYTRUNC'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text(); cut = len(s)
MARKERS = [
    "// Mobile icon rail", "// Mobile floating action button", "// Mobile floating glass",
    "// Mobile right-edge drawer", "// Mobile drawer", "// Mobile FAB",
    "initMobileIconRail", "initMobilePanelDrawer", "initLayersDrawer", "initMobileFab",
    "initDraggableMic", "initMobileUiV", "initMobileFabV",
    "// ===== GEV-SATELLITE-DRAWER v32 =====",
    "// ===== GEV-MOBILE-UI v32 =====",
    "// ===== GEV-MOBILE-UI v33 =====",
    "// ===== GEV-MOBILE-UI v34 =====",
    "// ===== GEV-SAT-FAB v35 =====",
    "// ===== GEV-SAT-TOOLS v36 =====", "initSatToolsMerge",
    "// ===== GEV-RAIL-FAB v37 =====", "// ===== GEV-RAIL-FAB v38 =====", "// ===== GEV-RAIL-FAB v39 =====", "// ===== GEV-RAIL-FAB v40 =====", "// ===== GEV-RAIL-FAB v41 =====", "initRailFab",
    "initMobileSatelliteDrawer", "initMobileUiV32", "initMobileUiV33", "initMobileUiV34",
]
for m in MARKERS:
    i = s.find(m)
    if 0 <= i < cut: cut = i
if cut < len(s):
    ls = s.rfind("\n", 0, cut); ls = 0 if ls < 0 else ls + 1
    p.write_text(s[:ls].rstrip() + "\n")
    print(f"  truncated {len(s) - ls} bytes")
PYTRUNC

    cat >> "$main_js" <<'JSV35'

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
JSV35
    ok "Mobile UI $UI_VERSION JS appended"

    cat >> "$main_js" <<'JSV41'

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
JSV41
    ok "Mobile UI $UI_VERSION rail FAB appended"

    # ---- CSS ----
    local css="src/ui/styles/responsive.css"
    if [ -f "$css" ]; then
        cp "$css" "${css}.bak.$(date +%s)"
        python3 - "$css" <<'PYSTRIP'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
for marker in ("MOBILE RIGHT-EDGE DRAWER","MOBILE ICON RAIL","Mobile FAB",
               "Mobile UI v","Exploration panel","Mobile UI v31",
               "GEV-SATELLITE-DRAWER v32","GEV-MOBILE-UI v32",
               "GEV-MOBILE-UI v33","GEV-MOBILE-UI v34","GEV-SAT-FAB v35",
               "GEV-SAT-TOOLS v36", "GEV-RAIL-FAB v37", "GEV-RAIL-FAB v38", "GEV-RAIL-FAB v39", "GEV-RAIL-FAB v40", "GEV-RAIL-FAB v41"):
    s = re.sub(r"/\*\s*=+\s*\n\s*[^\n]*" + re.escape(marker) + r"[^\n]*\n[\s\S]*?\*/\s*@media[^{]*\{[\s\S]*?\n\}\n",
               "", s, flags=re.DOTALL)
    s = re.sub(r"/\*\s*=====\s*" + re.escape(marker) + r"\s*=====\s*\*/[\s\S]*?(?=\n/\*|$)",
               "", s, flags=re.DOTALL)
# v34 desktop-hide rule for the sheet
s = re.sub(r"@media \(min-width: 1025px\) \{\s*#gev-sheet[^}]*\}\s*\}\n?", "", s)
p.write_text(s); print("  stripped old mobile CSS")
PYSTRIP

        cat >> "$css" <<'CSSV35'

/* ===== GEV-SAT-FAB v35 ===== */
@media (max-width: 768px) {
  #sat-root {
    position: fixed !important;
    z-index: 2147483602 !important;
    width: 48px; height: 48px;
    pointer-events: none;
    touch-action: none;
  }
  #sat-root > * { pointer-events: auto; }

  #sat-fab {
    position: relative; width: 48px; height: 48px; padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(140, 220, 255, 0.4);
    background: radial-gradient(circle at 30% 25%, rgba(150, 230, 255, 0.4) 0%, rgba(6, 18, 34, 0.9) 100%);
    display: flex; align-items: center; justify-content: center;
    cursor: grab; color: #dff3ff; outline: none;
    touch-action: none; -webkit-tap-highlight-color: transparent; user-select: none;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
    box-shadow: 0 0 20px rgba(90, 200, 255, 0.4), inset 0 0 14px rgba(140, 220, 255, 0.3);
    animation: satPulse 4s ease-in-out infinite;
  }
  #sat-fab:focus-visible { box-shadow: 0 0 0 3px rgba(140, 220, 255, 0.7); }
  #sat-fab:active, #sat-fab.is-grabbing { cursor: grabbing; transform: scale(0.92); animation-play-state: paused; }
  #sat-fab.is-open {
    transform: rotate(45deg);
    box-shadow: 0 0 30px rgba(120, 220, 255, 0.8), inset 0 0 20px rgba(180, 240, 255, 0.5);
  }
  .sat-svg { position: relative; z-index: 1; pointer-events: none; }
  .sat-halo {
    position: absolute; inset: -8px; border-radius: 50%;
    background: radial-gradient(circle, rgba(120, 210, 255, 0.4) 0%, transparent 60%);
    pointer-events: none; animation: satHalo 3s ease-in-out infinite;
  }
  .sat-ring {
    position: absolute; inset: 2px; border-radius: 50%;
    border: 1px dashed rgba(180, 230, 255, 0.4);
    pointer-events: none; animation: satSpin 15s linear infinite;
  }

  #sat-drawer {
    position: absolute; width: 260px; max-width: calc(100vw - 32px);
    display: flex; flex-direction: column; overflow: hidden;
    background: rgba(10, 18, 32, 0.75);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(140, 220, 255, 0.2);
    border-radius: 20px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    opacity: 0; pointer-events: none !important;
    transform: scale(0.95);
    transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    z-index: 2147483603;
  }
  .sat-drawer-below { top: 58px;    transform-origin: top center; }
  .sat-drawer-above { bottom: 58px; transform-origin: bottom center; }
  .sat-drawer-right { right: 0; }
  .sat-drawer-left  { left: 0; }
  .sat-drawer-below.sat-drawer-right { transform-origin: top right; }
  .sat-drawer-below.sat-drawer-left  { transform-origin: top left; }
  .sat-drawer-above.sat-drawer-right { transform-origin: bottom right; }
  .sat-drawer-above.sat-drawer-left  { transform-origin: bottom left; }
  #sat-drawer.sat-drawer-open { opacity: 1 !important; pointer-events: auto !important; transform: scale(1) !important; }

  .sat-drawer-header {
    flex: 0 0 auto;
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .sat-drawer-title { color: #8cc8ff; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
  .sat-drawer-close {
    width: 28px; height: 28px; border-radius: 50%; padding: 0;
    border: 1px solid rgba(140, 220, 255, 0.25);
    background: rgba(140, 220, 255, 0.08); color: #dff3ff;
    font-size: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .sat-drawer-close:active { background: rgba(255, 69, 58, 0.45); }

  .sat-drawer-list {
    flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch; touch-action: pan-y; padding: 4px 0 8px;
  }
  .sat-drawer-item {
    display: flex; align-items: center; gap: 12px; width: 100%;
    min-height: 44px; padding: 12px 16px;
    background: transparent; border: none; text-align: left;
    color: #dff3ff; font: inherit; font-size: 14px;
    cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: background 0.2s;
  }
  .sat-drawer-item:hover, .sat-drawer-item:active { background: rgba(90, 200, 255, 0.15); }
  .sat-item-icon { font-size: 16px; line-height: 1; }
  .sat-item-label { flex: 1; }
  .sat-item-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: rgba(140, 220, 255, 0.2); transition: background 0.2s, box-shadow 0.2s;
  }
  .sat-drawer-item.is-active .sat-item-dot {
    background: #5ad2ff; box-shadow: 0 0 8px rgba(90, 210, 255, 0.9);
  }

  @keyframes satPulse { 0%, 100% { box-shadow: 0 0 20px rgba(90, 200, 255, 0.4); } 50% { box-shadow: 0 0 35px rgba(110, 220, 255, 0.6); } }
  @keyframes satHalo  { 0%, 100% { opacity: 0.5; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }
  @keyframes satSpin  { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    #sat-fab, .sat-halo, .sat-ring { animation: none; }
  }
}
@media (min-width: 769px) { #sat-root { display: none !important; } }

/* ===== GEV-RAIL-FAB v41 ===== */
@media (max-width: 768px) {
  #rail-root {
    position: fixed !important; z-index: 2147483647 !important;
    width: 42px; height: 42px; touch-action: none;
  }
  #rail-fab {
    position: relative; width: 42px; height: 42px; padding: 0; border-radius: 50%;
    border: 1px solid rgba(140, 220, 255, 0.4);
    background: radial-gradient(circle at 30% 25%, rgba(150, 230, 255, 0.4) 0%, rgba(6, 18, 34, 0.9) 100%);
    display: flex; align-items: center; justify-content: center; cursor: grab;
    touch-action: none; user-select: none; -webkit-tap-highlight-color: transparent; outline: none;
    box-shadow: 0 0 20px rgba(90, 200, 255, 0.4), inset 0 0 14px rgba(140, 220, 255, 0.3);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
    animation: satPulse 4s ease-in-out infinite;
  }
  #rail-fab svg { position: relative; z-index: 1; pointer-events: none; transition: transform 0.3s ease; }
  #rail-fab.is-grabbing, #rail-fab:active { cursor: grabbing; transform: scale(0.92); animation-play-state: paused; }
  #rail-fab.is-open { box-shadow: 0 0 30px rgba(120, 220, 255, 0.8), inset 0 0 20px rgba(180, 240, 255, 0.5); }
  #rail-fab.is-open svg { transform: rotate(45deg); }
  #rail-fab:focus-visible { box-shadow: 0 0 0 3px rgba(140, 220, 255, 0.7); }

  /* ---- orb column anchored to the FAB (no frame, no outline) ---- */
  #rail-col {
    position: fixed !important; z-index: 2147483646 !important;
    left: var(--ax-l, 44px); top: var(--ax-t, auto); bottom: var(--ax-b, 186px);
    translate: -16px 0; width: 200px; align-items: flex-start !important;
    max-height: var(--ax-max, 60vh);
    display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 6px 0;
    background: none; border: 0; outline: 0; box-shadow: none;
    overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; touch-action: pan-y;
    scrollbar-width: none;
    transform-origin: bottom center; transform: translateY(14px) scale(0.85);
    opacity: 0; pointer-events: none; visibility: hidden;
    transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 0.3s;
  }
  #rail-col::-webkit-scrollbar { display: none; }
  #rail-col.ax-top { transform-origin: top center; transform: translateY(-14px) scale(0.85); }
  #rail-col.rc-open {
    transform: none; opacity: 1; pointer-events: auto; visibility: visible;
    transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s;
  }
  #rail-col .rail-orb {
    position: relative; flex: 0 0 auto; width: 32px; height: 32px; padding: 0; margin: 0;
    border-radius: 50%; border: 1px solid rgba(140, 220, 255, 0.4); outline: 0;
    background: radial-gradient(circle at 30% 25%, rgba(150, 230, 255, 0.35) 0%, rgba(6, 18, 34, 0.92) 100%);
    box-shadow: 0 0 16px rgba(90, 200, 255, 0.35), inset 0 0 12px rgba(140, 220, 255, 0.25);
    display: flex; align-items: center; justify-content: center;
    color: #dff3ff; cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease, box-shadow 0.3s ease;
  }
  #rail-col:not(.rc-open) .rail-orb { transform: scale(0.6); opacity: 0; }
  #rail-col .rail-orb:active { transform: scale(0.9); }
  #rail-col .rail-orb.is-active {
    border-color: rgba(140, 230, 255, 0.85);
    box-shadow: 0 0 26px rgba(110, 220, 255, 0.75), inset 0 0 18px rgba(180, 240, 255, 0.45);
  }
  /* text label beside each orb */
  #rail-col .rail-orb { overflow: visible; }
  .rail-orb-label {
    position: absolute; left: 40px; top: 50%; translate: 0 -50%;
    white-space: nowrap; pointer-events: none;
    padding: 3px 8px; border-radius: 999px;
    background: rgba(10, 18, 32, 0.78); border: 1px solid rgba(140, 220, 255, 0.22);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    color: #dff3ff; font-size: 9.5px; letter-spacing: 1.2px; text-transform: uppercase;
  }
  .rail-orb-label:empty { display: none; }
  #rail-col.ax-right { translate: calc(-100% + 16px) 0; align-items: flex-end !important; }
  #rail-col.ax-right .rail-orb-label { left: auto; right: 40px; }
  #rail-sheet .rs-back {
    width: 32px; height: 32px; margin-right: 8px; border-radius: 50%; padding: 0;
    border: 1px solid rgba(140, 220, 255, 0.25); background: rgba(140, 220, 255, 0.08);
    color: #dff3ff; font-size: 20px; line-height: 1; cursor: pointer;
  }
  #rail-sheet .rs-back[hidden] { display: none; }
  #rail-sheet .rs-head { justify-content: flex-start !important; }
  #rail-sheet .rs-title { flex: 1; }
  .rail-docked.rd-hidden { display: none !important; }
  #rail-col .rail-ocean-orb .rail-orb-ico { font-size: 15px; }

  /* submarine touch pad (W/A/S/D, RISE/DIVE, FAST, CAM) */
  #gev-sub-pad {
    position: fixed; left: 0; right: 0; bottom: calc(190px + env(safe-area-inset-bottom, 0px));
    display: none; justify-content: space-between; align-items: flex-end;
    padding: 0 14px; pointer-events: none; z-index: 2147483645;
    -webkit-user-select: none; user-select: none; touch-action: none;
  }
  #gev-sub-pad.sp-on { display: flex; }
  #gev-sub-pad > div { pointer-events: auto; }
  #gev-sub-pad button {
    border-radius: 50%; border: 1px solid rgba(140, 220, 255, 0.45); padding: 0;
    background: radial-gradient(circle at 30% 25%, rgba(150, 230, 255, 0.3), rgba(6, 18, 34, 0.88));
    color: #dff3ff; font: 600 11px/1 Inter, system-ui, sans-serif; letter-spacing: 1px;
    box-shadow: 0 0 12px rgba(90, 200, 255, 0.3); touch-action: none; -webkit-tap-highlight-color: transparent;
  }
  #gev-sub-pad button.on { background: rgba(90, 210, 255, 0.55); box-shadow: 0 0 20px rgba(110, 220, 255, 0.8); }
  #gev-sub-pad .sp-dpad { display: grid; grid-template: repeat(3, 44px) / repeat(3, 44px); gap: 4px; }
  #gev-sub-pad .sp-dpad button { width: 44px; height: 44px; font-size: 14px; }
  #gev-sub-pad .sp-dpad [data-k="W"] { grid-area: 1 / 2; }
  #gev-sub-pad .sp-dpad [data-k="A"] { grid-area: 2 / 1; }
  #gev-sub-pad .sp-dpad [data-k="S"] { grid-area: 3 / 2; }
  #gev-sub-pad .sp-dpad [data-k="D"] { grid-area: 2 / 3; }
  #gev-sub-pad .sp-side { display: grid; grid-template-columns: repeat(2, 48px); gap: 6px; }
  #gev-sub-pad .sp-side button { width: 48px; height: 48px; border-radius: 14px; }
  #gev-sub-pad [data-close] { grid-column: 2; width: 30px !important; height: 30px !important; border-radius: 50% !important; justify-self: end; }
  .rail-orb-ico { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center;
                  width: 15px; height: 15px; font-size: 12px; line-height: 1; color: #dff3ff; pointer-events: none; }
  .rail-orb-ico > svg, .rail-orb-ico > img, .rail-orb-ico > * { width: 15px; height: 15px; max-width: 15px; max-height: 15px; font-size: 15px; }
  .rail-orb-halo {
    position: absolute; inset: -8px; border-radius: 50%; pointer-events: none; z-index: 0;
    background: radial-gradient(circle, rgba(120, 210, 255, 0.3) 0%, transparent 62%);
    animation: satHalo 3s ease-in-out infinite;
  }
  .rail-orb-tag-unused {
    position: absolute; bottom: -2px; left: 50%; translate: -50% 0;
    font-size: 7px; letter-spacing: 1px; color: #8cc8ff; pointer-events: none;
  }
  .rail-side-orb { border-color: rgba(140, 220, 255, 0.55) !important; }

  /* app modal whose card got docked: make it invisible + click-through */
  .rail-overlay-tamed {
    background: transparent !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
    opacity: 0 !important; pointer-events: none !important;
  }

  /* ---- glass sheet anchored to the orb ---- */
  #rail-sheet {
    position: fixed !important; z-index: 2147483647 !important;
    left: var(--ax-l, 16px); right: var(--ax-r, auto);
    top: var(--ax-t, auto); bottom: var(--ax-b, 186px);
    width: calc(100vw - 32px); max-width: 440px;
    max-height: var(--ax-max, 70vh);
    display: flex; flex-direction: column; overflow: hidden;
    background: rgba(10, 18, 32, 0.82);
    -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(140, 220, 255, 0.2); border-radius: 20px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 24px rgba(90, 200, 255, 0.12);
    transform-origin: bottom left; transform: scale(0.95); opacity: 0; pointer-events: none;
    transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #rail-sheet.ax-top   { transform-origin: top left; }
  #rail-sheet.ax-right { transform-origin: bottom right; }
  #rail-sheet.ax-top.ax-right { transform-origin: top right; }
  #rail-sheet.rs-open  { opacity: 1; pointer-events: auto; transform: scale(1); }
  #rail-sheet .rs-head {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  #rail-sheet .rs-title { color: #8cc8ff; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; }
  #rail-sheet .rs-close {
    width: 32px; height: 32px; border-radius: 50%; padding: 0;
    border: 1px solid rgba(140, 220, 255, 0.25); background: rgba(140, 220, 255, 0.08);
    color: #dff3ff; font-size: 13px; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  #rail-sheet .rs-head { position: relative; z-index: 2; background: rgba(10, 18, 32, 0.92); padding: 10px 14px !important; }
  #rail-sheet .rs-title { font-size: 12px !important; letter-spacing: 2.5px !important; }
  #rail-sheet .rs-close, #rail-sheet .rs-back { width: 30px !important; height: 30px !important; }
  /* full-screen sheet on phones: more room, orb stays tappable above it */
  #rail-sheet.rs-full {
    left: 10px !important; right: 10px !important; width: auto !important; max-width: none !important;
    top: calc(10px + env(safe-area-inset-top, 0px)) !important;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px)) !important;
    max-height: none !important; z-index: 2147483646 !important;
  }
  #rail-sheet.rs-full .rs-body { padding: 8px 10px 72px !important; touch-action: pan-y !important; }
  /* smaller type inside docked panels: zoom scales text AND spacing together */
  #rail-sheet .rs-body > .rail-docked { zoom: 0.86; }
  #rail-sheet .rs-body .rail-docked :is(button, select, input) { min-height: 30px; }

  /* God's Eye View panels docked in the sheet: undo the desktop/rail sizing
     (--left-panel-allocated-height, inner scrollers, sticky header) so every
     option — from the first (e.g. Flights) to the last — is reachable */
  #rail-sheet .rail-docked:is(#data-panel, #cctv-panel, #scene-panel, #pp-toggles,
      #global-context-panel, #radio-panel, #weather-panel, #recent-imagery-panel, #gev-geo-panel) {
    --left-panel-allocated-height: auto;
    flex: none !important; order: 0 !important;
  }
  #rail-sheet .rail-docked :is(.data-panel-inner, .cctv-panel-inner, .scene-panel-inner,
      .global-context-panel-inner, .radio-panel-inner, .weather-panel-inner,
      .recent-imagery-panel-inner, .cyber-panel-body, .pp-panel-body,
      .data-toggle-list, [data-rail-scroller]) {
    height: auto !important; max-height: none !important; min-height: 0 !important;
    overflow: visible !important; padding-right: 0 !important;
    scrollbar-gutter: auto !important;
  }
  #rail-sheet .rail-docked .panel-glow { display: none !important; }
  #rail-sheet #gev-geo-panel.rail-docked .gg-inner { min-height: 0 !important; }
  #rail-sheet #gev-geo-panel.rail-docked .gg-tabs { flex-wrap: wrap; }
  #gev-geo-toggle { display: none !important; }   /* phones use the Geo orb */
  #rail-sheet .rail-docked .panel-header { position: static !important; }
  /* the sheet shows the title + close; keep the rest of the header (e.g. radio dock) */
  #rail-sheet .rail-docked > :is(div, section) > .panel-header > :is(.panel-title, .panel-divider, .panel-collapse-btn),
  #rail-sheet .rail-docked .pp-header-row { display: none !important; }
  #rail-sheet .rail-docked .panel-header:not(:has(> :not(.panel-title):not(.panel-divider):not(.panel-collapse-btn))) { display: none !important; }
  #rail-sheet .rail-docked .cctv-frame-wrap img,
  #rail-sheet .rail-docked .cctv-frame-wrap canvas { width: 100% !important; height: auto !important; }

  /* root cause in the app on phones: #left-panel-stack is pinned by its
     bottom (calc(50vh + 8px)) with no top bound, so tall panels grow off the
     top of the screen. Bound it and let it scroll. */
  /* MOVEMENT group (Satellites, Live Flights, ...) pinned at the top of the
     layer list so it is never out of reach */
  #rail-sheet .rail-docked .data-layer-group-heading:first-child,
  #data-toggles > .data-layer-group-heading:first-child { margin-top: 0 !important; padding-top: 4px !important; border-top: 0 !important; }
  #data-panel:not(.collapsed) .data-toggle-list { scroll-padding-top: 0; }
  #left-panel-stack {
    top: max(12px, env(safe-area-inset-top, 0px)) !important;
    max-height: calc(100vh - 24px) !important;
    overflow-y: auto !important; overscroll-behavior: contain;
  }
  #rail-sheet .rs-body {
    flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
    overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y;
    padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
    scroll-padding-top: 8px;
  }

  /* docked panel: flatten its own frame + kill the rail-clearance offset */
  .rail-docked {
    position: static !important; inset: auto !important; transform: none !important; translate: none !important;
    width: 100% !important; max-width: 100% !important; min-width: 0 !important;
    height: auto !important; max-height: none !important;
    margin: 0 !important; padding: 0 !important;
    border: 0 !important; outline: 0 !important; border-radius: 0 !important;
    box-shadow: none !important; background: transparent !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
    display: block !important; visibility: visible !important; opacity: 1 !important;
    pointer-events: auto !important; overflow: visible !important; z-index: auto !important;
  }
  .rail-docked > * {
    margin-left: 0 !important; left: auto !important;
    max-width: 100% !important; box-sizing: border-box !important;
  }
  /* inner wrappers that carried a second outline */
  .rail-docked > div, .rail-docked > section {
    border-color: transparent !important; box-shadow: none !important;
    padding-left: 0 !important; padding-right: 0 !important;
  }
  .rail-docked * { max-width: 100%; box-sizing: border-box; }
  /* rows: let text shrink/wrap so toggles + OFF buttons stay on screen */
  .rail-docked :is(div, li, label, section, header) { min-width: 0; }
  .rail-docked :is(span, p, small, strong, em, h1, h2, h3, h4, h5, h6, div) { overflow-wrap: anywhere; }
  .rail-docked :is(button, input, select, [role="switch"], [role="button"]) { flex-shrink: 0; }
  .rail-docked [style*="flex-wrap: nowrap"] { flex-wrap: wrap !important; }
  .rail-docked :is(ul, ol) { padding-left: 0 !important; margin: 0 !important; }
  .rail-docked > :first-child { margin-top: 0 !important; padding-top: 0 !important; }
  /* sticky headers inside the app panel would float over our sheet header */
  .rail-docked [style*="sticky"], .rail-docked .sticky { position: static !important; }

  @media (prefers-reduced-motion: reduce) { #rail-fab, .rail-orb-halo { animation: none; } }
}
@media (min-width: 769px) { #rail-root, #rail-col, #rail-sheet { display: none !important; } .rail-orb-halo { display: none; } }
CSSV35
        ok "Mobile UI $UI_VERSION CSS appended"
    else
        warn "$css not found — CSS not applied."
    fi
    [ -f src/mobile-drawer.css ] && rm -f src/mobile-drawer.css
    ok "Mobile UI $UI_VERSION applied — Satellite FAB + draggable rail FAB."
}

# =============================================================================
#  CESIUM GUARD + NATIVE FETCH + APK PROXY
# =============================================================================
apply_cesium_guard() {
    info "Writing Cesium render guard ..."
    mkdir -p src/lib
    cat > src/lib/cesiumGuard.js <<'JSC'
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
JSC
    ok "src/lib/cesiumGuard.js written"
}

apply_native_fetch() {
    info "Writing nativeFetch helper ..."
    mkdir -p src/lib
    cat > src/lib/nativeFetch.js <<'JSN'
import { Capacitor, CapacitorHttp } from '@capacitor/core';
const NATIVE_HOSTS = ['opensky-network.org','firms.modaps.eosdis.nasa.gov','ll.thespacedevs.com','celestrak.org','celestrak.com','api.wheretheiss.at','api.open-notify.org','graph.mapillary.com','api.tomtom.com','inciweb.wildfire.gov','services3.arcgis.com','www.nhc.noaa.gov','transit.land','de1.api.radio-browser.info','overpass-api.de','nominatim.openstreetmap.org'];
function needsNative(url) {
  try { const host = new URL(url, window.location.origin).hostname;
    return NATIVE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}
export async function nativeFetch(url, options = {}) {
  if (!Capacitor?.isNativePlatform?.() || !needsNative(url)) return fetch(url, options);
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};
  const res = await CapacitorHttp.request({
    url, method,
    headers: headers instanceof Headers ? Object.fromEntries(headers) : headers,
    data: options.body || undefined,
  });
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return {
    ok: res.status >= 200 && res.status < 300, status: res.status, statusText: String(res.status),
    headers: new Headers(res.headers || {}),
    text: async () => body, json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}
JSN
    ok "src/lib/nativeFetch.js written"
}

apply_apk_proxy() {
    info "Installing embedded API proxy ..."
    mkdir -p src/lib
    cat > src/lib/embeddedApiProxy.js <<'JSPROXY'
/**
 * Embedded API proxy — makes the standalone APK work without a Vite server.
 * NOTE: keys shipped in the APK are extractable. Route private credentials
 * through a backend for production.
 */
import { Capacitor } from '@capacitor/core';
import { nativeFetch } from './nativeFetch.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const APK_MODE =
  Boolean(Capacitor?.isNativePlatform?.()) ||
  env.VITE_API_PROXY === 'embedded' ||
  env.API_PROXY === 'embedded';

if (!APK_MODE) {
  console.info('[APK-Proxy] disabled (not in native mode)');
} else {
  const FIRMS_KEY   = env.VITE_FIRMS_MAP_KEY        || env.FIRMS_MAP_KEY        || '';
  const TOMTOM_KEY  = env.VITE_TOMTOM_API_KEY       || env.TOMTOM_API_KEY       || '';
  const MAPILLARY   = env.VITE_MAPILLARY_TOKEN      || env.MAPILLARY_ACCESS_TOKEN || '';
  const OPENSKY_ID  = env.VITE_OPENSKY_CLIENT_ID    || env.OPENSKY_CLIENT_ID    || '';
  const OPENSKY_SEC = env.VITE_OPENSKY_CLIENT_SECRET|| env.OPENSKY_CLIENT_SECRET|| '';

  // same result shape as the app's server (src/nominatimGeocode.js)
  function nominatimToGoogle(rows) {
    const h = Array.isArray(rows) ? rows[0] : null;
    const lat = Number(h?.lat), lng = Number(h?.lon);
    if (!h || !Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'ZERO_RESULTS', results: [] };
    const bb = (h.boundingbox || []).map(Number);
    const viewport = bb.length === 4 && bb.every(Number.isFinite)
      ? { southwest: { lat: bb[0], lng: bb[2] }, northeast: { lat: bb[1], lng: bb[3] } } : null;
    const name = String(h.name || '').trim();
    return { status: 'OK', results: [{
      geometry: { location: { lat, lng }, ...(viewport ? { bounds: viewport, viewport } : {}) },
      formatted_address: String(h.display_name || name),
      types: [h.type || h.addresstype || 'geocode'].filter(Boolean),
      address_components: name ? [{ long_name: name, short_name: name, types: [h.type || 'geocode'] }] : [],
    }] };
  }
  const RULES = [
    { match: /^\/api\/firms(?:\?|$)/, build: () => ({
        url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`,
    })},
    { match: /^\/api\/fire-perimeters\/inciweb/, build: () => ({ url: 'https://inciweb.wildfire.gov/incidents/rss.xml' })},
    { match: /^\/api\/fire-perimeters/, build: () => ({
        url: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson',
    })},
    { match: /^\/api\/tomtom\/flow\/(.+)$/, build: (_u, m) => ({
        url: `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${m[1]}.png?key=${TOMTOM_KEY}`,
    })},
    { match: /^\/api\/tomtom\/status/, build: () => ({
        url: `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=0,0&key=${TOMTOM_KEY}`,
    })},
    { match: /^\/api\/geocode(?:\?|$)/, build: (u) => {
        const q = new URL(u, 'https://x').searchParams;
        const params = new URLSearchParams({ format: 'jsonv2', q: q.get('q') || '', addressdetails: '1', limit: '1', 'accept-language': 'en' });
        return { url: 'https://nominatim.openstreetmap.org/search?' + params,
                 init: { headers: { 'User-Agent': 'gids-eyes-view/1.0 (Android)', 'Accept': 'application/json' } },
                 transform: nominatimToGoogle };
    }},
    { match: /^\/api\/launches/, build: () => ({ url: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=50&mode=list' })},
    { match: /^\/api\/celestrak\/active/, build: () => ({ url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json' })},
    { match: /^\/api\/radio\/stations/, build: () => ({ url: 'https://de1.api.radio-browser.info/json/stations/topvote/200' })},
    { match: /^\/api\/overpass/, build: (_u, _m, init) => {
        const body = init?.body || '';
        return { url: 'https://overpass-api.de/api/interpreter',
                 init: { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } } };
    }},
    { match: /^\/api\/cyclones/, build: () => ({ url: 'https://www.nhc.noaa.gov/CurrentStorms.json' })},
    { match: /^\/api\/transit\/feeds/, build: () => ({ url: 'https://transit.land/api/v2/rest/feeds?limit=200' })},
    { match: /^\/api\/gbfs\/(.+)$/, build: (_u, m) => ({ url: decodeURIComponent(m[1]) })},
    { match: /^\/api\/cctv\/sources/, build: () => ({ url: 'https://raw.githubusercontent.com/opencctv/cameras/main/cameras.json' })},
    { match: /^\/api\/cctv\/health/,  build: () => null },
    { match: /^\/api\/opensky|^\/api\/flights/, build: () => {
        const creds = (OPENSKY_ID && OPENSKY_SEC)
          ? `&client_id=${encodeURIComponent(OPENSKY_ID)}&client_secret=${encodeURIComponent(OPENSKY_SEC)}`
          : '';
        return { url: `https://opensky-network.org/api/states/all?_=1${creds}` };
    }},
    { match: /^\/api\/ais/, build: () => null },
    { match: /^\/api\/mapillary/, build: (u) => ({
        url: 'https://graph.mapillary.com' + u.replace(/^\/api\/mapillary/, '') +
             (u.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(MAPILLARY),
    })},
    { match: /^\/api\/local-receivers/, build: () => null },
  ];

  function resolve(originalUrl, init) {
    const m = originalUrl.match(/^https?:\/\/[^/]+(\/api\/[^\s]*)$/);
    const path = m ? m[1] : originalUrl;
    for (const rule of RULES) {
      const rx = rule.match instanceof RegExp ? rule.match : new RegExp('^' + rule.match + '$');
      const matched = path.match(rx);
      if (!matched) continue;
      try {
        const out = rule.build(path, matched, init || {});
        if (out && out.url) return out;
      } catch (err) { console.warn('[APK-Proxy] builder threw for', path, err); }
      return null;
    }
    return null;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    let url, realInit = init;
    if (typeof input === 'string') url = input;
    else if (input instanceof Request) url = input.url;
    else if (input && input.url) url = input.url;
    else return originalFetch(input, init);

    if (!url.startsWith('/api/')) return originalFetch(input, init);
    const resolved = resolve(url, init);
    if (!resolved) { console.warn('[APK-Proxy] no rewrite for', url); return originalFetch(input, init); }
    if (resolved.init) realInit = { ...(init || {}), ...resolved.init };
    console.info('[APK-Proxy]', url, '->', resolved.url.slice(0, 80) + (resolved.url.length > 80 ? '…' : ''));
    if (resolved.transform) {
      try {
        const res = await nativeFetch(resolved.url, realInit);
        const out = await resolved.transform(await res.json());
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [], error: String(e?.message || e) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return nativeFetch(resolved.url, realInit);
  };

  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    const open = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      if (typeof url === 'string' && url.startsWith('/api/')) {
        const r = resolve(url, { method });
        if (r) return open(method, r.url, ...rest);
      }
      return open(method, url, ...rest);
    };
    return xhr;
  }
  PatchedXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  console.info('[APK-Proxy] installed. Rules:', RULES.length);
  console.info('[APK-Proxy] keys present:',
    'firms=' + Boolean(FIRMS_KEY),
    'tomtom=' + Boolean(TOMTOM_KEY),
    'mapillary=' + Boolean(MAPILLARY),
    'opensky=' + Boolean(OPENSKY_ID && OPENSKY_SEC));
}
JSPROXY
    ok "src/lib/embeddedApiProxy.js written"

    local main_js; main_js="$(find_main_js)" || return 0
    cp "$main_js" "${main_js}.bak.$(date +%s)"
    python3 - "$main_js" <<'PYWIRE'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if "embeddedApiProxy" in s:
    print("  already imported"); sys.exit(0)
lines = s.split("\n"); i = 0
while i < len(lines) and (lines[i].startswith("#!") or lines[i].startswith("//") or lines[i].strip() == ""):
    i += 1
lines.insert(i, "import './lib/embeddedApiProxy.js'; // installed first — must run before layer code")
p.write_text("\n".join(lines))
print("  import inserted at line", i + 1)
PYWIRE
}

apply_layer_diagnostics() {
    info "Layer diagnostics ..."
    local n
    n=$(grep -rln "'/api/\|\"/api/" src/layers/ --include="*.js" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$n" = "0" ]; then
        ok "No layers use /api/* — all endpoints direct."
    else
        info "$n layer files call /api/* — rewritten by embedded proxy in APK mode."
        grep -rln "'/api/\|\"/api/" src/layers/ --include="*.js" 2>/dev/null | sed 's/^/    /'
    fi
    local h
    h=$(grep -rln "gev:layer-request" src/ --include="*.js" 2>/dev/null | grep -v main.js | wc -l | tr -d ' ')
    if [ "$h" = "0" ]; then
        warn "No listener for 'gev:layer-request' outside main.js — FAB falls back to panel ids."
    else
        ok "$h file(s) listen for gev:layer-request."
    fi
    ok "Diagnostic complete"
}

# =============================================================================
#  VOICE
# =============================================================================
write_native_voice() {
    mkdir -p src/voice
    cat > src/voice/nativeVoice.js <<'JSNV'
// GEV-VOICE v52 — Google speech recognition bound to the Gids Eye View mic,
// running hidden in the background (no Google popup).
//
// How it works (Android, @capgo/capacitor-speech-recognition 8.x):
//  * The native side creates its SpeechRecognizer on Google's recognition
//    service (see GevRecognizer.java, patched in by gids-android.sh), so the
//    GEV mic always talks to Google even if the phone's default is another
//    vendor's engine.
//  * With partialResults:true, words arrive as 'partialResults' events and the
//    final hypothesis arrives as one more 'partialResults' event; start()
//    resolves as soon as listening has begun, stop() returns no text.
//  * Errors arrive as an 'error' event {code,message,sessionId}; the session end
//    arrives as 'listeningState' {state:'stopped', sessionId, reason, errorCode}.
//
// Speed: we decide "you've finished speaking" ourselves from the partials
// (700 ms after a complete-sounding command, 1.3 s otherwise) instead of
// waiting for Android's own end-of-speech timer, and we hand the text over
// before the native recognizer has finished shutting down.
import { registerPlugin } from '@capacitor/core';
const SpeechRecognition = registerPlugin('SpeechRecognition');

export function isNativeVoiceAvailable() {
  return Boolean(globalThis.window?.Capacitor?.isNativePlatform?.());
}

export const QUICK_SILENCE_MS = 700; // "fly to Cebu" — sounds complete
export const SILENCE_MS = 1300; // "fly to …" — may still be mid-phrase
const NO_SPEECH_MS = 8000; // nothing heard at all
const EARLY_END_MS = 1500; // recognizer quit this fast without text = glitch, retry quietly

// words a command does not end on
const DANGLING = new Set(('to the a an of in on at for from near me my and or go fly take show find ' +
  'zoom navigate head travel search look locate where is what turn switch enable disable hey please').split(' '));
export function looksComplete(text) {
  const w = String(text || '').trim().toLowerCase().replace(/[.!?,]+$/, '').split(/\s+/).filter(Boolean);
  return w.length >= 2 && !DANGLING.has(w[w.length - 1]);
}

// Map native / plugin errors to what we do about them.
export function classifyVoiceError(err) {
  const s = `${err?.code || ''} ${err?.errorCode || ''} ${err?.message || err || ''}`;
  if (/INSUFFICIENT_PERMISSIONS|permission|not-allowed|denied/i.test(s)) return 'fatal';
  if (/not available|unavailable|No speech recognition service/i.test(s)) return 'fatal';
  if (/NETWORK|SERVER|network/i.test(s)) return 'network';
  if (/BUSY|already running|CLIENT|RECREATE_FAILED|stopped before final|AUDIO/i.test(s)) return 'retry';
  if (/NO_MATCH|SPEECH_TIMEOUT|No match|No speech input/i.test(s)) return 'silent';
  return 'other';
}

// on-screen caption so you can SEE what Google heard
let capEl = null, capT = 0;
export function gevCaption(text, fade = true) {
  try {
    if (!capEl) {
      capEl = document.createElement('div');
      capEl.id = 'gev-voice-caption';
      capEl.setAttribute('role', 'status');
      capEl.style.cssText = 'position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));translate:-50% 0;' +
        'max-width:86vw;padding:8px 14px;border-radius:14px;z-index:2147483647;pointer-events:none;' +
        'background:rgba(10,18,32,.88);border:1px solid rgba(140,220,255,.35);color:#dff3ff;' +
        'font:500 13px/1.35 Inter,system-ui,sans-serif;box-shadow:0 0 18px rgba(90,200,255,.35);' +
        'transition:opacity .3s;text-align:center';
      document.body.appendChild(capEl);
    }
    capEl.textContent = '🎙 ' + text;
    capEl.style.opacity = '1';
    clearTimeout(capT);
    if (fade) capT = setTimeout(() => { if (capEl) capEl.style.opacity = '0'; }, 4000);
  } catch {}
}

// Permission + availability are checked once, then cached, so a tap starts
// listening straight away. A failure is not cached (the user may fix it).
let ready = null;
export function warmUpVoice() {
  if (!ready) {
    ready = (async () => {
      let perm = await SpeechRecognition.checkPermissions?.().catch(() => null);
      if (!perm || perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
      if (perm?.speechRecognition !== 'granted') throw new Error('Microphone / speech permission denied');
      const { available } = await SpeechRecognition.available();
      if (!available) throw new Error('No speech recognition service on this device (run ./gids-android.sh --voice-setup to install Google speech services)');
      return true;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function resetNative() {
  try {
    if (SpeechRecognition.forceStop) await SpeechRecognition.forceStop({ timeout: 300 });
    else await SpeechRecognition.stop();
  } catch {}
  await sleep(250);
}

// Only one capture at a time: the native recognizer is a singleton, and two JS
// owners were the cause of "Speech recognition is already running" errors.
let current = null;
export const activeVoice = () => current;

export class NativeVoiceAdapter {
  constructor({ onTranscript, onPartial, onStatus, onError, language } = {}) {
    this.onTranscript = onTranscript || (() => {});
    this.onPartial = onPartial || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});
    this.language = language || navigator.language || 'en-US';
    this.subs = []; this.active = false; this.done = true; this.last = '';
    this.timer = 0; this.noSpeech = 0; this.gen = 0;
  }

  async start() {
    if (this.active) return;
    if (current && current !== this) current.abort();
    current = this;
    Object.assign(this, { active: true, done: false, last: '', attempts: 0, triedOnDevice: false,
      lastError: null, nativeSession: undefined, t0: performance.now(), heardAt: 0 });
    window.__gevVoiceActive = true;
    gevCaption('Listening…', false);
    this.onStatus('listening', 'Listening…');
    try {
      await warmUpVoice();
      if (this.done) return; // tapped off while the permission check ran
      await this._listen();
    } catch (e) {
      this._fail(e);
    }
  }

  async _listen({ onDevice = false } = {}) {
    this._unsub();
    this.attempts++;
    const gen = ++this.gen;
    const mine = (ev) => gen === this.gen && !this.done &&
      (ev?.sessionId === undefined || this.nativeSession === undefined || ev.sessionId === this.nativeSession);
    this.lastError = null; this.nativeSession = undefined; this.listenAt = performance.now();
    const add = async (name, fn) => {
      try { this.subs.push(await SpeechRecognition.addListener(name, fn)); } catch {}
    };
    await add('listeningState', (ev) => {
      if (gen !== this.gen || this.done) return;
      const st = ev?.state || ev?.status;
      if ((st === 'startingListening' || st === 'started') && ev?.sessionId !== undefined) this.nativeSession = ev.sessionId;
      if ((ev?.status === 'stopped' || st === 'stopped') && mine(ev)) this._ended(ev);
    });
    await add('partialResults', (ev) => {
      if (!mine(ev)) return;
      const t = String(ev?.accumulatedText || ev?.matches?.[0] || ev?.value?.[0] || '').trim();
      if (t) this._heard(t);
    });
    await add('error', (ev) => { if (mine(ev)) this.lastError = ev; });

    let res;
    try {
      res = await SpeechRecognition.start({
        language: this.language, maxResults: 3, partialResults: true, popup: false,
        ...(onDevice ? { useOnDeviceRecognition: true } : {}),
      });
    } catch (e) {
      if (this.done) return;
      if (classifyVoiceError(e) === 'retry' && this.attempts < 3) {
        console.info('[GEV-Voice] recognizer busy (' + (e?.message || e) + ') — resetting and retrying');
        await resetNative();
        return this._listen({ onDevice });
      }
      throw e;
    }
    console.info('[GEV-Voice] Google listening (background), lang=' + this.language + (onDevice ? ', on-device' : ''));
    const m = String(res?.matches?.[0] || '').trim(); // some builds still resolve with text
    if (m) { this.last = m; this.finalize('results'); return; }
    clearTimeout(this.noSpeech);
    this.noSpeech = setTimeout(() => { if (!this.last) this.finalize('no-speech'); }, NO_SPEECH_MS);
  }

  _heard(t) {
    this.last = t;
    this.heardAt = performance.now();
    clearTimeout(this.noSpeech);
    gevCaption('“' + t + '”', false);
    this.onPartial(t);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finalize('silence'), looksComplete(t) ? QUICK_SILENCE_MS : SILENCE_MS);
  }

  // native session ended on its own (Android end-of-speech, or an error)
  async _ended(ev) {
    if (this.done) return;
    if (this.last.trim()) return this.finalize('end');
    const err = this.lastError || (ev?.errorCode ? { code: ev.errorCode } : null);
    const kind = err ? classifyVoiceError(err) : 'silent';
    const quick = performance.now() - this.listenAt < EARLY_END_MS;
    console.info('[GEV-Voice] recognizer ended without text', JSON.stringify({ code: err?.code, kind, quick }));
    if (kind === 'fatal') return this._fail(new Error(err?.message || err?.code));
    if (kind === 'network' && !this.triedOnDevice) {
      this.triedOnDevice = true;
      const od = await SpeechRecognition.isOnDeviceRecognitionAvailable?.({ language: this.language }).catch(() => null);
      if (od?.available && !this.done) {
        gevCaption('No connection — listening on-device…', false);
        return this._listen({ onDevice: true }).catch((e) => this._fail(e));
      }
      return this.finalize('network');
    }
    if ((kind === 'retry' || quick) && this.attempts < 3) {
      await resetNative();
      if (!this.done) return this._listen().catch((e) => this._fail(e));
      return;
    }
    this.finalize(kind === 'network' ? 'network' : 'no-speech');
  }

  // user tapped the mic again: use what was heard so far
  async stop() {
    if (!this.active) return;
    if (!this.last.trim()) return this.finalize('cancelled');
    // deliver on the next tick, after the voice session has processed the tap
    // (it goes idle first; the command then runs as a fresh 'executing' turn)
    this.active = false;
    clearTimeout(this.timer);
    setTimeout(() => this.finalize('user'), 0);
  }

  // another capture took over / app tore the session down
  abort() {
    if (this.done) return;
    this.finalize('aborted');
  }

  finalize(reason) {
    if (this.done) return;
    this.done = true; this.active = false;
    clearTimeout(this.timer); clearTimeout(this.noSpeech);
    this._unsub();
    if (current === this) current = null;
    window.__gevVoiceActive = false;
    // shut the recognizer down in the background — never wait for it
    SpeechRecognition.stop().catch(() => {});
    const t = this.last.trim();
    const now = performance.now();
    window.__gevVoiceTiming = { reason, text: t, startMs: Math.round(now - this.t0),
      afterLastWordMs: this.heardAt ? Math.round(now - this.heardAt) : null, finalAt: now };
    console.info('[GEV-Voice] transcript:', JSON.stringify(t), reason, window.__gevVoiceTiming.afterLastWordMs + 'ms after last word');
    if (reason === 'aborted') return;
    const msg = t ? '“' + t + '”'
      : reason === 'network' ? 'Google speech needs a connection — check Wi-Fi/data and try again'
      : reason === 'cancelled' ? 'Voice off'
      : 'Didn’t catch that — tap the mic and speak';
    gevCaption(msg, true);
    if (t) this.onTranscript(t);
    this.onStatus('idle', t ? 'Heard: ' + t : msg);
  }

  _fail(e) {
    const msg = String(e?.message || e || 'Voice error');
    console.warn('[GEV-Voice] start failed:', msg);
    if (!this.done) {
      this.done = true; this.active = false;
      clearTimeout(this.timer); clearTimeout(this.noSpeech);
      this._unsub();
      if (current === this) current = null;
      window.__gevVoiceActive = false;
      SpeechRecognition.stop().catch(() => {});
    }
    gevCaption('Voice: ' + msg, true);
    if (classifyVoiceError(e) === 'fatal') this.onError(e);
    else this.onStatus('idle', msg);
  }

  _unsub() {
    const subs = this.subs; this.subs = [];
    subs.forEach((s) => { try { s.remove(); } catch {} });
  }

  speak(text) {
    try { window.gevSpeak ? window.gevSpeak(text) : window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text)); } catch {}
  }
  cancelSpeech() { try { window.speechSynthesis?.cancel(); } catch {} }
}
JSNV
    ok "src/voice/nativeVoice.js written"
}

# Binds the speech plugin to Google's recognition service (GEV mic -> Google,
# background). The plugin's Android sources live in node_modules and Gradle
# compiles them from there, so the patch is re-applied on every build.
apply_google_recognizer() {
    local dir="node_modules/$SPEECH_PLUGIN/android/src/main/java/app/capgo/speechrecognition"
    local f="$dir/SpeechRecognitionPlugin.java"
    if [ ! -f "$f" ]; then
        warn "Speech plugin Android sources not found ($dir) - mic uses the phone's default recognizer"
        return 0
    fi
    cat > "$dir/GevRecognizer.java" <<'JAVAGR'
package app.capgo.speechrecognition;

// GEV-GOOGLE-RECOGNIZER — added by gids-android.sh (Gids Eye View).
// Creates the plugin's SpeechRecognizer on Google's recognition service, so the
// GEV mic always uses Google speech recognition in the background, even when the
// phone's default voice-input engine is another vendor's (Samsung, Xiaomi, ...).
// Falls back to the system default when no Google service is installed.

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.provider.Settings;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;
import android.util.Log;
import java.util.List;

final class GevRecognizer {
    private static final String TAG = "GEV-Voice";
    // Google app first (classic, streaming partial results), then
    // "Speech Recognition & Synthesis from Google" (com.google.android.tts).
    private static final String[] GOOGLE_PACKAGES = {
        "com.google.android.googlequicksearchbox",
        "com.google.android.tts",
    };
    private static ComponentName chosen;
    private static boolean resolved;

    private GevRecognizer() {}

    static synchronized ComponentName googleService(Context ctx) {
        if (resolved) return chosen;
        resolved = true;
        try {
            // Already Google by default? Then let Android pick it (no explicit bind).
            String def = null;
            try {
                def = Settings.Secure.getString(ctx.getContentResolver(), "voice_recognition_service");
            } catch (Exception ignored) {
                // not readable on newer targets; choose explicitly below
            }
            if (def != null) {
                ComponentName d = ComponentName.unflattenFromString(def);
                if (d != null && isGoogle(d.getPackageName())) {
                    Log.i(TAG, "Default recognizer is already Google: " + def);
                    return chosen = null;
                }
            }
            List<ResolveInfo> services = ctx.getPackageManager()
                .queryIntentServices(new Intent(RecognitionService.SERVICE_INTERFACE), 0);
            if (services != null) {
                for (String pkg : GOOGLE_PACKAGES) {
                    for (ResolveInfo ri : services) {
                        ServiceInfo si = ri.serviceInfo;
                        if (si != null && pkg.equals(si.packageName) && si.enabled && si.exported) {
                            chosen = new ComponentName(si.packageName, si.name);
                            Log.i(TAG, "Binding GEV mic to Google recognizer " + chosen.flattenToShortString());
                            return chosen;
                        }
                    }
                }
            }
            Log.w(TAG, "No Google recognition service found; using the system default (install the Google app or Speech Recognition & Synthesis)");
        } catch (Exception e) {
            Log.w(TAG, "Google recognizer lookup failed, using the system default", e);
        }
        return chosen = null;
    }

    private static boolean isGoogle(String pkg) {
        for (String g : GOOGLE_PACKAGES) if (g.equals(pkg)) return true;
        return false;
    }

    static SpeechRecognizer create(Context ctx) {
        ComponentName c = googleService(ctx);
        if (c != null) {
            try {
                return SpeechRecognizer.createSpeechRecognizer(ctx, c);
            } catch (Exception e) {
                Log.w(TAG, "Could not bind " + c.flattenToShortString() + ", using the system default", e);
                chosen = null;
            }
        }
        return SpeechRecognizer.createSpeechRecognizer(ctx);
    }
}
JAVAGR
    python3 - "$f" <<'PYGR'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
old = "SpeechRecognizer.createSpeechRecognizer(bridge.getActivity())"
n = s.count(old)
if n:
    s = s.replace(old, "GevRecognizer.create(bridge.getActivity())")
    if "GEV-GOOGLE-RECOGNIZER" not in s:
        s = s.replace("package app.capgo.speechrecognition;", "package app.capgo.speechrecognition;\n// GEV-GOOGLE-RECOGNIZER: recognizers are created on Google's service (gids-android.sh)", 1)
    p.write_text(s)
    print(f"  bound {n} recognizer(s) to Google")
elif "GevRecognizer.create(" in s:
    print("  already bound to Google")
else:
    print("  WARNING: plugin layout changed - recognizer not bound (default engine used)")
PYGR
    ok "Speech plugin -> Google recognition service (background)"
}

# Web Speech API shim: Android WebView exposes webkitSpeechRecognition but it never
# returns results. On native, replace it with the Capacitor plugin so ANY existing
# voice code (incl. a preserved realtimeSession.js) receives text.
# Every final transcript also fires `gev:voice-transcript`; if nothing handles it
# (preventDefault), it is typed into the app's search box and submitted.
write_voice_bridge() {
    mkdir -p src/voice
    cat > src/voice/voiceBridge.js <<'JSVB'
import { NativeVoiceAdapter, isNativeVoiceAvailable, gevCaption, warmUpVoice, activeVoice } from './nativeVoice.js';
import { registerPlugin } from '@capacitor/core';
const TextToSpeech = registerPlugin('TextToSpeech');

// Spoken replies via the native engine (Speech Recognition & Synthesis by Google).
// Android WebView's speechSynthesis is often silent, so it is not relied on.
async function speak(text, opts = {}) {
  if (!text) return;
  try {
    await TextToSpeech.stop().catch(() => {});
    await TextToSpeech.speak({ text: String(text), lang: opts.lang || navigator.language || 'en-US',
                               rate: opts.rate || 1.0, pitch: opts.pitch || 1.0, volume: 1.0, category: 'playback' });
  } catch (e) {
    console.warn('[GEV-Voice] native TTS failed, falling back:', e?.message || e);
    try { window.__gevOrigSynth?.speak(new SpeechSynthesisUtterance(text)); } catch {}
  }
}

function findSearchBox() {
  const real = document.getElementById('location-search');
  if (real) {
    const bar = document.getElementById('location-bar');
    if (bar?.classList.contains('collapsed')) { try { document.getElementById('location-bar-toggle')?.click(); } catch {} }
    return real;
  }
  const sel = [
    'input[type="search"]', 'input[name*="search" i]', 'input[id*="search" i]',
    'input[placeholder*="search" i]', 'input[placeholder*="location" i]',
    'input[placeholder*="destination" i]', 'input[placeholder*="place" i]',
    'input[placeholder*="go to" i]', 'input[aria-label*="search" i]',
  ];
  for (const s of sel) {
    for (const el of document.querySelectorAll(s)) if (!el.disabled) return el;
  }
  return null;
}
function typeAndSubmit(input, text) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  input.focus();
  setter.call(input, text);                                  // works with React/Vue bound inputs
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
  input.dispatchEvent(new KeyboardEvent('keydown', key));
  input.dispatchEvent(new KeyboardEvent('keypress', key));
  input.dispatchEvent(new KeyboardEvent('keyup', key));
  input.form?.requestSubmit?.();
  try { input.blur(); } catch {}                             // keep the soft keyboard down
}
function deliver(text) {
  const ev = new CustomEvent('gev:voice-transcript', { detail: { text }, cancelable: true });
  const handled = !document.dispatchEvent(ev);
  if (handled) return;
  if (window.gevSearch?.(text)) return;                     // optional app hook
  const box = findSearchBox();
  if (box) { typeAndSubmit(box, text); console.info('[GEV-Voice] searched:', text); gevCaption('Searching the map for ' + text); }
  else { console.warn('[GEV-Voice] no search box found for transcript:', text); speak('I heard ' + text + ', but I could not find the search box'); }
}

class NativeSpeechRecognition extends EventTarget {
  constructor() {
    super();
    this.lang = navigator.language || 'en-US';
    this.continuous = false; this.interimResults = false; this.maxAlternatives = 1;
    this.onstart = this.onend = this.onresult = this.onerror = this.onaudiostart = this.onspeechend = null;
    this._a = null;
  }
  _emit(type, extra = {}) {
    const ev = new Event(type); Object.assign(ev, extra);
    this.dispatchEvent(ev);
    try { this['on' + type]?.(ev); } catch (e) { console.warn(e); }
  }
  _result(text, isFinal) {
    const alt = { transcript: text, confidence: 0.9 };
    const res = Object.assign([alt], { isFinal, length: 1, item: (i) => res[i] });
    const list = Object.assign([res], { length: 1, item: (i) => list[i] });
    this._emit('result', { results: list, resultIndex: 0 });
  }
  start() {
    this._a = new NativeVoiceAdapter({
      language: this.lang,
      onPartial: (t) => { if (this.interimResults) this._result(t, false); },
      onTranscript: (t) => { this._result(t, true); if (!window.__gevNativeSession) deliver(t); },
      onError: (e) => this._emit('error', { error: /permission/i.test(e?.message) ? 'not-allowed' : 'network', message: String(e?.message || e) }),
      onStatus: (s) => { if (s === 'idle') this._emit('end'); },
    });
    this._emit('start'); this._emit('audiostart');
    this._a.start();
  }
  stop()  { this._a?.stop(); }
  abort() { this._a?.abort(); }
}

if (isNativeVoiceAvailable()) {
  window.SpeechRecognition = NativeSpeechRecognition;
  window.webkitSpeechRecognition = NativeSpeechRecognition;
  // route window.speechSynthesis.speak() through the native engine too
  try {
    window.__gevOrigSynth = window.speechSynthesis;
    const shim = {
      speak: (u) => { speak(u?.text ?? String(u), { lang: u?.lang, rate: u?.rate, pitch: u?.pitch })
                       .then(() => { try { u?.onend?.(new Event('end')); } catch {} }); },
      cancel: () => TextToSpeech.stop().catch(() => {}),
      pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, paused: false,
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: shim, configurable: true });
  } catch {}
  window.gevVoice = { deliver, findSearchBox, speak, Recognition: NativeSpeechRecognition };
  window.gevVoiceCaption = (t) => gevCaption(t);
  window.gevSpeak = speak;

  // The GEV mic is bound to Google speech recognition (background, no popup).
  const MIC = '#gev-voice-button, [data-gev-mic], .gev-voice-button';
  // Warm up as the finger lands, so the permission/availability check is done
  // by the time the tap completes and listening starts without a pause.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.(MIC)) warmUpVoice().catch(() => {});
  }, true);
  // Speaking cuts any reply that is still being read out, so the mic hears you.
  document.addEventListener('click', (e) => {
    if (e.target.closest?.(MIC)) TextToSpeech.stop().catch(() => {});
  }, true);

  // Fallback ONLY for a forked voice stack that is not native (e.g. a
  // preserved server-relayed session): if a tap that switches voice ON does
  // not start Google capture, capture here and fly/search directly. With the
  // native session (the default) this never runs — two owners of the
  // recognizer were what caused "already running" errors.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.(MIC);
    if (!btn || window.__gevNativeSession) return;
    const own = activeVoice();
    if (own?.__standalone) { own.stop(); return; }
    if (btn.getAttribute('aria-pressed') === 'true') return; // this tap turns voice off
    setTimeout(() => {
      if (window.__gevVoiceActive || window.__gevNativeSession) return;
      console.info('[GEV-Voice] app voice did not start Google capture — using standalone capture');
      const a = new NativeVoiceAdapter({
        onTranscript: (t) => {
          const dest = t.replace(/^(?:please\s+)?(?:go to|fly to|take me to|navigate to|search(?: for)?|find|show me|where is)\s+/i, '').trim();
          deliver(dest || t);
        },
        onError: (er) => gevCaption('Voice error: ' + (er?.message || er)),
      });
      a.__standalone = true;
      a.start();
    }, 500);
  }, true);
  console.info('[GEV-Voice] bridge installed (GEV mic -> Google speech, background)');
}
export { deliver };
JSVB
    ok "src/voice/voiceBridge.js written"

    local main_js; main_js="$(find_main_js)" || return 0
    python3 - "$main_js" <<'PYVB'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if "voice/voiceBridge.js" in s: print("  bridge already imported"); sys.exit(0)
lines = s.split("\n"); i = 0
while i < len(lines) and (lines[i].startswith("#!") or lines[i].startswith("//") or lines[i].strip() == "" or "embeddedApiProxy" in lines[i]):
    i += 1
lines.insert(i, "import './voice/voiceBridge.js'; // native speech-to-text (must load before voice code)")
p.write_text("\n".join(lines)); print("  bridge import inserted at line", i + 1)
PYVB
}

write_realtime_session() {
    mkdir -p src/voice
    # Keep the app's own (server-relayed Gemini Live) session for desktop/web.
    # Only a real Gemini Live session (it names GeminiRealtimeConnection) is saved; an
    # older generated native session must never overwrite the web fallback.
    if [ -f src/voice/realtimeSession.js ] && grep -q "GeminiRealtimeConnection" src/voice/realtimeSession.js \
       && ! grep -q "GEV-NATIVE-VOICE" src/voice/realtimeSession.js; then
        cp src/voice/realtimeSession.js src/voice/realtimeSession.gemini.js
        ok "Saved original voice session as src/voice/realtimeSession.gemini.js"
    fi
    if [ -f src/voice/realtimeSession.gemini.js ] && ! grep -q "GeminiRealtimeConnection" src/voice/realtimeSession.gemini.js; then
        local restored=0 cand
        for cand in HEAD:src/voice/realtimeSession.gemini.js HEAD:src/voice/realtimeSession.js; do
            if git show "$cand" 2>/dev/null | grep -q "GeminiRealtimeConnection" \
               && ! git show "$cand" 2>/dev/null | grep -q "GEV-NATIVE-VOICE"; then
                git show "$cand" > src/voice/realtimeSession.gemini.js
                ok "Restored the Gemini Live session for web from git ($cand)"
                restored=1; break
            fi
        done
        [ "$restored" = 1 ] || warn "src/voice/realtimeSession.gemini.js is not a Gemini session — web voice will not work"
    fi
    local fallback_import="const createGemini = null;"
    [ -f src/voice/realtimeSession.gemini.js ] && \
        fallback_import="import { createRealtimeSession as createGemini } from './realtimeSession.gemini.js';"
    {
    echo "// GEV-NATIVE-VOICE — generated by gids-android.sh"
    echo "$fallback_import"
    cat <<'JSRS'
import { NativeVoiceAdapter, isNativeVoiceAvailable } from './nativeVoice.js';

/*
 * Root cause (APK): the stock session streams mic audio to Gemini Live through
 * the app's own Node server (/api/realtime/gemini-session + same-origin
 * WebSocket). The APK has no server, so audio was captured ("listening") but
 * never transcribed. On Android the GEV mic drives Google speech recognition
 * in the background and runs the app's own voice actions (fly_to_location,
 * set_layer_visibility, control_ocean, GEO questions).
 *
 * Latency (v52): the destination is geocoded WHILE you are still speaking
 * (from Google's partial results), so when you stop talking the camera can
 * fly at once with coordinates instead of walking the app's geocoder chain.
 */
const LAYERS = [
  ['flights', /\b(live )?flights?\b|\bplanes?\b|\baircraft\b/], ['military', /\bmilitary\b/],
  ['satellites', /\bsatellites?\b/], ['ais-live-vessels', /\bvessels?\b|\bships?\b|\bboats?\b/],
  ['traffic', /\btraffic\b/], ['cctv', /\bcctv\b|\bcameras?\b/], ['radio', /\bradio\b/],
  ['bikeshare', /\bbikes?\b|\bbike ?share\b/], ['rocket-launches', /\blaunch(es)?\b|\brockets?\b/],
  ['earthquakes', /\bearthquakes?\b|\bquakes?\b/], ['local-firms', /\bwild ?fires?\b|\bfires?\b/],
  ['fire-perimeters', /\bfire perimeters?\b/], ['local-adsb', /\bads-?b\b/],
];
const DEST = /^(?:hey\s+\w+[, ]+)?(?:please\s+)?(?:can you\s+)?(?:go to|fly to|fly me to|take me to|navigate to|travel to|head to|zoom (?:in )?(?:to|on)|search(?: for)?|find|look up|locate|show me|where is|where's)\s+/i;
const ON = /\b(turn on|switch on|enable|show|display|activate)\b/;
const OFF = /\b(turn off|switch off|disable|hide|remove|deactivate)\b/;
const GLOBE = /\b(zoom out|whole globe|globe view|full globe|reset (the )?view)\b/;
// phrases that belong to GEO INTEL / ocean, never prefetched as a destination
const NOT_A_PLACE = /\b(nearest|closest|nearby|near me|route|directions|weather|air quality|pollen|time in|elevation|street view|dive|submarine|\bsub\b|ocean|sea ?floor|underwater)\b/i;

export function destinationOf(raw) {
  const text = String(raw || '').trim().replace(/[.!?]+$/, '');
  return text.replace(DEST, '').replace(/^the\s+/i, '').trim();
}
function isLayerCommand(t) {
  return (ON.test(t) || OFF.test(t)) && LAYERS.some(([, rx]) => rx.test(t));
}

// ---- destination prefetch (runs during speech) -----------------------------
const prefetches = new Map(); // dest(lower) -> Promise<place|null>
let prefetchTimer = 0;
function geocodeFast(dest) {
  const key = dest.toLowerCase();
  if (prefetches.has(key)) return prefetches.get(key);
  const svc = window.gevGeo?.services;
  if (!svc?.geocode || dest.length < 2) return Promise.resolve(null);
  const p = svc.geocode(dest, { limit: 1 })
    .then((r) => r?.data?.[0] || null)
    .catch(() => null);
  prefetches.set(key, p);
  while (prefetches.size > 40) prefetches.delete(prefetches.keys().next().value);
  return p;
}
export function prefetchFromPartial(partial) {
  const t = String(partial || '').toLowerCase();
  if (!DEST.test(partial) || NOT_A_PLACE.test(t) || isLayerCommand(t)) return;
  const dest = destinationOf(partial);
  if (dest.length < 3) return;
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => geocodeFast(dest), 120);
}
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

// A sensible camera distance for areas that are much bigger than a street
// (countries, states, islands). Cities and places keep the app's own close view.
function rangeFor(place) {
  const b = place?.bbox;
  const big = /(:country|:state|:region|:province|:island|:archipelago|:continent|:sea|:ocean|boundary:administrative)/.test(place?.kind || '');
  if (!big || !Array.isArray(b) || b.length !== 4) return null;
  const [w, s, e, n] = b.map(Number);
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (n - s) * rad, dLon = (e - w) * rad, mLat = ((n + s) / 2) * rad;
  const diag = R * Math.sqrt(dLat * dLat + Math.pow(dLon * Math.cos(mLat), 2));
  if (!Number.isFinite(diag) || diag < 20000) return null;
  return Math.min(Math.max(diag * 1.3, 20000), 8000000);
}

async function flyTo(dest, runAction) {
  const t0 = performance.now();
  // already resolved while you spoke? (else give the fast geocoder ~1.5 s)
  const place = await within(geocodeFast(dest), 1500);
  const geocodeWaitMs = Math.round(performance.now() - t0);
  const args = { query: dest, viewMode: 'close' };
  if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
    // preset cities (Tokyo, Paris, …) still win inside fly_to_location
    args.latitude = Math.max(-90, Math.min(90, place.lat));
    args.longitude = Math.max(-180, Math.min(180, place.lon));
    const r = rangeFor(place);
    if (r) args.rangeM = Math.round(r);
  }
  const r = await runAction('fly_to_location', args);
  const ms = Math.round(performance.now() - t0);
  window.__gevVoiceLatency = { dest, geocodeWaitMs, totalMs: ms, viaCoordinates: 'latitude' in args, fromSpeechEndMs:
    window.__gevVoiceTiming?.finalAt ? Math.round(performance.now() - window.__gevVoiceTiming.finalAt) : null };
  console.info('[GEV-Voice] fly_to_location', JSON.stringify(window.__gevVoiceLatency));
  if (r && r.ok === false) throw new Error(r.error || (r.cancelled ? 'cancelled' : 'not found'));
  return { say: `Flying to ${r?.label && !/^-?\d/.test(r.label) ? r.label : (place?.name || dest)}` };
}

async function interpret(raw, runAction) {
  const text = raw.trim().replace(/[.!?]+$/, '');
  const t = text.toLowerCase();
  // 1. instant, local commands
  try { const o = await interpretOcean(t, text, runAction); if (o) return o; }
  catch (e) { console.warn('[GEV-Voice] control_ocean failed:', e?.message || e); }
  if (ON.test(t) || OFF.test(t)) {
    const hit = LAYERS.find(([, rx]) => rx.test(t));
    if (hit) {
      const off = OFF.test(t);
      await runAction('set_layer_visibility', { layerId: hit[0], enabled: !off });
      return { say: `${off ? 'Hiding' : 'Showing'} ${hit[0].replace(/-/g, ' ')}` };
    }
  }
  if (GLOBE.test(t)) {
    await runAction('zoom_to_globe', {});
    return { say: 'Back to the full globe' };
  }
  // 2. GEO INTEL questions (nearest X, directions, weather, …) — returns null otherwise
  if (NOT_A_PLACE.test(t) || /\b(how far|distance|what'?s at|what is at)\b/.test(t)) {
    try { const g = await window.gevGeo?.ask?.(text); if (g) return g; }
    catch (e) { console.warn('[GEV-Voice] geo failed:', e?.message || e); }
  }
  // 3. anything else is a destination
  const dest = destinationOf(text);
  if (!dest) return { say: 'Where should I go?' };
  try {
    return await flyTo(dest, runAction);
  } catch (e) {
    if (e?.name === 'AbortError') return null;
    console.warn('[GEV-Voice] fly_to_location failed, typing into search:', e?.message || e);
    window.gevVoice?.deliver?.(dest);
    return { say: `Searching the map for ${dest}` };
  }
}

// control_ocean (ocean integration): arguments are built from the app's own
// schema so this keeps working whatever the parameter names are.
let OCEAN_SCHEMA = null;
import('./actionSchemas.js').then(m => {
  OCEAN_SCHEMA = (m.GEV_ACTION_SCHEMAS || []).find(x => x.name === 'control_ocean')?.parameters || null;
  if (OCEAN_SCHEMA) console.info('[GEV-Voice] control_ocean available');
}).catch(() => {});
const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
function oceanArgs(intent, value) {
  const props = OCEAN_SCHEMA?.properties || {};
  const words = { dive: ['dive', 'setdepth', 'depth', 'descend', 'godepth'], goto: ['goto', 'travel', 'site', 'divesite', 'navigate', 'flyto', 'move'],
                  launch: ['launch', 'deploy', 'start', 'spawn'], recall: ['recall', 'surface', 'stop', 'dock', 'exit'],
                  on: ['on', 'enable', 'show', 'oceanon', 'start'], off: ['off', 'disable', 'hide', 'oceanoff'] }[intent] || [intent];
  const args = {};
  for (const [name, def] of Object.entries(props)) {
    const n = norm(name);
    if (Array.isArray(def.enum) && /action|command|op|mode|verb|intent/.test(n)) {
      args[name] = def.enum.find(e => words.includes(norm(e))) || def.enum.find(e => words.some(w => norm(e).includes(w))) || def.enum[0];
    } else if (intent === 'dive' && /depth|meter|metre|altitude/.test(n) && /number|integer/.test(def.type)) {
      args[name] = (def.maximum !== undefined && def.maximum <= 0) ? -Math.abs(value) : Math.abs(value);
    } else if (intent === 'goto' && /site|location|target|destination|place|query|name/.test(n)) {
      args[name] = Array.isArray(def.enum) ? (def.enum.find(e => norm(e).includes(norm(value)) || norm(value).includes(norm(e))) || def.enum[0]) : value;
    } else if ((intent === 'on' || intent === 'off') && /enabled|visible|on/.test(n) && def.type === 'boolean') {
      args[name] = intent === 'on';
    }
  }
  return args;
}
async function interpretOcean(t, text, runAction) {
  if (!OCEAN_SCHEMA) return null;
  let m;
  if ((m = t.match(/\b(?:dive|descend|go down|sub(?:marine)? (?:to|at))\s*(?:to\s*)?(\d[\d,.]*)\s*(m|meters?|metres?|ft|feet)?\b/))) {
    let v = parseFloat(m[1].replace(/,/g, '')); if (/^f/.test(m[2] || '')) v *= 0.3048;
    await runAction('control_ocean', oceanArgs('dive', Math.round(v)));
    return { say: `Diving to ${Math.round(v)} meters` };
  }
  if ((m = text.match(/\b(?:take|send|move|drive|bring)\s+(?:the\s+)?sub(?:marine)?\s+to\s+(.+)$/i))) {
    await runAction('control_ocean', oceanArgs('goto', m[1].trim()));
    return { say: `Taking the sub to ${m[1].trim()}` };
  }
  if (/\b(launch|deploy|start)\s+(the\s+)?sub(marine)?\b/.test(t)) { await runAction('control_ocean', oceanArgs('launch')); window.gevSubPad?.show(true); return { say: 'Submarine launched' }; }
  if (/\b(recall|surface|stop|park)\s+(the\s+)?sub(marine)?\b/.test(t)) { await runAction('control_ocean', oceanArgs('recall')); window.gevSubPad?.show(false); return { say: 'Submarine recalled' }; }
  if (/\b(ocean|sea ?floor|underwater)\b/.test(t) && /\b(on|show|enable|view)\b/.test(t)) { await runAction('control_ocean', oceanArgs('on')); return { say: 'Ocean view on' }; }
  if (/\b(ocean|sea ?floor|underwater)\b/.test(t) && /\b(off|hide|disable)\b/.test(t)) { await runAction('control_ocean', oceanArgs('off')); return { say: 'Ocean view off' }; }
  return null;
}

export function createRealtimeSession(options) {
  if (!isNativeVoiceAvailable() && createGemini) return createGemini(options);
  window.__gevNativeSession = true;
  const { emit, runAction } = options;
  let adapter = null;
  const say = (s) => {
    if (!s) return;
    emit({ type: 'transcript', role: 'assistant', text: s, final: true });
    window.gevVoiceCaption?.(s);
    try { window.gevSpeak?.(s); } catch {} // not awaited: speech never delays the flight
  };
  async function handle(text) {
    if (!text) return;
    emit({ type: 'transcript', role: 'user', text, final: true });
    emit({ type: 'state', state: 'executing', detail: text });
    console.info('[GEV-Voice] command:', text);
    try { const r = await interpret(text, runAction); say(r?.say); }
    catch (e) { if (e?.name !== 'AbortError') say('Sorry, ' + (e?.message || 'that did not work')); }
    emit({ type: 'completion' });
  }
  return {
    capabilities: { pushToTalk: false, provider: 'native-google' },
    async start() {
      adapter = new NativeVoiceAdapter({
        onPartial: (t) => { prefetchFromPartial(t); emit({ type: 'transcript', role: 'user', text: t, final: false }); },
        onTranscript: (t) => { handle(t).finally(() => emit({ type: 'state', state: 'idle', detail: 'Ready' })); },
        onStatus: (s, m) => {
          if (s === 'listening') emit({ type: 'state', state: 'listening', detail: m });
          // nothing heard / no connection: back to idle quietly (no error tray)
          else if (s === 'idle' && !/^Heard: /.test(m || '')) emit({ type: 'state', state: 'idle', detail: m });
        },
        onError: (e) => emit({ type: 'state', state: 'error', detail: String(e?.message || e) }),
      });
      await adapter.start();
    },
    stop(opts = {}) { try { opts.removeUi ? adapter?.abort() : adapter?.stop(); } catch {} },
    sendText: (t) => handle(String(t || '')),
    sendMapEvent() {},
    ignoreButtonClick: () => false,
    bindControls() {},
  };
}
JSRS
    } > src/voice/realtimeSession.js
    ok "src/voice/realtimeSession.js -> native on-device voice (Gemini kept for web)"
}

# installed @capacitor/core major (falls back to package.json, then CAP_VERSION_MAJOR)
cap_major() {
    local v=""
    [ -f node_modules/@capacitor/core/package.json ] && \
        v="$(node -p "require('./node_modules/@capacitor/core/package.json').version" 2>/dev/null)"
    [ -z "$v" ] && [ -f package.json ] && \
        v="$(node -p "(require('./package.json').dependencies||{})['@capacitor/core']||''" 2>/dev/null)"
    v="${v#^}"; v="${v#~}"; v="${v%%.*}"
    [[ "$v" =~ ^[0-9]+$ ]] && echo "$v" || echo "$CAP_VERSION_MAJOR"
}
# install (or fix the version of) a Capacitor plugin; never aborts the build
ensure_plugin() {
    local pkg="$1" range="$2" want="${2#^}" have=""
    [ -f "node_modules/$pkg/package.json" ] && \
        have="$(node -p "require('./node_modules/$pkg/package.json').version.split('.')[0]" 2>/dev/null)"
    if [ "$have" = "$want" ]; then ok "$pkg@$have already present"; return 0; fi
    [ -n "$have" ] && warn "$pkg v$have does not match Capacitor — reinstalling @$range"
    info "Installing $pkg@$range ..."
    npm install --save "$pkg@$range" --no-audit --no-fund || \
        warn "$pkg install failed — voice falls back to WebView APIs (build continues)"
}

apply_voice_patches() {
    info "Voice patches (PRESERVE_REALTIME_SESSION=$PRESERVE_REALTIME_SESSION) ..."
    # Native plugins must match the project's Capacitor major (6, 7 or 8).
    local capm; capm="$(cap_major)"
    local tts_range speech_range
    case "$capm" in
        8) tts_range="^8"; speech_range="^8" ;;
        7) tts_range="^6"; speech_range="^7" ;;
        *) tts_range="^5"; speech_range="^6" ;;
    esac
    info "Capacitor $capm detected -> $SPEECH_PLUGIN@$speech_range, $TTS_PLUGIN@$tts_range"
    ensure_plugin "$SPEECH_PLUGIN" "$speech_range"
    ensure_plugin "$TTS_PLUGIN" "$tts_range"
    apply_google_recognizer
    if ! grep -q "$MAPILLARY_VIEWER_PKG" package.json 2>/dev/null; then
        info "Installing $MAPILLARY_VIEWER_PKG ..."
        npm install --save "$MAPILLARY_VIEWER_PKG" || warn "MapillaryJS install failed"
    else ok "$MAPILLARY_VIEWER_PKG already present"; fi
    write_native_voice
    write_voice_bridge
    if [ "$PRESERVE_REALTIME_SESSION" = "0" ]; then
        write_realtime_session
    elif [ -f src/voice/realtimeSession.js ]; then
        warn "Preserving stock voice session — it needs the Node server and will NOT work in the APK"
    else
        write_realtime_session
    fi
    npx cap sync android >/dev/null 2>&1 || warn "cap sync reported an issue"
    ok "Voice patches complete"
}

apply_cesium_mobile_optimizations() {
    local mobile_file="src/mobile.js"
    [ -f "$mobile_file" ] && { ok "Mobile tuning module present."; return 0; }
    info "Creating $mobile_file ..."
    mkdir -p src
    cat > "$mobile_file" <<'JSMOB'
function isCapacitorNative() {
  return Boolean(typeof window !== 'undefined' &&
    (window.Capacitor?.isNativePlatform?.() ||
     window.Capacitor?.platform === 'android' ||
     window.Capacitor?.platform === 'ios'));
}
function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  return (navigator.deviceMemory || 4) <= 3 || (navigator.hardwareConcurrency || 4) <= 4;
}
export function applyMobileTuning(viewer) {
  if (!viewer) return;
  const native = isCapacitorNative();
  const low = isLowEndDevice();
  if (!native && !low) return;
  viewer.resolutionScale = 1.0;
  viewer.scene.globe.maximumScreenSpaceError = 4;
  viewer.scene.globe.tileCacheSize = 100;
  if (viewer.scene.fog) viewer.scene.fog.enabled = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.highDynamicRange = false;
  viewer.scene.postProcessStages.fxaa.enabled = false;
  if (viewer.scene.msaaSamples !== undefined) viewer.scene.msaaSamples = 1;
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;
  const c = viewer.scene.screenSpaceCameraController;
  c.minimumZoomDistance = 10;
  c.maximumZoomDistance = 20000000;
  c.inertiaSpin = 0.7;
  c.inertiaTranslate = 0.7;
  c.inertiaZoom = 0.6;
  document.addEventListener('visibilitychange', () => {
    viewer.useDefaultRenderLoop = !document.hidden;
    if (!document.hidden) viewer.scene.requestRender();
  });
  console.info('[Gids Eyes View] Mobile tuning applied (native=' + native + ', lowEnd=' + low + ')');
}
JSMOB
    ok "src/mobile.js created."
}

# =============================================================================
#  RELEASE SIGNING
# =============================================================================
verify_release_signing() {
    local app_gradle=""
    for cand in android/app/build.gradle android/app/build.gradle.kts; do
        [ -f "$cand" ] && app_gradle="$cand" && break
    done
    if [ -z "$app_gradle" ]; then
        warn "No app-level Gradle file found — cannot verify signing."
        return 0
    fi
    if grep -qE 'signingConfigs|signingConfig ' "$app_gradle"; then
        ok "Signing config present in $app_gradle"
    else
        warn "No release signing config found in $app_gradle"
        warn "  The AAB will be unsigned or debug-signed. Set up a keystore:"
        warn "  keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias gids"
        warn "  Then add signingConfigs.release to $app_gradle."
    fi
    if [ -f android/keystore.properties ]; then
        ok "android/keystore.properties present."
    else
        warn "android/keystore.properties not found — release may use debug signing."
    fi
}

# =============================================================================
#  OCEAN INTEGRATION  (ocean view, exploration submarine, ocean toolchain)
#  Applies gev-ocean-integration.patch (preferred: keeps .env + local files) or
#  falls back to gids-eye-view-ocean.zip (full project, keys removed).
#  Search order: --ocean-patch= / --ocean-zip= / $GEV_OCEAN_PATCH / $GEV_OCEAN_ZIP
#                ./  script dir  ~/Downloads  ~
# =============================================================================

find_ocean_file() {   # $1 = explicit path, $2 = default filename
    local explicit="$1" name="$2" d
    if [ -n "$explicit" ]; then [ -f "$explicit" ] && { printf '%s' "$explicit"; return 0; }; return 1; fi
    for d in "." "$(cd "$(dirname "$0")" && pwd)" "$HOME/Downloads" "$HOME"; do
        [ -f "$d/$name" ] && { printf '%s' "$d/$name"; return 0; }
    done
    return 1
}
ocean_applied() {
    [ -f docs/OCEAN.md ] && grep -rqs "control_ocean" src/ 2>/dev/null
}
ocean_env() {
    [ -f .env ] || : > .env
    write_env_key_if_unset "CESIUM_BATHYMETRY_ENABLED"  "true"
    write_env_key_if_unset "CESIUM_BATHYMETRY_ASSET_ID" "$BATHYMETRY_ASSET_ID"
    write_env_key_if_unset "GEBCO_WMS_ENABLED"          "true"
    write_env_key_if_unset "VITE_CESIUM_BATHYMETRY_ASSET_ID" "$BATHYMETRY_ASSET_ID"
    ok "Bathymetry flags in .env (asset $BATHYMETRY_ASSET_ID)"
}
apply_ocean_patch() {
    local pf="$1" ts; ts="$(date +%Y%m%d-%H%M%S)"
    command -v patch >/dev/null 2>&1 || die "'patch' not installed (sudo apt install patch)."
    if patch -p1 -R --dry-run -s -f < "$pf" >/dev/null 2>&1; then
        ok "Ocean patch already applied."; return 0
    fi
    local filtered=""
    if ! patch -p1 --forward --dry-run -s < "$pf" >/dev/null 2>&1; then
        # Drop file sections that are already applied (e.g. a dependency you added
        # by hand), then retry with the rest.
        filtered="$(mktemp)"
        python3 - "$pf" "$filtered" <<'PYOCEAN'
import re, subprocess, sys
src, dst = sys.argv[1], sys.argv[2]
parts = re.split(r'(?m)^(?=diff -ruN )', open(src).read())
keep, skipped = [], []
for part in parts:
    if part.startswith('diff ') and subprocess.run(
            ['patch', '-p1', '-R', '--dry-run', '-s', '-f'], input=part, text=True,
            capture_output=True).returncode == 0:
        skipped.append(part.split('\n', 1)[0].rsplit(' b/', 1)[-1])
    else:
        keep.append(part)
open(dst, 'w').write(''.join(keep))
for f in skipped:
    print('  already applied, skipping:', f)
PYOCEAN
        if patch -p1 --forward --dry-run -s < "$filtered" >/dev/null 2>&1; then
            pf="$filtered"
        else
            warn "Ocean patch does not apply cleanly. Dry-run output:"
            patch -p1 --forward --dry-run < "$filtered" | tail -15
            rm -f "$filtered"
            die "Resolve the conflicts above (or use $OCEAN_ZIP_NAME)."
        fi
    fi
    # back up every file the patch touches
    mkdir -p .gev-backup
    local files; files="$(grep -E '^\+\+\+ b/' "$pf" | sed -E 's#^\+\+\+ b/##; s#\t.*$##' | sort -u)"
    # shellcheck disable=SC2086
    tar -czf ".gev-backup/pre-ocean-$ts.tgz" $(for f in $files; do [ -e "$f" ] && printf '%s ' "$f"; done) 2>/dev/null || true
    ok "Backup of touched files: .gev-backup/pre-ocean-$ts.tgz"
    patch -p1 --forward -s < "$pf" || die "patch failed."
    if find . -name '*.rej' -newer "$pf" -not -path './node_modules/*' | grep -q .; then
        die "patch left .rej files — inspect them."
    fi
    ok "Applied the ocean patch ($(printf '%s\n' "$files" | grep -c .) files)."
    [ -n "$filtered" ] && rm -f "$filtered"
    return 0
}
apply_ocean_zip() {
    local zf="$1" tmp src ts; ts="$(date +%Y%m%d-%H%M%S)"
    command -v unzip >/dev/null 2>&1 || die "'unzip' not installed."
    tmp="$(mktemp -d)"; unzip -q "$zf" -d "$tmp" || die "unzip failed."
    src="$tmp"
    if [ ! -f "$src/package.json" ]; then
        local pj; pj="$(find "$tmp" -maxdepth 3 -name package.json -not -path '*/node_modules/*' | head -1)"
        [ -n "$pj" ] || { rm -rf "$tmp"; die "No package.json inside $zf — not a gids-eye-view project zip."; }
        src="$(dirname "$pj")"
    fi
    mkdir -p ".gev-backup/pre-ocean-$ts"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --backup --backup-dir=".gev-backup/pre-ocean-$ts" \
            --exclude '.env' --exclude '.env.*' --exclude 'node_modules/' --exclude 'dist/' \
            --exclude 'android/' --exclude '.git/' --exclude 'gids-keys.env' "$src/" ./
    else
        ( cd "$src" && tar -cf - --exclude=.env --exclude='.env.*' --exclude=node_modules --exclude=dist --exclude=android . ) | tar -xf -
    fi
    rm -rf "$tmp"
    ok "Merged $(basename "$zf") (your .env, keys, android/ untouched; replaced files in .gev-backup/pre-ocean-$ts)"
}
do_ocean() {   # $1 = "auto" -> silent no-op when nothing to apply
    local mode="${1:-}" pf zf
    [ -f package.json ] || die "Run from the gids-eye-view project root."
    if ocean_applied; then
        ok "Ocean integration present (docs/OCEAN.md, control_ocean)."
    elif pf="$(find_ocean_file "$OCEAN_PATCH_ARG" "$OCEAN_PATCH_NAME")"; then
        info "Applying ocean patch: $pf"; apply_ocean_patch "$pf"
    elif zf="$(find_ocean_file "$OCEAN_ZIP_ARG" "$OCEAN_ZIP_NAME")"; then
        info "Patch not found — merging ocean project zip: $zf"; apply_ocean_zip "$zf"
    else
        [ "$mode" = "auto" ] && return 0
        die "Neither $OCEAN_PATCH_NAME nor $OCEAN_ZIP_NAME found (looked in ., script dir, ~/Downloads, ~). Use --ocean-patch=PATH."
    fi
    ocean_env
    if [ "$mode" != "auto" ]; then
        info "Installing dependencies ..."
        npm install --no-audit --no-fund || warn "npm install reported problems"
    fi
    if [ "$OCEAN_TOOLS" = "1" ]; then
        if [ -f scripts/install-ocean-tools.sh ]; then
            info "Installing ocean toolchain (desktop/Python — not part of the APK) ..."
            bash scripts/install-ocean-tools.sh || warn "Ocean toolchain installer reported problems (see docs/OCEAN.md)"
        else warn "scripts/install-ocean-tools.sh missing — apply the ocean patch first."; fi
    fi
    info "Real seafloor depths: add 'Cesium World Bathymetry' (asset $BATHYMETRY_ASSET_ID) to My Assets"
    info "  https://ion.cesium.com/assetdepot/$BATHYMETRY_ASSET_ID  (without it the sub uses a flat 10,935 m limit)"
    [ "$mode" = "auto" ] || ok "Ocean ready. Phone: 🌊 Ocean / 🛥 Sub orbs + touch pad. Desktop: npm run dev"
}

# =============================================================================
#  GEO INTEL  (src/geo — geospatial search, routing, environment, imagery)
#  The module ships inside this script (payload at the end). --geo installs or
#  updates it with a backup; --geo-remove restores the backup. --build installs
#  it automatically unless GEV_GEO=0. Docs: docs/GEO.md
# =============================================================================
geo_payload() {   # stream the embedded tar.gz
    awk '/^__GEV_GEO_PAYLOAD_BEGIN__$/{f=1;next} /^__GEV_GEO_PAYLOAD_END__$/{f=0} f' "$0" | base64 -d
}
geo_payload_version() { geo_payload | tar -xzO src/geo/VERSION 2>/dev/null | tr -d '[:space:]'; }

geo_hook_main() {
    local main_js; main_js="$(find_main_js)" || { warn "main.js not found — add: import './geo/boot.js';"; return 0; }
    python3 - "$main_js" <<'PYGEO'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if "geo/boot.js" in s: print("  geo import already present"); sys.exit(0)
line = "import './geo/boot.js'; // GEV-GEO: optional geo intelligence (VITE_GEO_ENABLED=false disables)"
lines = s.split("\n")
idx = max([i for i, l in enumerate(lines[:80]) if l.startswith("import ")] or [-1]) + 1
lines.insert(idx, line); p.write_text("\n".join(lines)); print("  geo import added at line", idx + 1)
PYGEO
}
geo_hook_viewer() {
    local f="src/app/viewer.js"
    [ -f "$f" ] || { warn "$f not found — globe overlays disabled (panel still works)"; return 0; }
    python3 - "$f" <<'PYVIEW'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if "__gevViewer" in s: print("  viewer hook already present"); sys.exit(0)
i = s.find("new Cesium.Viewer(")
if i < 0: print("  WARN: no 'new Cesium.Viewer(' — globe overlays disabled"); sys.exit(0)
j = s.find("\n  });\n", i)
if j < 0: print("  WARN: viewer block end not found — globe overlays disabled"); sys.exit(0)
j += len("\n  });\n")
s = s[:j] + "  globalThis.__gevViewer = viewer; // GEV-GEO: overlays reuse this viewer\n" + s[j:]
p.write_text(s); print("  viewer hook added")
PYVIEW
}
# Zero-size render guard (fixes "DeveloperError: Expected width to be greater
# than 0 … Rendering has stopped" when the canvas collapses to ~1 px while the
# resolution scale is < 1). Independent of GEO; always applied by --build.
apply_render_guard() {
    [ -f package.json ] || die "Run from the project root."
    [ -f src/app/viewer.js ] || { warn "src/app/viewer.js not found — render guard skipped"; return 0; }
    geo_payload | tar -xzf - src/app/renderGuard.js src/app/renderGuard.test.mjs 2>/dev/null \
        || die "Render guard missing from the embedded payload."
    python3 - <<'PYGUARD'
import json, pathlib, re
v = pathlib.Path("src/app/viewer.js"); s = v.read_text()
if "installZeroSizeRenderGuard(viewer)" not in s:
    i = s.find("new Cesium.Viewer(")
    j = s.find("\n  });\n", i) if i >= 0 else -1
    if j < 0:
        print("  WARN: viewer creation not found — guard not wired"); raise SystemExit(0)
    j += len("\n  });\n")
    s = s[:j] + "  installZeroSizeRenderGuard(viewer); // GEV-GUARD: no frames into a 0-px buffer\n" + s[j:]
    lines = s.split("\n")
    idx = max(k for k, l in enumerate(lines[:80]) if l.startswith("import "))
    while not lines[idx].rstrip().endswith(";"): idx += 1
    lines.insert(idx + 1, "import { installZeroSizeRenderGuard } from './renderGuard.js'; // GEV-GUARD")
    v.write_text("\n".join(lines)); print("  render guard wired into src/app/viewer.js")
else:
    print("  render guard already wired")
# register the module with the package-boundary manifest (repo check)
pb = pathlib.Path("scripts/package-boundaries.json")
if pb.exists():
    t = pb.read_text()
    if "src/app/renderGuard.js" not in t:
        t2 = re.sub(r'("src/app/viewer\.js"\s*,)(\s*)', lambda m: m.group(1) + m.group(2) + '"src/app/renderGuard.js",' + m.group(2), t)
        try:
            json.loads(t2); pb.write_text(t2); print("  renderGuard.js registered in package-boundaries.json")
        except ValueError:
            print("  WARN: could not register renderGuard.js in package-boundaries.json (add it next to src/app/viewer.js)")
PYGUARD
    if [ -f scripts/package-boundaries.json ] && [ -x node_modules/.bin/prettier ]; then
        node_modules/.bin/prettier --write scripts/package-boundaries.json >/dev/null 2>&1 || true
    fi
    ok "Render guard in place (src/app/renderGuard.js)"
}

do_geo() {   # $1 = auto -> quiet, skip when current
    local mode="${1:-}" have want ts
    [ -f package.json ] || die "Run from the gids-eye-view project root."
    if [ "${GEV_GEO:-1}" = "0" ] && [ "$mode" = "auto" ]; then info "GEO skipped (GEV_GEO=0)"; return 0; fi
    want="$(geo_payload_version)"; [ -n "$want" ] || die "GEO payload missing from $(basename "$0")."
    have=""; [ -f src/geo/VERSION ] && have="$(tr -d '[:space:]' < src/geo/VERSION)"
    if [ "$have" = "$want" ] && [ "$mode" = "auto" ]; then
        ok "GEO module v$have present"
    else
        ts="$(date +%Y%m%d-%H%M%S)"; mkdir -p .gev-backup
        local keep=""; for f in src/geo docs/GEO.md src/main.js src/app/viewer.js; do [ -e "$f" ] && keep="$keep $f"; done
        # shellcheck disable=SC2086
        [ -n "$keep" ] && tar -czf ".gev-backup/pre-geo-$ts.tgz" $keep 2>/dev/null && ok "Backup: .gev-backup/pre-geo-$ts.tgz"
        rm -rf src/geo
        geo_payload | tar -xzf - || die "GEO payload extraction failed."
        ok "GEO module v$want installed (src/geo, docs/GEO.md)"
    fi
    geo_hook_main
    geo_hook_viewer
    apply_render_guard
    [ -f .env ] || : > .env
    write_env_key_if_unset "VITE_GEO_ENABLED" "true"
    # foreground location for "near me" / routes from my position (consent-gated in the UI)
    local capm; capm="$(cap_major)"
    if [ -d android ] || grep -q '"@capacitor/core"' package.json 2>/dev/null; then
        ensure_plugin "@capacitor/geolocation" "^$capm"
    fi
    if [ "$mode" != "auto" ] && command -v node >/dev/null 2>&1; then
        info "Running GEO unit tests ..."
        node --test src/geo/geo.test.mjs src/geo/intents.test.mjs 2>&1 | grep -E '^# (pass|fail)|^ℹ (pass|fail)' || true
    fi
}
do_geo_remove() {
    [ -f package.json ] || die "Run from the project root."
    local last; last="$(ls -t .gev-backup/pre-geo-*.tgz 2>/dev/null | head -1)"
    rm -rf src/geo docs/GEO.md
    python3 - <<'PYRM'
import pathlib
for f, needle in (("src/main.js", "geo/boot.js"), ("src/app/viewer.js", "__gevViewer")):
    p = pathlib.Path(f)
    if p.exists():
        s = p.read_text(); n = "\n".join(l for l in s.split("\n") if needle not in l)
        if n != s: p.write_text(n); print("  unhooked", f)
PYRM
    write_env_key "VITE_GEO_ENABLED" "false"
    ok "GEO removed (VITE_GEO_ENABLED=false; render guard kept).${last:+ Earlier files are in $last}"
}

# =============================================================================
#  BUILD PIPELINE
# =============================================================================
build_web() {
    info "Building web bundle ..."
    [ -f package.json ] || die "package.json not found."
    if [ -f package-lock.json ]; then
        npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund || die "npm install failed."
    else
        npm install --no-audit --no-fund || die "npm install failed."
    fi
    npm run build || die "npm run build failed."
    [ -d "$WEB_DIR" ] || die "$WEB_DIR not produced."
    ok "Web assets ready."
}
sync_android() {
    [ -d android ] || die "android/ missing. Run --init first."
    npx cap sync android || die "cap sync failed."
    ok "Sync complete."
}
gradlew() {
    if [ "$DETECTED_OS" = "Windows" ] && [ -f "android/gradlew.bat" ]; then
        ( cd android && ./gradlew.bat "$@" )
    elif [ -x "android/gradlew" ]; then
        ( cd android && ./gradlew "$@" )
    else
        die "Gradle wrapper not found."
    fi
}
verify_bundle_markers() {
    local bundle
    bundle="$(ls -t dist/assets/index-*.js 2>/dev/null | head -1)"
    if [ -z "$bundle" ]; then warn "No JS bundle found in dist/assets — skipping marker scan."; return 0; fi
    local FAILED=0
    check_marker() {
        if grep -q "$1" "$bundle" 2>/dev/null; then ok "$2 present."
        else fail "$2 MISSING."; FAILED=$((FAILED+1)); fi
    }
    check_marker "sat-root"           "Satellite FAB root"
    check_marker "sat-drawer"         "Satellite drawer"
    check_marker "gev:layer-request"  "Layer request event"
    check_marker "gevSatFab"          "gevSatFab API"
    check_marker "rail-col"           "Rail FAB column"
    check_marker "rail-sheet"         "Rail panel sheet"
    # function names are minified away; the guard's log text survives
    check_marker "\[Cesium\] renderError" "Cesium guard"
    check_marker "APK-Proxy"          "Embedded API proxy"
    check_marker "GEV-Voice"          "Native voice bridge"
    (( FAILED > 0 )) && warn "$FAILED marker(s) missing from bundle — inspect $bundle"
    return 0
}
do_build() {
    command -v node >/dev/null 2>&1 || die "Node.js not found."
    do_init
    do_keys
    do_ocean auto
    apply_render_guard
    do_geo auto
    apply_voice_patches
    apply_mobile_ui_patches
    apply_cesium_guard
    apply_native_fetch
    apply_apk_proxy
    apply_layer_diagnostics
    apply_cesium_mobile_optimizations
    do_icon
    build_web
    sync_android
    apply_local_properties

    info "Running Gradle assembleDebug ..."
    gradlew assembleDebug || die "Gradle assembleDebug failed."
    local apk="android/app/build/outputs/apk/debug/app-debug.apk"
    [ -f "$apk" ] || die "APK not found."

    info "Post-build verification ..."
    verify_bundle_markers
    ok "Debug APK: $apk ($(du -h "$apk" | cut -f1))"
}
do_release() {
    command -v node >/dev/null 2>&1 || die "Node.js not found."
    require_java || die "Java 17/21 required."
    [ -d android ] || die "android/ missing. Run --init first."
    do_keys; apply_voice_patches; apply_mobile_ui_patches
    apply_cesium_guard; apply_native_fetch; apply_apk_proxy
    apply_cesium_mobile_optimizations
    do_icon
    build_web; sync_android; apply_local_properties
    verify_bundle_markers
    verify_release_signing
    info "Building release AAB ..."
    gradlew bundleRelease || die "Gradle bundleRelease failed."
    local aab="android/app/build/outputs/bundle/release/app-release.aab"
    [ -f "$aab" ] || die "AAB not found."
    ok "Release AAB: $aab ($(du -h "$aab" | cut -f1))"
    warn "Verify signing before distribution: jarsigner -verify -verbose $aab | head"
}
do_install() {
    require_android_sdk || die "ANDROID_HOME not set."
    command -v adb >/dev/null 2>&1 || die "adb not on PATH."
    local apk="android/app/build/outputs/apk/debug/app-debug.apk"
    [ -f "$apk" ] || die "Debug APK not found. Run --build first."
    cp "$apk" ~/storage/downloads/gids-eye-view.apk 2>/dev/null && \
        ok "Copied to ~/storage/downloads/gids-eye-view.apk" || true
    adb kill-server >/dev/null 2>&1 || true
    adb start-server >/dev/null 2>&1 || warn "adb daemon failed to start"
    adb devices
    adb install -r "$apk" || die "adb install failed."
    ok "Installed."
    adb shell pm grant "$APP_ID" android.permission.RECORD_AUDIO >/dev/null 2>&1 && ok "Microphone permission pre-granted" || true
    info "First time on this phone? Run ./$(basename "$0") --voice-setup"
}
# Installs/configures on the connected phone (adb):
#   * Speech Recognition & Synthesis (com.google.android.tts): TTS + on-device STT
#   * Google app (com.google.android.googlequicksearchbox): recognizer + Digital assistant
# Missing apps open in the Play Store (Play apps can't be sideloaded by adb).
do_voice_setup() {
    command -v adb >/dev/null 2>&1 || die "adb not on PATH."
    adb start-server >/dev/null 2>&1 || true
    [ "$(adb devices | grep -c 'device$')" -gt 0 ] || die "No device connected."
    has_pkg() { adb shell pm list packages 2>/dev/null | tr -d '\r' | grep -qx "package:$1"; }
    local need=0 pkg label
    for pkg in "$GOOGLE_TTS_PKG" "$GOOGLE_APP_PKG"; do
        if [ "$pkg" = "$GOOGLE_TTS_PKG" ]; then label="Speech Recognition & Synthesis"; else label="Google app (Digital assistant)"; fi
        if has_pkg "$pkg"; then
            ok "$label installed"
            adb shell pm enable "$pkg" >/dev/null 2>&1 || true
        else
            warn "$label missing — opening Play Store on the phone"
            adb shell am start -a android.intent.action.VIEW -d "market://details?id=$pkg" >/dev/null 2>&1 || \
            adb shell am start -a android.intent.action.VIEW -d "https://play.google.com/store/apps/details?id=$pkg" >/dev/null 2>&1 || true
            need=1
        fi
    done
    if (( need )); then
        info "Tap Install on the phone, then re-run: ./$(basename "$0") --voice-setup"
        return 0
    fi

    info "Setting Google as speech engine, recognizer and digital assistant ..."
    adb shell settings put secure tts_default_synth "$GOOGLE_TTS_PKG" && ok "TTS engine = Speech Recognition & Synthesis"
    local rec vis prev svcs
    prev=$(adb shell settings get secure voice_recognition_service 2>/dev/null | tr -d '\r')
    svcs=$(adb shell cmd package query-services -a android.speech.RecognitionService 2>/dev/null | tr -d '\r')
    # same preference as the app (GevRecognizer.java): Google app, then Speech Services
    rec=$(grep -oE "${GOOGLE_APP_PKG}/[A-Za-z0-9_.]+" <<<"$svcs" | head -1)
    [ -z "$rec" ] && rec=$(grep -oE "${GOOGLE_TTS_PKG}/[A-Za-z0-9_.]+" <<<"$svcs" | head -1)
    [ -z "$rec" ] && rec="${GOOGLE_APP_PKG}/com.google.android.voicesearch.serviceapi.GoogleRecognitionService"
    if [ -n "$prev" ] && [ "$prev" != "null" ] && [ "$prev" != "$rec" ]; then
        info "Previous speech recognizer: $prev"
        info "  (restore with: adb shell settings put secure voice_recognition_service $prev)"
    fi
    adb shell settings put secure voice_recognition_service "$rec" && ok "Speech recognizer = $rec"
    vis=$(adb shell cmd package query-services -a android.service.voice.VoiceInteractionService 2>/dev/null | tr -d '\r' \
          | grep -oE "${GOOGLE_APP_PKG}/[A-Za-z0-9_.]+" | head -1)
    [ -z "$vis" ] && vis="${GOOGLE_APP_PKG}/com.google.android.voiceinteraction.GsaVoiceInteractionService"
    if adb shell settings put secure voice_interaction_service "$vis" >/dev/null 2>&1 && \
       adb shell settings put secure assistant "$vis" >/dev/null 2>&1; then
        ok "Digital assistant app = Google"
    else
        warn "Set it manually: Settings > Apps > Default apps > Digital assistant app > Google"
    fi
    adb shell pm grant "$APP_ID" android.permission.RECORD_AUDIO >/dev/null 2>&1 && ok "Microphone granted to $APP_ID" || \
        warn "Run --install first to pre-grant the microphone"
    info "Opening speech settings — download your offline language (e.g. English, Filipino)"
    adb shell am start -a com.android.settings.TTS_SETTINGS >/dev/null 2>&1 || true
    ok "Voice setup done. Test: tap the mic, say \"fly to Cebu\"; watch: adb logcat | grep GEV-Voice"
    info "  expect: 'Binding GEV mic to Google recognizer', 'transcript: ... ms after last word', 'fly_to_location {...}'"
}

do_devices() {
    require_android_sdk || die "ANDROID_HOME not set."
    adb kill-server >/dev/null 2>&1 || true
    adb start-server >/dev/null 2>&1 || die "adb daemon failed"
    adb devices -l
}
do_sync() {
    do_keys; apply_voice_patches; apply_mobile_ui_patches
    apply_cesium_guard; apply_native_fetch; apply_apk_proxy
    apply_cesium_mobile_optimizations
    build_web; sync_android
}
do_clean() {
    rm -rf "$WEB_DIR"
    [ -d android ] && ( cd android && ./gradlew clean 2>/dev/null || true )
    rm -rf android/app/build android/build 2>/dev/null || true
    ok "Cleaned."
}
do_doctor() {
    local problems=0
    echo ""; echo -e "${BOLD}Environment${RESET}"
    command -v node >/dev/null 2>&1 && ok "Node $(node -v)" || { fail "Node.js missing"; problems=$((problems+1)); }
    command -v npm  >/dev/null 2>&1 && ok "npm $(npm -v)"  || { fail "npm missing";     problems=$((problems+1)); }
    command -v java >/dev/null 2>&1 && ok "Java present"  || { fail "Java missing";    problems=$((problems+1)); }
    command -v adb  >/dev/null 2>&1 && ok "adb present"   || warn "adb missing"
    command -v base64 >/dev/null 2>&1 && ok "base64 present" || warn "base64 missing"
    command -v python3 >/dev/null 2>&1 && ok "python3 present" || warn "python3 missing"
    python3 -c 'import PIL' 2>/dev/null && ok "Pillow present" || warn "Pillow missing"
    [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ] && ok "ANDROID_HOME=$ANDROID_HOME" || { fail "ANDROID_HOME invalid"; problems=$((problems+1)); }

    echo ""; echo -e "${BOLD}Project${RESET}"
    [ -f package.json ] && ok "package.json present" || { fail "package.json missing"; problems=$((problems+1)); }
    [ -f capacitor.config.json ] && ok "capacitor.config.json" || warn "run --init"
    [ -d android ] && ok "android/ present" || warn "run --init"
    [ -f src/voice/realtimeSession.js ] && ok "realtimeSession.js present" || warn "run --voice"
    [ -f src/lib/cesiumGuard.js ] && ok "cesiumGuard.js" || warn "run --build"
    [ -f src/lib/nativeFetch.js ] && ok "nativeFetch.js" || warn "run --build"
    [ -f src/lib/embeddedApiProxy.js ] && ok "embeddedApiProxy.js" || warn "run --build"

    echo ""; echo -e "${BOLD}Credentials${RESET}"
    if [ -f "$KEYS_FILE" ]; then
        ok "Keys file: $KEYS_FILE"
        local missing=0 k
        for k in "${KEY_NAMES[@]}"; do [ -n "${!k}" ] || missing=$((missing+1)); done
        (( missing == 0 )) && ok "All ${#KEY_NAMES[@]} keys set" || warn "$missing key(s) empty"
        if [ -d .git ] && git ls-files --error-unmatch "$KEYS_FILE" >/dev/null 2>&1; then
            fail "$KEYS_FILE is TRACKED by git — remove it and rotate keys"; problems=$((problems+1))
        fi
    else
        warn "Keys file missing — run --keys to create a template"
    fi
    if grep -qE '^KEY_[A-Z_]+="[^"$]{12,}"' "$0" 2>/dev/null; then
        fail "Hardcoded key found in $(basename "$0") — move it to $KEYS_FILE"; problems=$((problems+1))
    fi
    if [ -f .env ]; then
        ok ".env present"
        local perms
        perms=$(stat -c '%a' .env 2>/dev/null || stat -f '%A' .env 2>/dev/null || echo '?')
        [ "$perms" = "600" ] && ok ".env permissions = 600" || warn ".env permissions = $perms (recommend 600)"
    else
        warn ".env missing — run --keys"
    fi
    [ -d .git ] && { grep -qxF '.env' .gitignore 2>/dev/null && ok ".env in .gitignore" || warn ".env NOT in .gitignore"; }

    echo ""; echo -e "${BOLD}App icon${RESET}"
    [ -f android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png ] \
        && ok "Launcher icon installed" \
        || warn "Launcher icon missing — run --icon"

    echo ""; echo -e "${BOLD}Release signing${RESET}"
    if [ -f android/app/build.gradle ] || [ -f android/app/build.gradle.kts ]; then
        verify_release_signing
    else
        warn "Gradle files missing — run --init"
    fi

    echo ""; echo -e "${BOLD}Mobile UI${RESET}"
    local main_js
    if main_js="$(find_main_js)"; then
        if grep -q "GEV-RAIL-FAB v41" "$main_js" 2>/dev/null; then ok "Mobile UI v41 present (sat FAB + consolidated rail FAB)"
        elif grep -qE "GEV-RAIL-FAB v(3[89]|40)" "$main_js" 2>/dev/null; then warn "Older rail FAB present — run --mobile-ui for v40"
        elif grep -qE "GEV-SAT-TOOLS v36|GEV-RAIL-FAB v37" "$main_js" 2>/dev/null; then warn "Older v36/v37 UI present — run --mobile-ui (restores top toolbar)"
        elif grep -q "GEV-SAT-FAB v35" "$main_js" 2>/dev/null; then warn "v35 FAB without toolbar merge — run --mobile-ui"
        elif grep -qE "initMobileUiV3[1-4]" "$main_js" 2>/dev/null; then warn "Older mobile UI present — run --mobile-ui to upgrade to v35"
        else warn "No mobile UI IIFE — run --mobile-ui"; fi
    fi

    echo ""
    if (( problems == 0 )); then ok "Doctor: no blocking problems."; else fail "Doctor: $problems problem(s)."; return 1; fi
}
do_verify() {
    command -v adb >/dev/null 2>&1 || die "adb not on PATH."
    adb kill-server >/dev/null 2>&1 || true
    adb start-server >/dev/null 2>&1 || die "adb daemon failed"
    local count; count=$(adb devices | grep -c "device$" || echo 0)
    [ "$count" -gt 0 ] || die "No device connected."
    info "Launching app and watching logcat for 20 seconds ..."
    echo ""
    adb logcat -c 2>/dev/null || true
    adb shell am start -n "${APP_ID}/.MainActivity" >/dev/null 2>&1 || true
    local log
    log=$(timeout 20 adb logcat -v brief 2>/dev/null | grep -iE "Gids Eyes View|Capacitor/Console|APK-Proxy|GEV-Voice|NotAllowedError" || true)
    local pass=0 total=0 failed=0
    check() {
        local label="$1" pattern="$2"
        total=$((total+1))
        if printf '%s' "$log" | grep -q "$pattern"; then ok "$label"; pass=$((pass+1));
        else fail "$label"; failed=$((failed+1)); fi
    }
    echo ""
    echo -e "${BOLD}Logcat verification${RESET}"
    check "Satellite FAB ready"     "Satellite FAB v35 ready"
    check "Voice bridge"            "GEV-Voice\] bridge installed"
    check "Rail FAB ready"          "Rail FAB v41 ready"
    check "APK proxy installed"     "APK-Proxy.*installed"
    if printf '%s' "$log" | grep -q "NotAllowedError"; then
        fail "getUserMedia NotAllowedError"; failed=$((failed+1))
    else ok "No getUserMedia errors"; fi
    echo ""
    if (( failed == 0 )); then ok "$pass/$total checks passed."; else warn "$pass/$total checks passed ($failed failed)."; fi
    echo ""
    info "Raw log excerpt:"
    printf '%s\n' "$log" | tail -20
}

# =============================================================================
#  MAIN
# =============================================================================
echo ""
echo -e "${BOLD}  $APP_NAME - Android build pipeline ($UI_VERSION)${RESET}"
echo -e "  ${DIM}Mode    : $MODE${RESET}"
echo -e "  ${DIM}OS      : $DETECTED_OS${RESET}"
echo -e "  ${DIM}App ID  : $APP_ID${RESET}"
echo -e "  ${DIM}Keys    : $KEYS_FILE$([ -f "$KEYS_FILE" ] || echo ' (missing)')${RESET}"
echo -e "  ${DIM}Voice   : preserve_realtime=$PRESERVE_REALTIME_SESSION${RESET}"
[ "$MODE" = "keys" ] && echo -e "  ${DIM}.env    : $([ "$FORCE_KEYS" = "1" ] && echo 'force overwrite' || echo 'preserve existing')${RESET}"
echo ""

case "$MODE" in
    setup)        do_setup ;;
    init)         do_init ;;
    tune-system)  do_tune_system ;;
    keys)         do_keys ;;
    encode-keys)  do_encode_keys ;;
    voice)        apply_voice_patches ;;
    mobile-ui)    apply_mobile_ui_patches ;;
    icon)         do_icon ;;
    layers)       apply_layer_diagnostics ;;
    doctor)       do_doctor ;;
    build)        do_build ;;
    release)      do_release ;;
    install)      do_install ;;
    verify)       do_verify ;;
    devices)      do_devices ;;
    voice-setup)  do_voice_setup ;;
    ocean)        do_ocean ;;
    geo)          do_geo ;;
    geo-remove)   do_geo_remove ;;
    render-guard) apply_render_guard ;;
    sync)         do_sync ;;
    clean)        do_clean ;;
    all)          do_doctor; do_build; do_install; do_voice_setup ;;
    *)            die "Unknown mode: $MODE" ;;
esac

exit 0

# ----------------------------------------------------------------------------
#  Embedded GEO INTEL payload (tar.gz, base64). Never executed.
# ----------------------------------------------------------------------------
: <<'__GEV_GEO_PAYLOAD_FENCE__'
__GEV_GEO_PAYLOAD_BEGIN__
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
+fL58vny+fL58vny+fL5FT7/P79dHrUAqAIA
__GEV_GEO_PAYLOAD_END__
__GEV_GEO_PAYLOAD_FENCE__
