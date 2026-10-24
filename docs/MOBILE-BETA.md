# Gids Eyes View — Android mobile beta

**Version:** 0.1.0-beta.1 · **Status:** public beta · **App id:** `com.gidabytes.gidseyeview`

Gids Eyes View puts the God's Eye View 3D globe on Android phones. You get live aircraft, satellites, earthquakes, public cameras, an ocean view with a small submarine, and voice control ("fly to Cebu"). This is a **beta**: it works on the phones we tested, and we want reports from as many different Android devices as possible so the next versions run well on all of them.

> **No API keys are built in.** The shared APK has none. When you turn on a feature that needs a key, the app asks for **your own** free key. It is saved only on your phone. Never share an APK that someone built with their own keys inside.

---

## 1. What you need

| | Minimum | Recommended |
|---|---|---|
| Android | 7.0 (API 24) | 10 or newer |
| Android System WebView / Chrome | 100 | latest from the Play Store |
| RAM | 2 GB | 4 GB or more |
| Graphics | OpenGL ES 3.0 (WebGL 2) | any phone from 2019 on |
| Free space | 150 MB | 300 MB |

A laptop (Linux, macOS or Windows) and a USB data cable are only needed for methods A and B below.

## 2. Install

### A. Interactive installer from your laptop (Linux / macOS), recommended

The installer walks you through every step, checks that your phone can run the app, installs it, and offers to allow the microphone.

```bash
git clone https://github.com/gidabytes/gids-eye-view.git
cd gids-eye-view
./gids-install.sh
```

With no APK path it downloads the latest beta from the Releases page and checks its SHA-256 checksum. You can also pass a file: `./gids-install.sh ~/Downloads/gids-eyes-view-0.1.0-beta.1.apk`.

It needs `adb`:

- Ubuntu/Debian: `sudo apt install adb`
- Fedora: `sudo dnf install android-tools`
- macOS: `brew install android-platform-tools`

Each step it walks you through:

1. **Android tools:** finds `adb`.
2. **The APK:** finds or downloads it and checks the checksum.
3. **Prepare your phone (one time):**
   - Settings → About phone → tap **Build number** 7 times.
   - Settings → System → Developer options → turn on **USB debugging**.
   - Connect the cable, then tap **Allow** on the phone.
4. **Find your phone:** handles several connected devices and "unauthorized" phones.
5. **Compatibility check:** Android version, WebView version, RAM and GPU. It saves a `gids-device-report-*.txt` with no personal data, so you can attach it to a GitHub report.
6. **Install:** then it can allow the microphone (and, if you choose, location) and open the app.

### B. Manually with adb (any laptop, including Windows)

1. Download **Android SDK Platform-Tools**: <https://developer.android.com/tools/releases/platform-tools> and unzip it.
2. Download `gids-eyes-view-0.1.0-beta.1.apk` and its `.sha256` file from <https://github.com/gidabytes/gids-eye-view/releases>.
3. Check the file:
   - Windows: `certutil -hashfile gids-eyes-view-0.1.0-beta.1.apk SHA256`
   - macOS: `shasum -a 256 gids-eyes-view-0.1.0-beta.1.apk`
   - Linux: `sha256sum gids-eyes-view-0.1.0-beta.1.apk`

   The result must equal the text in the `.sha256` file.
4. Turn on USB debugging on the phone (see A, step 3) and connect it.
5. In the platform-tools folder (Windows: `adb.exe`):
   ```
   adb devices
   adb install -r gids-eyes-view-0.1.0-beta.1.apk
   adb shell pm grant com.gidabytes.gidseyeview android.permission.RECORD_AUDIO
   ```
   `adb devices` must list your phone as `device`. If it says `unauthorized`, tap Allow on the phone.

### C. Without a laptop

1. On the phone, open <https://github.com/gidabytes/gids-eye-view/releases> and download the `.apk`.
2. Open it from Downloads. Android asks to allow installs from your browser: **Settings → Install unknown apps → allow**, then go back and tap **Install**.
3. Google Play Protect may say the app is unknown. That's normal for apps outside the Play Store: choose **Install anyway**. If you're unsure, check the checksum first (method B, step 3).

## 3. First run

- **Permissions:**
  - **Microphone** is for voice commands. Speech is recognised by Google's on-device or online recogniser, the same as the keyboard mic.
  - **Location** is optional, for "near me" and your position on the globe.
