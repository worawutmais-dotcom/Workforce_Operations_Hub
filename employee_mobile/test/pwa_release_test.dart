import 'package:employee_mobile/pwa_release.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('exposes the installed PWA release label without APK metadata', () {
    expect(kPwaVersionName, '1.0.18');
  });
}
