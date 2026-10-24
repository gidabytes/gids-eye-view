#!/usr/bin/env bash
# =============================================================================
#  Gid's Eye View - Ocean & Sonar Python toolchain installer (v2)
#  Copyright (c) 2026 Gidabytes - MIT License
#
#  Installs into its own venv (never touches system Python). Idempotent.
#  Delete the venv folder to uninstall.
#
#  Usage:
#    scripts/install-ocean-tools.sh                     # venv at ~/gev-ocean-tools
#    scripts/install-ocean-tools.sh --venv=~/my-ocean   # custom venv
#    scripts/install-ocean-tools.sh --with-mbsystem     # + build MB-System (sudo, apt/Homebrew)
#    scripts/install-ocean-tools.sh --with-experimental # + sonar-vision (single release, unvetted)
#    scripts/install-ocean-tools.sh --with-holoocean    # + HoloOcean UE5 simulator (multi-GB)
#    scripts/install-ocean-tools.sh --check             # report only
#    scripts/install-ocean-tools.sh --force             # reinstall packages
#
#  Changes from v1: hadexion removed (no importable module; installs generic
#  top-level "src"/"examples" packages), libgmt-dev added so PyGMT can load
#  libgmt.so, MB-System is actually built (CMake, newest release tag, GCC 13
#  <cstdint> workaround), smoke test installed as `gev-ocean-check`.
# =============================================================================
set -uo pipefail

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B=; G=; Y=; R=; C=; N=; fi
info(){ printf '%s[INFO]%s %s\n' "$C" "$N" "$*"; }
ok(){   printf '%s[ OK ]%s %s\n' "$G" "$N" "$*"; }
warn(){ printf '%s[WARN]%s %s\n' "$Y" "$N" "$*"; }

OCEAN_VENV="$HOME/gev-ocean-tools"; WITH_EXPERIMENTAL=0; WITH_HOLOOCEAN=0; WITH_MBSYSTEM=0; OCEAN_CHECK=0; FORCE=0
for a in "$@"; do case "$a" in
  --venv=*) OCEAN_VENV="${a#--venv=}"; OCEAN_VENV="${OCEAN_VENV/#\~/$HOME}" ;;
  --with-experimental) WITH_EXPERIMENTAL=1 ;;
  --with-holoocean) WITH_HOLOOCEAN=1 ;;
  --with-mbsystem) WITH_MBSYSTEM=1 ;;
  --check) OCEAN_CHECK=1 ;;
  --force) FORCE=1 ;;
  -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
  *) echo "Unknown flag: $a (try --help)" >&2; exit 2 ;;
esac; done

# =============================================================================
#  OCEAN & SONAR PYTHON TOOLCHAIN (merged from install-ocean-tools.sh v1)
# =============================================================================
# "<import name>|<pip name>" - all verified on PyPI (Oct 2026)
OCEAN_CORE=(
  "numpy|numpy" "scipy|scipy" "pandas|pandas" "xarray|xarray" "netCDF4|netCDF4"
  "matplotlib|matplotlib" "rasterio|rasterio" "geopandas|geopandas" "shapely|shapely" "pyproj|pyproj"
  "bathy|bathy"
  "echopype|echopype" "oceanstream|oceanstream" "pytritech|pytritech" "pingmapper|pingmapper"
  "skimage|scikit-image" "cv2|opencv-python" "obspy|obspy"
  "jupyterlab|jupyterlab" "ipywidgets|ipywidgets" "plotly|plotly"
  "py3dtiles|py3dtiles"
)
# Single-release package with no linked source repository: opt-in only.
# (hadexion was evaluated and excluded: its wheel has no "hadexion" module and installs
#  generic top-level "src"/"examples" packages into site-packages, which can shadow other code.)
OCEAN_EXPERIMENTAL=( "sonar_vision|sonar-vision" )

