# Employee APK UX/UI audit — 26 Nov 2026

## Scope and evidence

Reviewed the Flutter employee application source: login, Today/check-in,
GPS confirmation map, monthly attendance calendar, leave form, request status,
account/security, and the mandatory-update prompt. This is source and widget-test
evidence; it is **not** a substitute for physical Android-device or GPS UAT.

## Findings and actions

| Screen / flow | Finding | Priority | Change in 1.0.17 |
|---|---|---:|---|
| Entire application | Supporting text was too pale against white, especially outdoors; the white canvas also used almost-invisible dividers. | High | Raised secondary ink to `#475569`, strengthened borders, and set body/title text tokens to dark ink. |
| Entire application | The old slight-blue canvas plus white cards made every screen look like stacked panels, diluting the attendance action. | High | Used a white canvas; separation now comes from a clear hairline rather than elevation. |
| Today | The primary check-in/check-out action must remain the sole saturated action; its time tiles used a pale inactive time that looked like a loading failure. | High | Inactive time is now readable secondary ink. Green/amber/red remain reserved for operational status. |
| Login | The identity, employee selector, password and login action are already one linear task. | Medium | Retained the short, single-column form; no decorative card or secondary CTA added. |
| GPS confirmation | Showing map, location state and the check-in action at once is useful, but its auxiliary copy must not compete with the action. | Medium | Relies on the stronger global secondary text token while retaining map status as one-line support. |
| Monthly calendar | Status colors are meaningful but must be read with their labels/details, not color alone. | Medium | Existing legend, selected-day detail and icon/time rows remain; contrast improvements apply to labels and details. |
| Leave + requests | These are separate jobs: submit a new leave request and track what was sent. | Medium | Retained separate tabs and compact choice/date controls; no unrelated financial request was reintroduced. |
| Account + security | The compact account is appropriate on a 360×800 device and must not become another scrolling menu. | High | Preserved fixed layout, security actions, and no advance-payment entry point. |
| Mandatory updates | The dialog correctly blocks only when server metadata advertises a strictly newer build. | High | Version is advanced atomically with the APK to avoid the old repeated-update mismatch. |

## Product rules retained

1. Check-in is GPS/location-policy aware; check-out stays available without a
   new GPS gate.
2. Attendance state comes from accepted server events; the app never invents a
   default shift when the schedule is unavailable.
3. Status color supports text and icon; it is not the only indication.
4. Employee-facing wording is direct Thai: one main decision/action per screen.

## Verification required before calling it production-complete

- Install the release APK over the previous build on a real Android phone.
- Test current location allowed, location denied, mock-location rejection,
  check-in, check-out, leave submission, password change and logout.
- Confirm the backend `version` action reports the same version code/name and
  a fresh Drive URL as the APK manifest.
