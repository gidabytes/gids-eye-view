#!/usr/bin/env bash
# =============================================================================
#  Gid's Eye View - Android build pipeline
#  Copyright (c) 2026 Gidabytes - MIT License
#
#  Handles the whole Android lifecycle:
#    - Checks prerequisites (Node, Java 17, Android SDK)
#    - Initialises Capacitor + Android platform on first run
#    - Applies CesiumJS mobile optimisations to the web bundle
#    - Builds the web app and syncs into the native project
#    - Builds debug APK or signed release AAB
#    - Installs onto a connected device
#
#  Usage:
#    ./gids-android.sh --init                # first-time setup
#    ./gids-android.sh --dev                 # live dev server + Android Studio
#    ./gids-android.sh --build               # build debug APK
#    ./gids-android.sh --release             # build signed release AAB
#    ./gids-android.sh --install             # install debug APK on device
#    ./gids-android.sh --clean               # wipe build artifacts
#    ./gids-android.sh --devices             # list connected devices
#    ./gids-android.sh --help
# =============================================================================

set -uo pipefail

APP_NAME="Gid's Eye View"
APP_ID="com.gidabytes.gidseyeview"
APP_SLUG="gids-eye-view"
WEB_DIR="dist"
CAP_VERSION_MAJOR="6"

# ---- Pretty output ---------------------------------------------------------
if [ -t 1 ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'
    RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
    BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi
info() { printf '%s[INFO]%s %s\n' "$BLUE"   "$RESET" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n' "$GREEN"  "$RESET" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '%s[FAIL]%s %s\n' "$RED"    "$RESET" "$*" >&2; exit 1; }

# ---- OS detection ----------------------------------------------------------
UNAME_OUT="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME_OUT" in
    Linux*)               DETECTED_OS="Linux"   ;;
    Darwin*)              DETECTED_OS="macOS"   ;;
    MINGW*|MSYS*|CYGWIN*) DETECTED_OS="Windows" ;;
    *)                    DETECTED_OS="Unknown" ;;
esac

if [ "$DETECTED_OS" = "Windows" ]; then
    warn "Running under $UNAME_OUT (Git Bash on Windows)."
    warn "Some commands (./gradlew) will use gradlew.bat automatically."
fi

# ---- Help ------------------------------------------------------------------
show_help() {
    sed -n '2,26p' "$0"
    exit 0
}

# ---- Argument parsing ------------------------------------------------------
MODE=""
for arg in "$@"; do
    case "$arg" in
        --init)     MODE="init" ;;
        --dev)      MODE="dev" ;;
        --build)    MODE="build" ;;
        --release)  MODE="release" ;;
        --install)  MODE="install" ;;
        --sync)     MODE="sync" ;;
        --clean)    MODE="clean" ;;
        --devices)  MODE="devices" ;;
        --help|-h)  show_help ;;
        *) printf 'Unknown flag: %s (try --help)\n' "$arg" >&2; exit 2 ;;
    esac
done

if [ -z "$MODE" ]; then
    printf '%sNo mode specified.%s\n\n' "$YELLOW" "$RESET" >&2
    show_help
fi

# ---- Prerequisite checks ---------------------------------------------------
require_node() {
    command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ first."
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if (( major < 18 )); then
        die "Node.js $(node -v) is too old. Need v18+ (v20+ recommended)."
    fi
    ok "Node.js $(node -v)"
}

require_npm() {
    command -v npm >/dev/null 2>&1 || die "npm not found."
    ok "npm $(npm -v)"
}

require_java() {
    if ! command -v java >/dev/null 2>&1; then
        warn "Java not found. Install JDK 17 (required for the Android Gradle Plugin)."
        warn "  Ubuntu/Debian : sudo apt install openjdk-17-jdk"
        warn "  macOS         : brew install openjdk@17"
        warn "  Windows       : winget install Microsoft.OpenJDK.17"
        return 1
    fi
    local ver
    ver="$(java -version 2>&1 | head -1 | sed 's/.*version "\([^"]*\)".*/\1/')"
    ok "Java $ver"
    case "$ver" in
        17*) ;;
        21*) ;;
        *) warn "Java $ver detected. JDK 17 is recommended for Capacitor 6." ;;
    esac
    return 0
}

