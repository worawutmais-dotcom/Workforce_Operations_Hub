// Account-tab actions guard context use via a context.mounted check inside _snack.
// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import 'bvn_api.dart';

const _navy = Color(0xFF102A43);
const _blue = Color(0xFF146EF5);

String _statusTh(String s) {
  switch (s) {
    case 'accepted':
      return 'สำเร็จ';
    case 'approved':
      return 'อนุมัติ';
    case 'pending':
      return 'รอตรวจ';
    case 'rejected':
      return 'ปฏิเสธ';
    case 'voided':
      return 'ยกเลิก';
    default:
      return s;
  }
}

void main() => runApp(const BvnEmployeeApp());

class BvnEmployeeApp extends StatefulWidget {
  const BvnEmployeeApp({super.key});
  @override
  State<BvnEmployeeApp> createState() => _BvnEmployeeAppState();
}

class _BvnEmployeeAppState extends State<BvnEmployeeApp> {
  final _store = DeviceSessionStore();
  String? _id, _token;
  bool _restoring = true;
  @override
  void initState() {
    super.initState();
    _restore();
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
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: _blue),
      scaffoldBackgroundColor: const Color(0xFFF5F8FB),
    ),
    home: _restoring
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : _id == null
        ? LoginPage(onLogin: _login)
        : EmployeeShell(employeeId: _id!, token: _token!, onLogout: _logout),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onLogin});
  final Future<void> Function(String, String) onLogin;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _password = TextEditingController();
  List<Map<String, dynamic>> _people = [];
  String? _id, _error;
  bool _hidden = true, _loading = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _people = await BvnApi().employeeDirectory();
    } on BvnApiException catch (e) {
      _error = e.message;
    } catch (e) {
      _error = 'โหลดรายชื่อไม่สำเร็จ: $e';
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _submit() async {
    if (_id == null || _password.text.trim().isEmpty) {
      setState(() => _error = 'เลือกชื่อของคุณและกรอกรหัสผ่าน');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final session = await BvnApi().login(_id!, _password.text.trim());
      await widget.onLogin(session.employeeId, session.mobileToken);
    } on BvnApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'เชื่อมต่อระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.inventory_2_rounded, color: _blue, size: 56),
              const SizedBox(height: 18),
              const Text(
                'BVN PACKAGE',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _blue,
                  letterSpacing: 2,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'เข้าสู่ระบบพนักงาน',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.bold,
                  color: _navy,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'เลือกชื่อของคุณ แล้วกรอกรหัสผ่านของคุณ',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              DropdownButtonFormField<String>(
                initialValue: _id,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'ชื่อพนักงาน',
                  border: OutlineInputBorder(),
                ),
                items: _people
                    .map(
                      (p) => DropdownMenuItem(
                        value: p['employeeId']?.toString(),
                        child: Text('${p['name']} (${p['employeeId']})'),
                      ),
                    )
                    .toList(),
                onChanged: _loading
                    ? null
                    : (value) => setState(() => _id = value),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _password,
                obscureText: _hidden,
                keyboardType: TextInputType.text,
                decoration: InputDecoration(
                  labelText: 'รหัสผ่าน',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _hidden
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                    onPressed: () => setState(() => _hidden = !_hidden),
                  ),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: Text(_loading ? 'กำลังโหลด…' : 'เข้าสู่ระบบ'),
              ),
              TextButton(
                onPressed: _loading
                    ? null
                    : () {
                        setState(() {
                          _loading = true;
                          _error = null;
                        });
                        _load();
                      },
                child: const Text('โหลดรายชื่อใหม่'),
              ),
            ],
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
  });
  final String employeeId, token;
  final Future<void> Function() onLogout;
  @override
  State<EmployeeShell> createState() => _EmployeeShellState();
}

class _EmployeeShellState extends State<EmployeeShell> {
  int _tab = 0;
  String _name = '', _role = '', _site = '', _status = 'กำลังตรวจสถานะวันนี้';
  String? _in, _out;
  bool _locationRequired = true, _busy = false;
  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final profile = await BvnApi().profile(widget.token);
      final day = DateTime.now().toIso8601String().substring(0, 10);
      final events = (await BvnApi().timeline(widget.token))
          .where(
            (e) =>
                '${e['occurredAt']}'.startsWith(day) &&
                e['status'] == 'accepted',
          )
          .toList();
      String? time(String type) {
        final event = events.where((e) => e['eventType'] == type).toList();
        final value = event.isEmpty ? '' : '${event.first['occurredAt']}';
        return value.length >= 16 ? value.substring(11, 16) : null;
      }

