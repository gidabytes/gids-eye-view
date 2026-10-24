#!/usr/bin/env bash
# =============================================================================
#  Gids Eyes View — interactive installer (mobile beta)
#  Installs the Android app on a phone connected to this laptop by USB.
#  Copyright (c) 2026 Gidabytes - MIT License
#
#  Usage:  ./gids-install.sh [path/to/gids-eyes-view.apk]
#  With no path it uses the newest APK in ./release, or downloads the latest
#  beta from GitHub. Works on Linux and macOS (Windows: see docs/MOBILE-BETA.md).
#
#  The app has NO API keys inside. When a feature needs one, the app asks you
#  for your own free key on the phone; it is saved only on that phone.
# =============================================================================
set -uo pipefail

APP_ID="com.gidabytes.gidseyeview"
REPO="gidabytes/gids-eye-view"
MIN_SDK=24            # Android 7.0
MIN_WEBVIEW=100       # Chrome WebView major version with solid WebGL 2

if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[36m'; N=$'\033[0m'
else B=""; G=""; Y=""; R=""; C=""; N=""; fi
step() { printf '\n%s== %s ==%s\n' "$B$C" "$*" "$N"; }
ok()   { printf '%s[ OK ]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%s[FAIL]%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
ask()  { local a; read -r -p "$1 " a || true; printf '%s' "$a"; }
yes_no() {  # yes_no "question" default(y|n)
    local d="${2:-y}" a
    a="$(ask "$1 [$( [ "$d" = y ] && echo Y/n || echo y/N )]")"
    a="${a:-$d}"; [[ "$a" =~ ^[Yy] ]]
}
pause() { ask "${1:-Press Enter to continue...}" >/dev/null; }

printf '%sGids Eyes View — mobile beta installer%s\n' "$B" "$N"
echo "This puts the app on your Android phone from this laptop, step by step."

# ---- 1. adb -----------------------------------------------------------------
step "1/6  Android tools (adb)"
ADB="$(command -v adb || true)"
[ -z "$ADB" ] && [ -x "${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb" ] && ADB="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb"
if [ -z "$ADB" ]; then
    warn "adb is not installed. Install it, then run this again:"
    case "$(uname -s)" in
        Linux*)  echo "    sudo apt install adb          (Debian/Ubuntu)"
                 echo "    sudo dnf install android-tools (Fedora)" ;;
        Darwin*) echo "    brew install android-platform-tools" ;;
        *)       echo "    https://developer.android.com/tools/releases/platform-tools" ;;
    esac
    exit 1
fi
ok "adb found: $ADB"

# ---- 2. the APK -------------------------------------------------------------
step "2/6  The app file (APK)"
APK="${1:-}"
if [ -z "$APK" ]; then
    APK="$(ls -t release/gids-eyes-view-*.apk 2>/dev/null | head -1 || true)"
fi
if [ -z "$APK" ]; then
    echo "No APK given and none in ./release."
    if yes_no "Download the latest beta from github.com/$REPO?" y; then
        command -v curl >/dev/null || die "curl is needed to download. Or download the APK in a browser and pass its path."
        url="$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=5" \
               | grep -oE '"browser_download_url": *"[^"]+\.apk"' | head -1 | sed -E 's/.*"(https[^"]+)"/\1/')"
        [ -n "$url" ] || die "Could not find an APK on the releases page: https://github.com/$REPO/releases"
        APK="$(basename "$url")"
        echo "Downloading $url"
        curl -fL --progress-bar -o "$APK" "$url" || die "Download failed."
        curl -fsSL -o "$APK.sha256" "$url.sha256" 2>/dev/null || rm -f "$APK.sha256"
    else
        die "Pass the APK path:  ./gids-install.sh path/to/gids-eyes-view.apk"
    fi
fi
[ -f "$APK" ] || die "APK not found: $APK"
if [ -f "$APK.sha256" ]; then
    want="$(cut -d' ' -f1 "$APK.sha256")"
    got="$( (sha256sum "$APK" 2>/dev/null || shasum -a 256 "$APK") | cut -d' ' -f1)"
    [ "$want" = "$got" ] && ok "Checksum matches ($APK)" || die "Checksum does NOT match — the file is damaged or not the original. Download it again."
else
    ok "Using $APK (no .sha256 file next to it to check against)"
fi

# ---- 3. phone setup ---------------------------------------------------------
step "3/6  Prepare your phone (one time)"
cat <<'TXT'
  a) Settings > About phone > tap "Build number" 7 times (you become a developer).
     (Xiaomi: MIUI version; Samsung: Software information > Build number.)
  b) Settings > System > Developer options > turn on "USB debugging".
  c) Connect the phone to this laptop with a USB data cable.
  d) On the phone, allow "USB debugging" for this computer (tick "Always allow").
TXT
pause "Press Enter when the phone is connected..."

