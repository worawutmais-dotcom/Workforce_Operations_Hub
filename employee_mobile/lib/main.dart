// Account-tab actions guard context use via a context.mounted check inside _snack.
// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import 'attendance_view_state.dart';
import 'bvn_api.dart';
import 'employee_login_validation.dart';
import 'identity_validation.dart';
import 'notif.dart';
import 'pwa_runtime.dart';
import 'pwa_support.dart';
import 'runtime_platform.dart';
import 'theme.dart';
import 'update.dart';

// Brand language shared with Admin Codex: a light-first enterprise green
// identity. Brand green is the single accent; amber = attention/late, red =
// checked-out/danger. Tokens live in theme.dart — these aliases keep the
// in-screen references short and on one system.
const _ink = kInk;
const _greenDeep = kBrandDeep;
const _orange = kAmber;

/// Embedded PPP mark: it is always available offline in a fresh APK. When the
/// owner uploads a brand image in Admin, [logoUrl] replaces this fallback.
class PppBrandMark extends StatelessWidget {
  const PppBrandMark({
    super.key,
    this.size = 48,
    this.logoUrl = '',
    this.onDark = false,
  });
  final double size;
  final String logoUrl;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    if (logoUrl.trim().startsWith('http')) {
      return ClipOval(
        child: Image.network(
          logoUrl,
          width: size,
          height: size,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => _fallback(),
        ),
      );
    }
    return _fallback();
  }

  Widget _fallback() => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: onDark ? Colors.white : kBrand,
      borderRadius: BorderRadius.circular(size * .28),
    ),
    alignment: Alignment.center,
    child: Text(
      'BVN',
      style: TextStyle(
        color: onDark ? kBrandDeep : Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: size * .30,
        letterSpacing: -size * .02,
      ),
    ),
  );
}