require_android_sdk() {
    if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
        warn "ANDROID_HOME / ANDROID_SDK_ROOT is not set."
        warn "Set it to your Android SDK path, e.g.:"
        warn "  export ANDROID_HOME=\$HOME/Android/Sdk          # Linux"
        warn "  export ANDROID_HOME=\$HOME/Library/Android/sdk  # macOS"
        warn "  export ANDROID_HOME=%LOCALAPPDATA%\\\\Android\\\\Sdk  # Windows"
        return 1
    fi
    local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT}}"
    if [ ! -d "$sdk" ]; then
        warn "ANDROID_HOME points to $sdk but that directory does not exist."
        return 1
    fi
    ok "Android SDK: $sdk"
    return 0
}

check_prereqs_full() {
    require_node
    require_npm
    require_java || warn "Continuing without Java - native builds will fail."
    require_android_sdk || warn "Continuing without Android SDK - native builds will fail."
}

# ---- Capacitor install -----------------------------------------------------
ensure_capacitor() {
    if [ -f "capacitor.config.json" ] || [ -f "capacitor.config.ts" ]; then
        ok "Capacitor already configured."
        return 0
    fi

    info "Installing Capacitor core + CLI ..."
    npm install --save "@capacitor/core@^${CAP_VERSION_MAJOR}"
    npm install --save-dev "@capacitor/cli@^${CAP_VERSION_MAJOR}"
    npm install --save "@capacitor/android@^${CAP_VERSION_MAJOR}"

    info "Initialising Capacitor ..."
    npx cap init "$APP_NAME" "$APP_ID" --web-dir "$WEB_DIR"

    ok "Capacitor initialised for $APP_NAME."
}

ensure_android_platform() {
    if [ -d "android" ]; then
        ok "Android platform already present."
        return 0
    fi
    info "Adding Android platform ..."
    npx cap add android
    ok "Android platform added."
}

# ---- First-time init -------------------------------------------------------
do_init() {
    info "First-time setup for $APP_NAME"
    check_prereqs_full
    ensure_capacitor
    ensure_android_platform
    apply_capacitor_config
    apply_android_manifest
    apply_strings_xml
    apply_cesium_mobile_optimizations
    info "Init complete. Run './gids-android.sh --dev' to start developing,"
    info "or './gids-android.sh --build' to build a debug APK."
}

# ---- Capacitor config ------------------------------------------------------
apply_capacitor_config() {
    info "Writing capacitor.config.json ..."
    cat > capacitor.config.json <<'JSON'
{
  "appId": "com.gidabytes.gidseyeview",
  "appName": "Gid's Eye View",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "allowMixedContent": false,
    "captureInput": true,
    "webContentsDebuggingEnabled": true
  }
}
JSON
    ok "capacitor.config.json written."
}

# ---- AndroidManifest patches ----------------------------------------------
apply_android_manifest() {
    local mf="android/app/src/main/AndroidManifest.xml"
    [ -f "$mf" ] || { warn "AndroidManifest.xml not found - skipping."; return 0; }

    info "Patching AndroidManifest.xml for WebGL + network ..."
    # Ensure hardwareAccelerated is on (Cesium needs it)
    if ! grep -q 'android:hardwareAccelerated' "$mf"; then
        if sed --version >/dev/null 2>&1; then
            sed -i.bak 's|<application|<application android:hardwareAccelerated="true"|' "$mf" && rm -f "$mf.bak"
        else
            sed -i '' 's|<application|<application android:hardwareAccelerated="true"|' "$mf"
        fi
        ok "Enabled hardwareAccelerated."
    else
        ok "hardwareAccelerated already set."
    fi

    # Ensure INTERNET permission is declared
    if ! grep -q 'android.permission.INTERNET' "$mf"; then
        warn "INTERNET permission not found in AndroidManifest - add it manually if the app cannot reach APIs."
    fi
}

# ---- strings.xml ----------------------------------------------------------
apply_strings_xml() {
    local f="android/app/src/main/res/values/strings.xml"
    [ -f "$f" ] || { warn "strings.xml not found - skipping."; return 0; }

    info "Setting app name in strings.xml ..."
    cat > "$f" <<'XML'
<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Gid\u0027s Eye View</string>
    <string name="title_activity_main">Gid\u0027s Eye View</string>
    <string name="package_name">com.gidabytes.gidseyeview</string>
    <string name="custom_url_scheme">com.gidabytes.gidseyeview</string>
</resources>
XML
    ok "strings.xml updated."
}

