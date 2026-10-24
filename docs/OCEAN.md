# Ocean view & exploration submarine

Lawful, educational use: the submarine is a **simulation** over public
bathymetry. It never controls, tracks or represents a real vessel.

## Using it

| Control                                                               | What it does                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 🌊 **Ocean** (right-edge dock) or Exploration → _Ocean Floor Terrain_ | Seafloor terrain (Cesium World Bathymetry) + GEBCO relief; photorealistic 3D tiles are hidden until you turn it off             |
| 🛥 **Sub**                                                             | Launches the submarine under the camera (turns Ocean view on if needed)                                                         |
| **Dive site…**                                                        | Challenger Deep, Philippine Trench, Tubbataha, Cebu Strait, Great Barrier Reef, Mid-Atlantic Ridge, Titanic, Puerto Rico Trench |
| **W / S**                                                             | Throttle forward / reverse                                                                                                      |
| **A / D**                                                             | Steer                                                                                                                           |
| **Q / E**                                                             | Rise / dive                                                                                                                     |
| **Shift**                                                             | Explore speed (×40, to cross ocean basins in minutes)                                                                           |
| **X**                                                                 | Camera: chase → cockpit → free                                                                                                  |
| HUD buttons                                                           | The same controls for touch / Android                                                                                           |

Sub keys are captured **only while the sub is launched**, so your normal
shortcuts (D detection, C CCTV, …) are back as soon as you recall it. Space stays
push-to-talk.

### Voice (`control_ocean`)

"ocean view" · "launch the submarine" · "dive to 2000 meters" · "surface" ·
"take the sub to Challenger Deep" · "how deep are we?" · "recall the sub"

## Real seafloor heights

Add the free **Cesium World Bathymetry** asset (id `2426648`) to _My Assets_ at
<https://ion.cesium.com/assetdepot> for the same account as your
`CESIUM_ION_TOKEN`. Without it the sub still runs, with a flat limit of
10,935 m (Challenger Deep) and a notice in the HUD.

## Code map

| File                                      | Role                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/ocean/subPhysics.js`                 | Pure physics (great-circle motion, depth/seafloor clamp, light, zones, dive sites) — unit-tested |
| `src/ocean/subPhysics.test.mjs`           | `node --test` suite (runs with `npm test`)                                                       |
| `src/ocean/oceanRuntime.js`               | `OceanView`, `Submarine`, dock + HUD, `window.__gevOcean` API                                    |
| `src/ocean/index.js`                      | Boots after the viewer exists; wires the existing bathymetry toggle                              |
| `src/ocean/ocean.css`                     | Dock, HUD, underwater tint                                                                       |
| `src/voice/*`, `server/providers/voice/*` | `control_ocean` schema, description, handler                                                     |

## Offline ocean & sonar toolchain (optional)

```bash
scripts/install-ocean-tools.sh                    # venv at ~/gev-ocean-tools
scripts/install-ocean-tools.sh --with-mbsystem    # + MB-System from source (sudo; apt or Homebrew)
scripts/install-ocean-tools.sh --check            # report only
source ~/gev-ocean-tools/bin/activate && gev-ocean-check
```

Installs bathy, xarray/netCDF4, rasterio/geopandas, echopype, oceanstream,
PINGMapper, pytritech, ObsPy, OpenCV, PyGMT (+ GMT and `libgmt-dev`),
py3dtiles and JupyterLab. `--with-experimental` adds sonar-vision (single
release, no public source repo). `hadexion` is intentionally not installed: its
wheel has no `hadexion` module and drops generic `src`/`examples` packages into
site-packages.
