// Account-tab actions guard context use via a context.mounted check inside _snack.
// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import 'bvn_api.dart';
import 'time_request_tab.dart';

const _navy = Color(0xFF102A43);
const _blue = Color(0xFF146EF5);

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
      if (_locationRequired) {
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
      await BvnApi().attendance(
        token: widget.token,
        eventType: type,
        latitude: p?.latitude ?? 0,
        longitude: p?.longitude ?? 0,
        accuracy: p?.accuracy ?? 0,
      );
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('บันทึกเวลาเข้าระบบแล้ว')));
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
        onIn: () => _attendance('check_in'),
        onOut: () => _attendance('check_out'),
        onRefresh: _refresh,
      ),
      _ListPage(
        title: 'เวลาเข้าออกงาน',
        future: () => BvnApi().timeline(widget.token),
        row: (r) => ListTile(
          title: Text(r['eventType'] == 'check_in' ? 'เข้างาน' : 'ออกงาน'),
          subtitle: Text('${r['occurredAt'] ?? ''}'),
          trailing: Text('${r['status'] ?? ''}'),
        ),
      ),
      _LeaveForm(token: widget.token),
      _ListPage(
        title: 'คำขอลางานของฉัน',
        future: () => BvnApi().leaveCalendar(widget.token),
        row: (r) => ListTile(
          title: Text('${r['leaveType']} • ${r['status']}'),
          subtitle: Text('${r['startDate']} ถึง ${r['endDate']}'),
        ),
      ),
      TimeRequestTab(token: widget.token),
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
          NavigationDestination(icon: Icon(Icons.more_time), label: 'OT/เวลา'),
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
    required this.onIn,
    required this.onOut,
    required this.onRefresh,
  });
  final String name, status;
  final String? checkIn, checkOut;
  final bool busy;
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
      const SizedBox(height: 14),
      FilledButton.icon(
        onPressed: busy || checkIn != null ? null : onIn,
        icon: const Icon(Icons.login),
        label: Text(busy ? 'กำลังตรวจสอบ…' : 'Check in'),
      ),
      OutlinedButton.icon(
        onPressed: busy || checkIn == null || checkOut != null ? null : onOut,
        icon: const Icon(Icons.logout),
        label: const Text('Check out'),
      ),
      TextButton.icon(
        onPressed: busy ? null : onRefresh,
        icon: const Icon(Icons.refresh),
        label: const Text('รีเฟรชสถานะ'),
      ),
    ],
  );
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

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        'ขอลางาน',
        style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: _type,
        decoration: const InputDecoration(
          labelText: 'ประเภทการลา',
          border: OutlineInputBorder(),
        ),
        items: [
          'ลาป่วย',
          'ลากิจ',
          'ลาพักร้อน',
          'ลาอื่น ๆ',
        ].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(),
        onChanged: _sending
            ? null
            : (value) => setState(() => _type = value ?? _type),
      ),
      OutlinedButton(
        onPressed: () => _pick(true),
        child: Text(
          'เริ่ม: ${_start?.toIso8601String().substring(0, 10) ?? 'เลือกวัน'}',
        ),
      ),
      OutlinedButton(
        onPressed: () => _pick(false),
        child: Text(
          'สิ้นสุด: ${_end?.toIso8601String().substring(0, 10) ?? 'เลือกวัน'}',
        ),
      ),
      TextField(
        controller: _reason,
        maxLines: 4,
        decoration: const InputDecoration(
          labelText: 'เหตุผล',
          border: OutlineInputBorder(),
        ),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: _sending ? null : _send,
        child: Text(_sending ? 'กำลังส่ง…' : 'ส่งคำขอลา'),
      ),
    ],
  );
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