/// Lightweight Safari instruction card. It never blocks the login form; users
/// can dismiss it and continue directly to attendance.
class PwaInstallGuide extends StatelessWidget {
  const PwaInstallGuide({super.key, required this.onDismiss});

  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => SoftCard(
    padding: const EdgeInsets.all(14),
    color: const Color(0xFFF8FAFC),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: kBrandSoft,
            borderRadius: BorderRadius.circular(kRadiusSm),
          ),
          child: const Icon(
            Icons.add_to_home_screen_rounded,
            color: kBrandDeep,
            size: 20,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'เพิ่มแอปไว้บนหน้าจอ iPhone',
                style: TextStyle(
                  color: kInk,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 3),
              const Text(
                'กด Share ใน Safari แล้วเลือก Add to Home Screen เพื่อเปิดใช้งานเหมือนแอป',
                style: TextStyle(color: kMuted, fontSize: 12, height: 1.35),
              ),
              const SizedBox(height: 5),
              TextButton(
                onPressed: onDismiss,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 32),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                child: const Text('ไว้ภายหลัง'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Google Sheets serialises a time-only cell as 1899-12-30T08:30:00...
/// Never surface that spreadsheet implementation detail in the employee app.
String _clockValue(Object? raw, {String fallback = '09:00'}) {
  final value = '${raw ?? ''}'.trim();
  final matched = RegExp(r'(?:T|\s|^)([01]?\d|2[0-3]):([0-5]\d)')
      .firstMatch(value);
  if (matched == null) return fallback;
  return '${matched.group(1)!.padLeft(2, '0')}:${matched.group(2)}';
}

// Attendance events are persisted as UTC instants. A substring of an ISO
// timestamp is UTC, not the employee's local clock (09:48 in Bangkok is
// 02:48Z). Keep the attendance-day boundary in Thailand time as well.
const _bangkokOffset = Duration(hours: 7);

DateTime? bangkokAttendanceDate(Object? raw) {
  final value = '${raw ?? ''}'.trim();
  if (value.isEmpty) return null;
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  // Old time-only values have no zone. They describe the clock itself and
  // must not be shifted as if they were a UTC attendance event.
  if (!RegExp(r'(Z|[+-]\d{2}:\d{2})$').hasMatch(value)) return parsed;
  return parsed.toUtc().add(_bangkokOffset);
}

String bangkokAttendanceDay(Object? raw) {
  final date = bangkokAttendanceDate(raw);
  if (date == null) return '';
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

String? bangkokAttendanceClock(Object? raw) {
  final date = bangkokAttendanceDate(raw);
  if (date != null) {
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
  final value = '${raw ?? ''}'.trim();
  final match = RegExp(r'(?:T|\s|^)([01]?\d|2[0-3]):([0-5]\d)')
      .firstMatch(value);
  if (match == null) return null;
  return '${match.group(1)!.padLeft(2, '0')}:${match.group(2)}';
}

/// Presentation-only account status. It deliberately derives from data that
/// is already in the employee session; it does not change identity or GPS
/// permissions.
class WorkIdentityStatus {
  const WorkIdentityStatus({
    required this.label,
    required this.detail,
    required this.locationPolicy,
    required this.requiresAction,
    required this.background,
    required this.foreground,
    required this.icon,
  });

  final String label;
  final String detail;
  final String locationPolicy;
  final bool requiresAction;
  final Color background;
  final Color foreground;
  final IconData icon;
}

WorkIdentityStatus workIdentityStatus({
  required bool profileNeedsUpdate,
  required bool identityPending,
  required bool locationRequired,
}) {
  final locationPolicy = locationRequired
      ? 'ลงเวลาตามพิกัดที่อนุญาต'
      : 'ไม่บังคับตรวจพิกัด';
  if (profileNeedsUpdate) {
    return const WorkIdentityStatus(
      label: 'ต้องอัปเดตข้อมูล',
      detail: 'เพิ่มเลขบัตรประชาชนและเบอร์โทรเพื่อให้ผู้ดูแลตรวจสอบ',
      locationPolicy: '',
      requiresAction: true,
      background: kAmberSoft,
      foreground: kAmberInk,
      icon: Icons.badge_outlined,
    ).withLocationPolicy(locationPolicy);
  }
  if (identityPending) {
    return const WorkIdentityStatus(
      label: 'กำลังตรวจสอบข้อมูล',
      detail: 'ส่งข้อมูลให้ผู้ดูแลตรวจสอบแล้ว',
      locationPolicy: '',
      requiresAction: false,
      background: Color(0xFFEAF2FF),
      foreground: Color(0xFF2459A6),
      icon: Icons.schedule_outlined,
    ).withLocationPolicy(locationPolicy);
  }
  return const WorkIdentityStatus(
    label: 'ข้อมูลยืนยันแล้ว',
    detail: 'ข้อมูลส่วนตัวได้รับการบันทึกแล้ว',
    locationPolicy: '',
    requiresAction: false,
    background: Color(0xFFE8F7EF),
    foreground: Color(0xFF08764E),
    icon: Icons.verified_outlined,
  ).withLocationPolicy(locationPolicy);
}

extension on WorkIdentityStatus {
  WorkIdentityStatus withLocationPolicy(String value) => WorkIdentityStatus(
    label: label,
    detail: detail,
    locationPolicy: value,
    requiresAction: requiresAction,
    background: background,
    foreground: foreground,
    icon: icon,
  );
}

// The whole app's visual language lives in theme.dart (see [bvnTheme]). Kept
// here as a thin alias so the MaterialApp call below stays readable.
ThemeData _theme(Brightness brightness) => bvnTheme(brightness);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await BvnConfig.load();
  await Notif.init();
  runApp(const BvnEmployeeApp());
}

class BvnEmployeeApp extends StatefulWidget {
  const BvnEmployeeApp({super.key});
  @override
  State<BvnEmployeeApp> createState() => _BvnEmployeeAppState();
}

class _BvnEmployeeAppState extends State<BvnEmployeeApp> {
  final _store = DeviceSessionStore();
  String? _id, _token;
  bool _restoring = true;
  String _brandName = 'พนมพร พาณิชย์', _brandLogoUrl = '';
  @override
  void initState() {
    super.initState();
    _restore();
    _loadBranding();
  }

  Future<void> _loadBranding() async {
    try {
      final brand = await BvnApi().branding();
      if (mounted) {
        setState(() {
          final fetched = brand['name']?.toString().trim() ?? '';
          // Ignore the generic server placeholder so the shop name always wins
          // until an owner sets a real company name in Admin branding.
          _brandName = (fetched.isNotEmpty && fetched != 'BVN Package')
              ? fetched
              : _brandName;
          _brandLogoUrl = brand['logoUrl']?.toString() ?? '';
        });
      }
    } catch (_) {
      // Brand refresh must never prevent attendance or login when offline.
    }
  }

  Future<void> _restore() async {
    final saved = await _store.load();
    if (saved != null) {
      try {
        final id = await BvnApi().activate(saved.id, saved.token);
        if (mounted) {
          setState(() {
            _id = id;
            _token = saved.token;
          });
        }
      } catch (_) {
        await _store.clear();
      }
    }
    if (mounted) setState(() => _restoring = false);
  }

  Future<void> _login(String id, String token) async {
    await _store.save(id, token);
    if (mounted) {
      setState(() {
        _id = id;
        _token = token;
      });
    }
  }

  Future<void> _logout() async {
    await _store.clear();
    if (mounted) {
      setState(() {
        _id = null;
        _token = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'BVN Package',
    theme: _theme(Brightness.light),
    darkTheme: _theme(Brightness.dark),
    // Operational screens must look the same in every staff device. A phone's
    // system dark setting must not change the contrast of attendance, GPS or
    // action states.
    themeMode: ThemeMode.light,
    home: _restoring
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : _id == null
        ? LoginPage(
            onLogin: _login,
            brandName: _brandName,
            brandLogoUrl: _brandLogoUrl,
          )
        : EmployeeShell(
            employeeId: _id!,
            token: _token!,
            onLogout: _logout,
            brandName: _brandName,
            brandLogoUrl: _brandLogoUrl,
          ),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.onLogin,
    this.brandName = 'BVN Package',
    this.brandLogoUrl = '',
  });
  final Future<void> Function(String, String) onLogin;
  final String brandName, brandLogoUrl;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _employeeId = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _hidden = true, _submitting = false, _pwaGuideDismissed = false;

  bool get _showPwaGuide => shouldShowPwaInstallGuide(
    isIosWeb: isIosPwaBrowser,
    isStandalone: isPwaStandalone,
    isDismissed: _pwaGuideDismissed,
  );
  Future<void> _submit() async {
    final employeeId = _employeeId.text.trim().toUpperCase();
    final formError = employeeLoginError(
      employeeId: employeeId,
      password: _password.text,
    );
    if (formError != null) {
      setState(() => _error = formError);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final session = await BvnApi().login(employeeId, _password.text.trim());
      await widget.onLogin(session.employeeId, session.mobileToken);
    } on BvnApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'เชื่อมต่อระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _employeeId.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    // Option 3 — minimal white login: centered BVN mark, clean fields, navy CTA.
    backgroundColor: Colors.white,
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: PppBrandMark(size: 68, logoUrl: widget.brandLogoUrl),
                ),
                const SizedBox(height: 18),
                Text(
                  widget.brandName,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: _ink,
                    fontSize: 23,
                    letterSpacing: .2,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                const Text(
                  'ระบบลงเวลาพนักงาน',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: kMuted),
                ),
                if (_showPwaGuide) ...[
                  const SizedBox(height: 18),
                  PwaInstallGuide(
                    onDismiss: () => setState(() => _pwaGuideDismissed = true),
                  ),
                ],
                const SizedBox(height: 30),
                const Text(
                  'กรอกรหัสพนักงานและรหัสผ่านของคุณ',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: kMuted),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _employeeId,
                  enabled: !_submitting,
                  autofocus: true,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'รหัสพนักงาน',
                    hintText: 'เช่น BVN-0002',
                    prefixIcon: Icon(Icons.badge_outlined),
                  ),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _password,
                  obscureText: _hidden,
                  keyboardType: TextInputType.text,
                  enabled: !_submitting,
                  decoration: InputDecoration(
                    labelText: 'รหัสผ่าน',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _hidden
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      onPressed: _submitting
                          ? null
                          : () => setState(() => _hidden = !_hidden),
                    ),
                  ),
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.only(top: 12),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: kDangerSoft,
                      borderRadius: BorderRadius.circular(kRadiusSm),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.error_outline_rounded,
                          size: 18,
                          color: kDanger,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _error!,
                            style: const TextStyle(
                              color: kDanger,
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 22),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(
                    _submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class EmployeeShell extends StatefulWidget {
  const EmployeeShell({
    super.key,
    required this.employeeId,
    required this.token,
    required this.onLogout,
    required this.brandName,
    required this.brandLogoUrl,
  });
  final String employeeId, token, brandName, brandLogoUrl;
  final Future<void> Function() onLogout;
  @override
  State<EmployeeShell> createState() => _EmployeeShellState();
}

class _EmployeeShellState extends State<EmployeeShell>
    with WidgetsBindingObserver {
  int _tab = 0;
  String _name = '', _role = '', _status = 'กำลังตรวจสถานะวันนี้';
  String _shiftStart = '—', _shiftEnd = '—';
  String? _in, _out;
  bool _locationRequired = true, _busy = false;
  int _attendanceRevision = 0;
  bool _profileNeedsUpdate = false,
      _profilePending = false,
      _profilePromptShown = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (shouldCheckForApkUpdate(isWeb: kIsWeb)) {
        final info = await checkForUpdate();
        if (info != null && mounted) showUpdateDialog(context, info);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh(force: true);
  }

  Future<void> _refresh({bool force = false}) async {
    try {
      // Profile and attendance history do not depend on one another. Load both
      // together so a Google Apps Script redirect is paid once in perceived time.
      final day = bangkokAttendanceDay(DateTime.now().toUtc());
      final api = BvnApi();
      if (force) api.clearEmployeeCache(widget.token);
      final results = await Future.wait([
        api.profile(widget.token),
        api.timeline(widget.token),
      ]);
      final profile = results[0] as Map<String, dynamic>;
      bool validClock(String value) => RegExp(r'^\d{2}:\d{2}$').hasMatch(value);
      String clock(dynamic value) => _clockValue(value, fallback: '—');
      var shiftStart = clock(profile['shiftStart']);
      var shiftEnd = clock(profile['shiftEnd']);
      // The monthly endpoint is a compatible secondary source for work hours.
      // It avoids a blank home card if an older profile deployment omits the
      // schedule fields while the attendance/month API is already available.
      if (!validClock(shiftStart) || !validClock(shiftEnd)) {
        final now = DateTime.now();
        try {
          final month = await api.month(widget.token, now.year, now.month);
          shiftStart = validClock(shiftStart)
              ? shiftStart
              : clock(month['shiftStart'] ?? month['shift_start']);
          shiftEnd = validClock(shiftEnd)
              ? shiftEnd
              : clock(month['shiftEnd'] ?? month['shift_end']);
        } catch (_) {
          // Keep the truthful empty state. A missing schedule must never be
          // replaced with a made-up default on an employee's attendance view.
        }
      }
      final events = (results[1] as List<Map<String, dynamic>>)
          .where(
            (e) =>
                bangkokAttendanceDay(e['occurredAt']) == day &&
                e['status'] == 'accepted',
          )
          .toList();
      String? time(String type) {
        final event = events.where((e) => e['eventType'] == type).toList();
        return event.isEmpty
            ? null
            : bangkokAttendanceClock(event.first['occurredAt']);
      }

      if (mounted) {
        setState(() {
          _name = '${profile['name'] ?? ''}';
          _role = '${profile['role'] ?? ''}';
          _locationRequired = profile['locationRequired'] == true;
          _shiftStart = shiftStart;
          _shiftEnd = shiftEnd;
          _in = time('check_in');
          _out = time('check_out');
          _status = _out != null
              ? 'ลงเวลาออกงานแล้ว'
              : _in != null
              ? 'อยู่ระหว่างงาน'
              : 'ยังไม่ได้ลงเวลาเข้างาน';
        });
        final wd = '${profile['workdays'] ?? '1,2,3,4,5'}'
            .split(',')
            .map((e) => int.tryParse(e.trim()))
            .whereType<int>()
            .toSet();
        if (RegExp(r'^\d{2}:\d{2}$').hasMatch(_shiftStart) &&
            RegExp(r'^\d{2}:\d{2}$').hasMatch(_shiftEnd)) {
          Notif.scheduleShift(
            shiftStart: _shiftStart,
            shiftEnd: _shiftEnd,
            remindBefore: (profile['remindBeforeMin'] as num?)?.toInt() ?? 15,
            remindAfter:
                (profile['remindCheckoutAfterMin'] as num?)?.toInt() ?? 10,
            workdays: wd,
            checkedIn: _in != null,
          );
        }
      }
      // Contact/identity information is optional at account creation. Ask the
      // employee once, after the operational home has loaded, instead of
      // blocking their first check-in.
      try {
        final identity = await api.identityProfile(widget.token);
        final profilePending = identity['pending'] == true;
        final needsUpdate =
            !profilePending &&
            (identity['identityComplete'] != true ||
                '${identity['phone'] ?? ''}'.trim().isEmpty);
        if (mounted) {
          setState(() {
            _profileNeedsUpdate = needsUpdate;
            _profilePending = profilePending;
          });
          if (needsUpdate && !_profilePromptShown) {
            _profilePromptShown = true;
            WidgetsBinding.instance.addPostFrameCallback(
              (_) => _offerProfileUpdate(),
            );
          }
        }
      } catch (_) {
        // A stale deployed backend may not have the optional profile action.
        // The app stays usable and the account page offers a manual retry.
      }
    } catch (_) {
      if (mounted) setState(() => _status = 'ดึงสถานะจากระบบไม่สำเร็จ');
    }
  }

  Future<void> _attendance(String type) async {
    setState(() => _busy = true);
    try {
      Position? p;
      // Check-out is allowed anywhere, so only the location-required check-IN needs GPS.
      if (shouldRequestCheckInLocation(
        locationRequired: _locationRequired,
        eventType: type,
      )) {
        if (!await Geolocator.isLocationServiceEnabled()) {
          throw Exception('กรุณาเปิด Location/GPS');
        }
        var permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          permission = await Geolocator.requestPermission();
        }
        if (permission == LocationPermission.denied ||
            permission == LocationPermission.deniedForever) {
          throw Exception('ต้องอนุญาต GPS ตามสิทธิ์ของคุณ');
        }
        p = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
          ),
        );
      }
      final mocked = p?.isMocked ?? false;
      if (type == 'check_in' && mocked) {
        throw Exception(
          'ตรวจพบการปลอมตำแหน่ง (Mock location) — ปิดแอปจำลองตำแหน่งก่อนเช็กอิน',
        );
      }
      final res = await BvnApi().attendance(
        token: widget.token,
        eventType: type,
        latitude: p?.latitude ?? 0,
        longitude: p?.longitude ?? 0,
        accuracy: p?.accuracy ?? 0,
        mocked: mocked,
      );
      if (mounted) setState(() => _attendanceRevision++);
      await _refresh();
      if (mounted) {
        final ot =
            (res['data'] as Map<String, dynamic>?)?['overtime']
                as Map<String, dynamic>?;
        final otMin = (ot?['overtimeMinutes'] as num?)?.round() ?? 0;
        String msg = 'บันทึกเวลาเข้าระบบแล้ว';
        if (type == 'check_out' && otMin > 0) {
          final h = otMin ~/ 60, m = otMin % 60;
          final dur = h > 0
              ? '$h ชม. ${m > 0 ? '$m นาที' : ''}'.trim()
              : '$m นาที';
          msg = ot?['status'] == 'already_requested'
              ? 'บันทึกออกงานแล้ว • ทำเกินกะ ~$dur ระบบส่งให้ผู้ดูแลตรวจสอบแล้ว'
              : 'บันทึกออกงานแล้ว • ตรวจพบเวลาทำงานเกินกะ ~$dur ระบบส่งให้ผู้ดูแลตรวจสอบ';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), duration: const Duration(seconds: 4)),
        );
      }
    } on BvnApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _Today(
        name: _name.isEmpty ? widget.employeeId : _name,
        role: _role,
        status: _status,
        checkIn: _in,
        checkOut: _out,
        shiftStart: _shiftStart,
        shiftEnd: _shiftEnd,
        busy: _busy,
        token: widget.token,
        locationRequired: _locationRequired,
        onIn: () => _attendance('check_in'),
        onOut: () => _attendance('check_out'),
        onRefresh: () => _refresh(force: true),
      ),
      _MonthCalendar(
        token: widget.token,
        attendanceRevision: _attendanceRevision,
      ),
      _LeaveForm(token: widget.token, onSent: () => setState(() => _tab = 3)),
      _RequestsPage(token: widget.token),
      AccountScreen(
        token: widget.token,
        name: _name,
        id: widget.employeeId,
        role: _role,
        locationRequired: _locationRequired,
        profileNeedsUpdate: _profileNeedsUpdate,
        identityPending: _profilePending,
        onLogout: widget.onLogout,
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            PppBrandMark(size: 28, logoUrl: widget.brandLogoUrl, onDark: true),
            const SizedBox(width: 9),
            Expanded(
              child: Text(widget.brandName, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
      body: SafeArea(child: pages[_tab]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (value) {
          setState(() => _tab = value);
          if (value == 0) _refresh(force: true);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            label: 'วันนี้',
          ),
          NavigationDestination(
            icon: Icon(Icons.access_time),
            label: 'เวลางาน',
          ),
          NavigationDestination(icon: Icon(Icons.event_note), label: 'ลางาน'),
          NavigationDestination(icon: Icon(Icons.list_alt), label: 'คำขอ'),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'บัญชี',
          ),
        ],
      ),
    );
  }

  Future<void> _offerProfileUpdate() async {
    if (!mounted) return;
    final open = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('อัปเดตโปรไฟล์'),
        content: const Text(
          'เพิ่มเลขบัตรประชาชนและเบอร์โทรเพื่อให้ฝ่ายดูแลยืนยันข้อมูลได้ คุณยังใช้งานเช็กอินต่อได้ตามปกติ',
          style: TextStyle(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('ไว้ภายหลัง'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('อัปเดตตอนนี้'),
          ),
        ],
      ),
    );
    if (open == true && mounted) setState(() => _tab = 4);
  }
}

