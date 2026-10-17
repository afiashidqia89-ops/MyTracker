# MyTracker Android — Build APK di GitHub

Aplikasi **MyTracker** untuk Android — peta & GPS dengan fitur tagging, tracking, export XLSX, dan **offline mode**. UI ditulis dengan HTML/CSS/JS biasa (di folder `www/`), dibungkus jadi APK native Android dengan **Capacitor**. Build APK dilakukan otomatis di **GitHub Actions** — tidak butuh Android Studio.

> Fitur: peta multi-layer (offline + online), waypoints, track recording, GPS auto-start, pengukuran, GPX/XLSX export, multi-project, kompas, koordinat 4 format, foto geotag, **export XLSX offline**, **fully offline mode**.

---

## ✨ Fitur Utama

### 1. Export XLSX (Offline) 📊
- Export semua data waypoints + tracks ke file `.xlsx` (Excel)
- 5 sheet: Placemarks, Tracks, TrackPoints, Projects, Settings
- Pakai **SheetJS** yang sudah dibundle di APK — tidak butuh internet
- Berisi: nama, kategori, koordinat (lat/lng/alt), jarak, durasi, ascent/descent, speed, foto count, timestamp, dll

### 2. Auto-search GPS saat startup 🛰️
- Saat pertama kali aplikasi dibuka, GPS langsung aktif & mencari lokasi
- Toast "Mencari lokasi GPS…" muncul otomatis
- Peta auto-center ke lokasi GPS saat lock ditemukan
- **Manual lock GPS tetap dipertahankan** — tombol GPS di toolbar untuk toggle on/off kapan saja

### 3. Nama aplikasi: MyTracker
- App name: "MyTracker"
- Package ID: `com.my.tracker`
- Icon: blue dengan location pin + GPS crosshair

### 4. Fully Offline Mode 🔒
- **World Map (Offline)** — base layer dari Natural Earth (bundled di APK, ~240 KB)
- Semua data disimpan di IndexedDB (offline-first)
- Search places bisa offline (cari di placemark/track lokal)
- Track recording jalan tanpa internet
- Export GPX & XLSX tidak butuh internet
- Online layers (OSM/Satellite/Topo) tersedia jika ada koneksi

---

## 🗺️ Fitur Lengkap (sama seperti Avenza + Pro)

### Map & Layers
- **Offline**: World Map (bundled Natural Earth) — works tanpa internet
- Online: OpenStreetMap, Esri Satellite, OpenTopoMap (opsional)
- Overlay: Esri Terrain + custom GeoJSON/KML import

### Waypoints (Tagging)
- 9 kategori (waypoint, camping, makan, air, viewpoint, parkir, danger, foto, custom)
- 8 warna pilihan + foto attachment (multiple)
- Klik di peta untuk tambah

### Tracks (Tracking)
- Record track dengan GPS (start/stop)
- Statistik: jarak, durasi, ascent/descent, max/min elev, avg/max speed
- Visualisasi track dengan warna custom
- Tetap jalan saat layar mati (foreground service)

### Pengukuran
- Ukur jarak (line) & luas area (polygon) dengan klik di peta

### GPS & Sensor
- **Auto-start GPS saat app dibuka**
- Real-time GPS: akurasi, heading, speed
- Manual toggle GPS di toolbar
- Kompas (deviceorientation API)
- Follow GPS mode (auto-center peta ke lokasi)

### Coordinate Display
- 4 format: Decimal, DMS, UTM, MGRS

### Search
- **Offline-first**: cari di placemark/track lokal
- Online: Nominatim (OpenStreetMap) jika ada internet

### Export
- **GPX** — format standar untuk GPS apps
- **XLSX** — Excel format dengan 5 sheet detail (offline)
- KML (via GeoJSON import)

### Pro Features
- Unlimited maps & projects
- Custom map import (GeoJSON/KML)
- Batch GPX & XLSX export
- Multi-project management
- Advanced track statistics
- Photo geotagging per placemark
- All coordinate formats (UTM, MGRS, DMS)
- Fully offline mode

---

## 📁 Struktur folder

