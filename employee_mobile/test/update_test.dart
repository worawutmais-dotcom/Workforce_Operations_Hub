import 'package:employee_mobile/update.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reports the Android package version used by the current release', () {
    expect(kAppVersionName, '1.0.18');
    expect(kAppVersionCode, 18);
  });

  test('does not offer an update for the installed build', () {
    expect(
      isUpdateAvailable(
        advertisedVersionCode: 18,
        apkUrl: 'https://example.com/bvn-1.0.18.apk',
      ),
      isFalse,
    );
  });

  test('offers an update only for a newer build with a usable URL', () {
    expect(
      isUpdateAvailable(
        advertisedVersionCode: 19,
        apkUrl: 'https://example.com/bvn-1.0.19.apk',
      ),
      isTrue,
    );
    expect(
      isUpdateAvailable(advertisedVersionCode: 19, apkUrl: 'not-a-url'),
      isFalse,
    );
  });
}
