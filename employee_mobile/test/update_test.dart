import 'package:employee_mobile/update.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reports the Android package version used by the current release', () {
    expect(kAppVersionName, '1.0.14');
    expect(kAppVersionCode, 14);
  });

  test('does not offer an update for the installed build', () {
    expect(
      isUpdateAvailable(
        advertisedVersionCode: 14,
        apkUrl: 'https://example.com/bvn-1.0.14.apk',
      ),
      isFalse,
    );
  });

  test('offers an update only for a newer build with a usable URL', () {
    expect(
      isUpdateAvailable(
        advertisedVersionCode: 15,
        apkUrl: 'https://example.com/bvn-1.0.15.apk',
      ),
      isTrue,
    );
    expect(
      isUpdateAvailable(advertisedVersionCode: 15, apkUrl: 'not-a-url'),
      isFalse,
    );
  });
}