      if (mounted) {
        setState(() {
          _name = '${profile['name'] ?? ''}';
          _role = '${profile['role'] ?? ''}';
          _site = '${profile['siteId'] ?? ''}';
          _locationRequired = profile['locationRequired'] == true;
          _in = time('check_in');
          _out = time('check_out');
          _status = _out != null
              ? 'ลงเวลาออกงานแล้ว'
              : _in != null
              ? 'อยู่ระหว่างงาน'
              : 'ยังไม่ได้ลงเวลาเข้างาน';
        });
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
      if (_locationRequired && type == 'check_in') {
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
        throw Exception('ตรวจพบการปลอมตำแหน่ง (Mock location) — ปิดแอปจำลองตำแหน่งก่อนเช็กอิน');
      }
      final res = await BvnApi().attendance(
        token: widget.token,
        eventType: type,
        latitude: p?.latitude ?? 0,
        longitude: p?.longitude ?? 0,
        accuracy: p?.accuracy ?? 0,
        mocked: mocked,
      );
      await _refresh();
      if (mounted) {
        final ot = (res['data'] as Map<String, dynamic>?)?['overtime']
            as Map<String, dynamic>?;
        final otMin = (ot?['overtimeMinutes'] as num?)?.round() ?? 0;
        String msg = 'บันทึกเวลาเข้าระบบแล้ว';
        if (type == 'check_out' && otMin > 0) {
          final h = otMin ~/ 60, m = otMin % 60;
          final dur = h > 0 ? '$h ชม. ${m > 0 ? '$m นาที' : ''}'.trim() : '$m นาที';
          msg = ot?['status'] == 'already_requested'
              ? 'บันทึกออกงานแล้ว • ทำเกินเวลา ~$dur (ส่งขออนุมัติ OT ไว้แล้ว)'
              : 'บันทึกออกงานแล้ว • ตรวจพบ OT ~$dur ส่งขออนุมัติให้แอดมินแล้ว ✅';
        }
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(msg),
          duration: const Duration(seconds: 4),
        ));
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
        status: _status,
        checkIn: _in,
        checkOut: _out,
        busy: _busy,
        token: widget.token,
        locationRequired: _locationRequired,
        onIn: () => _attendance('check_in'),
        onOut: () => _attendance('check_out'),
        onRefresh: _refresh,
      ),
      _MonthCalendar(token: widget.token),
      _LeaveForm(token: widget.token),
      _ListPage(
        title: 'คำขอลางานของฉัน',
        future: () => BvnApi().leaveCalendar(widget.token),
        row: (r) => ListTile(
          title: Text('${r['leaveType']} • ${_statusTh('${r['status']}')}'),
          subtitle: Text('${r['startDate']} ถึง ${r['endDate']}'),
        ),
      ),
      _Account(
        token: widget.token,
        name: _name,
        id: widget.employeeId,
        role: _role,
        site: _site,
        locationRequired: _locationRequired,
        onLogout: widget.onLogout,
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_name.isEmpty ? 'BVN Package' : 'BVN Package • $_role'),
      ),
      body: SafeArea(child: pages[_tab]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (value) => setState(() => _tab = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            label: 'วันนี้',
          ),
          NavigationDestination(icon: Icon(Icons.access_time), label: 'เวลา'),
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
}

