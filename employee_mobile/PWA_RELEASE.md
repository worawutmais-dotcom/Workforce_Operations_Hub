# BVN Package Employee PWA — Release Checklist

## Artifact

Build from `employee_mobile`:

```powershell
C:\flutter\bin\flutter.bat build web --release
```

Deploy the complete `build/web/` directory to one stable **HTTPS** hostname.
Do not deploy it under the Admin Console path unless the server is configured
to preserve the PWA base path and its service-worker scope.

## Hosting checklist

- [ ] HTTPS is valid on the final branded hostname.
- [ ] `index.html` is served with `no-cache` or a short cache policy.
- [ ] Fingerprinted Flutter assets may be cached long-term.
- [ ] `manifest.json`, icons, and `flutter_bootstrap.js` are reachable from
  the same origin.
- [ ] Browser calls to `swift-handler` pass from the final origin.
- [ ] No server-side credential or Supabase service-role key is present in the
  web build.
- [ ] No APK update prompt or download link is shown in the PWA.

## iPhone Safari UAT

- [ ] Open the HTTPS URL in Safari on a physical iPhone.
- [ ] Log in with an active employee account.
- [ ] Confirm the compact Add to Home Screen guide appears in Safari and can
  be dismissed without blocking login.
- [ ] Use Share -> Add to Home Screen; launch the resulting BVN Package icon.
- [ ] Confirm the icon, title, deep-navy header, white body, and safe-area
  spacing are correct.
- [ ] With Location Services enabled, check in inside an allowed site radius.
- [ ] Deny GPS once and confirm the app explains the recovery path without
  submitting a false attendance event.
- [ ] Check out and confirm the PWA records the same attendance policy.
- [ ] Close and reopen the Home Screen app; confirm the employee session and
  month/history views load correctly.
- [ ] Repeat with unstable network and confirm the user receives a recoverable
  error rather than a stuck action.

## Release boundary

This PWA does not publish an App Store app, does not track employee location
in the background, and does not change Admin, payroll, employee records, or
Supabase schema. Production publication requires final-hostname CORS and
physical-iPhone UAT evidence.
