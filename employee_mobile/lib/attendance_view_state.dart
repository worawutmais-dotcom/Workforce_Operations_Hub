/// A new successful attendance write means an already-mounted month calendar
/// must replace its cached day snapshot. Merely rebuilding the shell does not
/// guarantee the calendar state reloads.
bool shouldReloadMonthForAttendanceRevision({
  required int previousRevision,
  required int currentRevision,
}) =>
    previousRevision != currentRevision;

/// The location card is a confirmation once both attendance events exist; it
/// must not continue to advertise an action the employee can no longer take.
String geofenceAttendanceMessage({
  required bool insideAllowedSite,
  required String siteName,
  required bool hasCompletedAttendance,
}) {
  if (hasCompletedAttendance) return 'เช็กอินและเช็กเอาต์เรียบร้อยแล้ว';
  if (insideAllowedSite) return 'คุณอยู่ในพื้นที่ "$siteName" แล้ว เช็กอินได้';
  return 'ยังอยู่นอกพื้นที่';
}