class _Today extends StatelessWidget {
  const _Today({
    required this.name,
    required this.status,
    this.checkIn,
    this.checkOut,
    required this.busy,
    required this.token,
    required this.locationRequired,
    required this.onIn,
    required this.onOut,
    required this.onRefresh,
  });
  final String name, status, token;
  final String? checkIn, checkOut;
  final bool busy, locationRequired;
  final Future<void> Function() onIn, onOut, onRefresh;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Text(
        'สวัสดี, $name',
        style: const TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.bold,
          color: _navy,
        ),
      ),
      const SizedBox(height: 12),
      Card(
        color: _navy,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                status,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'เข้างาน: ${checkIn ?? '--:--'}   ออกงาน: ${checkOut ?? '--:--'}',
                style: const TextStyle(color: Colors.white),
              ),
            ],
          ),
        ),
      ),
      if (locationRequired && checkIn == null) ...[
        const SizedBox(height: 14),
        _CheckInMap(token: token),
      ],
      const SizedBox(height: 14),
      FilledButton.icon(
        onPressed: busy || checkIn != null ? null : onIn,
        icon: const Icon(Icons.login),
        label: Text(busy ? 'กำลังตรวจสอบ…' : 'Check in'),
      ),
      OutlinedButton.icon(
        onPressed: busy || checkIn == null || checkOut != null ? null : onOut,
        icon: const Icon(Icons.logout),
        label: const Text('Check out (ที่ไหนก็ได้)'),
      ),
      TextButton.icon(
        onPressed: busy ? null : onRefresh,
        icon: const Icon(Icons.refresh),
        label: const Text('รีเฟรชสถานะ'),
      ),
    ],
  );
}

// Live check-in map: shows allowed sites (circles) + the employee's position,
// and whether they are inside any site's radius yet.
class _CheckInMap extends StatefulWidget {
  const _CheckInMap({required this.token});
  final String token;
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

