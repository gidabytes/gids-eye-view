# GEO INTEL — geospatial expansion for Gids Eye View

An optional, self-contained module (`src/geo/`) that adds geographic search, nearby places, routing, route optimisation, road snapping, elevation profiles, weather, air quality, pollen, solar irradiance, time zones, and street-level/aerial imagery discovery to the existing app. It also lets native voice answer geo questions. It does not replace or restructure anything that already exists.

Disable it completely with `VITE_GEO_ENABLED=false` in `.env`. The app then builds and runs exactly as before.

## 1. Repository audit (baseline)

Audited against upstream **God's Eye View Free Edition v0.2.1** (`gods-eye-view-free`, commit `60a89fb`), which `gids-eye-view` is forked from. The fork's own additions (mobile rail, ocean/sub, Exploration panel, Capacitor shell) were **not available** for inspection; the integration is designed to install on top of them through `gids-android.sh --geo`.

| Area | Finding |
|---|---|
| Framework | Vanilla ES modules + Vite 6; entry `src/main.js` → `standalone/application.js` |
| Renderer | CesiumJS 1.124 3D globe (`src/app/viewer.js`), map stack: Google 3D tiles / Esri / OSM, terrain |
| World text | Mandatory world-overlay host (`src/overlays/worldOverlay.js`); Cesium labels are forbidden by `noCesiumLabels.test.mjs` |
| Search | `src/search/*`: coordinates, presets, Google, Cesium ion, Wikipedia, Photon, Nominatim (`/api/geocode`) |
| Routing | `/api/route` → Node middleware → FOSSGIS OSRM (`routing.openstreetmap.de`), directions layer `src/layers/directions` |
| Weather | `/api/weather-effects` → Node middleware → Open-Meteo (current conditions for visual effects) |
| Voice | Gemini Live via Node relay (`/api/realtime/gemini-session`); 30+ structured tools in `src/voice/actionSchemas.js`, payload pinned by SHA-256 test |
| Backend | **Node** middleware inside the Vite dev server (`server/providers/*`), no FastAPI. The Android APK has **no** server |
| Tests | `npm test` → `node --test` over `src/**/*.test.mjs` (Node 24) |
| Boundaries | `npm run check:boundaries` (import direction + package boundaries) |

**Baseline (Node 24.22):** `npm test` 5,752 tests, 5,751 passed, 0 failed · `npm run build` OK.
**After GEO:** 5,796 tests (44 new), 5,795 passed, 0 failed · build OK · boundaries OK · `format:check` OK.

## 2. Design decisions

* **No second map renderer.** MapLibre GL JS would duplicate the Cesium globe the app already renders, with its own tile stack. GEO draws on the existing viewer instead (routes, markers, an optional aerial imagery layer). MapLibre stays a documented option for a future 2D mode.
* **No new backend.** The APK has no server, and upstream's backend is Node, not FastAPI. All GEO providers run client-side against keyless open services, with timeouts, retries, caching, per-host pacing and cancellation. In the APK, requests go through `CapacitorHttp`, which avoids CORS. Self-hosted endpoints can be swapped in through env vars (section 6).
* **Zero new npm dependencies** for the web app. The only native plugin added by `gids-android.sh --geo` is `@capacitor/geolocation`, matched to the project's Capacitor major.
* **Two additive edits to existing files:** one import in `src/main.js` and `globalThis.__gevViewer = viewer` in `src/app/viewer.js`.
* **Honest data.** Every result carries provenance: provider, retrieval time, validity time, units, attribution, kind (`model`, `forecast`, `historical`, `static` or `live`) and a note. The UI and voice say "model estimate", "no live traffic" and "photo taken on …". Coverage gaps are reported, never filled.

## 3. Integration matrix

