import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

// Default backend = Supabase Edge Function. (Publishable key is public by
// design — safe to bake in. The secret service_role key is never in the app.)
const bvnApiUrl = String.fromEnvironment(
  'BVN_API_URL',
  defaultValue: 'https://vqualksnbctfukcbxqdd.supabase.co/functions/v1/swift-handler',
);
const bvnApiKey = String.fromEnvironment(
  'BVN_API_KEY',
  defaultValue: 'sb_publishable_E302-Dm85ztBPl-3o5xL_w_0UkW2fG4',
);

// Runtime-overridable endpoint + apikey (set in-app, persisted) so a changed
// URL does NOT require rebuilding the APK. Falls back to the baked defaults.
class BvnConfig {
  static const _storage = FlutterSecureStorage();
  static const _key = 'bvn_endpoint';
  static const _keyApi = 'bvn_apikey';
  static String endpoint = bvnApiUrl;
  static String apikey = bvnApiKey;
  static Future<void> load() async {
    try {
      final v = await _storage.read(key: _key);
      if (v != null && v.trim().isNotEmpty) endpoint = v.trim();
      final k = await _storage.read(key: _keyApi);
      if (k != null) apikey = k.trim();
    } catch (_) {}
  }

  static Future<void> setEndpoint(String url, {String? apiKey}) async {
    endpoint = url.trim();
    if (apiKey != null) apikey = apiKey.trim();
    try {
      await _storage.write(key: _key, value: endpoint);
      if (apiKey != null) await _storage.write(key: _keyApi, value: apikey);
    } catch (_) {}
  }

  static Future<void> reset() async {
    endpoint = bvnApiUrl;
    apikey = bvnApiKey;
    try {
      await _storage.delete(key: _key);
      await _storage.delete(key: _keyApi);
    } catch (_) {}
  }
}

