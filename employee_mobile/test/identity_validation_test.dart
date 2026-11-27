import 'package:employee_mobile/identity_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('accepts complete Thai national ID and phone values', () {
    final result = validateEmployeeIdentity(
      nationalId: '1101700203456',
      phone: '084-556-1071',
    );

    expect(result.nationalIdDigits, 13);
    expect(result.phoneDigits, 10);
    expect(result.canSubmit, isTrue);
  });

  test('blocks submission until both ID and phone have required digits', () {
    final result = validateEmployeeIdentity(
      nationalId: '110170020345',
      phone: '084556107',
    );

    expect(result.canSubmit, isFalse);
    expect(result.nationalIdHint, 'กรอกอีก 1 หลัก');
    expect(result.phoneHint, 'กรอกอีก 1 หลัก');
  });
}