class _Today extends StatelessWidget {
  const _Today({
    required this.name,
    required this.role,
    required this.status,
    this.checkIn,
    this.checkOut,
    required this.shiftStart,
    required this.shiftEnd,
    required this.busy,
    required this.token,
    required this.locationRequired,
    required this.onIn,
    required this.onOut,
    required this.onRefresh,
  });
  final String name, role, status, token, shiftStart, shiftEnd;
  final String? checkIn, checkOut;
  final bool busy, locationRequired;
  final Future<void> Function() onIn, onOut, onRefresh;

  String _initials() {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    final a = parts.first[0];
    final b = parts.length > 1 ? parts[1][0] : '';
    return (a + b).toUpperCase();
  }

  String _hint() {
    final hasSchedule =
        RegExp(r'^\d{2}:\d{2}$').hasMatch(shiftStart) &&
        RegExp(r'^\d{2}:\d{2}$').hasMatch(shiftEnd);
    if (!hasSchedule) {
      return 'ยังซิงค์ตารางงานไม่สำเร็จ · แตะรีเฟรชเพื่อลองใหม่';
    }
    DateTime at(String hm) {
      final n = DateTime.now(), p = hm.split(':');
      return DateTime(
        n.year,
        n.month,
        n.day,
        int.tryParse(p[0]) ?? 9,
        int.tryParse(p.length > 1 ? p[1] : '0') ?? 0,
      );
    }

    final now = DateTime.now();
    if (checkOut != null) return 'เช็กเอาต์แล้ว · บันทึกเวลาวันนี้ครบถ้วน';
    if (checkIn != null) {
      final mins = at(shiftEnd).difference(now).inMinutes;
      return mins > 0
          ? 'กำลังทำงาน · เลิกงาน $shiftEnd (อีก ${_dur(mins)})'
          : 'เลยเวลาเลิกงาน $shiftEnd แล้ว · กรุณาเช็กเอาต์';
    }
    final mins = at(shiftStart).difference(now).inMinutes;
    if (mins > 0) return 'เริ่มงาน $shiftStart · อีก ${_dur(mins)}';
    return 'ถึงเวลาเริ่มงานแล้ว · กรุณาเช็กอิน';
  }

  String _dur(int mins) {
    if (mins >= 60) return '${mins ~/ 60} ชม. ${mins % 60} นาที';
    return '$mins นาที';
  }

  String _thaiDate() {
    const days = [
      'อาทิตย์',
      'จันทร์',
      'อังคาร',
      'พุธ',
      'พฤหัสบดี',
      'ศุกร์',
      'เสาร์',
    ];
    const months = [
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
    ];
    final now = DateTime.now();
    return '${days[now.weekday % 7]} ${now.day} ${months[now.month - 1]} ${now.year + 543}';
  }