```
mytracker-android/
├── .github/workflows/
│   └── build-apk.yml        # GitHub Actions workflow (auto-build APK)
├── android/                 # Project Android native (Capacitor)
│   ├── app/
│   │   ├── build.gradle
│   │   ├── proguard-rules.pro
│   │   └── src/main/
│   │       ├── AndroidManifest.xml    # Permissions: GPS, Camera, Internet, dll
│   │       ├── java/com/my/tracker/MainActivity.java
│   │       └── res/
│   │           ├── mipmap-*/           # Launcher icons (semua density)
│   │           ├── values/             # strings, styles, colors
│   │           └── xml/file_paths.xml
│   ├── build.gradle
│   ├── settings.gradle
│   ├── variables.gradle
│   ├── gradle.properties
│   ├── gradle/wrapper/gradle-wrapper.properties
│   ├── gradlew (auto-download wrapper)
│   └── gradlew.bat
├── www/                     # Web app (dibungkus jadi APK)
│   ├── index.html
│   ├── styles.css
│   ├── app.js               # Semua logika aplikasi (offline-ready)
│   ├── manifest.json
│   ├── icons/               # PWA icons (192, 512)
│   ├── xlsx/xlsx.full.min.js # SheetJS library (bundled, 924 KB)
│   ├── data/world-land.geo.json # World map offline (240 KB, Natural Earth)
│   └── leaflet/             # Leaflet library (bundled)
├── capacitor.config.json    # Konfigurasi Capacitor (appId: com.my.tracker)
├── package.json             # Dependencies (Capacitor + plugins)
├── tsconfig.json
├── .gitignore
├── LICENSE (MIT)
└── README.md                # File ini
```

---

## 🚀 Cara Build APK di GitHub (RECOMMENDED)

### 1. Buat repository baru di GitHub
- https://github.com/new → nama `mytracker-android` (atau apa pun)
- **JANGAN** centang "Add a README" atau ".gitignore"
- Klik **Create repository**

### 2. Push file-file ini ke repo

```bash
git clone https://github.com/<USERNAME>/mytracker-android.git
cd mytracker-android

# Salin semua isi folder mytracker-android/ ke sini
git add .
git commit -m "feat: initial MyTracker Android project"
git push origin main
```

### 3. Build APK otomatis berjalan

Setelah push, GitHub Actions akan:
1. Setup Node.js 20 + Java 17 + Android SDK 34
2. Install dependencies Capacitor
3. Sync web assets ke project Android
4. Build debug APK + release APK

Lihat progres: **tab Actions** → `Build Android APK` → klik run terbaru.

Build butuh **5–10 menit** untuk first run, berikutnya pakai cache jadi lebih cepat.

### 4. Download APK

1. Buka **tab Actions** → klik run yang sukses (centang hijau)
2. Scroll ke bawah → section **Artifacts**
3. Download:
   - `mytracker-debug-apk` — untuk test (debug)
   - `mytracker-release-apk-unsigned` — untuk distribusi (release)
4. Unzip → dapat `app-debug.apk`
5. Install di HP Android:
   - Transfer APK ke HP (USB, Google Drive, Telegram, dll)
   - Buka file manager → tap APK → **izinkan dari sumber ini** → Install

---

## 🛠️ Cara Build APK Lokal (alternatif)

Butuh di laptop/PC dengan Android Studio. Lebih rumit tapi lebih cepat untuk iterasi.

### Prasyarat
- **Node.js 20+** — https://nodejs.org
- **Android Studio** (dengan Android SDK 34 + Build Tools 34.0.0) — https://developer.android.com/studio
- **Java 17** (terpasang otomatis dengan Android Studio)

### Langkah

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug         # Linux/macOS
# atau: gradlew.bat assembleDebug  # Windows

# APK hasil ada di:
#    android/app/build/outputs/apk/debug/app-debug.apk