  Future<void> _load() async {
    // Get the phone's own GPS FIRST and independently, so it works even if the
    // sites API is unavailable (e.g. backend not yet deployed).
    Position? p;
    try {
      if (await Geolocator.isLocationServiceEnabled()) {
        var perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied) {
          perm = await Geolocator.requestPermission();
        }
        if (perm != LocationPermission.denied &&
            perm != LocationPermission.deniedForever) {
          p = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
            ),
          );
        }
      }
    } catch (_) {}
    List<Map<String, dynamic>> sites = [];
    String? sitesError;
    try {
      sites = await BvnApi().sites(widget.token);
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
        msg = inside
            ? 'คุณอยู่ในพื้นที่ "$bestName" แล้ว ✅ เช็กอินได้'
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
        if (me != null) _map.move(me, 16);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _msg = 'โหลดแผนที่ไม่ได้: ${e.toString().replaceFirst('Exception: ', '')}';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final center = _me ??
        (_sites.isNotEmpty
            ? LatLng(
                (_sites.first['lat'] as num).toDouble(),
                (_sites.first['lng'] as num).toDouble(),
              )
            : const LatLng(13.7563, 100.5018));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _inside ? const Color(0xFFE4F7EF) : const Color(0xFFFDF3DD),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(
                _inside ? Icons.check_circle : Icons.my_location,
                color: _inside ? const Color(0xFF0A7350) : const Color(0xFFB45309),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(_msg)),
              IconButton(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh),
                tooltip: 'รีเฟรชตำแหน่ง',
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 240,
            child: FlutterMap(
              mapController: _map,
              options: MapOptions(initialCenter: center, initialZoom: 16),
              children: [
                TileLayer(
                  urlTemplate:
                      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.bvnpackage.employee_mobile',
                ),
                CircleLayer(
                  circles: [
                    for (final s in _sites)
                      CircleMarker(
                        point: LatLng(
                          (s['lat'] as num).toDouble(),
                          (s['lng'] as num).toDouble(),
                        ),
                        radius: (s['radius'] as num).toDouble(),
                        useRadiusInMeter: true,
                        color: const Color(0x331E6EF5),
                        borderColor: _blue,
                        borderStrokeWidth: 2,
                      ),
                  ],
                ),
                MarkerLayer(
                  markers: [
                    for (final s in _sites)
                      Marker(
                        point: LatLng(
                          (s['lat'] as num).toDouble(),
                          (s['lng'] as num).toDouble(),
                        ),
                        width: 120,
                        height: 34,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${s['name'] ?? s['id']}',
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                      ),
                    if (_me != null)
                      Marker(
                        point: _me!,
                        width: 28,
                        height: 28,
                        child: const Icon(
                          Icons.person_pin_circle,
                          color: Color(0xFFD64545),
                          size: 28,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// Month calendar of attendance: color-coded days + one row per day with times.
class _MonthCalendar extends StatefulWidget {
  const _MonthCalendar({required this.token});
  final String token;
  @override
  State<_MonthCalendar> createState() => _MonthCalendarState();
}

class _StatusStyle {
  const _StatusStyle(this.bg, this.fg, this.label);
  final Color bg, fg;
  final String label;
}

const _thMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

_StatusStyle _statusStyle(String s) {
  switch (s) {
    case 'normal':
      return const _StatusStyle(Color(0xFFE4F7EF), Color(0xFF0A7350), 'ปกติ');
    case 'late':
      return const _StatusStyle(Color(0xFFFDF3DD), Color(0xFFB45309), 'มาสาย');
    case 'incomplete':
      return const _StatusStyle(Color(0xFFFDECEC), Color(0xFFC23636), 'ไม่ครบ');
    case 'absent':
      return const _StatusStyle(Color(0xFFFDECEC), Color(0xFFC23636), 'ขาด');
    case 'leave':
      return const _StatusStyle(Color(0xFFEAF1FF), Color(0xFF1B4FD6), 'ลา');
    case 'holiday':
    case 'holiday_work':
      return const _StatusStyle(Color(0xFFEDEFF4), Color(0xFF5F6B7E), 'วันหยุด');
    default:
      return const _StatusStyle(Color(0x00000000), Color(0xFF9AA6B5), '');
  }
}

class _MonthCalendarState extends State<_MonthCalendar> {
  late int _year, _month;
  List<Map<String, dynamic>> _days = [];
  bool _loading = true;
  String? _err;
  final _scroll = ScrollController();
  final _rowKeys = <String, GlobalKey>{};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
    _load();
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
      if (mounted) {
        setState(() {
          _days = days;
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

  void _scrollToDay(String date) {
    final k = _rowKeys[date];
    final ctx = k?.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx,
          duration: const Duration(milliseconds: 300), alignment: 0.1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final worked = _days.where((d) => d['status'] == 'normal' || d['status'] == 'late' || d['status'] == 'holiday_work');
    final otMin = _days.fold<int>(0, (s, d) => s + ((d['otMinutes'] as num?)?.round() ?? 0));
    final lateCnt = _days.where((d) => d['late'] == true).length;
    final first = DateTime(_year, _month, 1).weekday % 7; // 0=Sun
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              IconButton(onPressed: () => _shift(-1), icon: const Icon(Icons.chevron_left)),
              Expanded(
                child: Text('${_thMonths[_month - 1]} ${_year + 543}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: _navy)),
              ),
              IconButton(onPressed: () => _shift(1), icon: const Icon(Icons.chevron_right)),
            ],
          ),
          if (_loading) const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator())),
          if (_err != null) Padding(padding: const EdgeInsets.all(12), child: Text('โหลดไม่ได้: $_err', style: const TextStyle(color: Color(0xFFC23636)))),
          if (!_loading && _err == null) ...[
            Row(
              children: const [
                Expanded(child: Center(child: Text('อา', style: TextStyle(fontSize: 11, color: Colors.grey)))),
                Expanded(child: Center(child: Text('จ', style: TextStyle(fontSize: 11, color: Colors.grey)))),
                Expanded(child: Center(child: Text('อ', style: TextStyle(fontSize: 11, color: Colors.grey)))),
                Expanded(child: Center(child: Text('พ', style: TextStyle(fontSize: 11, color: Colors.grey)))),
                Expanded(child: Center(child: Text('พฤ', style: TextStyle(fontSize: 11, color: Colors.grey)))),
                Expanded(child: Center(child: Text('ศ', style: TextStyle(fontSize: 11, color: Colors.grey)))),
                Expanded(child: Center(child: Text('ส', style: TextStyle(fontSize: 11, color: Colors.grey)))),
              ],
            ),
            const SizedBox(height: 4),
            GridView.count(
              crossAxisCount: 7,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 4,
              crossAxisSpacing: 4,
              children: [
                for (var i = 0; i < first; i++) const SizedBox.shrink(),
                for (final d in _days) _dayCell(d),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(spacing: 12, runSpacing: 6, children: [
              _legend(const Color(0xFFE4F7EF), 'ปกติ'),
              _legend(const Color(0xFFFDF3DD), 'สาย'),
              _legend(const Color(0xFFFDECEC), 'ขาด/ไม่ครบ'),
              _legend(const Color(0xFFEAF1FF), 'ลา'),
              _legend(const Color(0xFFEDEFF4), 'วันหยุด'),
            ]),
            const SizedBox(height: 10),
            Card(
              color: _navy,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  _stat('มาทำงาน', '${worked.length} วัน'),
                  _stat('มาสาย', '$lateCnt วัน'),
                  _stat('OT รวม', '${(otMin / 60).toStringAsFixed(1)} ชม.'),
                ]),
              ),
            ),
            const SizedBox(height: 10),
            for (final d in _days.where((d) => d['checkIn'] != '' || d['status'] == 'leave' || d['status'] == 'absent'))
              _dayRow(d),
          ],
        ],
      ),
    );
  }

  Widget _stat(String label, String value) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ]),
      );

  Widget _legend(Color c, String t) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 11, height: 11, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 5),
        Text(t, style: const TextStyle(fontSize: 11, color: Colors.black54)),
      ]);

  Widget _dayCell(Map<String, dynamic> d) {
    final st = _statusStyle('${d['status']}');
    final today = '${d['date']}' == DateTime.now().toIso8601String().substring(0, 10);
    return GestureDetector(
      onTap: () => _scrollToDay('${d['date']}'),
      child: Container(
        decoration: BoxDecoration(
          color: st.bg,
          borderRadius: BorderRadius.circular(8),
          border: today ? Border.all(color: _blue, width: 1.5) : null,
        ),
        alignment: Alignment.center,
        child: Text('${d['day']}', style: TextStyle(fontSize: 13, color: st.fg)),
      ),
    );
  }

  Widget _dayRow(Map<String, dynamic> d) {
    final st = _statusStyle('${d['status']}');
    final key = _rowKeys.putIfAbsent('${d['date']}', () => GlobalKey());
    final ot = (d['otMinutes'] as num?)?.round() ?? 0;
    final wm = (d['workedMinutes'] as num?)?.round() ?? 0;
    final dt = DateTime.parse('${d['date']}');
    final sub = '${d['checkIn']}'.isEmpty
        ? ('${d['status']}' == 'leave' ? 'ลา: ${d['leaveType']}' : 'ไม่มีบันทึก')
        : 'เข้า ${d['checkIn']} · ออก ${'${d['checkOut']}'.isEmpty ? '—' : d['checkOut']}'
            '${wm > 0 ? ' · รวม ${(wm / 60).toStringAsFixed(1)} ชม.' : ''}'
            '${ot > 0 ? ' · OT ${(ot / 60).toStringAsFixed(1)} ชม.' : ''}';
    return Container(
      key: key,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFEEF2F6)))),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${dt.day} ${_thMonths[dt.month - 1].substring(0, 3)}', style: const TextStyle(fontSize: 14)),
            Text(sub, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ]),
        ),
        if (st.label.isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
            decoration: BoxDecoration(color: st.bg, borderRadius: BorderRadius.circular(999)),
            child: Text(st.label, style: TextStyle(fontSize: 11, color: st.fg)),
          ),
      ]),
    );
  }
}