class BvnApiException implements Exception {
  BvnApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class _CachedValue<T> {
  const _CachedValue(this.value, this.savedAt);
  final T value;
  final DateTime savedAt;
  bool isFresh(Duration ttl) => DateTime.now().difference(savedAt) < ttl;
}

class BvnApi {
  BvnApi({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;
  // Apps Script has noticeable cold-start and redirect overhead. Keep only
  // read-only, employee-scoped snapshots here; every write invalidates them.
  static final Map<String, _CachedValue<dynamic>> _readCache = {};

  Future<T> _cached<T>(
    String key,
    Duration ttl,
    Future<T> Function() loader,
  ) async {
    final cached = _readCache[key];
    if (cached != null && cached.isFresh(ttl)) return cached.value as T;
    final value = await loader();
    _readCache[key] = _CachedValue<T>(value, DateTime.now());
    return value;
  }

  void _invalidateEmployee(String token) {
    _readCache.remove('profile:$token');
    _readCache.remove('timeline:$token');
    _readCache.removeWhere((key, _) => key.startsWith('month:$token:'));
  }

  /// Explicit refresh controls must bypass the short-lived read cache.
  void clearEmployeeCache(String token) => _invalidateEmployee(token);

  void _invalidate(String key) => _readCache.remove(key);

  Future<Map<String, dynamic>> post(Map<String, dynamic> body) async {
    final response = await _send(body);
    final Map<String, dynamic> decoded;
    try {
      final parsed = jsonDecode(utf8.decode(response.bodyBytes));
      if (parsed is! Map<String, dynamic>) {
        throw const FormatException('not-a-map');
      }
      decoded = parsed;
    } on FormatException {
      final snippet = utf8
          .decode(response.bodyBytes, allowMalformed: true)
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      throw BvnApiException(
        'ข้อมูลไม่ใช่ JSON (HTTP ${response.statusCode}) '
        '${snippet.substring(0, snippet.length < 80 ? snippet.length : 80)}',
      );
    }
    if (decoded['ok'] != true) {
      throw BvnApiException(
        decoded['message']?.toString() ?? 'ระบบไม่สามารถดำเนินการได้',
      );
    }
    return decoded;
  }

  // Apps Script /exec answers with a 302 redirect to script.googleusercontent.com.
  // package:http's automatic redirect re-POSTs to that host (which fails), so the
  // redirect must be followed manually as a GET to receive the JSON body.
  Future<http.Response> _send(Map<String, dynamic> body) async {
    var uri = Uri.parse(BvnConfig.endpoint);
    // Supabase Edge Functions need the public apikey to be routed. Pass it in the
    // query string (not a header) so the request stays a simple, no-preflight call.
    if (uri.host.endsWith('supabase.co') &&
        uri.path.contains('/functions/') &&
        BvnConfig.apikey.isNotEmpty) {
      uri = uri.replace(
        queryParameters: {...uri.queryParameters, 'apikey': BvnConfig.apikey},
      );
    }
    final request = http.Request('POST', uri)
      ..followRedirects = false
      ..headers['Content-Type'] = 'text/plain;charset=utf-8'
      ..body = jsonEncode(body);
    var response = await http.Response.fromStream(
      await _client.send(request).timeout(const Duration(seconds: 20)),
    );
    // Follow redirects manually by status code: package:http reports
    // isRedirect=false when followRedirects is disabled, so rely on 3xx + Location.
    var hops = 0;
    while (response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers['location'] != null &&
        hops < 5) {
      final location = uri.resolve(response.headers['location']!);
      final redirect = http.Request('GET', location)..followRedirects = false;
      response = await http.Response.fromStream(
        await _client.send(redirect).timeout(const Duration(seconds: 20)),
      );
      uri = location;
      hops++;
    }
    return response;
  }

  Future<String> activate(String employeeId, String token) async {
    final response = await post({
      'action': 'employee_timeline',
      'mobileToken': token,
    });
    final returnedId =
        (response['data'] as Map<String, dynamic>?)?['employeeId']
            ?.toString() ??
        '';
    if (returnedId.isEmpty || returnedId != employeeId) {
      throw BvnApiException('รหัสพนักงานหรือ Device token ไม่ถูกต้อง');
    }
    return returnedId;
  }

  Future<List<Map<String, dynamic>>> employeeDirectory() =>
      _cached('employee-directory', const Duration(minutes: 5), () async {
        final response = await post({'action': 'employee_directory'});
        final rows = (response['data'] as Map<String, dynamic>?)?['employees'];
        return rows is List
            ? rows.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
      });

  /// Public, non-sensitive branding. The app has an embedded PPP mark as a
  /// reliable fallback; this URL lets the owner update the visible logo later
  /// from the Admin billing settings without issuing a new APK.
  // Public app/backend version manifest. The APK binary itself lives on Drive
  // (apkUrl); this only returns the small version metadata to compare against.
  Future<Map<String, dynamic>> version() async =>
      ((await post({'action': 'version'}))['data'] as Map<String, dynamic>?) ??
      <String, dynamic>{};

  Future<Map<String, dynamic>> branding() => _cached(
    'branding',
    const Duration(hours: 6),
    () async =>
        ((await post({'action': 'public_branding'}))['data']
            as Map<String, dynamic>?) ??
        <String, dynamic>{},
  );

  Future<Map<String, dynamic>> month(String token, int year, int mon) =>
      _cached(
        'month:$token:$year:$mon',
        const Duration(seconds: 30),
        () async =>
            ((await post({
                  'action': 'employee_month',
                  'mobileToken': token,
                  'year': year,
                  'month': mon,
                }))['data']
                as Map<String, dynamic>?) ??
            <String, dynamic>{},
      );

  Future<List<Map<String, dynamic>>> sites(String token) =>
      _cached('sites:$token', const Duration(minutes: 2), () async {
        final data =
            (await post({'action': 'sites', 'mobileToken': token}))['data']
                as Map<String, dynamic>?;
        final rows = data?['sites'];
        return rows is List
            ? rows.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
      });

  Future<({String employeeId, String mobileToken})> login(
    String employeeId,
    String password,
  ) async {
    final response = await post({
      'action': 'employee_login',
      'employeeId': employeeId,
      'password': password,
      'deviceLabel': 'Android app',
    });
    final data = response['data'] as Map<String, dynamic>?;
    final id = data?['employeeId']?.toString() ?? '',
        token = data?['mobileToken']?.toString() ?? '';
    if (id.isEmpty || token.isEmpty) {
      throw BvnApiException('ระบบไม่สามารถเปิดใช้งานอุปกรณ์ได้');
    }
    return (employeeId: id, mobileToken: token);
  }

  Future<bool> locationRequired(String token) async {
    final response = await post({
      'action': 'employee_profile',
      'mobileToken': token,
    });
    return (response['data'] as Map<String, dynamic>?)?['locationRequired'] ==
        true;
  }

  Future<Map<String, dynamic>> profile(String token) => _cached(
    'profile:$token',
    // The employee profile includes the company shift. Keep this very
    // short so an Admin schedule change appears promptly, while the
    // heavier timeline/map requests remain cached independently.
    const Duration(seconds: 8),
    () async {
      final raw =
          ((await post({
                'action': 'employee_profile',
                'mobileToken': token,
              }))['data']
              as Map<String, dynamic>?) ??
          <String, dynamic>{};
      // Older Apps Script deployments used snake_case while the current
      // contract uses camelCase. Normalise at the boundary so a saved
      // Admin schedule is never hidden merely because of a field rename.
      return <String, dynamic>{
        ...raw,
        'shiftStart': _firstScheduleValue(raw, const [
          'shiftStart',
          'shift_start',
          'startTime',
        ]),
        'shiftEnd': _firstScheduleValue(raw, const [
          'shiftEnd',
          'shift_end',
          'endTime',
        ]),
      };
    },
  );

  Future<Map<String, dynamic>> identityProfile(String token) async {
    final response = await post({
      'action': 'employee_identity_profile',
      'mobileToken': token,
    });
    return (response['data'] as Map<String, dynamic>?) ?? <String, dynamic>{};
  }

  Future<void> submitIdentity({
    required String token,
    required String nationalId,
    required String phone,
  }) async {
    await post({
      'action': 'employee_submit_identity',
      'mobileToken': token,
      'nationalId': nationalId,
      'phone': phone,
    });
  }

  static dynamic _firstScheduleValue(
    Map<String, dynamic> values,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = values[key];
      if (value != null && value.toString().trim().isNotEmpty) return value;
    }
    return null;
  }

  Future<Map<String, dynamic>> attendance({
    required String token,
    required String eventType,
    required double latitude,
    required double longitude,
    required double accuracy,
    bool mocked = false,
  }) async {
    final result = await post({
      'action': 'attendance',
      'mobileToken': token,
      'eventType': eventType,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'mocked': mocked,
      'deviceTimezone': DateTime.now().timeZoneName,
    });
    _invalidateEmployee(token);
    return result;
  }

  Future<List<Map<String, dynamic>>> timeline(String token) =>
      _cached('timeline:$token', const Duration(seconds: 15), () async {
        final data =
            (await post({
                  'action': 'employee_timeline',
                  'mobileToken': token,
                }))['data']
                as Map<String, dynamic>?;
        final rows = data?['attendance'];
        return rows is List
            ? rows.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
      });

  Future<void> submitLeave({
    required String token,
    required String leaveType,
    required DateTime start,
    required DateTime end,
    required String reason,
  }) async {
    String iso(DateTime value) => value.toIso8601String().substring(0, 10);
    await post({
      'action': 'leave_request',
      'mobileToken': token,
      'leaveType': leaveType,
      'startDate': iso(start),
      'endDate': iso(end),
      'reason': reason,
    });
    _invalidate('leave-calendar:$token');
  }

  Future<List<Map<String, dynamic>>> leaveCalendar(String token) =>
      _cached('leave-calendar:$token', const Duration(seconds: 30), () async {
        final data =
            (await post({
                  'action': 'leave_calendar',
                  'mobileToken': token,
                }))['data']
                as Map<String, dynamic>?;
        final rows = data?['requests'];
        return rows is List
            ? rows.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
      });

  Future<void> submitTimeRequest({
    required String token,
    required String requestType,
    required DateTime workDate,
    required int requestedMinutes,
    required String reason,
  }) async {
    final date = workDate.toIso8601String().substring(0, 10);
    await post({
      'action': 'time_request',
      'mobileToken': token,
      'requestType': requestType,
      'workDate': date,
      'requestedMinutes': requestedMinutes,
      'reason': reason,
    });
    _invalidate('time-requests:$token');
  }

  Future<List<Map<String, dynamic>>> timeRequests(String token) =>
      _cached('time-requests:$token', const Duration(seconds: 30), () async {
        final data =
            (await post({
                  'action': 'employee_time_requests',
                  'mobileToken': token,
                }))['data']
                as Map<String, dynamic>?;
        final rows = data?['requests'];
        return rows is List
            ? rows.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
      });

  Future<void> submitAdvance({
    required String token,
    required double amount,
    required String reason,
  }) async {
    await post({
      'action': 'employee_submit_advance',
      'mobileToken': token,
      'amount': amount,
      'reason': reason,
    });
    _invalidate('advances:$token');
  }

  Future<List<Map<String, dynamic>>> advances(String token) =>
      _cached('advances:$token', const Duration(seconds: 30), () async {
        final data =
            (await post({
                  'action': 'employee_advances',
                  'mobileToken': token,
                }))['data']
                as Map<String, dynamic>?;
        final rows = data?['advances'];
        return rows is List
            ? rows.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
      });

  Future<void> changePassword({
    required String token,
    required String oldPassword,
    required String newPassword,
  }) => post({
    'action': 'employee_change_password',
    'mobileToken': token,
    'oldPassword': oldPassword,
    'newPassword': newPassword,
  });

  Future<void> requestPasswordReset(String token) =>
      post({'action': 'employee_request_password_reset', 'mobileToken': token});
}

class DeviceSessionStore {
  static const _storage = FlutterSecureStorage();
  static const _idKey = 'bvn_employee_id', _tokenKey = 'bvn_device_token';
  Future<void> save(String id, String token) async => _storage
      .write(key: _idKey, value: id)
      .then((_) => _storage.write(key: _tokenKey, value: token));
  Future<({String id, String token})?> load() async {
    final id = await _storage.read(key: _idKey);
    final token = await _storage.read(key: _tokenKey);
    return id == null || token == null ? null : (id: id, token: token);
  }

  Future<void> clear() async => _storage.deleteAll();
}
