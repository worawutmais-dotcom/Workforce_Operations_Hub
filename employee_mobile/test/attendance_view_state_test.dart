import 'package:employee_mobile/attendance_view_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reloads the month only when attendance data changes', () {
    expect(
      shouldReloadMonthForAttendanceRevision(
        previousRevision: 4,
        currentRevision: 5,
      ),
      isTrue,
    );
    expect(
      shouldReloadMonthForAttendanceRevision(
        previousRevision: 5,
        currentRevision: 5,
      ),
      isFalse,
    );
  });

  test('uses completed attendance location copy instead of a check-in prompt', () {
    expect(
      geofenceAttendanceMessage(
        insideAllowedSite: true,
        siteName: 'BlueOsea',
        hasCompletedAttendance: true,
      ),
      'เช็กอินและเช็กเอาต์เรียบร้อยแล้ว',
    );
  });
}