class _ListPage extends StatefulWidget {
  const _ListPage({
    required this.title,
    required this.future,
    required this.row,
  });
  final String title;
  final Future<List<Map<String, dynamic>>> Function() future;
  final Widget Function(Map<String, dynamic>) row;
  @override
  State<_ListPage> createState() => _ListPageState();
}

class _ListPageState extends State<_ListPage> {
  late Future<List<Map<String, dynamic>>> _rows;
  @override
  void initState() {
    super.initState();
    _rows = widget.future();
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Row(
        children: [
          Text(
            widget.title,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const Spacer(),
          IconButton(
            onPressed: () => setState(() => _rows = widget.future()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      FutureBuilder<List<Map<String, dynamic>>>(
        future: _rows,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            );
          }
          if (snapshot.hasError) {
            return const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('ดึงข้อมูลไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่'),
              ),
            );
          }
          final rows = snapshot.data ?? [];
          if (rows.isEmpty) {
            return const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('ยังไม่มีรายการในระบบ'),
              ),
            );
          }
          return Column(
            children: rows.map((r) => Card(child: widget.row(r))).toList(),
          );
        },
      ),
    ],
  );
}

class _LeaveForm extends StatefulWidget {
  const _LeaveForm({required this.token});
  final String token;
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
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('ส่งคำขอลาแล้ว')));
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

  Widget _dateTile(String label, DateTime? value, bool start) => Expanded(
        child: InkWell(
          onTap: _sending ? null : () => _pick(start),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFFD7DCE5)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(height: 4),
              Row(children: [
                Icon(Icons.event, size: 18, color: value == null ? Colors.black38 : _blue),
                const SizedBox(width: 6),
                Text(_thDate(value),
                    style: TextStyle(fontSize: 15, color: value == null ? Colors.black45 : Colors.black87)),
              ]),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    const types = ['ลาป่วย', 'ลากิจ', 'ลาพักร้อน', 'ลาอื่น ๆ'];
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('ขอลางาน', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: _navy)),
        const SizedBox(height: 16),
        const Text('ประเภทการลา', style: TextStyle(fontSize: 13, color: Colors.black54)),
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
                selectedColor: _blue,
                labelStyle: TextStyle(color: _type == t ? Colors.white : Colors.black87),
                backgroundColor: const Color(0xFFEFF3F8),
                showCheckmark: false,
              ),
          ],
        ),
        const SizedBox(height: 16),
        Row(children: [
          _dateTile('ตั้งแต่', _start, true),
          const SizedBox(width: 10),
          _dateTile('ถึง', _end, false),
        ]),
        if (_days > 0)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: const Color(0xFFEAF1FF), borderRadius: BorderRadius.circular(10)),
              child: Row(children: [
                const Icon(Icons.info_outline, size: 16, color: Color(0xFF1B4FD6)),
                const SizedBox(width: 6),
                Text('รวม $_days วัน', style: const TextStyle(color: Color(0xFF1B4FD6), fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        const SizedBox(height: 16),
        TextField(
          controller: _reason,
          maxLines: 4,
          decoration: InputDecoration(
            labelText: 'เหตุผล',
            alignLabelWithHint: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 50,
          child: FilledButton.icon(
            onPressed: _sending ? null : _send,
            icon: _sending
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send),
            label: Text(_sending ? 'กำลังส่ง…' : 'ส่งคำขอลา'),
          ),
        ),
      ],
    );
  }
}

