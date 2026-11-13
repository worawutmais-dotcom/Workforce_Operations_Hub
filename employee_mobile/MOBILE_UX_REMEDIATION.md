# BVN Package Employee APK — UX remediation

## Product rule

An employee should never need to understand payroll, APIs, GPS accuracy, or an
Admin's workflow. The app has one job: make today's attendance clear, submit a
request with confidence, and show what happened next.

## Unslop direction

- **Product:** attendance and request app for BVN Package employees.
- **Character:** steady, exact, reassuring.
- **World:** a shift handover board: time, status, and the next action are
  visible without decoration.
- **Moments:** the dark shift-status card and the in/out time pair on Today;
  request-status badges in the request history.
- **Signature:** an explicit clock pair (`เข้างาน` / `ออกงาน`) reused wherever
  a work day is summarised.

### Audit

- The old Today layout used a large dark card plus two decorative reminder
  cards, so its primary action was below non-action content. **Fixed:** one
  status card, time pair, then the primary action.
- The location map was permanently expanded even though only a small fraction
  of employees need to inspect it. **Fixed:** a result-first status card with
  an expandable map.
- Requests were split by implementation rather than employee intent; salary
  advances had no employee-visible status at all. **Fixed:** one request inbox
  for leave, time/OT and advance requests.
- Server configuration was shown to an employee. **Fixed:** endpoint controls
  are no longer exposed in the account page.

Unslop guidance adapted from `unslop` by Damir Sokolovsky, CC BY 4.0.

## Audit and implemented fixes

| Screen | Problem found | Resolution in this build |
|---|---|---|
| Login | A technical endpoint could later be changed from a normal employee account. An empty directory did not explain the next action. | The endpoint control is no longer exposed to employees. Keep server changes as an Admin/release operation. |
| Today | Google Sheet time-only cells could display as `30 Dec 1899`, overflow the hero card, and trigger the Flutter overflow warning. Reminder cards consumed space but were not actions. | Normalise all shift times to `HH:mm`; redesign as a compact shift/status card, separate in/out tiles, one primary check-in action, and an explicit location rule. |
| Check-in map | The map is useful only when location is required, but the employee needs a plain answer before interpreting a map. | Retain map only for location-required check-in; the status card answers whether the employee is inside the allowed radius. |
| Work calendar | Calendar and daily rows were visually dense; dark mode had light-theme-only text/divider colours. | Keep calendar as a history screen, use theme-aware row text and divider colours, and rename the navigation item to `เวลางาน`. |
| Leave | A successful leave submission left the completed form visible, encouraging accidental duplicate requests. | Clear the form, confirm submission, then move to the request-status tab. |
| Requests | The tab claimed to be generic but only showed leave requests; time/OT requests existed in the backend but were invisible. | Unified leave + OT + attendance-correction status screen; filter by type; add employee time-request creation. |
| Account | The endpoint control was a security/UX failure for a normal user. | Removed. Account keeps profile, location policy, advance request, password change/reset, and logout. |

## Remaining backend/product gaps — do not fake these in UI

1. **Leave balance**: the API supplies requests, not authoritative remaining
   quota by leave type. Do not display a balance until the backend exposes one.
2. **Attendance correction detail**: the current API stores only requested
   minutes and a reason. A production correction needs requested in/out time,
   reason category, evidence attachment, and the original attendance record.
3. **Offline attendance**: a timestamp or GPS event created offline must be
   signed/queued and validated server-side; it cannot be treated as normal
   attendance merely by caching it locally.
4. **Privacy of employee directory**: selecting a name is convenient for a
   closed internal app but reveals the employee roster. For a larger workforce,
   switch to employee code + password, or an admin-issued invitation/QR flow.
5. **Device release**: this APK is debug-signed for UAT. A release keystore and
   real-device test of login, GPS, leave, time request, and logout are required
   before distributing it as a production update.

## Next implementation order

1. Add backend leave-balance and correction-detail APIs.
2. Add evidence/attachment support for correction requests.
3. Provide an Admin-issued activation/QR flow rather than a public directory.
4. Test device behaviour on both a GPS-required and a no-location employee.
5. Create a signed release APK only after those UAT scenarios pass.

## Today location proof redesign (2026-11-09)

### What was wrong

The Today page made a simple attendance decision look like a long form. The
shift card, in/out cards, GPS warning, expandable map and two action buttons
all had similar visual weight. The expandable map also hid the location proof
that an employee needs before checking in. Its pale warning panel was hard to
read in dark mode, and a map centred only on the employee did not explain why
they were outside the permitted radius.

### Direction

- **Product:** an employee confirms today's shift and records attendance.
- **Character:** calm, specific, accountable.
- **World:** a compact timecard with a location proof attached to it.
- **Moment:** the shift time and the fixed map that shows the employee and site together.
- **Signature:** the paired `เข้างาน` / `ออกงาน` time stamps.

### Implemented pass

1. Reduced Today-page padding, type scale, app bar, navigation labels, time tiles and action heights without shrinking the important shift time.
2. Replaced the greeting with the employee identity and current work context.
3. Kept the map visible whenever the employee's location policy requires it; removed `ExpansionTile` entirely.
4. Disabled map gestures using both `IgnorePointer` and `InteractiveFlag.none` so the map is a location proof, not an accidental navigation surface.
5. Added a site header, dark pin labels, visible employee marker, in-map status strip and lock indicator. The camera now fits both employee and site when they are apart.
6. Put the check-in and check-out controls immediately after the location proof, then keep the location rule as quiet supporting text.

### Verification

- `flutter analyze` completed with no issues.
- Widget test `renders employee login` passed.
- The map/UI needs one physical-device UAT with GPS enabled and one outside-radius scenario because tile loading and permission behaviour are device/network dependent.

## Light-only operational theme (2026-11-09)

The employee APK now uses `ThemeMode.light` instead of the phone's system
setting. This keeps attendance actions, GPS evidence, text contrast and visual
hierarchy consistent across staff devices. The Admin Codex console also clears
any saved dark preference, removes the theme toggle, and always renders the
same light operational surface.
