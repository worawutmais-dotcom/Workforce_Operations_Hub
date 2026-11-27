import 'package:employee_mobile/employee_login_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('accepts a manually entered employee ID and password', () {
    expect(
      employeeLoginError(employeeId: 'BVN-0002', password: 'secure-pass'),
      isNull,
    );
  });

  test('does not require an employee directory selection', () {
    expect(
      employeeLoginError(employeeId: '', password: 'secure-pass'),
      'กรอกรหัสพนักงาน',
    );
    expect(
      employeeLoginError(employeeId: 'BVN-0002', password: ''),
      'กรอกรหัสผ่าน',
    );
  });
}