# Buka di Android Studio (untuk running di emulator / debug USB):
npx cap open android
```

---

## 🔒 Permissions Android

APK meminta permissions berikut (lihat `AndroidManifest.xml`):

| Permission | Keperluan |
|---|---|
| `INTERNET` | Tile peta online (OSM, Esri) — opsional, offline mode tetap jalan tanpa ini |
| `ACCESS_FINE_LOCATION` | GPS akurat untuk koordinat & track recording |
| `ACCESS_COARSE_LOCATION` | GPS kasar (fallback) |
| `ACCESS_BACKGROUND_LOCATION` | Track recording saat layar mati |
| `CAMERA` | Foto waypoint |
| `WRITE_EXTERNAL_STORAGE` (SDK ≤28) | Simpan file GPX/XLSX di Android lama |
| `FOREGROUND_SERVICE` | Recording tetap jalan saat layar mati |
| `WAKE_LOCK` | Cegah sleep saat recording |
| `POST_NOTIFICATIONS` (Android 13+) | Notif saat recording |

Semua permission diminta saat pertama kali fitur terkait dijalankan.

---

## 🧩 Customisasi

### Ganti nama aplikasi
Edit `android/app/src/main/res/values/strings.xml` → ubah `<string name="app_name">…`

### Ganti package ID
- Edit `capacitor.config.json` → `appId`
- Edit `android/app/build.gradle` → `applicationId` dan `namespace`
- Edit `AndroidManifest.xml` → `package`
- Rename folder `java/com/my/tracker` → sesuai package baru
- Edit `MainActivity.java` → `package com.my.tracker;`

### Ganti ikon launcher
Timpa file di `android/app/src/main/res/mipmap-*/`. Generate ulang dengan:
```bash
python scripts/make_mytracker_icons.py
```

### Ganti base layers default
Edit `www/app.js` → array `BUILTIN_LAYERS`

### Tambah custom XLSX format
Edit `www/app.js` → fungsi `exportXlsx()` (sekitar line 283)

---

## ❓ Troubleshooting

**Build gagal: "Could not find gradle-wrapper.jar"**
- `android/gradlew` otomatis mendownload `gradle-wrapper.jar` saat pertama dijalankan

**Build gagal: "Unexpected input(s) 'sdk-platform', 'sdk-build-tools'"**
- Sudah diperbaiki di versi terbaru workflow — input yang benar adalah `packages`

**Build gagal: "Could not find com.getcapacitor:geolocation:6.0.1"**
- Sudah diperbaiki — pakai `project(':capacitor-geolocation')` (subproject refs)

**Build gagal: "Could not find installation of TypeScript"**
- Sudah diperbaiki — pakai `capacitor.config.json` (bukan `.ts`)

**APK install ditolak: "App not installed"**
- Pastikan "Install unknown apps" diizinkan untuk File Manager / browser
- Untuk Android 13+, izinkan "Restricted setting" di info APK

**Peta blank di APK (offline)**
- World Map (Offline) sudah di-bundle — harus jalan tanpa internet
- Cek apakah `www/data/world-land.geo.json` dan `www/xlsx/xlsx.full.min.js` ada di repo
- Cek permission: Settings Android → MyTracker → Permissions → izinkan Location

**GPS tidak auto-start saat app dibuka**
- Pastikan settings.gpsTracking = true (default di DEFAULT_SETTINGS)
- Pastikan permission lokasi diizinkan
- Cek logcat untuk error GPS

**Export XLSX gagal**
- Pastikan `www/xlsx/xlsx.full.min.js` ada di repo
- Cek console JS untuk error: `XLSX is not defined`
- SheetJS dibundle di APK, tidak butuh internet untuk export

**Track berhenti saat layar mati**
- Aktifkan foreground service (sudah dikonfigurasi di manifest)
- Matikan "Battery optimization" untuk MyTracker di Settings Android

---

## 📝 Lisensi

MIT — bebas pakai, modifikasi, dan distribusi. Lihat `LICENSE`.

## 🙌 Credits

Dibangun dengan:
- [Leaflet](https://leafletjs.com/) — peta interaktif open source
- [Capacitor](https://capacitorjs.com/) — wrap web jadi APK native
- [SheetJS](https://sheetjs.com/) — XLSX export (offline, Community Edition)
- [GitHub Actions](https://docs.github.com/en/actions) — CI/CD otomatis
- [OpenStreetMap](https://www.openstreetmap.org/) — tile peta online
- [Nominatim](https://nominatim.openstreetmap.org/) — geocoding search
- [Natural Earth](https://www.naturalearthdata.com/) — world map offline (public domain)
