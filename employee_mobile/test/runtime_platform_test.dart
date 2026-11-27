import 'package:employee_mobile/runtime_platform.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('labels browser sessions as PWA web', () {
    expect(
      deviceLabelForRuntime(isWeb: true, platformName: 'android'),
      'PWA web',
    );
  });

  test('keeps Android label only for a native Android session', () {
    expect(
      deviceLabelForRuntime(isWeb: false, platformName: 'android'),
      'Android app',
    );
  });

  test('suppresses APK update checks for PWA sessions', () {
    expect(shouldCheckForApkUpdate(isWeb: true), isFalse);
    expect(shouldCheckForApkUpdate(isWeb: false), isTrue);
  });
}
