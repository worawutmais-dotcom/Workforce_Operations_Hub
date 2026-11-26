# Employee iPhone PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Flutter Web Progressive Web App for iPhone employees that reuses the existing authenticated attendance workflow and is ready for HTTPS hosting.

**Architecture:** Add the Flutter `web/` target to `employee_mobile` so the existing Dart screens and `BvnApi` contract compile for browsers. Keep PWA install guidance and browser detection in a small pure helper plus a presentation card; existing attendance code remains the only source of Check-in/out business logic.

**Tech Stack:** Flutter Web, Material 3, existing `geolocator`, `flutter_map`, `flutter_secure_storage`, Supabase Edge Function `swift-handler`, generated web manifest/service worker.

**Spec:** `docs/superpowers/specs/2026-11-26-employee-pwa-design.md`

## Global Constraints

- Reuse `BvnApi` and `swift-handler`; do not add a second attendance API.
- Do not modify `admin_codex`, administrator users, employee data, payroll rules, Supabase schema, or APK forced-update settings.
- PWA is HTTPS-hosted; no production hostname is assumed or published in this change.
- Location is requested only after Check-in; no continuous background tracking is added.
- Keep the Option 3 visual system: deep navy header, white body, dark text, semantic status colours, 44px controls and 48px attendance action.

## Review Focus

- iPhone Safari browser vs installed standalone window: installation guidance must not obstruct attendance after dismissal.
- Location permission denied, unavailable, or imprecise: existing clear retry/error state must stay usable.
- Browser storage failure/session expiry: employee returns to Login rather than an unhandled exception.
- Web build must not expose service credentials; only the existing publishable API key is present.
- PWA manifest/service worker and hosted assets must use a stable HTTPS origin before production release.

---

### Task 1: Add browser install-state helpers

**Files:**
- Create: `employee_mobile/lib/pwa_support.dart`
- Create: `employee_mobile/test/pwa_support_test.dart`

**Interfaces:**
- Produces: `bool shouldShowPwaInstallGuide({required bool isIosWeb, required bool isStandalone, required bool isDismissed})`
- Produces: `bool shouldRequestCheckInLocation({required bool locationRequired, required String eventType})`
- Consumed by: Task 2’s PWA install card and existing attendance flow verification.

- [ ] **Step 1: Write failing helper tests**

```dart
expect(shouldShowPwaInstallGuide(isIosWeb: true, isStandalone: false, isDismissed: false), isTrue);
expect(shouldShowPwaInstallGuide(isIosWeb: false, isStandalone: false, isDismissed: false), isFalse);
expect(shouldRequestCheckInLocation(locationRequired: true, eventType: 'check_in'), isTrue);
expect(shouldRequestCheckInLocation(locationRequired: true, eventType: 'check_out'), isFalse);
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `C:\flutter\bin\flutter.bat test test\pwa_support_test.dart --reporter expanded`

Expected: FAIL because `pwa_support.dart` does not exist.

- [ ] **Step 3: Implement pure helpers in `lib/pwa_support.dart`**

Use exact boolean predicates only; no platform channel, browser API, or backend call belongs in the helper.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `C:\flutter\bin\flutter.bat test test\pwa_support_test.dart --reporter expanded`

Expected: PASS.

### Task 2: Add Flutter Web shell and install guidance

**Files:**
- Create: `employee_mobile/web/` Flutter-generated PWA shell assets
- Modify: `employee_mobile/lib/main.dart`
- Modify: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: `shouldShowPwaInstallGuide` from Task 1.
- Produces: a dismissible `_PwaInstallGuide` rendered only for the non-standalone iPhone web case.
- Produces: Flutter Web manifest/service worker configuration consumed by Task 3.

- [ ] **Step 1: Write the failing widget test**

Add a widget test for a public `PwaInstallGuide` that asserts Safari steps are visible and the dismiss callback fires.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `C:\flutter\bin\flutter.bat test test\widget_test.dart --plain-name "renders the PWA install guide" --reporter expanded`

Expected: FAIL because the widget is not defined.

- [ ] **Step 3: Generate the web platform and implement the compact card**

Run `flutter create --platforms=web .` from `employee_mobile`; preserve existing Android files. Add an install card to the employee Login screen using the Option 3 flat visual system, with Safari Share -> Add to Home Screen steps and a non-blocking dismiss action. Use `kIsWeb` and `defaultTargetPlatform == TargetPlatform.iOS` to decide whether to offer the card; standalone detection is a post-hosting UAT condition, not a blocking dependency.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `C:\flutter\bin\flutter.bat test test\widget_test.dart --plain-name "renders the PWA install guide" --reporter expanded`

Expected: PASS.

- [ ] **Step 5: Run complete Flutter test suite**

Run: `C:\flutter\bin\flutter.bat test --reporter expanded`

Expected: PASS with no regressions in login, attendance, update, or Account tests.

### Task 3: Build and inspect the PWA artifact

**Files:**
- Create: `employee_mobile/PWA_RELEASE.md`

**Interfaces:**
- Consumes: Task 2 web shell and existing `BvnApi` CORS-compatible endpoint.
- Produces: `build/web/` deployable static PWA and a hosting/UAT checklist.

- [ ] **Step 1: Write the release checklist before build**

Document HTTPS hosting, cache headers, `manifest.json`, service worker, Safari Add to Home Screen, GPS permission/retry, check-in, check-out, session restore, CORS, and the explicit rule that APK update settings remain unchanged.

- [ ] **Step 2: Run static analysis**

Run: `C:\flutter\bin\flutter.bat analyze`

Expected: `No issues found!`.

- [ ] **Step 3: Build a production web artifact**

Run: `C:\flutter\bin\flutter.bat build web --release`

Expected: build completes and writes `build/web/index.html`, `manifest.json`, and Flutter service-worker assets.

- [ ] **Step 4: Inspect build output**

Verify manifest name/short_name/theme color and that `index.html` references the manifest. Verify no administrator or backend source file is changed.

- [ ] **Step 5: Commit scoped PWA files**

```bash
git add employee_mobile/web employee_mobile/lib/main.dart employee_mobile/lib/pwa_support.dart employee_mobile/test/pwa_support_test.dart employee_mobile/test/widget_test.dart employee_mobile/PWA_RELEASE.md docs/superpowers/specs/2026-11-26-employee-pwa-design.md docs/superpowers/plans/2026-11-26-employee-pwa.md
git commit -m "feat: add employee iPhone PWA shell"
```
