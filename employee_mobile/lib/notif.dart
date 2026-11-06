import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

// Local, best-effort shift reminders (fire even when the app is closed).
class Notif {
  static final _p = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static Future<void> init() async {
    try {
      tzdata.initializeTimeZones();
      tz.setLocalLocation(tz.getLocation('Asia/Bangkok'));
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      await _p.initialize(const InitializationSettings(android: android));
      final impl = _p.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await impl?.requestNotificationsPermission();
      _ready = true;
    } catch (_) {}
  }

  static const _details = NotificationDetails(
    android: AndroidNotificationDetails(
      'bvn_shift',
      'เตือนเวลางาน',
      channelDescription: 'เตือนเข้างานและเช็กเอาต์',
      importance: Importance.high,
      priority: Priority.high,
    ),
  );

  static Future<void> _at(int id, DateTime when, String title, String body) async {
    if (!_ready || when.isBefore(DateTime.now())) return;
    try {
      await _p.zonedSchedule(
        id,
        title,
        body,
        tz.TZDateTime.from(when, tz.local),
        _details,
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
      );
    } catch (_) {}
  }

  // Reschedule today's reminders from the current shift config.
  static Future<void> scheduleShift({
    required String shiftStart,
    required String shiftEnd,
    required int remindBefore,
    required int remindAfter,
    required Set<int> workdays, // 0=Sun..6=Sat
    required bool checkedIn,
  }) async {
    if (!_ready) return;
    try {
      await _p.cancelAll();
    } catch (_) {}
    final now = DateTime.now();
    if (!workdays.contains(now.weekday % 7)) return; // Mon=1..Sun=7 → %7 → Sun=0
    DateTime at(String hm, int addMin) {
      final p = hm.split(':');
      return DateTime(now.year, now.month, now.day,
              int.tryParse(p[0]) ?? 9, int.tryParse(p.length > 1 ? p[1] : '0') ?? 0)
          .add(Duration(minutes: addMin));
    }

    if (!checkedIn) {
      await _at(101, at(shiftStart, -remindBefore), 'ใกล้เวลาเข้างาน',
          'เข้างาน $shiftStart — อย่าลืมเช็กอิน');
    }
    await _at(102, at(shiftEnd, remindAfter), 'เลิกงานแล้ว',
        'อย่าลืมเช็กเอาต์ก่อนกลับ');
  }
}