pick_python() {
  local c
  for c in python3.12 python3.11 python3.10 python3.9 python3; do
    command -v "$c" >/dev/null 2>&1 || continue
    "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)' 2>/dev/null && { echo "$c"; return 0; }
  done
  return 1
}

apt_install() {  # best-effort system packages; asks sudo once
  command -v apt-get >/dev/null 2>&1 || return 1
  sudo apt-get update -qq || true; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
}

have_libgmt() {  # PyGMT loads the unversioned libgmt.so (Debian/Ubuntu: from libgmt-dev)
  ldconfig -p 2>/dev/null | grep -q 'libgmt\.so ' && return 0
  [ "$(uname -s)" = Darwin ] && command -v gmt >/dev/null 2>&1 && return 0
  return 1
}
ensure_gmt() {
  if command -v gmt >/dev/null 2>&1 && have_libgmt; then ok "GMT $(gmt --version 2>/dev/null)"; return 0; fi
  info "GMT or its shared library is missing (needed by PyGMT and MB-System)."
  if   command -v apt-get >/dev/null 2>&1; then apt_install gmt gmt-gshhg gmt-dcw libgmt-dev ghostscript || true
  elif command -v brew    >/dev/null 2>&1; then brew install gmt ghostscript || true
  elif command -v dnf     >/dev/null 2>&1; then sudo dnf install -y GMT || true
  fi
  command -v gmt >/dev/null 2>&1 && have_libgmt && { ok "GMT installed."; return 0; }
  warn "GMT still missing - PyGMT skipped. See https://www.generic-mapping-tools.org/download/"
  return 1
}

O_INSTALLED=0; O_SKIPPED=0; O_FAILED=(); O_TOTAL=0
mod_present(){ "$OPY" -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('$1') else 1)" 2>/dev/null; }
ocean_install_list() {
  local e imp dist
  for e in "$@"; do
    imp="${e%%|*}"; dist="${e##*|}"; O_TOTAL=$((O_TOTAL+1))
    if [ "$OCEAN_CHECK" = 1 ]; then
      if mod_present "$imp"; then ok "$dist"; O_SKIPPED=$((O_SKIPPED+1)); else warn "$dist (missing)"; O_FAILED+=("$dist"); fi
      continue
    fi
    if [ "$FORCE" = 0 ] && mod_present "$imp"; then printf '%s[SKIP]%s %s\n' "$C" "$N" "$dist"; O_SKIPPED=$((O_SKIPPED+1)); continue; fi
    if "$OPY" -m pip install --quiet --upgrade "$dist"; then ok "$dist"; O_INSTALLED=$((O_INSTALLED+1))
    else warn "$dist failed"; O_FAILED+=("$dist"); fi
  done
}

