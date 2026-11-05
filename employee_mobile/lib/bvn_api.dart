import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

const bvnApiUrl = String.fromEnvironment(
  'BVN_API_URL',
  defaultValue: 'https://script.google.com/macros/s/AKfycbw_Jf5Wy1WaLtUQEs7EDNaR-vs5tKcfqlnPCrYjIJNWUJV1tUBBnWOjcSHzu9KzeCGU/exec',
);

class BvnApiException implements Exception {
  BvnApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class BvnApi {
  BvnApi({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

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
    var uri = Uri.parse(bvnApiUrl);
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

  Future<List<Map<String, dynamic>>> employeeDirectory() async {
    final response = await post({'action': 'employee_directory'});
    final rows = (response['data'] as Map<String, dynamic>?)?['employees'];
    return rows is List ? rows.whereType<Map<String, dynamic>>().toList() : [];
  }

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

  Future<Map<String, dynamic>> profile(String token) async =>
      ((await post({
            'action': 'employee_profile',
            'mobileToken': token,
          }))['data']
          as Map<String, dynamic>?) ??
      {};

  Future<Map<String, dynamic>> attendance({
    required String token,
    required String eventType,
    required double latitude,
    required double longitude,
    required double accuracy,
  }) => post({
    'action': 'attendance',
    'mobileToken': token,
    'eventType': eventType,
    'siteId': 'BVN-HQ',
    'latitude': latitude,
    'longitude': longitude,
    'accuracy': accuracy,
    'deviceTimezone': DateTime.now().timeZoneName,
  });

  Future<List<Map<String, dynamic>>> timeline(String token) async {
    final data =
        (await post({
              'action': 'employee_timeline',
              'mobileToken': token,
            }))['data']
            as Map<String, dynamic>?;
    final rows = data?['attendance'];
    return rows is List ? rows.whereType<Map<String, dynamic>>().toList() : [];
  }

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
  }

  Future<List<Map<String, dynamic>>> leaveCalendar(String token) async {
    final data =
        (await post({'action': 'leave_calendar', 'mobileToken': token}))['data']
            as Map<String, dynamic>?;
    final rows = data?['requests'];
    return rows is List ? rows.whereType<Map<String, dynamic>>().toList() : [];
  }

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
  }

  Future<List<Map<String, dynamic>>> timeRequests(String token) async {
    final data =
        (await post({
              'action': 'employee_time_requests',
              'mobileToken': token,
            }))['data']
            as Map<String, dynamic>?;
    final rows = data?['requests'];
    return rows is List ? rows.whereType<Map<String, dynamic>>().toList() : [];
  }
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
