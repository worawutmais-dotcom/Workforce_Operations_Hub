# PWA-first Security and Minimal Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire APK-first employee behaviour and ship a safer, smaller PWA attendance workflow.

**Architecture:** The Edge Function remains the authoritative enforcement point; remove the anonymous directory handler and make CORS an origin-aware response policy. The Flutter client identifies as `PWA web`, contains no APK/update flow or Android project, and lazily presents the location map behind a user action.

**Tech Stack:** Flutter/Dart web, Supabase Edge Functions/Deno TypeScript, existing Node and Flutter test runners.

**Spec:** `docs/superpowers/specs/2026-11-27-pwa-first-security-minimal-spec.md`

## Global Constraints

- Keep `supabase/functions/bvn-api` and `supabase/functions/swift-handler` byte-identical before deployment.
- Do not change the Admin console or production data.
- PWA is the only employee channel; remove Android source and APK promotion/update code.
- Every behavior change is developed test-first and verified by the complete relevant suite.

## Review Focus

- Anonymous directory enumeration must return no employee data.
- Allowed browser origins must receive CORS headers; an untrusted origin must not.
- Browser clients must use the explicit `PWA web` device label.
- No APK or Android update UI may remain in the employee product.
- Map data must not load until the user requests the optional map surface.

---

### Task 1: Secure mobile gateway surface

**Files:**
- Modify: `supabase/functions/bvn-api/index.ts`
- Modify: `supabase/functions/swift-handler/index.ts`
- Create: `supabase/functions/swift-handler/pwa_security_test.ts`

**Interfaces:**
- Produces: origin-aware `cors(origin)` and no registered `employee_directory` action.
- Consumes: existing `H` action map and Edge Function response helper.

- [ ] Write a failing Deno test proving a no-token directory action is unsupported and CORS does not allow an unknown origin.
- [ ] Run the test and confirm it fails against the current public handler/CORS policy.
- [ ] Remove `employee_directory`; make `reply` and OPTIONS responses apply the new origin-aware CORS helper; mirror source to `swift-handler`.
- [ ] Run the new test and `node tools/mirror_sync_test.mjs`.
- [ ] Commit gateway hardening.

### Task 2: Remove APK and Android distribution behaviour

**Files:**
- Modify: `employee_mobile/lib/bvn_api.dart`
- Delete: `employee_mobile/android/`, `employee_mobile/lib/update.dart`, `employee_mobile/lib/notif.dart`, and APK release documents.
- Modify: `employee_mobile/lib/bvn_api.dart`, `employee_mobile/lib/main.dart`, and `employee_mobile/pubspec.yaml`.
- Create: `employee_mobile/test/pwa_release_test.dart`
- Modify: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Produces: an explicit `PWA web` login label with no APK update/download code.
- Consumes: `BvnApi.login`.

- [ ] Write a failing Dart test for the PWA release label with no APK metadata.
- [ ] Remove Android/APK code and the obsolete client directory method.
- [ ] Run the full Flutter suite, static analysis, and production web build.
- [ ] Commit the PWA-only distribution change.

### Task 3: Make Today operationally minimal

**Files:**
- Modify: `employee_mobile/lib/main.dart`
- Modify: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Produces: a compact location status surface that opens `_CheckInMap` only by explicit user action.
- Consumes: existing `_Today` attendance state and `_CheckInMap` API.

- [ ] Write a failing widget test that opens location detail only after tapping the map action.
- [ ] Run the focused test and observe it fails because the map is rendered in the initial Today tree.
- [ ] Implement the compact default state and on-demand map sheet/dialog without changing attendance requests.
- [ ] Run `flutter test`, `flutter analyze`, and `flutter build web --release --base-href /Workforce_Operations_Hub/employee/`.
- [ ] Commit minimal Today workflow.

### Task 4: Ship and verify PWA release

**Files:**
- Modify: `AI_COLLAB_BRIEF.md`

**Interfaces:**
- Consumes: completed gateway and PWA changes.

- [ ] Run the repository guard checks and all Flutter checks.
- [ ] Deploy the mirrored Edge Function using the connected Supabase capability, then make no-token and allowed/denied-origin checks against the live endpoint.
- [ ] Push the PWA, wait for GitHub Pages deployment, and smoke-check the hosted manifest/base path.
- [ ] Record validation and remaining device-UAT limits in `AI_COLLAB_BRIEF.md`.
- [ ] Commit release record.