# ---- Cesium mobile optimisations ------------------------------------------
apply_cesium_mobile_optimizations() {
    local mobile_file="src/mobile.js"

    if [ -f "$mobile_file" ]; then
        ok "Mobile optimisation module already exists at $mobile_file."
        return 0
    fi

    info "Creating src/mobile.js with Cesium mobile tuning ..."
    mkdir -p src
    cat > "$mobile_file" <<'JS'
/**
 * Mobile runtime tuning for Gid's Eye View.
 *
 * Detects whether the app is running inside a Capacitor Android/iOS shell
 * (or on a touch device with limited GPU resources) and applies conservative
 * Cesium viewer settings that keep the globe responsive without crashing.
 *
 * Import this once from your main entry point (e.g. src/main.js):
 *
 *     import { applyMobileTuning } from './mobile.js';
 *     applyMobileTuning(viewer);
 */

function isCapacitorNative() {
  return Boolean(
    typeof window !== 'undefined' &&
    (window.Capacitor?.isNativePlatform?.() ||
     window.Capacitor?.platform === 'android' ||
     window.Capacitor?.platform === 'ios')
  );
}

function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return mem <= 3 || cores <= 4;
}

export function applyMobileTuning(viewer) {
  if (!viewer) return;

  const native = isCapacitorNative();
  const low = isLowEndDevice();

  if (!native && !low) {
    // Desktop - leave the defaults alone.
    return;
  }

  // ---- Rendering cost reduction ----------------------------------------
  // Cap the rendering resolution at 1.0x the CSS pixel size. On phones this
  // drops fragment work by 3-9x compared to the native DPR (often 3x).
  viewer.resolutionScale = 1.0;

  // ---- Terrain + imagery budget ----------------------------------------
  // Higher SSE = less detail = fewer tiles = less memory pressure.
  viewer.scene.globe.maximumScreenSpaceError = 4;
  viewer.scene.globe.tileCacheSize = 100;

  // ---- Expensive visual features off -----------------------------------
  if (viewer.scene.fog) viewer.scene.fog.enabled = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.highDynamicRange = false;
  viewer.scene.postProcessStages.fxaa.enabled = false;
  if (viewer.scene.msaaSamples !== undefined) viewer.scene.msaaSamples = 1;

  // ---- Request render mode for battery ---------------------------------
  // Only render when the camera moves or data changes.
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;

  // ---- Touch-friendly camera -------------------------------------------
  const c = viewer.scene.screenSpaceCameraController;
  c.minimumZoomDistance = 10;
  c.maximumZoomDistance = 20000000;
  c.inertiaSpin = 0.7;
  c.inertiaTranslate = 0.7;
  c.inertiaZoom = 0.6;

  // ---- Memory pressure hooks -------------------------------------------
  // When the app is backgrounded, Cesium should stop rendering.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      viewer.useDefaultRenderLoop = false;
    } else {
      viewer.useDefaultRenderLoop = true;
      viewer.scene.requestRender();
    }
  });

  console.info(
    `[Gid's Eye View] Mobile tuning applied ` +
    `(native=${native}, lowEnd=${low}, DPR=${window.devicePixelRatio})`
  );
}
JS

    ok "src/mobile.js created."
    info "Next: import and call applyMobileTuning(viewer) from your main.js."
}

# ---- Build web bundle ------------------------------------------------------
build_web() {
    info "Building web bundle ..."
    if [ ! -f "package.json" ]; then
        die "package.json not found. Are you in the project root?"
    fi
    if npm run build; then
        ok "Web build complete."
    else
        die "npm run build failed."
    fi

    if [ ! -d "$WEB_DIR" ]; then
        die "Expected output folder '$WEB_DIR' was not produced. Check vite.config.js."
    fi
    ok "Web assets ready in $WEB_DIR/"
}

# ---- Sync to Android -------------------------------------------------------
sync_android() {
    [ -d "android" ] || die "android/ folder missing. Run './gids-android.sh --init' first."
    info "Copying web assets into Android project ..."
    npx cap sync android || die "cap sync failed."
    ok "Sync complete."
}

