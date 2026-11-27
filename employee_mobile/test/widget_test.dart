import 'package:employee_mobile/main.dart';
import 'package:employee_mobile/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('uses high-contrast text tokens for employee-facing screens', () {
    expect(kInk, const Color(0xFF0F172A));
    expect(kMuted, const Color(0xFF475569));
    expect(bvnTheme(Brightness.light).scaffoldBackgroundColor, Colors.white);
    expect(bvnTheme(Brightness.light).textTheme.bodyMedium?.color, kInk);
  });

  test('uses the compact Operational Calm application chrome', () {
    final theme = bvnTheme(Brightness.light);

    expect(theme.appBarTheme.backgroundColor, kBrandDeep);
    expect(theme.appBarTheme.foregroundColor, Colors.white);
    expect(theme.appBarTheme.toolbarHeight, 52);
    expect(theme.navigationBarTheme.height, 62);
    expect(kRadius, 12);
    expect(kRadiusSm, 10);
    expect(
      theme.filledButtonTheme.style?.minimumSize?.resolve(<WidgetState>{}),
      const Size(0, 44),
    );
    expect(
      theme.outlinedButtonTheme.style?.minimumSize?.resolve(<WidgetState>{}),
      const Size(0, 44),
    );
  });

  test('maps incomplete profile to an action-needed work identity status', () {
    final status = workIdentityStatus(
      profileNeedsUpdate: true,
      identityPending: false,
      locationRequired: true,
    );

    expect(status.label, 'ต้องอัปเดตข้อมูล');
    expect(
      status.detail,
      'เพิ่มเลขบัตรประชาชนและเบอร์โทรเพื่อให้ผู้ดูแลตรวจสอบ',
    );
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

  testWidgets(
    'renders the compact account without advance payments or scrolling',
    (tester) async {
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
      expect(
        find.text('นโยบายการลงเวลา · ลงเวลาตามพิกัดที่อนุญาต'),
        findsOneWidget,
      );
      expect(find.text('ข้อมูลส่วนตัว'), findsAtLeastNWidgets(1));
      expect(find.text('เปลี่ยนรหัสผ่าน'), findsOneWidget);
      expect(find.text('ออกจากระบบ'), findsOneWidget);
      expect(find.text('ขอเบิกเงินล่วงหน้า'), findsNothing);
      expect(find.byType(ListView), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('uses a solid account identity surface instead of a gradient', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AccountScreen(
            token: 'test-token',
            name: 'Worawut Muangsuwan',
            id: 'BVN-0002',
            role: 'Employee',
            locationRequired: false,
            profileNeedsUpdate: false,
            identityPending: false,
            onLogout: () async {},
          ),
        ),
      ),
    );

    final gradientSurfaces = tester
        .widgetList<Container>(find.byType(Container))
        .map((container) => container.decoration)
        .whereType<BoxDecoration>()
        .where((decoration) => decoration.gradient != null);

    expect(gradientSurfaces, isEmpty);
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

  testWidgets('uses private employee ID entry instead of a name directory', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: LoginPage(onLogin: (_, _) async {})),
    );

    expect(find.text('รหัสพนักงาน'), findsOneWidget);
    expect(find.textContaining('เช่น'), findsNothing);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(find.text('โหลดรายชื่อใหม่'), findsNothing);
  });

  testWidgets('keeps the location map behind an explicit Today action', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: EmployeeShell(
          employeeId: 'BVN-0002',
          token: 'test-token',
          brandName: 'BVN Package',
          brandLogoUrl: '',
          onLogout: () async {},
        ),
      ),
    );

    expect(find.text('ดูแผนที่และพื้นที่อนุญาต'), findsOneWidget);
    expect(find.byType(FlutterMap), findsNothing);
  });

  testWidgets('renders the PWA install guide and lets the user dismiss it', (
    tester,
  ) async {
    var dismissed = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PwaInstallGuide(onDismiss: () => dismissed = true),
        ),
      ),
    );

    expect(find.text('เพิ่มแอปไว้บนหน้าจอ iPhone'), findsOneWidget);
    expect(find.textContaining('Share'), findsOneWidget);
    expect(find.textContaining('Add to Home Screen'), findsOneWidget);

    await tester.tap(find.text('ไว้ภายหลัง'));
    expect(dismissed, isTrue);
  });
}
