# Employee Attendance Consistency Design

## Goal

Make the employee app present one consistent Bangkok workday in Today and
Work Time immediately after Check-in or Check-out.

## Confirmed cause

The attendance write path invalidates the employee month cache, and the
Supabase `employee_month` action derives day keys in ICT (+07:00). However,
`_MonthCalendar` is created once and does not reload after a successful
attendance write. The Today screen therefore shows a new timeline response
while the existing calendar keeps its older day snapshot, including `absent`.

## Scope

- Keep API dates Gregorian `YYYY-MM-DD`; Buddhist Era remains display-only.
- Increment a shell-owned attendance revision only after a successful write.
- Pass the revision to the month calendar and reload its selected month when
  the revision changes.
- Compute the client-side “today” key with the same Bangkok date helper used
  by Today rather than the device-local ISO substring.
- When both times exist, change the GPS confirmation copy to say the
  employee has completed Check-in and Check-out; do not imply Check-in is
  still available.

## Non-goals

- No admin user, payroll, Supabase schema, or attendance policy changes.
- Offline queue, leave attachment/quota, and push notifications are separate
  roadmap items after this correctness fix is verified.

## Acceptance criteria

1. A successful attendance action causes the visible month calendar to fetch
   the selected month again and show the new day data.
2. The selected day and Today use the same Bangkok `YYYY-MM-DD` comparison.
3. A completed day does not display “เช็กอินได้” in the geofence panel.
4. Flutter tests and static analysis pass without new warnings.