  @override
  Widget build(BuildContext context) {
    final nowStr = TimeOfDay.now().format(context);
    final color = Theme.of(context).colorScheme;
    final hasStarted = checkIn != null;
    final hasFinished = checkOut != null;
    final hasSchedule =
        RegExp(r'^\d{2}:\d{2}$').hasMatch(shiftStart) &&
        RegExp(r'^\d{2}:\d{2}$').hasMatch(shiftEnd);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: color.primaryContainer,
                child: Text(
                  _initials(),
                  style: TextStyle(
                    color: color.onPrimaryContainer,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '${role.isEmpty ? 'พนักงาน' : role} · ${_thaiDate()}',
                      style: TextStyle(
                        fontSize: 11,
                        color: color.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'รีเฟรชข้อมูล',
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: kBrandDeep,
              borderRadius: BorderRadius.circular(kRadius),
              border: Border.all(color: const Color(0xFF203B57)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: .18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            hasFinished
                                ? 'เสร็จงานแล้ว'
                                : hasStarted
                                ? 'กำลังทำงาน'
                                : 'รอเช็กอิน',
                            style: const TextStyle(
                              fontSize: 11,
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    Text(
                      nowStr,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: .78),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  hasSchedule ? 'กะงานวันนี้' : 'ตารางงานวันนี้',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: Colors.white.withValues(alpha: .82),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  hasSchedule ? '$shiftStart – $shiftEnd' : 'ยังไม่มีข้อมูล',
                  style: const TextStyle(
                    fontSize: 24,
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -.3,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  _hint(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: .9),
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
                if (!hasSchedule) ...[
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: busy ? null : onRefresh,
                    icon: const Icon(Icons.sync_rounded, size: 16),
                    label: const Text('ลองซิงค์ตารางอีกครั้ง'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      textStyle: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _timeTile(
                  context,
                  'เข้างาน',
                  checkIn ?? '—',
                  Icons.login_rounded,
                  hasStarted,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _timeTile(
                  context,
                  'ออกงาน',
                  checkOut ?? '—',
                  Icons.logout_rounded,
                  hasFinished,
                  accent: kDanger,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (locationRequired)
            Expanded(
              child: _CheckInMap(
                token: token,
                hasCompletedAttendance: hasFinished,
              ),
            )
          else
            const Spacer(),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: hasFinished
                ? OutlinedButton.icon(
                    onPressed: null,
                    icon: const Icon(Icons.check_circle_rounded, size: 19),
                    label: const Text('ลงเวลาครบแล้ววันนี้'),
                  )
                : !hasStarted
                ? FilledButton.icon(
                    onPressed: busy ? null : onIn,
                    style: FilledButton.styleFrom(backgroundColor: _greenDeep),
                    icon: busy
                        ? const SizedBox(
                            width: 17,
                            height: 17,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.login_rounded, size: 19),
                    label: Text(busy ? 'กำลังตรวจสอบ…' : 'เช็กอินเข้างาน'),
                  )
                : FilledButton.icon(
                    onPressed: busy ? null : onOut,
                    style: FilledButton.styleFrom(backgroundColor: _greenDeep),
                    icon: busy
                        ? const SizedBox(
                            width: 17,
                            height: 17,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.logout_rounded, size: 19),
                    label: Text(busy ? 'กำลังตรวจสอบ…' : 'เช็กเอาต์ออกงาน'),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _timeTile(
    BuildContext context,
    String label,
    String value,
    IconData icon,
    bool completed, {
    Color accent = kBrand,
  }) {
    final tint = completed ? accent : kMuted;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(kRadiusSm),
        border: Border.all(
          color: completed ? accent.withValues(alpha: .35) : kHair,
        ),
        boxShadow: kSoftShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: completed
                  ? accent.withValues(alpha: .12)
                  : const Color(0xFFF0F3F0),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, size: 18, color: tint),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  color: kMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.3,
                  color: completed ? kInk : kMuted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// Live check-in map: shows allowed sites (circles) + the employee's position,
// and whether they are inside any site's radius yet.
class _CheckInMap extends StatefulWidget {
  const _CheckInMap({
    required this.token,
    required this.hasCompletedAttendance,
  });
  final String token;
  final bool hasCompletedAttendance;
  @override
  State<_CheckInMap> createState() => _CheckInMapState();
}

class _CheckInMapState extends State<_CheckInMap> {
  final _map = MapController();
  List<Map<String, dynamic>> _sites = [];
  LatLng? _me;
  String _msg = 'กำลังโหลดแผนที่…';
  bool _inside = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<Position?> _position() async {
    try {
      if (await Geolocator.isLocationServiceEnabled()) {
        var perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied) {
          perm = await Geolocator.requestPermission();
        }
        if (perm != LocationPermission.denied &&
            perm != LocationPermission.deniedForever) {
          final p = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
            ),
          );
          return p;
        }
      }
    } catch (_) {}
    return null;
  }

  Future<void> _load() async {
    // Start the two slow operations together. The map can use cached sites
    // while Android obtains a fresh GPS reading; neither should wait for the
    // other on a normal check-in.
    final positionFuture = _position();
    final sitesFuture = BvnApi().sites(widget.token);
    final p = await positionFuture;
    List<Map<String, dynamic>> sites = [];
    String? sitesError;
    try {
      sites = await sitesFuture;
    } catch (e) {
      sitesError = e.toString().replaceFirst('Exception: ', '');
    }
    try {
      final me = p == null ? null : LatLng(p.latitude, p.longitude);
      String msg;
      bool inside = false;
      if (sitesError != null) {
        msg = me == null
            ? 'เปิด GPS เพื่อดูตำแหน่ง · จุดเช็กอินโหลดไม่ได้ ($sitesError)'
            : 'เจอตำแหน่งคุณแล้ว · แต่จุดเช็กอินโหลดไม่ได้ ($sitesError)';
      } else if (sites.isEmpty) {
        msg = 'ยังไม่ได้ตั้งจุดเช็กอิน (ติดต่อแอดมิน)';
      } else if (me == null) {
        msg = 'เปิด GPS เพื่อตรวจว่าอยู่ในพื้นที่หรือยัง';
      } else {
        final d = const Distance();
        double best = double.infinity;
        String bestName = '';
        for (final s in sites) {
          final c = LatLng(
            (s['lat'] as num).toDouble(),
            (s['lng'] as num).toDouble(),
          );
          final metres = d(me, c);
          final radius = (s['radius'] as num).toDouble();
          if (metres <= radius) {
            inside = true;
            bestName = '${s['name'] ?? s['id']}';
            best = metres;
            break;
          }
          if (metres - radius < best) {
            best = metres - radius;
            bestName = '${s['name'] ?? s['id']}';
          }
        }
        msg = widget.hasCompletedAttendance
            ? geofenceAttendanceMessage(
                insideAllowedSite: inside,
                siteName: bestName,
                hasCompletedAttendance: true,
              )
            : inside
            ? geofenceAttendanceMessage(
                insideAllowedSite: true,
                siteName: bestName,
                hasCompletedAttendance: false,
              )
            : 'ยังอยู่นอกพื้นที่ — ใกล้สุด "$bestName" (อีก ~${best.round()} ม.)';
      }
      if (mounted) {
        setState(() {
          _sites = sites;
          _me = me;
          _msg = msg;
          _inside = inside;
          _loading = false;
        });
        // Keep the camera about the current employee and the relevant site.
        // Including every company site made the radius too small to inspect.
        Map<String, dynamic>? nearest = sites.isEmpty ? null : sites.first;
        if (me != null) {
          const distance = Distance();
          for (final site in sites) {
            if (nearest == null ||
                distance(
                      me,
                      LatLng(
                        (site['lat'] as num).toDouble(),
                        (site['lng'] as num).toDouble(),
                      ),
                    ) <
                    distance(
                      me,
                      LatLng(
                        (nearest['lat'] as num).toDouble(),
                        (nearest['lng'] as num).toDouble(),
                      ),
                    )) {
              nearest = site;
            }
          }
        }
        final ownPoint = me == null ? null : <LatLng>[me];
        final mapPoints = <LatLng>[
          ...?ownPoint,
          if (nearest != null)
            LatLng(
              (nearest['lat'] as num).toDouble(),
              (nearest['lng'] as num).toDouble(),
            ),
        ];
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || mapPoints.isEmpty) return;
          if (mapPoints.length == 1) {
            _map.move(mapPoints.first, 16);
          } else {
            _map.fitCamera(
              CameraFit.bounds(
                bounds: LatLngBounds.fromPoints(mapPoints),
                padding: const EdgeInsets.all(68),
                maxZoom: 16,
              ),
            );
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _msg =
              'โหลดแผนที่ไม่ได้: ${e.toString().replaceFirst('Exception: ', '')}';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic>? focus;
    double? focusDistance;
    if (_sites.isNotEmpty) {
      focus = _sites.first;
      if (_me != null) {
        const distance = Distance();
        for (final site in _sites) {
          final metres = distance(
            _me!,
            LatLng(
              (site['lat'] as num).toDouble(),
              (site['lng'] as num).toDouble(),
            ),
          );
          if (focusDistance == null || metres < focusDistance) {
            focus = site;
            focusDistance = metres;
          }
        }
      }
    }
    final center =
        _me ??
        (focus == null
            ? const LatLng(13.7563, 100.5018)
            : LatLng(
                (focus['lat'] as num).toDouble(),
                (focus['lng'] as num).toDouble(),
              ));
    final siteLabel = focus == null
        ? 'ยังไม่มีจุดเช็กอินที่ตั้งค่า'
        : '${focus['name'] ?? focus['id']} · รัศมี ${(focus['radius'] as num).round()} ม.';
    final statusColor = _inside ? _greenDeep : _orange;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 10),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F5DF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(Icons.map_outlined, size: 18, color: _greenDeep),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'ยืนยันพื้นที่เช็กอิน',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        siteLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  tooltip: 'รีเฟรชตำแหน่ง',
                ),
              ],
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(
                  child: FlutterMap(
                    mapController: _map,
                    options: MapOptions(
                      initialCenter: center,
                      initialZoom: 16,
                      interactionOptions: const InteractionOptions(
                        // Zoom is allowed for inspection; dragging is locked
                        // so the map always remains a GPS confirmation view.
                        flags:
                            InteractiveFlag.pinchZoom |
                            InteractiveFlag.doubleTapZoom,
                      ),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.bvnpackage.employee_mobile',
                        tileBuilder: null,
                      ),
                      // The radius is a business rule, so retain it. The
                      // gentle fill and thin outline make it legible without
                      // obscuring the street map or the precise GPS point.
                      if (focus != null)
                        CircleLayer(
                          circles: [
                            CircleMarker(
                              point: LatLng(
                                (focus['lat'] as num).toDouble(),
                                (focus['lng'] as num).toDouble(),
                              ),
                              radius: (focus['radius'] as num).toDouble(),
                              useRadiusInMeter: true,
                              color: statusColor.withValues(alpha: .14),
                              borderColor: statusColor,
                              borderStrokeWidth: 1.5,
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          if (focus != null)
                            Marker(
                              point: LatLng(
                                (focus['lat'] as num).toDouble(),
                                (focus['lng'] as num).toDouble(),
                              ),
                              width: 30,
                              height: 30,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: _ink,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 2,
                                  ),
                                ),
                                child: const Icon(
                                  Icons.business_rounded,
                                  size: 16,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          if (_me != null)
                            Marker(
                              point: _me!,
                              width: 18,
                              height: 18,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: _orange,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 2,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: kHair),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _loading
                              ? Icons.location_searching_rounded
                              : _inside
                              ? Icons.check_circle_rounded
                              : Icons.near_me_outlined,
                          size: 16,
                          color: statusColor,
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            _msg,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10,
                              color: _ink,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Month calendar of attendance: color-coded days + one row per day with times.
class _MonthCalendar extends StatefulWidget {
  const _MonthCalendar({required this.token, required this.attendanceRevision});
  final String token;
  final int attendanceRevision;
  @override
  State<_MonthCalendar> createState() => _MonthCalendarState();
}

class _StatusStyle {
  const _StatusStyle(
    this.bg,
    this.fg,
    this.label, [
    this.accent = const Color(0x00000000),
  ]);
  final Color bg, fg, accent;
  final String label;
}

const _thMonths = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const _thDows = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
];

_StatusStyle _statusStyle(String s) {
  switch (s) {
    case 'normal':
      return const _StatusStyle(
        Color(0xFFD1FAE5),
        Color(0xFF047857),
        'ปกติ',
        Color(0xFF10B981),
      );
    case 'late':
      return const _StatusStyle(
        Color(0xFFFBE7BE),
        Color(0xFF8A5A05),
        'มาสาย',
        Color(0xFFE59313),
      );
    case 'incomplete':
      return const _StatusStyle(
        Color(0xFFFBD5D5),
        Color(0xFFB02727),
        'ไม่ครบ',
        Color(0xFFD83A3A),
      );
    case 'absent':
      return const _StatusStyle(
        Color(0xFFFBD5D5),
        Color(0xFFB02727),
        'ขาด',
        Color(0xFFD83A3A),
      );
    case 'leave':
      return const _StatusStyle(
        Color(0xFFD5E3FF),
        Color(0xFF1B4FD6),
        'ลา',
        Color(0xFF2F6BE0),
      );
    case 'holiday':
    case 'holiday_work':
      return const _StatusStyle(
        Color(0xFFE7DFF6),
        Color(0xFF5B4C8A),
        'วันหยุด',
        Color(0xFF8A79C9),
      );
    default:
      return const _StatusStyle(Color(0x00000000), Color(0xFF9AA6B5), '');
  }
}

class _MonthCalendarState extends State<_MonthCalendar> {
  late int _year, _month;
  List<Map<String, dynamic>> _days = [];
  bool _loading = true;
  String? _err;
  String? _selected;
  String _shiftStart = '';

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
    _load();
  }

  @override
  void didUpdateWidget(covariant _MonthCalendar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (shouldReloadMonthForAttendanceRevision(
      previousRevision: oldWidget.attendanceRevision,
      currentRevision: widget.attendanceRevision,
    )) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final data = await BvnApi().month(widget.token, _year, _month);
      final days = (data['days'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final shiftStart = _clockValue(
        data['shiftStart'] ?? data['shift_start'],
        fallback: '',
      );
      final todayStr = bangkokAttendanceDay(DateTime.now().toUtc());
      final hasToday = days.any((d) => '${d['date']}' == todayStr);
      if (mounted) {
        setState(() {
          _days = days;
          _shiftStart = RegExp(r'^\d{1,2}:\d{2}$').hasMatch(shiftStart)
              ? shiftStart
              : '';
          _selected = hasToday
              ? todayStr
              : (days.isNotEmpty ? '${days.last['date']}' : null);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _err = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  void _shift(int delta) {
    var m = _month + delta, y = _year;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setState(() {
      _month = m;
      _year = y;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final worked = _days.where(
      (d) =>
          d['status'] == 'normal' ||
          d['status'] == 'late' ||
          d['status'] == 'holiday_work',
    );
    final otMin = _days.fold<int>(
      0,
      (s, d) => s + ((d['otMinutes'] as num?)?.round() ?? 0),
    );
    final lateCnt = _days.where((d) => d['late'] == true).length;
    final first = DateTime(_year, _month, 1).weekday % 7; // 0=Sun
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
        children: [
          SizedBox(
            height: 38,
            child: Row(
              children: [
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _shift(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    '${_thMonths[_month - 1]} ${_year + 543}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _shift(1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(30),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_err != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                'โหลดไม่ได้: $_err',
                style: const TextStyle(color: Color(0xFFC23636)),
              ),
            ),
          if (!_loading && _err == null) ...[
            Row(
              children: [
                for (var i = 0; i < 7; i++)
                  Expanded(
                    child: Center(
                      child: Text(
                        ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][i],
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: i == 0
                              ? const Color(0xFFC0392B)
                              : i == 6
                              ? const Color(0xFF2F6BE0)
                              : const Color(0xFF8A94A3),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            GridView.count(
              crossAxisCount: 7,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 3,
              crossAxisSpacing: 3,
              childAspectRatio: 1.22,
              children: [
                for (var i = 0; i < first; i++) const SizedBox.shrink(),
                for (final d in _days) _dayCell(d),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 5,
              children: [
                _legend(const Color(0xFFD1FAE5), 'ปกติ'),
                _legend(const Color(0xFFFBE7BE), 'สาย'),
                _legend(const Color(0xFFFBD5D5), 'ขาด/ไม่ครบ'),
                _legend(const Color(0xFFD5E3FF), 'ลา'),
                _legend(const Color(0xFFE7DFF6), 'วันหยุด'),
                _legend(const Color(0xFFEDEFF2), 'เสาร์-อาทิตย์'),
                _legend(const Color(0xFFFAD79A), '×N = ค่าแรงพิเศษ'),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
              decoration: BoxDecoration(
                color: kBrandDeep,
                borderRadius: BorderRadius.circular(kRadius),
                boxShadow: kHeroShadow,
              ),
              child: Row(
                children: [
                  _stat('มาทำงาน', '${worked.length} วัน'),
                  _statDivider(),
                  _stat('มาสาย', '$lateCnt วัน'),
                  _statDivider(),
                  _stat('OT รวม', '${(otMin / 60).toStringAsFixed(1)} ชม.'),
                ],
              ),
            ),
            if (_shiftStart.isNotEmpty) ...[
              const SizedBox(height: 8),
              _reminderBanner(),
            ],
            const SizedBox(height: 8),
            _selectedDetail(),
          ],
        ],
      ),
    );
  }

  Widget _stat(String label, String value) => Expanded(
    child: Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 19,
            fontWeight: FontWeight.w800,
            letterSpacing: -.3,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: .82),
            fontSize: 11.5,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    ),
  );

  Widget _statDivider() => Container(
    width: 1,
    height: 34,
    color: Colors.white.withValues(alpha: .22),
  );

  Widget _legend(Color c, String t) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 11,
        height: 11,
        decoration: BoxDecoration(
          color: c,
          borderRadius: BorderRadius.circular(3),
        ),
      ),
      const SizedBox(width: 5),
      Text(t, style: const TextStyle(fontSize: 11)),
    ],
  );

  Widget _dayCell(Map<String, dynamic> d) {
    final st = _statusStyle('${d['status']}');
    final date = '${d['date']}';
    final today = date == bangkokAttendanceDay(DateTime.now().toUtc());
    final selected = date == _selected;
    final hasIn = '${d['checkIn']}'.isNotEmpty;
    final hasOut = '${d['checkOut']}'.isNotEmpty;
    final hasStatus = st.label.isNotEmpty;
    final wd = DateTime.parse(date).weekday % 7; // 0=Sun..6=Sat
    final weekend = wd == 0 || wd == 6;
    final mult = (d['multiplier'] as num?)?.toDouble() ?? 1;
    final premium = mult > 1;
    final bg = hasStatus
        ? st.bg
        : (weekend ? const Color(0xFFEDEFF2) : Colors.transparent);
    final numColor = hasStatus
        ? st.fg
        : (wd == 0
              ? const Color(0xFFC0392B)
              : wd == 6
              ? const Color(0xFF2F6BE0)
              : const Color(0xFF66707C));
    return GestureDetector(
      onTap: () => setState(() => _selected = date),
      child: Container(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(9),
          border: selected
              ? Border.all(color: _greenDeep, width: 2)
              : today
              ? Border.all(color: _greenDeep, width: 1.2)
              : null,
        ),
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '${d['day']}',
                    style: TextStyle(
                      fontSize: 13,
                      color: numColor,
                      fontWeight: (selected || hasStatus)
                          ? FontWeight.w600
                          : FontWeight.normal,
                    ),
                  ),
                  const SizedBox(height: 3),
                  SizedBox(
                    height: 5,
                    child: (hasIn || hasOut)
                        ? Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (hasIn) _dot(_greenDeep),
                              if (hasIn && hasOut) const SizedBox(width: 3),
                              if (hasOut) _dot(const Color(0xFFC23636)),
                            ],
                          )
                        : hasStatus
                        ? Container(
                            width: 13,
                            height: 4,
                            decoration: BoxDecoration(
                              color: st.accent,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
            if (premium) Positioned(top: 1, right: 2, child: _multBadge(mult)),
          ],
        ),
      ),
    );
  }

  // Small corner badge showing a day's OT pay multiplier (holiday / weekend).
  Widget _multBadge(double m) {
    final (bg, fg) = m >= 3
        ? (const Color(0xFFF4C0C0), const Color(0xFF8E1F1F))
        : m >= 2
        ? (const Color(0xFFFAD79A), const Color(0xFF7A4A08))
        : (const Color(0xFFC6E3A4), const Color(0xFF2C5010));
    final txt = m == m.roundToDouble()
        ? m.toStringAsFixed(0)
        : m.toStringAsFixed(1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        '×$txt',
        style: TextStyle(
          fontSize: 9,
          height: 1,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }

  Widget _dot(Color c) => Container(
    width: 5,
    height: 5,
    decoration: BoxDecoration(color: c, shape: BoxShape.circle),
  );

  Widget _reminderBanner() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: const Color(0xFFE4F7EF),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFBFE6D1)),
    ),
    child: Row(
      children: [
        const Icon(Icons.notifications_active, size: 18, color: _greenDeep),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            'แอปจะเตือนก่อนถึงเวลาเข้างาน $_shiftStart น. และเตือนให้เช็กเอาต์หลังเลิกงาน',
            style: const TextStyle(fontSize: 12.5, color: Color(0xFF0A5B3B)),
          ),
        ),
      ],
    ),
  );

  Widget _selectedDetail() {
    final cs = Theme.of(context).colorScheme;
    Widget shell(Widget child) => Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: child,
    );
    if (_selected == null) {
      return shell(
        Text(
          'แตะวันในปฏิทินเพื่อดูรายละเอียดการลงเวลา',
          style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
        ),
      );
    }
    final d = _days.firstWhere(
      (e) => '${e['date']}' == _selected,
      orElse: () => <String, dynamic>{},
    );
    if (d.isEmpty) {
      return shell(
        Text(
          'ไม่มีข้อมูลของวันที่เลือก',
          style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
        ),
      );
    }
    final st = _statusStyle('${d['status']}');
    final dt = DateTime.parse('${d['date']}');
    final checkIn = '${d['checkIn']}';
    final checkOut = '${d['checkOut']}';
    final wm = (d['workedMinutes'] as num?)?.round() ?? 0;
    final ot = (d['otMinutes'] as num?)?.round() ?? 0;
    final holiday = '${d['holidayName'] ?? ''}';
    final leaveType = '${d['leaveType'] ?? ''}';
    final status = '${d['status']}';
    final title =
        'วัน${_thDows[dt.weekday % 7]} ${dt.day} ${_thMonths[dt.month - 1]}';
    final rows = <Widget>[];
    if (holiday.isNotEmpty) {
      rows.add(
        _detailLine(
          Icons.event_busy,
          'วันหยุด',
          holiday,
          const Color(0xFF5F6B7E),
        ),
      );
    }
    if (status == 'leave') {
      rows.add(
        _detailLine(
          Icons.beach_access,
          'ลางาน',
          leaveType.isEmpty ? '—' : leaveType,
          const Color(0xFF1B4FD6),
        ),
      );
    }
    rows.add(
      _detailLine(
        Icons.login,
        'เข้างาน',
        checkIn.isEmpty ? '—' : checkIn,
        _greenDeep,
      ),
    );
    rows.add(
      _detailLine(
        Icons.logout,
        'ออกงาน',
        checkOut.isEmpty ? '—' : checkOut,
        const Color(0xFFC23636),
      ),
    );
    if (wm > 0) {
      rows.add(
        _detailLine(
          Icons.timelapse,
          'ชั่วโมงทำงาน',
          '${(wm / 60).toStringAsFixed(1)} ชม.',
          _ink,
        ),
      );
    }
    if (ot > 0) {
      rows.add(
        _detailLine(
          Icons.more_time,
          'OT',
          '${(ot / 60).toStringAsFixed(1)} ชม.',
          _orange,
        ),
      );
    }
    final mult = (d['multiplier'] as num?)?.toDouble() ?? 1;
    if (mult > 1) {
      final mtxt = mult == mult.roundToDouble()
          ? mult.toStringAsFixed(0)
          : mult.toStringAsFixed(1);
      rows.add(
        _detailLine(
          Icons.payments,
          'ค่าแรงวันนี้',
          '×$mtxt (${holiday.isNotEmpty ? 'วันหยุด' : (dt.weekday % 7 == 0
                    ? 'วันอาทิตย์'
                    : dt.weekday % 7 == 6
                    ? 'วันเสาร์'
                    : 'วันพิเศษ')})',
          _orange,
        ),
      );
    }
    if (checkIn.isEmpty && status != 'leave' && holiday.isEmpty) {
      rows.add(
        _detailLine(
          Icons.info_outline,
          'สถานะ',
          'ไม่มีบันทึกการลงเวลา',
          const Color(0xFFC23636),
        ),
      );
    }
    return shell(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (st.label.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: st.bg,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    st.label,
                    style: TextStyle(
                      fontSize: 12,
                      color: st.fg,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          ...rows,
        ],
      ),
    );
  }

  Widget _detailLine(IconData icon, String label, String value, Color color) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
          ),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _RequestsPage extends StatefulWidget {
  const _RequestsPage({required this.token});
  final String token;
  @override
  State<_RequestsPage> createState() => _RequestsPageState();
}

class _RequestsPageState extends State<_RequestsPage> {
  List<Map<String, dynamic>> _leaves = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final leaves = await BvnApi().leaveCalendar(widget.token);
      if (mounted) {
        setState(() {
          _leaves = leaves;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'ยังดึงคำขอจากระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
        });
      }
    }
  }

  _StatusStyle _requestStyle(String status) {
    switch (status) {
      case 'approved':
      case 'accepted':
        return const _StatusStyle(
          Color(0xFFE4F7EF),
          Color(0xFF0A7350),
          'อนุมัติ',
        );
      case 'rejected':
        return const _StatusStyle(
          Color(0xFFFDECEC),
          Color(0xFFC23636),
          'ไม่อนุมัติ',
        );
      default:
        return const _StatusStyle(
          Color(0xFFFFF1DD),
          Color(0xFFB45309),
          'รอตรวจ',
        );
    }
  }

  Widget _badge(String status) {
    final style = _requestStyle(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: style.bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        style.label,
        style: TextStyle(
          color: style.fg,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _leaveCard(BuildContext context, Map<String, dynamic> item) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _requestIcon(context, Icons.event_busy_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item['leaveType'] ?? 'ลางาน'}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${item['startDate'] ?? '—'} ถึง ${item['endDate'] ?? '—'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                if ('${item['reason'] ?? ''}'.trim().isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    '${item['reason']}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          _badge('${item['status'] ?? 'pending'}'),
        ],
      ),
    ),
  );

  Widget _requestIcon(BuildContext context, IconData icon) => Container(
    width: 38,
    height: 38,
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Icon(
      icon,
      size: 20,
      color: Theme.of(context).colorScheme.onPrimaryContainer,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final leaves = _leaves;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'คำขอของฉัน',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'ติดตามสถานะคำขอลาของคุณ',
                      style: TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(30),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_error!),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: _load,
                      child: const Text('ลองใหม่'),
                    ),
                  ],
                ),
              ),
            )
          else if (leaves.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Icon(
                      Icons.inbox_outlined,
                      size: 34,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'ยังไม่มีคำขอ',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 3),
                    const Text(
                      'เมื่อส่งคำขอลา สถานะจะแสดงที่นี่',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          else ...[
            Text(
              'การลา',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            ...leaves.map(
              (e) => Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: _leaveCard(context, e),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LeaveForm extends StatefulWidget {
  const _LeaveForm({required this.token, required this.onSent});
  final String token;
  final VoidCallback onSent;
  @override
  State<_LeaveForm> createState() => _LeaveFormState();
}

class _LeaveFormState extends State<_LeaveForm> {
  String _type = 'ลาป่วย';
  DateTime? _start, _end;
  bool _sending = false;
  final _reason = TextEditingController();
  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick(bool start) async {
    final d = await showDatePicker(
      context: context,
      initialDate: start
          ? (_start ?? DateTime.now())
          : (_end ?? _start ?? DateTime.now()),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (d != null) setState(() => start ? _start = d : _end = d);
  }

  Future<void> _send() async {
    if (_start == null ||
        _end == null ||
        _reason.text.trim().isEmpty ||
        _end!.isBefore(_start!)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('เลือกวันลาให้ถูกต้องและระบุเหตุผล')),
      );
      return;
    }
    setState(() => _sending = true);
    try {
      await BvnApi().submitLeave(
        token: widget.token,
        leaveType: _type,
        start: _start!,
        end: _end!,
        reason: _reason.text.trim(),
      );
      if (mounted) {
        setState(() {
          _start = null;
          _end = null;
          _reason.clear();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('ส่งคำขอลาแล้ว กำลังเปิดหน้าติดตามสถานะ'),
          ),
        );
        widget.onSent();
      }
    } on BvnApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _thDate(DateTime? d) => d == null
      ? 'เลือกวัน'
      : '${d.day} ${_thMonths[d.month - 1].substring(0, 3)} ${d.year + 543}';

  int get _days => (_start != null && _end != null && !_end!.isBefore(_start!))
      ? _end!.difference(_start!).inDays + 1
      : 0;

  Widget _dateTile(
    BuildContext context,
    String label,
    DateTime? value,
    bool start,
  ) => Expanded(
    child: InkWell(
      onTap: _sending ? null : () => _pick(start),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(
                  Icons.event,
                  size: 18,
                  color: value == null
                      ? Theme.of(context).disabledColor
                      : _greenDeep,
                ),
                const SizedBox(width: 6),
                Text(
                  _thDate(value),
                  style: TextStyle(
                    fontSize: 15,
                    color: value == null
                        ? Theme.of(context).disabledColor
                        : Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    const types = ['ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาอื่น ๆ'];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      children: [
        const Text(
          'ขอลางาน',
          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 14),
        Text(
          'ประเภทการลา',
          style: TextStyle(
            fontSize: 13,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final t in types)
              ChoiceChip(
                label: Text(t),
                selected: _type == t,
                onSelected: _sending ? null : (_) => setState(() => _type = t),
                selectedColor: _greenDeep,
                labelStyle: TextStyle(
                  color: _type == t
                      ? Colors.white
                      : Theme.of(context).colorScheme.onSurface,
                ),
                backgroundColor: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest,
                showCheckmark: false,
              ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            _dateTile(context, 'ตั้งแต่', _start, true),
            const SizedBox(width: 10),
            _dateTile(context, 'ถึง', _end, false),
          ],
        ),
        if (_days > 0)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFEAF1FF),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.info_outline,
                    size: 16,
                    color: Color(0xFF1B4FD6),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'รวม $_days วัน',
                    style: const TextStyle(
                      color: Color(0xFF1B4FD6),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 14),
        TextField(
          controller: _reason,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: 'เหตุผล',
            alignLabelWithHint: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 50,
          child: FilledButton.icon(
            onPressed: _sending ? null : _send,
            icon: _sending
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.send),
            label: Text(_sending ? 'กำลังส่ง…' : 'ส่งคำขอลา'),
          ),
        ),
      ],
    );
  }
}

class _NotifStatusCard extends StatefulWidget {
  const _NotifStatusCard();
  @override
  State<_NotifStatusCard> createState() => _NotifStatusCardState();
}

class _NotifStatusCardState extends State<_NotifStatusCard> {
  bool? _enabled;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final on = await Notif.isEnabled();
    if (mounted) setState(() => _enabled = on);
  }

  Future<void> _enable() async {
    setState(() => _busy = true);
    final ok = await Notif.requestPermission();
    if (!mounted) return;
    setState(() {
      _enabled = ok;
      _busy = false;
    });
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'เปิดสิทธิ์แจ้งเตือนไม่สำเร็จ · ไปที่ ตั้งค่า > แอป > การแจ้งเตือน เพื่อเปิดด้วยตนเอง',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final on = _enabled == true;
    final color = on ? _greenDeep : _orange;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Row(
          children: [
            Icon(
              on ? Icons.notifications_active : Icons.notifications_off,
              color: color,
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'การแจ้งเตือน',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _enabled == null
                        ? 'กำลังตรวจสอบ…'
                        : on
                        ? 'เปิดอยู่ · เตือนก่อนเข้างานและเตือนให้เช็กเอาต์'
                        : 'ปิดอยู่ · แอปจะไม่เตือนเช็กอิน/เช็กเอาต์',
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (_enabled == false)
              FilledButton(
                onPressed: _busy ? null : _enable,
                style: FilledButton.styleFrom(
                  backgroundColor: _greenDeep,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                ),
                child: Text(_busy ? '…' : 'เปิด'),
              )
            else if (on)
              const Icon(Icons.check_circle, color: _greenDeep, size: 20),
          ],
        ),
      ),
    );
  }
}

class AccountScreen extends StatelessWidget {
  const AccountScreen({
    super.key,
    required this.token,
    required this.name,
    required this.id,
    required this.role,
    required this.locationRequired,
    required this.profileNeedsUpdate,
    required this.identityPending,
    required this.onLogout,
  });
  final String token, name, id, role;
  final bool locationRequired;
  final bool profileNeedsUpdate;
  final bool identityPending;
  final Future<void> Function() onLogout;
  @override
  Widget build(BuildContext context) {
    final status = workIdentityStatus(
      profileNeedsUpdate: profileNeedsUpdate,
      identityPending: identityPending,
      locationRequired: locationRequired,
    );
    final displayName = name.trim().isEmpty ? id : name.trim();
    final displayRole = role.trim().isEmpty ? 'พนักงาน' : role.trim();
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionLabel('ข้อมูลการทำงานของฉัน'),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: kBrandDeep,
              borderRadius: BorderRadius.circular(kRadiusSm),
              boxShadow: kHeroShadow,
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 21,
                  backgroundColor: Colors.white.withValues(alpha: .18),
                  child: Text(
                    displayName.isEmpty ? '?' : displayName[0].toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$displayRole · $id',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: .84),
                          fontSize: 11.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _statusCard(
                  'สถานะบัญชี',
                  'ใช้งานอยู่',
                  Icons.person_outline_rounded,
                  const Color(0xFFE8F7EF),
                  const Color(0xFF08764E),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _statusCard(
                  'ข้อมูลส่วนตัว',
                  status.label,
                  status.icon,
                  status.background,
                  status.foreground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _locationPolicy(status),
          if (status.requiresAction) ...[
            const SizedBox(height: 8),
            _identityAlert(context, status),
          ],
          const SizedBox(height: 10),
          SoftCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _accountTile(
                  context,
                  Icons.badge_outlined,
                  'ข้อมูลส่วนตัว',
                  status.requiresAction
                      ? 'กรอกข้อมูลเพื่อส่งให้ผู้ดูแลตรวจสอบ'
                      : status.detail,
                  () => _identityDialog(context),
                ),
                const Divider(height: 1, indent: 52),
                _accountTile(
                  context,
                  Icons.lock_outline_rounded,
                  'เปลี่ยนรหัสผ่าน',
                  'ใช้รหัสผ่านเดิมเพื่อยืนยัน',
                  () => _changePasswordDialog(context),
                ),
                const Divider(height: 1, indent: 52),
                _accountTile(
                  context,
                  Icons.lock_reset_rounded,
                  'รีเซ็ตรหัสผ่าน',
                  'ขอให้ผู้ดูแลช่วยเมื่อเข้าไม่ได้',
                  () => _requestResetDialog(context),
                ),
              ],
            ),
          ),
          const Spacer(),
          OutlinedButton.icon(
            onPressed: onLogout,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(42),
              foregroundColor: kDanger,
              side: const BorderSide(color: Color(0xFFE6C3C3)),
            ),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('ออกจากระบบ'),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              'เวอร์ชัน $kAppVersionName',
              style: const TextStyle(fontSize: 10.5, color: kMuted),
            ),
          ),
        ],
      ),
    );
  }

  Widget _locationPolicy(WorkIdentityStatus status) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
    decoration: BoxDecoration(
      color: kBrandSoft,
      borderRadius: BorderRadius.circular(kRadiusSm),
      border: Border.all(color: kHair),
    ),
    child: Row(
      children: [
        Icon(
          locationRequired
              ? Icons.location_on_outlined
              : Icons.location_off_outlined,
          color: kBrandDeep,
          size: 18,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'นโยบายการลงเวลา · ${status.locationPolicy}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: kInk,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _identityAlert(BuildContext context, WorkIdentityStatus status) =>
      InkWell(
        onTap: () => _identityDialog(context),
        borderRadius: BorderRadius.circular(kRadiusSm),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
          decoration: BoxDecoration(
            color: status.background,
            borderRadius: BorderRadius.circular(kRadiusSm),
            border: Border.all(color: status.foreground.withValues(alpha: .25)),
          ),
          child: Row(
            children: [
              Icon(
                Icons.info_outline_rounded,
                color: status.foreground,
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  status.detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: status.foreground,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: status.foreground),
            ],
          ),
        ),
      );

  Widget _statusCard(
    String title,
    String value,
    IconData icon,
    Color bg,
    Color fg,
  ) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(kRadiusSm),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: fg),
        const SizedBox(height: 9),
        Text(title, style: const TextStyle(fontSize: 11.5, color: kMuted)),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            color: fg,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );

  Widget _accountTile(
    BuildContext context,
    IconData icon,
    String title,
    String? subtitle,
    VoidCallback onTap,
  ) => ListTile(
    onTap: onTap,
    dense: true,
    minVerticalPadding: 2,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 1),
    leading: Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: kBrandSoft,
        borderRadius: BorderRadius.circular(9),
      ),
      child: Icon(icon, size: 18, color: kBrandDeep),
    ),
    title: Text(
      title,
      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
    ),
    subtitle: subtitle == null
        ? null
        : Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11, color: kMuted),
          ),
    trailing: const Icon(Icons.chevron_right_rounded, color: kMuted),
  );

  void _snack(BuildContext context, String msg) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  Future<void> _identityDialog(BuildContext context) async {
    Map<String, dynamic> current = <String, dynamic>{};
    try {
      current = await BvnApi().identityProfile(token);
    } on BvnApiException catch (e) {
      _snack(context, e.message);
      return;
    } catch (_) {
      _snack(context, 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
      return;
    }
    if (current['pending'] == true) {
      _snack(context, 'ส่งข้อมูลให้ผู้ดูแลตรวจสอบแล้ว');
      return;
    }
    final nationalId = TextEditingController();
    final phone = TextEditingController(text: '${current['phone'] ?? ''}');
    final validation = ValueNotifier(
      validateEmployeeIdentity(nationalId: nationalId.text, phone: phone.text),
    );
    void refreshValidation() => validation.value = validateEmployeeIdentity(
      nationalId: nationalId.text,
      phone: phone.text,
    );
    nationalId.addListener(refreshValidation);
    phone.addListener(refreshValidation);
    try {
      await showDialog<void>(
        context: context,
        builder: (c) => ValueListenableBuilder<EmployeeIdentityValidation>(
          valueListenable: validation,
          builder: (c, state, _) => AlertDialog(
            title: const Text('ยืนยันข้อมูลส่วนตัว'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ข้อมูลจะส่งให้ผู้ดูแลตรวจสอบก่อนบันทึกในทะเบียนพนักงาน',
                  style: TextStyle(fontSize: 12, color: kMuted),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: nationalId,
                  keyboardType: TextInputType.number,
                  maxLength: 13,
                  decoration: InputDecoration(
                    labelText: 'เลขบัตรประชาชน',
                    helperText:
                        '${state.nationalIdDigits}/13 · ${state.nationalIdHint}',
                    hintText:
                        current['nationalIdLast4']?.toString().isNotEmpty ==
                            true
                        ? 'บันทึกแล้ว ••••${current['nationalIdLast4']}'
                        : '13 หลัก',
                  ),
                ),
                TextField(
                  controller: phone,
                  keyboardType: TextInputType.phone,
                  maxLength: 10,
                  decoration: InputDecoration(
                    labelText: 'เบอร์โทรศัพท์',
                    helperText: '${state.phoneDigits}/10 · ${state.phoneHint}',
                    hintText: 'เช่น 0845561071',
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c),
                child: const Text('ยกเลิก'),
              ),
              FilledButton(
                onPressed: state.canSubmit
                    ? () async {
                        try {
                          await BvnApi().submitIdentity(
                            token: token,
                            nationalId: nationalId.text,
                            phone: phone.text,
                          );
                          if (c.mounted) Navigator.pop(c);
                          _snack(context, 'ส่งข้อมูลให้ผู้ดูแลตรวจสอบแล้ว');
                        } on BvnApiException catch (e) {
                          _snack(context, e.message);
                        } catch (_) {
                          _snack(context, 'ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
                        }
                      }
                    : null,
                child: const Text('ส่งให้ตรวจสอบ'),
              ),
            ],
          ),
        ),
      );
    } finally {
      nationalId.dispose();
      phone.dispose();
      validation.dispose();
    }
  }

  Future<void> _changePasswordDialog(BuildContext context) async {
    final oldPw = TextEditingController(), newPw = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('เปลี่ยนรหัสผ่าน'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: oldPw,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'รหัสผ่านเดิม'),
            ),
            TextField(
              controller: newPw,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'รหัสผ่านใหม่'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('ยกเลิก'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('บันทึก'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (newPw.text.trim().length < 4) {
      _snack(context, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัว');
      return;
    }
    try {
      await BvnApi().changePassword(
        token: token,
        oldPassword: oldPw.text,
        newPassword: newPw.text.trim(),
      );
      _snack(context, 'เปลี่ยนรหัสผ่านแล้ว');
    } catch (e) {
      _snack(context, e.toString());
    }
  }

  Future<void> _requestResetDialog(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('ขอให้แอดมินรีเซ็ตรหัสผ่าน'),
        content: const Text(
          'ส่งคำขอให้แอดมินออกรหัสผ่านใหม่ให้ แล้วแอดมินจะแจ้งรหัสใหม่กลับมา',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('ยกเลิก'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('ส่งคำขอ'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await BvnApi().requestPasswordReset(token);
      _snack(context, 'ส่งคำขอรีเซ็ตรหัสผ่านให้แอดมินแล้ว');
    } catch (e) {
      _snack(context, e.toString());
    }
  }
}
