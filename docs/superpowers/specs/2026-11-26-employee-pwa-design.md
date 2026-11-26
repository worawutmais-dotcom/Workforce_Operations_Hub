# Employee PWA for iPhone — Design Proposal

## Intent

Let employees who use iPhone open the workforce app from the Home Screen and
check in/out using the same authenticated backend, attendance rules, and site
radius rules as Android. The PWA is an additional client, not an Admin
replacement and not a second attendance system.

## Selected approach

**Flutter Web PWA from `employee_mobile`** was selected because the current
employee client already contains login, attendance, calendar, leave, profile,
and the shared `BvnApi` contract. We will add web support and responsive web
behaviour rather than duplicate business rules in a new frontend.

Alternatives considered:

1. Flutter Web PWA — selected; greatest reuse and consistent workflow with the
   APK.
2. New TypeScript PWA — a smaller initial web bundle, but duplicates screens
   and creates two client implementations.
3. Check-in/out-only web page — fastest, but makes iPhone employees use a
   partial product and creates two UX paths.

## Scope proposed for release 1

- Home-screen-installable PWA served over HTTPS.
- Employee login, Today, check-in/out, location/radius validation, month
  history, leave, requests, and profile: feature parity with the current APK.
- Mobile-first width, safe-area spacing, clear Safari "Add to Home Screen"
  guidance, web manifest, icons, and offline app shell only.
- Reuse `BvnApi` and `swift-handler`; no administrator UI, employee database
  data, payroll calculations, or Supabase schema changes.

## iPhone constraints

- Installation is manual in Safari: Share -> Add to Home Screen. iOS has no
  browser install prompt, so the PWA displays an instructional sheet only when
  it detects iPhone Safari and is not already standalone.
- GPS is requested only after the employee presses Check-in. The PWA stores no
  continuous background location; a visible permission-denied state explains
  how to enable precise location and offers retry.
- Check-out remains location-free when company policy permits, matching the
  current mobile client.
- The site must be HTTPS. The existing Edge Function already allows browser
  CORS POST/OPTIONS calls, but this must be tested from the production PWA
  origin before release.
- A PWA release does not use APK update metadata and never changes
  `app_update_mandatory`.

## UX

- A deep-navy compact header, white body, dark text, and semantic status
  colours follow the Option 3 mobile visual system.
- The Today screen opens directly to attendance state and its next action.
- The installation card is compact, dismissible, and never blocks check-in.
- On a 360–430px viewport, all primary controls remain visible without
  horizontal scrolling; touch targets are 44px minimum, with 48px attendance
  actions.

## Verification

1. Web unit/widget tests cover install guidance detection and the GPS-denied
   state.
2. `flutter analyze`, `flutter test`, and `flutter build web --release` pass.
3. Test on a real iPhone in Safari: login, Add to Home Screen, first GPS
   prompt, allowed-site check-in, denied GPS recovery, check-out, session
   re-open, and Safari web app launch.
4. Production verification checks HTTPS headers, manifest/service worker,
   `swift-handler` CORS, and that Admin and Android update settings are
   unchanged.

## Decisions needed before implementation

- Confirm whether release 1 should include **full parity** with the APK as
  proposed, or only Today + check-in/out + history before expanding to leave,
  requests, and profile.
- Confirm the production hostname for the PWA. A stable branded HTTPS hostname
  is required; no public launch should use a temporary preview URL.
