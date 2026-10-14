"""Dijalankan setelah `npx cap add android`: izin, ikon, dan splash."""
import glob, shutil
M = 'android/app/src/main/AndroidManifest.xml'
s = open(M, encoding='utf8').read()
add = ''.join('    <uses-permission android:name="%s" />\n' % p for p in
              ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION',
               'android.permission.VIBRATE', 'android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS',
               'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_LOCATION'] if p not in s)
add += ''.join('    <uses-feature android:name="%s" android:required="false" />\n' % f for f in
               ['android.hardware.location.gps', 'android.hardware.sensor.compass', 'android.hardware.camera'] if f not in s)
assert '</manifest>' in s
open(M, 'w', encoding='utf8').write(s.replace('</manifest>', add + '</manifest>', 1))
res = 'android/app/src/main/res'
shutil.copytree('resources/android-res', res, dirs_exist_ok=True)
for p in glob.glob(res + '/**/splash.png', recursive=True):
    shutil.copy('resources/splash.png', p)
print('Android siap: izin lokasi, ikon, splash diterapkan')