build_mbsystem() {
  if command -v mbinfo >/dev/null 2>&1; then ok "MB-System already installed ($(command -v mbinfo))"; return 0; fi
  info "Building MB-System from https://github.com/dwcaress/MB-System (CMake, ~20-40 min) ..."
  if command -v apt-get >/dev/null 2>&1; then
    apt_install build-essential git libtirpc-dev netcdf-bin libnetcdf-dev libgdal-dev \
      gmt libgmt6 libgmt-dev libproj-dev libfftw3-bin libfftw3-dev libmotif-dev \
      xfonts-100dpi libglu1-mesa-dev libopencv-dev cmake gfortran python3-pil \
      || { warn "MB-System prerequisites failed to install."; return 1; }
  elif command -v brew >/dev/null 2>&1; then
    info "Homebrew detected - using the maintained formula."
    brew install mbsystem && { ok "MB-System installed via Homebrew."; return 0; } || return 1
  else
    warn "Automatic MB-System build supports apt (Ubuntu/Debian) and Homebrew only."
    return 1
  fi
  local src="${MBSYSTEM_SRC:-$HOME/src/MB-System}" tag
  # Prefer the newest release tag; fall back to the default branch.
  tag="$(git ls-remote --tags --refs https://github.com/dwcaress/MB-System.git 2>/dev/null \
        | awk -F/ '{print $NF}' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1)"
  if [ -d "$src/.git" ]; then
    git -C "$src" fetch --tags --quiet || true
  else
    mkdir -p "$(dirname "$src")"
    git clone --quiet https://github.com/dwcaress/MB-System.git "$src" || { warn "clone failed"; return 1; }
  fi
  [ -n "$tag" ] && git -C "$src" checkout --quiet "$tag" && info "Using release $tag"
  mkdir -p "$src/build" && cd "$src/build" || return 1
  # MB-System 5.8.1 TRN sources miss #include <cstdint> and fail on GCC 13+ (Ubuntu 24.04);
  # force-include it for C++. (TRN can't be disabled: libmbio links its r7kr library.)
  cmake .. -DbuildTests=OFF -DCMAKE_CXX_FLAGS="-include cstdint" >cmake.log 2>&1 || { warn "cmake failed - see $src/build/cmake.log"; cd - >/dev/null; return 1; }
  make -j"$(nproc 2>/dev/null || echo 2)" >make.log 2>&1 || { warn "make failed - see $src/build/make.log"; cd - >/dev/null; return 1; }
  sudo make install >install.log 2>&1 && sudo ldconfig 2>/dev/null
  cd - >/dev/null
  command -v mbinfo >/dev/null 2>&1 && ok "MB-System installed: $(mbinfo 2>&1 | grep -m1 -i "version")" \
    || { warn "MB-System install did not put mbinfo on PATH."; return 1; }
}

write_ocean_check() {  # smoke test you can re-run any time: gev-ocean-check
  cat > "$OCEAN_VENV/bin/gev-ocean-check" <<'PYCHK'
#!/usr/bin/env python
import importlib, sys
G, R, Y, Z = ("\033[32m", "\033[31m", "\033[33m", "\033[0m") if sys.stdout.isatty() else ("", "", "", "")
mods = [("bathy","bathy"),("echopype","echopype"),("oceanstream","oceanstream"),("pingmapper","pingmapper"),
        ("pytritech","pytritech"),("py3dtiles","py3dtiles"),("xarray","xarray"),("netCDF4","netCDF4"),
        ("rasterio","rasterio"),("geopandas","geopandas"),("scipy","scipy"),("cv2","opencv-python"),
        ("obspy","obspy"),("pygmt","pygmt"),
        ("sonar_vision","sonar-vision (experimental)"),
        ("holoocean","holoocean (optional)")]
bad = 0
for mod, name in mods:
    try:
        m = importlib.import_module(mod)
        print(f"  {G}✓{Z} {name:<28} {getattr(m, '__version__', 'present')}")
    except ImportError:
        optional = "(" in name
        print(f"  {'·' if optional else R+'✗'+Z} {name:<28} {'not installed' if optional else 'MISSING'}")
        bad += 0 if optional else 1
    except Exception as e:
        print(f"  {Y}!{Z} {name:<28} import error: {e.__class__.__name__}: {str(e).splitlines()[0]}")
        bad += 1
import shutil
print(f"  {'✓' if shutil.which('mbinfo') else '·'} {'MB-System (mbinfo)':<28} {shutil.which('mbinfo') or 'not installed'}")
print(f"  {'✓' if shutil.which('gmt') else '·'} {'GMT':<28} {shutil.which('gmt') or 'not installed'}")
raise SystemExit(1 if bad else 0)
PYCHK
  chmod +x "$OCEAN_VENV/bin/gev-ocean-check"
}