- **Without any key you already get:** the globe, live flights, satellites, earthquakes, radio, public CCTV, transit, the ocean view and voice.
- **When a feature needs a key**, a dialog appears: "API KEY NEEDED", with what the key unlocks and a link to get a free one. Paste the key and tap **Save key**. **Not now** skips it until you restart the app.
- **POWER UP** (bottom right) lists every key the phone app can use. Add, change or remove keys there at any time. Saving restarts the app.

| Key | Unlocks | Where to get it (free) |
|---|---|---|
| Cesium ion | 3D terrain and the photoreal globe | <https://ion.cesium.com/tokens> |
| NASA FIRMS | Live active-fire detections | <https://firms.modaps.eosdis.nasa.gov/api/map_key/> |
| TomTom | Live traffic | <https://my.tomtom.com/keys> |
| OpenSky (optional) | More flight-polling credits | <https://opensky-network.org/my-opensky/account> |

Keys are kept in the app's private storage on your phone. They are sent only to the provider they belong to. Uninstalling the app deletes them.

The Cesium ion free tier is for personal, non-commercial use.

## 4. Update or remove

- **Update:** install the newer APK the same way. Your keys and settings stay.
- If Android says the signature doesn't match (an older copy built by someone else), uninstall that copy first. That deletes its saved keys.
- **Remove:** long-press the app → Uninstall, or `adb uninstall com.gidabytes.gidseyeview`.

## 5. Troubleshooting

| Problem | Fix |
|---|---|
| `adb devices` shows nothing | Use a data cable (not charge-only); try another USB port; turn USB debugging off and on. |
| `unauthorized` | Unlock the phone and tap **Allow** on the USB debugging dialog. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An older copy has a different signature: `adb uninstall com.gidabytes.gidseyeview`, then install again. |
| Black or frozen globe | Update **Android System WebView** and **Chrome** in the Play Store; close other apps; turn off heavy layers. |
| Voice does nothing | Allow the microphone; install or enable **Speech Recognition & Synthesis** and the **Google** app. With a laptop: `./gids-android.sh --voice-setup`. |
| A feature says "API key needed" after **Not now** | Restart the app, or add the key in **POWER UP**. |
| Slow on an older phone | Use one or two layers at a time; the beta needs feedback from devices like yours (see 7). |

Logs for a bug report (with a laptop): `adb logcat | grep -E "GEV|APK-Proxy|Cesium|chromium"`.

## 6. Build your own APK

You need Node.js 24, JDK 21 (Gradle 8.14 does not run on Java 25) and the Android SDK.

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # macOS: $(/usr/libexec/java_home -v 21)
./gids-android.sh --build       # asks for each missing key (hidden input, Enter skips)
./gids-android.sh --install     # phone over USB
```

- Keys you type are saved in `gids-keys.env` (chmod 600, ignored by git). **An APK built this way contains your keys. Install it only on your own devices.**
- `./gids-android.sh --public` builds the shareable, keyless APK into `release/` with a `.sha256`. It scans the web bundle and the APK and stops if any key from your `.env` or `gids-keys.env` is inside.
- `--no-prompt` (or `GEV_NO_PROMPT=1`) builds without questions.

## 7. Beta roadmap: every Android device

The beta's goal is to run well on the whole range of Android hardware. Planned and wanted:

- **Low-memory mode** for 2–3 GB phones and Android Go: fewer tiles, lower resolution, one data layer at a time.
- **GPU tiers:** pick render quality from the GPU and WebGL limits (Mali, Adreno, PowerVR, Xclipse).
- **Tablets, foldables and landscape:** two-pane layout, larger touch targets.
- **Older Android (7–9) and 32-bit ARM** phones.
- **Battery and heat:** frame-rate cap, pause rendering in the background.
- **Offline:** cached basemap and recent data for travel.
- **Signed release builds** and a Play Store / F-Droid listing, so updates install without warnings.
- **Fixes we already know about:** on narrow screens the top-left HUD text overlaps, and dock labels are clipped.

**Help the beta:**
- Open an issue at <https://github.com/gidabytes/gids-eye-view/issues> with the **Device report** template, and attach the `gids-device-report-*.txt` that `gids-install.sh` saved.
- Ideas go in a **Feature request**.
- Pull requests are welcome; see the README for the code layout.

## Credits

- Gids Eyes View is by [Gidabytes](https://github.com/gidabytes).
- It's built on the community [God's Eye View — Free Edition](https://github.com/electronictechshow-netizen/gods-eye-view-free), which is based on [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by **Bilawal Sidhu** (MIT). Not affiliated with or endorsed by either.
- Map data: Cesium, OpenStreetMap contributors, NASA, USGS, NOAA and the other sources listed in `DATA_SOURCES.md`.
