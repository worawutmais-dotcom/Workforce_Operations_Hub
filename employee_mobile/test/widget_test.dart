import 'package:employee_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders employee login', (tester) async {
    await tester.pumpWidget(MaterialApp(home: LoginPage(onLogin: (_, _) async {})));
    expect(find.text('เข้าสู่ระบบพนักงาน'), findsOneWidget);
    expect(find.text('ชื่อพนักงาน'), findsOneWidget);
    expect(find.text('รหัสผ่านชั่วคราว'), findsOneWidget);
    expect(find.text('กำลังโหลด…'), findsOneWidget);
  });
}