install_ocean_tools() {
  echo; echo "${B}== Ocean & sonar Python toolchain ==${N}  venv: $OCEAN_VENV"
  local base; base="$(pick_python)" || {
    warn "Python >= 3.9 not found."; apt_install python3 python3-venv python3-pip || true
    base="$(pick_python)" || { warn "Skipping ocean toolchain (no Python)."; return 1; }; }
  ok "Python: $($base --version)"

  if [ ! -x "$OCEAN_VENV/bin/python" ]; then
    [ "$OCEAN_CHECK" = 1 ] && { warn "No venv at $OCEAN_VENV - nothing installed yet."; return 1; }
    "$base" -m venv "$OCEAN_VENV" 2>/dev/null || {
      info "Installing python venv support ..."; apt_install python3-venv || true
      "$base" -m venv "$OCEAN_VENV" || { warn "venv creation failed."; return 1; }; }
    ok "venv created at $OCEAN_VENV"
  fi
  OPY="$OCEAN_VENV/bin/python"
  [ "$OCEAN_CHECK" = 1 ] || "$OPY" -m pip install --quiet --upgrade pip setuptools wheel || warn "pip upgrade issue - continuing."

  # rasterio/geopandas/netCDF4 ship wheels; GDAL headers only matter for source builds.
  echo "${B}[1/5] Core bathymetry, sonar & signal packages${N}"
  ocean_install_list "${OCEAN_CORE[@]}"

  echo "${B}[2/5] PyGMT${N}"
  if [ "$OCEAN_CHECK" = 1 ] || ensure_gmt; then ocean_install_list "pygmt|pygmt"; else warn "PyGMT skipped."; fi

  echo "${B}[3/5] Experimental packages${N}"
  if [ "$WITH_EXPERIMENTAL" = 1 ]; then
    warn "sonar-vision has one release and no public source repo - review before trusting its output."
    ocean_install_list "${OCEAN_EXPERIMENTAL[@]}"
  else printf '%s[SKIP]%s sonar-vision, hadexion (add --with-experimental)\n' "$C" "$N"; fi

  echo "${B}[4/5] HoloOcean${N}"
  if [ "$WITH_HOLOOCEAN" = 1 ]; then info "HoloOcean pulls multi-GB Unreal Engine binaries ..."; ocean_install_list "holoocean|holoocean"
  else printf '%s[SKIP]%s HoloOcean (add --with-holoocean)\n' "$C" "$N"; fi

  echo "${B}[5/5] MB-System${N}"
  if [ "$WITH_MBSYSTEM" = 1 ] && [ "$OCEAN_CHECK" = 0 ]; then build_mbsystem || warn "MB-System not installed - the rest of the toolchain is fine."
  elif command -v mbinfo >/dev/null 2>&1; then ok "MB-System present"
  else printf '%s[SKIP]%s MB-System (add --with-mbsystem)\n' "$C" "$N"; fi

  [ "$OCEAN_CHECK" = 1 ] || write_ocean_check
  echo; echo "${B}Smoke test${N}"
  "$OPY" "$OCEAN_VENV/bin/gev-ocean-check" && ok "Ocean toolchain ready." || warn "Some imports failed - see above."
  echo "  Summary: $O_TOTAL considered · $O_SKIPPED already present · $O_INSTALLED installed now · ${#O_FAILED[@]} failed"
  [ ${#O_FAILED[@]} -gt 0 ] && printf '    - %s\n' "${O_FAILED[@]}" && echo "  Retry one with: $OPY -m pip install <pkg> -v"
  echo "  Use it:  source \"$OCEAN_VENV/bin/activate\"   ·   re-check: gev-ocean-check"
}

_unused_maybe_ocean() {
  if [ "$OCEAN" = ask ]; then
    if [ -t 0 ]; then
      echo; echo "${B}Optional: ocean & sonar Python toolchain${N} (bathy, echopype, PINGMapper, PyGMT, py3dtiles ...)"
      read -rp "  Install it now into $OCEAN_VENV? [y/N] " a
      case "${a:-N}" in [Yy]*) OCEAN=yes ;; *) OCEAN=no ;; esac
    else OCEAN=no; fi
  fi
  [ "$OCEAN" = yes ] && install_ocean_tools
  return 0
}

install_ocean_tools
