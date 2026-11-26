# Employee Attendance Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Today and Work Time in sync immediately after employee Check-in or Check-out.

**Architecture:** The shell owns a monotonically increasing attendance revision. A successful attendance mutation increments that revision; `_MonthCalendar` receives it and reloads the selected month in `didUpdateWidget`. The app uses the established Bangkok helper for all employee-facing current-day comparisons.

**Tech Stack:** Flutter/Dart, flutter_test, existing Supabase Edge API.

**Spec:** `docs/superpowers/specs/2026-11-26-attendance-consistency-design.md`

## Global Constraints

- Preserve the existing admin user and all backend data.
- Use Gregorian API dates and Buddhist Era display dates only.
- Do not change Supabase schema or attendance policy.

## Review Focus

- Check-in followed by opening Work Time must show the new record; test this through the revision comparison helper in Task 1.
- A Check-out must also advance the revision; Task 1 tests both non-equal revisions, independent of action type.
- A month navigation must not reload merely because its existing revision is unchanged; Task 1 tests equal revisions.
- Device timezone must not change which day is selected; Task 2 uses `bangkokAttendanceDay(DateTime.now().toUtc())`.
- Completed attendance must not retain an actionable Check-in GPS message; Task 3 tests completed-state copy.

---

### Task 1: Attendance revision predicate

**Files:**
- Create: `employee_mobile/lib/attendance_view_state.dart`
- Create: `employee_mobile/test/attendance_view_state_test.dart`

**Interfaces:**
- Produces: `bool shouldReloadMonthForAttendanceRevision({required int previousRevision, required int currentRevision})`.
- Consumed by: Task 2.

- [ ] **Step 1: Write the failing test**

```dart
expect(shouldReloadMonthForAttendanceRevision(previousRevision: 4, currentRevision: 5), isTrue);
expect(shouldReloadMonthForAttendanceRevision(previousRevision: 5, currentRevision: 5), isFalse);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/attendance_view_state_test.dart`

Expected: FAIL because the production import/function does not exist.

- [ ] **Step 3: Implement the predicate**

Implement the exact interface in `employee_mobile/lib/attendance_view_state.dart` using the revision inequality only.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `flutter test test/attendance_view_state_test.dart`

Expected: PASS.

### Task 2: Reload the visible monthly snapshot after attendance

**Files:**
- Modify: `employee_mobile/lib/main.dart:608-891,1817-1855`
- Modify: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: `shouldReloadMonthForAttendanceRevision` from Task 1.
- Produces: `_MonthCalendar(attendanceRevision: int)` which reloads only when the revision changes.

- [ ] **Step 1: Write the failing widget-facing test**

Add a test for the extracted revision predicate usage contract, asserting an unchanged revision does not request refresh and a changed revision does.

- [ ] **Step 2: Run focused test to verify it fails before widget wiring**

Run: `flutter test test/attendance_view_state_test.dart`

Expected: FAIL until the Task 1 production predicate exists.

- [ ] **Step 3: Wire the revision through shell and calendar**

Add `_attendanceRevision = 0` to `_EmployeeShellState`, increment it only after `BvnApi().attendance` succeeds, pass it to `_MonthCalendar`, and in `didUpdateWidget` call `_load()` when the predicate returns true. Replace local `DateTime.now().toIso8601String().substring(0, 10)` current-day comparisons inside `_MonthCalendar` with `bangkokAttendanceDay(DateTime.now().toUtc())`.

- [ ] **Step 4: Run focused and full mobile tests**

Run: `flutter test test/attendance_view_state_test.dart && flutter test`

Expected: PASS.

### Task 3: Make GPS completion copy state-aware

**Files:**
- Modify: `employee_mobile/lib/main.dart:933-1710`
- Modify: `employee_mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: Today `checkIn` and `checkOut` values.
- Produces: a completed-day location confirmation message that does not claim Check-in is available.

- [ ] **Step 1: Write a failing pure-copy test**

Extract a public helper and assert completed state returns `เช็กอินและเช็กเอาต์เรียบร้อยแล้ว` while an incomplete check-in state can still request Check-out.

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/widget_test.dart --plain-name "uses completed attendance location copy"`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement only the state-aware copy path**

Use the helper in the geofence message selection. Keep GPS refresh behavior and check-in location policy unchanged.

- [ ] **Step 4: Run full verification**

Run: `flutter test && flutter analyze && flutter build web --release`

Expected: tests and analysis PASS; web build completes.