class _Account extends StatelessWidget {
  const _Account({
    required this.token,
    required this.name,
    required this.id,
    required this.role,
    required this.site,
    required this.locationRequired,
    required this.onLogout,
  });
  final String token, name, id, role, site;
  final bool locationRequired;
  final Future<void> Function() onLogout;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        'บัญชีของฉัน',
        style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
      ),
      Card(
        child: Column(
          children: [
            ListTile(
              title: Text(name.isEmpty ? id : name),
              subtitle: Text('$role • $id'),
            ),
            ListTile(
              title: const Text('ไซต์งาน'),
              subtitle: Text(site.isEmpty ? 'ยังไม่ได้กำหนด' : site),
            ),
            ListTile(
              title: Text(
                locationRequired ? 'ต้องตรวจ Location' : 'ไม่ต้องตรวจ Location',
              ),
              subtitle: Text(
                locationRequired
                    ? 'ลงเวลาต้องอยู่ในรัศมีไซต์'
                    : 'ลงเวลาโดยไม่ใช้พิกัดได้',
              ),
            ),
          ],
        ),
      ),
      Card(
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('ขอเบิกเงินล่วงหน้า'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _advanceDialog(context),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.password),
              title: const Text('เปลี่ยนรหัสผ่าน'),
              subtitle: const Text('ต้องใช้รหัสผ่านเดิม'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _changePasswordDialog(context),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.lock_reset),
              title: const Text('ลืมรหัสผ่าน? ขอให้แอดมินรีเซ็ต'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _requestResetDialog(context),
            ),
          ],
        ),
      ),
      OutlinedButton.icon(
        onPressed: onLogout,
        icon: const Icon(Icons.logout),
        label: const Text('ออกจากระบบ'),
      ),
    ],
  );

  void _snack(BuildContext context, String msg) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  Future<void> _advanceDialog(BuildContext context) async {
    final amount = TextEditingController(), reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('ขอเบิกเงินล่วงหน้า'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'จำนวนเงิน (บาท)'),
            ),
            TextField(
              controller: reason,
              decoration: const InputDecoration(labelText: 'เหตุผล'),
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
            child: const Text('ส่งคำขอ'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final amt = double.tryParse(amount.text.trim()) ?? 0;
    if (amt <= 0) {
      _snack(context, 'จำนวนเงินไม่ถูกต้อง');
      return;
    }
    try {
      await BvnApi().submitAdvance(
        token: token,
        amount: amt,
        reason: reason.text.trim(),
      );
      _snack(context, 'ส่งคำขอเบิกเงินล่วงหน้าแล้ว');
    } catch (e) {
      _snack(context, e.toString());
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