| Capability | Primary | Fallback / alternative | Status |
|---|---|---|---|
| Place / address search | Photon (komoot, OSM) | Nominatim (1 req/s) | Implemented and tested (unit + e2e with recorded payloads) |
| Reverse geocoding | Photon `/reverse` | Nominatim | Implemented and tested |
| Coordinate input (decimal, DMS) | local parser | – | Implemented and tested |
| Nearby POIs (20 categories, ≤10 km) | Overpass API | overpass.kumi.systems | Implemented and tested |
| Routing (car / foot / bike, ≤3 alternatives, maneuvers) | OSRM @ FOSSGIS | self-hosted OSRM via env | Implemented and tested |
| Spoken directions | existing TTS (`gevSpeak`) / speechSynthesis | – | Implemented, not device-tested |
| Road snapping | OSRM `/nearest` | Valhalla `trace_attributes` (later) | Implemented and tested (unit) |
| Travel-time matrix | OSRM `/table` | ORS matrix (key) | Implemented and tested (unit; no UI yet) |
| Stop-order optimisation (TSP) | Valhalla `optimized_route` @ FOSSGIS | VROOM self-hosted (time windows, capacities) | Implemented and tested (unit + payload decode); live endpoint not reachable from the build sandbox |
| Elevation point / profile | Open-Meteo (Copernicus GLO-90) | OpenTopoData (SRTM 90 m) | Implemented and tested |
| Weather (current-hour model + 3-day forecast) | Open-Meteo | – | Implemented and tested |
| Air quality (PM2.5, PM10, O₃, NO₂, SO₂, CO, US/EU AQI) | Open-Meteo / CAMS | – | Implemented and tested |
| Pollen | Open-Meteo / CAMS Europe | – | Implemented; **coverage-limited to Europe**, so the Philippines reports "not available" |
| Solar irradiance (GHI, direct, diffuse, UV, daily sum) | Open-Meteo | – | Implemented and tested |
| Time zone + local time | Open-Meteo geographic lookup + `Intl` | tzf / geo2tz offline (later) | Implemented and tested |
| Street-level imagery | Panoramax | Mapillary (already in app) | Implemented and tested (format verified against the live API) |
| Aerial imagery (archive) + globe layer | OpenAerialMap | – | Implemented and tested (format verified live; licence from catalogue `meta`) |
| Device location + consent | Capacitor Geolocation / browser API | – | Implemented; consent gate unit-tested; device permission flows not device-tested |
| Provider health check | probes per provider | – | Implemented (Sources tab) |
| Native voice geo questions | `geoIntent()` | falls through to existing voice | Implemented and tested |
| Gemini voice tool (`geo_query`) | – | – | **Documented for a later phase** (section 8): needs your fork's action files and its pinned tool digest |
| Offline maps / self-hosted tiles | – | Protomaps PMTiles, Baremaps | Documented for a later phase |
| Live traffic | – | – | Not available from these open services; never simulated |

## 4. Using it

**Desktop:** the **GEO** button in the top action bar opens the GEO INTEL panel.
**Phone (APK):** the **Geo** orb in the floating 4-dot menu opens the same panel in the glass sheet.

Tabs:

* **Search**: a place, an address, `14.5995, 120.9842`, or DMS. Also "What's at the map centre?".
* **Nearby**: a category and radius around the map centre or your location.
* **Route**: From (leave empty for your location) and To, with drive, walk or cycle. Shows the fastest route and alternatives, steps, 🔊 Speak and an elevation profile. "More" adds optimising 3–20 stops and snapping your position to a road.
* **Environment**: weather, air quality and pollen, solar, elevation and time zone for the map centre or your location.
* **Imagery**: Panoramax photos (capture date, heading, licence, author) and OpenAerialMap scenes (acquisition date; "Show on globe" adds the layer).
* **Sources**: location-sharing consent, provider health, endpoints, attribution and cache.

Voice examples (on-device voice in the APK): "find the nearest hospital", "nearest police station near Cebu City", "directions to Intramuros by walking", "weather in Baguio", "air quality here", "what time is it in Tokyo", "elevation of Mount Pulag", "show street view here". Phrases that aren't geo questions ("take me to …", "turn on flights", "dive to 2000 m") keep their existing behaviour.

