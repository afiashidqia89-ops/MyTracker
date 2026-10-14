# MyTracker APK

Aplikasi peta PDF/GeoTIFF offline (tag, rekam track, kompas, geofence, Shapefile) yang dibungkus
menjadi APK Android native dengan Capacitor. APK dibangun otomatis oleh GitHub Actions.

## Cara membuat APK
1. Buat repo baru di GitHub, lalu unggah **semua isi folder ini** (termasuk folder `.github`).
   Jika `.github` tidak ikut terunggah lewat browser, buat manual: *Add file → Create new file*,
   ketik nama `.github/workflows/build-apk.yml`, lalu tempel isi berkasnya.
2. Buka tab **Actions → Build APK → Run workflow**. Tunggu sekitar 5-10 menit.
3. Setelah hijau, buka run tersebut, unduh artifact **MyTracker-apk**, ekstrak, dan pasang
   `MyTracker-debug.apk` di HP (izinkan "pasang dari sumber tidak dikenal").

Setiap push ke `main` membangun ulang APK. Push tag `v1.0.0` juga membuat GitHub Release berisi APK.

## APK release bertanda tangan (opsional)
```
keytool -genkeypair -v -keystore mytracker.jks -alias mytracker -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 mytracker.jks      # salin hasilnya
```
Tambahkan di Settings → Secrets and variables → Actions:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Simpan berkas `mytracker.jks` dengan aman dan jangan di-commit.

## Mengubah aplikasi
Edit `www/index.html`, commit, lalu build ulang. ID aplikasi dan nama ada di `capacitor.config.json`.
Minimal Android 7.0 (API 24).

## Pelacakan di latar belakang
Aplikasi memakai layanan foreground (plugin `@capgo/background-geolocation`). Saat merekam track atau
mengemudi, tekan Home/minimize (bukan keluar). Notifikasi "MyTracker aktif" akan tampil selama GPS jalan.
Agar tidak dimatikan sistem: Pengaturan HP → Aplikasi → MyTracker → Baterai → **Tidak dibatasi**,
dan izinkan lokasi ("Izinkan sepanjang waktu" jika ditawarkan) serta notifikasi.

## Unduh peta OpenStreetMap
Peta Saya → tombol + → "Unduh jalan & nama tempat". Butuh internet saat mengunduh; hasilnya tersimpan offline.

## Jika GPS tidak muncul
Menu Pro (ikon slider) → **Diagnosa GPS**: menampilkan izin, sumber GPS, dan error terakhir.
Tombol "Minta izin & ulangi GPS" memunculkan permintaan izin lokasi. Pastikan Lokasi HP menyala.

## Agar perekaman tidak terputus saat layar mati
1. Izinkan lokasi ("Izinkan sepanjang waktu" jika ditawarkan) dan notifikasi untuk MyTracker.
2. Pengaturan HP → Aplikasi → MyTracker → Baterai → **Tidak dibatasi** (di Xiaomi/Oppo/Vivo/Samsung juga
   aktifkan "Mulai otomatis" dan kunci aplikasi di daftar Recent).
3. Saat merekam, tekan Home (bukan menutup aplikasi). Notifikasi "MyTracker aktif" harus tetap tampil.
4. Opsional: Menu Pro → "Layar tetap menyala saat merekam".
Jika sinyal GPS memang hilang, track dipecah menjadi segmen (garis putus-putus abu-abu menandai celah),
bukan ditarik garis lurus.
