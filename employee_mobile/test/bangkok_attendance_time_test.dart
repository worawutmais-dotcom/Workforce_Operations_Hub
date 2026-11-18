import 'package:employee_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Bangkok attendance display', () {
    test('converts a UTC attendance instant to the Thailand clock', () {
      const recordedAt = '2026-11-18T02:48:00.000Z';

      expect(bangkokAttendanceDay(recordedAt), '2026-11-18');
      expect(bangkokAttendanceClock(recordedAt), '09:48');
    });

    test('uses Thailand day at the UTC midnight boundary', () {
      const recordedAt = '2026-11-17T18:05:00.000Z';

      expect(bangkokAttendanceDay(recordedAt), '2026-11-18');
      expect(bangkokAttendanceClock(recordedAt), '01:05');
    });

    test('keeps a valid legacy time-only string readable', () {
      expect(bangkokAttendanceClock('1899-12-30T08:30:00'), '08:30');
      expect(bangkokAttendanceClock('not a timestamp'), isNull);
    });
  });
}