## 5. Privacy

* Your precise location is only sent to providers after you choose **Allow** (Sources tab or first prompt). The choice is stored locally in `gev.geo.shareLocation`.
* Voice never asks for consent mid-sentence. Without prior consent it uses the map centre and says so ("…from the map centre").
* No background tracking and no location history. The APK requests foreground location only (`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`).
* External text is rendered with `textContent`, links are https-only with `rel="noopener noreferrer"`, and provider responses are never executed.

## 6. Configuration (`.env`, all optional)

```
VITE_GEO_ENABLED=true                 # false = module off
VITE_GEO_PHOTON_URL=                  # e.g. https://photon.example.org
VITE_GEO_NOMINATIM_URL=
VITE_GEO_OVERPASS_URL=                # comma-separated list = fallbacks
VITE_GEO_OSRM_URL=                    # expects /routed-{car,foot,bike}/... layout
VITE_GEO_VALHALLA_URL=
VITE_GEO_OPEN_METEO_URL=
VITE_GEO_AIR_QUALITY_URL=
VITE_GEO_PANORAMAX_URL=
```

No API keys are required. None are stored in source or the bundle.

## 7. Licensing and service policies (verify before production)

| Service | Terms that matter |
|---|---|
| OpenStreetMap data (Photon, Nominatim, Overpass, OSRM, Valhalla) | ODbL: attribution "© OpenStreetMap contributors" is shown in every result and in Sources |
| Nominatim (OSMF) | Max 1 req/s (enforced by the pacer), no bulk geocoding; heavy use → self-host or a commercial host |
| Photon (komoot) public | Fair use; no SLA → self-host for production traffic |
| Overpass public instances | Fair use; queries are radius-bounded and cached 30 min |
| FOSSGIS OSRM / Valhalla | Community servers, fair use, no SLA; self-host OSRM/Valhalla (or VROOM) for production |
| Open-Meteo | Free for **non-commercial** use, CC BY 4.0 attribution; commercial use requires a paid plan or self-hosting (open-source) |
| CAMS (via Open-Meteo) | Copernicus licence, attribution shown |
| Panoramax | Per-picture licence (shown per result, e.g. CC-BY-SA-4.0) |
| OpenAerialMap | Catalogue licence CC-BY 4.0 as reported by the API; tile URLs are http on some records (upgraded to https, may not load) |

## 8. Later phases

**Gemini tool (desktop voice).** Add a `geo_query` schema to `src/voice/actionSchemas.js`:
`{ name:'geo_query', parameters:{ type:'object', additionalProperties:false, properties:{ question:{ type:'string' } }, required:['question'] } }`.
Handle it in `src/voice/gevActions.js` with `return globalThis.gevGeo ? globalThis.gevGeo.ask(args.question) : { ok:false, error:'geo unavailable' }`, add the tool description to `server/providers/voice/tools.js`, and re-derive the digest in `actionSchemas.test.mjs` (upstream's procedure for additive tools).

**Other planned items:**
* Offline: Protomaps PMTiles regional extracts (licence-permitting) and an offline tz lookup (tzf).
* Self-hosted stack: Photon + OSRM + Valhalla + VROOM (docker-compose), selected through section 6.
* Matrix UI and a VROOM-backed optimiser with time windows.

## 9. Rollback

* **Switch off:** `VITE_GEO_ENABLED=false`.
* **Remove:** delete `src/geo/` and `docs/GEO.md`, then remove the `import './geo/boot.js'` line in `src/main.js` and the `globalThis.__gevViewer = viewer;` line in `src/app/viewer.js`.
* **With gids-android.sh:** `./gids-android.sh --geo-remove` does all of the above, using the backup in `.gev-backup/pre-geo-*.tgz`.
