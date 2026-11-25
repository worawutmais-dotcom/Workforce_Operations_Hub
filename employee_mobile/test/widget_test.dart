import 'package:employee_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps incomplete profile to an action-needed work identity status', () {
    final status = workIdentityStatus(
      profileNeedsUpdate: true,
      identityPending: false,
      locationRequired: true,
    );

    expect(status.label, 'ต้องอัปเดตข้อมูล');
    expect(status.detail, 'เพิ่มเลขบัตรประชาชนและเบอร์โทรเพื่อให้ผู้ดูแลตรวจสอบ');
    expect(status.requiresAction, isTrue);
    expect(status.locationPolicy, 'ลงเวลาตามพิกัดที่อนุญาต');
  });

  test('maps complete profile and optional GPS to a ready status', () {
    final status = workIdentityStatus(
      profileNeedsUpdate: false,
      identityPending: false,
      locationRequired: false,
    );

    expect(status.label, 'ข้อมูลยืนยันแล้ว');
    expect(status.requiresAction, isFalse);
    expect(status.locationPolicy, 'ไม่บังคับตรวจพิกัด');
  });

  test('maps a submitted identity profile to review status without action', () {
    final status = workIdentityStatus(
      profileNeedsUpdate: false,
      identityPending: true,
      locationRequired: true,
    );

    expect(status.label, 'กำลังตรวจสอบข้อมูล');
    expect(status.detail, 'ส่งข้อมูลให้ผู้ดูแลตรวจสอบแล้ว');
    expect(status.requiresAction, isFalse);
  });

  testWidgets('renders the Work Identity account at a narrow employee width', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AccountScreen(
            token: 'test-token',
            name: 'วราวุฒิ ม่วงสุวรรณ ชื่อทดสอบยาว',
            id: 'BVN-0002',
            role: 'พนักงานขายประจำสาขา',
            locationRequired: true,
            profileNeedsUpdate: true,
            identityPending: false,
            onLogout: () async {},
          ),
        ),
      ),
    );

    expect(find.text('ข้อมูลการทำงานของฉัน'), findsOneWidget);
    expect(find.text('สถานะบัญชี'), findsOneWidget);
    expect(find.text('ต้องอัปเดตข้อมูล'), findsOneWidget);
    expect(find.text('นโยบายการลงเวลา'), findsOneWidget);
    expect(find.text('ลงเวลาตามพิกัดที่อนุญาต'), findsOneWidget);
    expect(find.text('ข้อมูลส่วนตัว'), findsAtLeastNWidgets(1));
    await tester.scrollUntilVisible(find.text('ขอเบิกเงินล่วงหน้า'), 280);
    expect(find.text('ขอเบิกเงินล่วงหน้า'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('เปลี่ยนรหัสผ่าน'), 280);
    expect(find.text('เปลี่ยนรหัสผ่าน'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('ออกจากระบบ'), 280);
    expect(find.text('ออกจากระบบ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

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