# ---- Gradle wrapper helper -------------------------------------------------
gradlew() {
    if [ "$DETECTED_OS" = "Windows" ] && [ -f "android/gradlew.bat" ]; then
        ( cd android && ./gradlew.bat "$@" )
    elif [ -x "android/gradlew" ]; then
        ( cd android && ./gradlew "$@" )
    else
        die "Gradle wrapper not found in android/. Run --init first."
    fi
}

# ---- Debug APK -------------------------------------------------------------
do_build() {
    check_prereqs_full
    ensure_capacitor
    ensure_android_platform
    apply_capacitor_config
    apply_android_manifest
    apply_strings_xml
    apply_cesium_mobile_optimizations
    build_web
    sync_android

    info "Building debug APK ..."
    gradlew assembleDebug || die "Gradle assembleDebug failed."
    local apk="android/app/build/outputs/apk/debug/app-debug.apk"
    [ -f "$apk" ] || die "APK not found at $apk"
    ok "Debug APK ready: $apk"
    info "Install on a device with: ./gids-android.sh --install"
}

# ---- Release AAB -----------------------------------------------------------
do_release() {
    check_prereqs_full
    require_java || die "Java 17 is required to build a release AAB."
    [ -d "android" ] || die "android/ folder missing. Run './gids-android.sh --init' first."

    build_web
    sync_android

    info "Building release AAB ..."
    info "This requires signingConfigs to be present in android/app/build.gradle."
    info "If you have not set up signing yet, see the README section 'Release signing'."

    gradlew bundleRelease || die "Gradle bundleRelease failed."
    local aab="android/app/build/outputs/bundle/release/app-release.aab"
    [ -f "$aab" ] || die "AAB not found at $aab"
    ok "Release AAB ready: $aab"
    info "Upload this file to the Google Play Console."
}

# ---- Install on device -----------------------------------------------------
do_install() {
    require_android_sdk || die "ANDROID_HOME not set - cannot use adb."
    command -v adb >/dev/null 2>&1 || die "adb not on PATH. Add \$ANDROID_HOME/platform-tools to PATH."

    local apk="android/app/build/outputs/apk/debug/app-debug.apk"
    [ -f "$apk" ] || die "Debug APK not found. Run './gids-android.sh --build' first."

    info "Connected devices:"
    adb devices

    info "Installing $apk ..."
    adb install -r "$apk" || die "adb install failed."
    ok "Installed. Launch '${APP_NAME}' from your device launcher."
}

# ---- List devices ----------------------------------------------------------
do_devices() {
    require_android_sdk || die "ANDROID_HOME not set."
    command -v adb >/dev/null 2>&1 || die "adb not on PATH."
    info "Devices:"
    adb devices -l
}

# ---- Dev mode --------------------------------------------------------------
do_dev() {
    check_prereqs_full
    ensure_capacitor
    ensure_android_platform
    apply_capacitor_config
    apply_android_manifest
    apply_strings_xml
    apply_cesium_mobile_optimizations

    info "Building web bundle once, then opening Android Studio ..."
    build_web
    sync_android
    npx cap open android
    ok "Android Studio opened. Use Run to deploy to your device or emulator."
    info "For live reload, start 'npm run dev' in a separate terminal and update"
    info "the server URL in capacitor.config.json as described in the docs."
}

# ---- Clean -----------------------------------------------------------------
do_clean() {
    info "Removing build artifacts ..."
    rm -rf "$WEB_DIR"
    [ -d "android" ] && ( cd android && ./gradlew clean 2>/dev/null || true )
    rm -rf android/app/build 2>/dev/null || true
    rm -rf android/build 2>/dev/null || true
    ok "Cleaned. android/ and node_modules/ untouched."
}

# ---- Main ------------------------------------------------------------------
echo ""
echo -e "${BOLD}  $APP_NAME - Android build pipeline${RESET}"
echo -e "  ${DIM}Mode  : $MODE${RESET}"
echo -e "  ${DIM}OS    : $DETECTED_OS${RESET}"
echo -e "  ${DIM}App ID: $APP_ID${RESET}"
echo ""

case "$MODE" in
    init)     do_init ;;
    dev)      do_dev ;;
    build)    do_build ;;
    release)  do_release ;;
    install)  do_install ;;
    sync)     build_web; sync_android ;;
    clean)    do_clean ;;
    devices)  do_devices ;;
    *)        die "Unknown mode: $MODE" ;;
esac

exit 0