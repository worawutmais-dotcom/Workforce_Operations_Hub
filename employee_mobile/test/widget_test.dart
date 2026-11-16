import 'package:employee_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the current employee login shell', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: LoginPage(onLogin: (_, _) async {})),
    );

    // Directory loading is intentionally async and network-backed, so this
    // smoke test asserts the stable branded shell rather than stale form copy
    // or a network-dependent employee list.
    expect(find.text('BVN Package'), findsOneWidget);
    expect(find.text('ระบบลงเวลาพนักงาน'), findsOneWidget);
    expect(find.byType(LoginPage), findsOneWidget);
  });
}