# ---- 4. find the phone ------------------------------------------------------
step "4/6  Finding your phone"
"$ADB" start-server >/dev/null 2>&1 || true
SERIAL=""
for attempt in 1 2 3 4 5 6; do
    devices=(); unauthorized=0
    while IFS= read -r l; do   # (no mapfile: macOS ships bash 3.2)
        case "$l" in
            *$'\t'device)       devices+=("${l%%$'\t'*}") ;;
            *$'\t'unauthorized) unauthorized=1 ;;
        esac
    done < <("$ADB" devices | tail -n +2)
    if [ "${#devices[@]}" -eq 1 ]; then SERIAL="${devices[0]}"; break; fi
    if [ "${#devices[@]}" -gt 1 ]; then
        echo "More than one device is connected:"
        i=1; for d in "${devices[@]}"; do echo "  $i) $d  $("$ADB" -s "$d" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"; i=$((i+1)); done
        n="$(ask "Install on which one? [1-${#devices[@]}]")"
        [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "${#devices[@]}" ] && { SERIAL="${devices[$((n-1))]}"; break; }
        continue
    fi
    if [ "$unauthorized" = 1 ]; then warn "The phone is asking to allow USB debugging — tap Allow on the phone."
    else warn "No phone found. Check the cable (some cables only charge), and that USB debugging is on."; fi
    pause "Press Enter to look again (attempt $attempt of 6)..."
done
[ -n "$SERIAL" ] || die "No phone found. See 'Troubleshooting' in docs/MOBILE-BETA.md."
A=("$ADB" -s "$SERIAL")
prop() { "${A[@]}" shell getprop "$1" 2>/dev/null | tr -d '\r'; }
MODEL="$(prop ro.product.manufacturer) $(prop ro.product.model)"
RELEASE="$(prop ro.build.version.release)"; SDK="$(prop ro.build.version.sdk)"
ABI="$(prop ro.product.cpu.abi)"
RAM_KB="$("${A[@]}" shell cat /proc/meminfo 2>/dev/null | awk '/MemTotal/{print $2}')"
WV="$("${A[@]}" shell dumpsys package com.google.android.webview 2>/dev/null | grep -m1 versionName | sed 's/.*=//' | tr -d '\r')"
[ -z "$WV" ] && WV="$("${A[@]}" shell dumpsys package com.android.chrome 2>/dev/null | grep -m1 versionName | sed 's/.*=//' | tr -d '\r')"
ok "Phone: $MODEL — Android $RELEASE (API $SDK), $ABI, $(( ${RAM_KB:-0} / 1024 )) MB RAM, WebView ${WV:-unknown}"

# ---- 5. compatibility -------------------------------------------------------
step "5/6  Checking the phone can run it"
fine=1
if [ -n "$SDK" ] && [ "$SDK" -lt "$MIN_SDK" ]; then die "Android $RELEASE is too old: the app needs Android 7.0 or newer."; fi
wv_major="${WV%%.*}"
if [[ "$wv_major" =~ ^[0-9]+$ ]] && [ "$wv_major" -lt "$MIN_WEBVIEW" ]; then
    warn "Android System WebView $WV is old; the 3D globe needs WebGL 2. Update 'Android System WebView' in the Play Store."; fine=0
fi
if [ -n "${RAM_KB:-}" ] && [ "$RAM_KB" -lt 3000000 ]; then
    warn "Less than 3 GB RAM: the globe may be slow. Use fewer layers at once."; fine=0
fi
[ "$fine" = 1 ] && ok "Looks good."
REPORT="gids-device-report-$(date +%Y%m%d-%H%M%S).txt"
{
    echo "Gids Eyes View device report"
    echo "App: $(basename "$APK")"
    echo "Device: $MODEL"
    echo "Android: $RELEASE (API $SDK)"
    echo "CPU ABI: $ABI"
    echo "RAM: $(( ${RAM_KB:-0} / 1024 )) MB"
    echo "WebView: ${WV:-unknown}"
    echo "GPU: $("${A[@]}" shell dumpsys SurfaceFlinger 2>/dev/null | grep -m1 -i 'GLES:' | sed 's/^ *//' | tr -d '\r')"
} > "$REPORT"
echo "Saved $REPORT (no personal data) — attach it to a 'Device report' on GitHub to help the beta."

# ---- 6. install -------------------------------------------------------------
step "6/6  Installing"
out="$("${A[@]}" install -r "$APK" 2>&1)"; rc=$?
if [ $rc -ne 0 ] && printf '%s' "$out" | grep -qE 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match'; then
    warn "An older Gids Eyes View signed by someone else is on the phone."
    warn "Removing it deletes its settings and the keys saved in it."
    if yes_no "Uninstall the old one and install this beta?" n; then
        "${A[@]}" uninstall "$APP_ID" >/dev/null 2>&1 || true
        out="$("${A[@]}" install "$APK" 2>&1)"; rc=$?
    fi
fi
[ $rc -eq 0 ] || { printf '%s\n' "$out" | tail -3; die "Install failed. See 'Troubleshooting' in docs/MOBILE-BETA.md."; }
ok "Installed on $MODEL."

if yes_no "Allow the microphone now (for voice: \"fly to Tokyo\")?" y; then
    "${A[@]}" shell pm grant "$APP_ID" android.permission.RECORD_AUDIO >/dev/null 2>&1 && ok "Microphone allowed." || warn "Could not set it here; the app will ask."
fi
if yes_no "Allow location now (for 'near me' and your position on the globe)?" n; then
    "${A[@]}" shell pm grant "$APP_ID" android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1
    "${A[@]}" shell pm grant "$APP_ID" android.permission.ACCESS_COARSE_LOCATION >/dev/null 2>&1 && ok "Location allowed." || warn "The app will ask."
fi
if yes_no "Open the app on the phone now?" y; then
    "${A[@]}" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 && ok "Opened." || warn "Open 'Gids Eyes View' from the phone's app list."
fi

cat <<TXT

${B}Done.${N} Tips:
  * API keys: the app has none built in. When you turn on a feature that needs
    one (e.g. NASA fires, live traffic), it asks for your own free key and keeps
    it only on this phone. You can also tap POWER UP to add keys any time.
  * Voice: tap the mic and say "fly to Cebu".
  * Found a bug or want a feature? https://github.com/$REPO/issues
    (attach $REPORT for device problems).
  * You can now unplug the phone. Turn USB debugging off again if you like.
TXT
