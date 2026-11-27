import 'dart:convert';

import 'package:employee_mobile/bvn_api.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_test/flutter_test.dart';

class _CountingClient extends http.BaseClient {
  int sends = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    sends += 1;
    final requestBody = request is http.Request
        ? jsonDecode(request.body) as Map<String, dynamic>
        : <String, dynamic>{};
    final action = requestBody['action'];
    final data = switch (action) {
      'employee_profile' => <String, dynamic>{'name': 'Test'},
      _ => <String, dynamic>{},
    };
    return http.StreamedResponse(
      Stream<List<int>>.value(
        utf8.encode(jsonEncode({'ok': true, 'data': data})),
      ),
      200,
      request: request,
    );
  }
}

void main() {
  test('explicit refresh clears employee profile cache', () async {
    final client = _CountingClient();
    final api = BvnApi(client: client);

    await api.profile('cache-test-token');
    await api.profile('cache-test-token');
    api.clearEmployeeCache('cache-test-token');
    await api.profile('cache-test-token');

    expect(client.sends, 2);
  });
}
