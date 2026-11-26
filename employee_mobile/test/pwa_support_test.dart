import 'package:employee_mobile/pwa_support.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('offers installation guidance only to an undisposed iPhone web session', () {
    expect(
      shouldShowPwaInstallGuide(
        isIosWeb: true,
        isStandalone: false,
        isDismissed: false,
      ),
      isTrue,
    );
    expect(
      shouldShowPwaInstallGuide(
        isIosWeb: false,
        isStandalone: false,
        isDismissed: false,
      ),
      isFalse,
    );
    expect(
      shouldShowPwaInstallGuide(
        isIosWeb: true,
        isStandalone: true,
        isDismissed: false,
      ),
      isFalse,
    );
    expect(
      shouldShowPwaInstallGuide(
        isIosWeb: true,
        isStandalone: false,
        isDismissed: true,
      ),
      isFalse,
    );
  });

  test('requests a location only for required check-in', () {
    expect(
      shouldRequestCheckInLocation(
        locationRequired: true,
        eventType: 'check_in',
      ),
      isTrue,
    );
    expect(
      shouldRequestCheckInLocation(
        locationRequired: true,
        eventType: 'check_out',
      ),
      isFalse,
    );
    expect(
      shouldRequestCheckInLocation(
        locationRequired: false,
        eventType: 'check_in',
      ),
      isFalse,
    );
  });
}
