# Employee app — release build

The debug APK in `build/` (107 MB) is **not** for distribution. Follow this to
produce a signed, shrunk release build.

## 1. Create a release keystore (once)
Keep the `.jks` file and its passwords safe and **out of git** (already ignored).
Losing them means you can never ship an update to the same app listing.

```bash
keytool -genkey -v -keystore bvn-release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias bvn
```

Then copy `android/key.properties.example` → `android/key.properties` and fill in
the passwords, alias (`bvn`) and `storeFile` path. Gradle reads it automatically;
if the file is missing, release silently falls back to the debug key (not publishable).

## 2. Build

Per-ABI APKs (smallest; what you sideload / attach):
```bash
flutter build apk --release --split-per-abi \
  --dart-define=BVN_API_URL=https://script.google.com/macros/s/XXXX/exec
```
→ `build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` (~15–25 MB) is the one
for modern phones. Drop the x86_64 output (emulator only).

App Bundle for Google Play:
```bash
flutter build appbundle --release \
  --dart-define=BVN_API_URL=https://script.google.com/macros/s/XXXX/exec
```

> Pass the endpoint with `--dart-define=BVN_API_URL=...`. The hardcoded default in
> `lib/bvn_api.dart` is only a dev fallback; don't rely on it for a shipped build.

## 3. What release config now does
- Signs with your release keystore (from `key.properties`).
- R8 `isMinifyEnabled` + `isShrinkResources` → strips unused code/resources.
- AOT compile drops the 74 MB debug `kernel_blob` and the Vulkan validation layer.
- App launcher name is **BVN Package** (was `employee_mobile`).

## 4. Still TODO before a real public release
- Replace the default Flutter launcher icon with BVN branding
  (`flutter_launcher_icons` or `android/app/src/main/res/mipmap-*`).
- Verify `minSdk` is acceptable for the target phones and the signed APK installs.
- Smoke-test the release build against the real endpoint (login + GPS check-in).
- Consider anti-spoofing / mock-location handling for attendance integrity.
