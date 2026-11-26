import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'bvn_api.dart';

/// Must match pubspec `version: x.y.z+<code>` for the checked-in release.
/// The backend's `version` action returns `appVersionCode`; when that is higher
/// than this, the app offers the new APK (hosted on Drive).
const int kAppVersionCode = 17;
const String kAppVersionName = '1.0.17';

/// A backend must advertise a strictly newer build and a browser-openable APK.
/// Keeping this pure makes the no-update path regression-testable.
bool isUpdateAvailable({
  required int advertisedVersionCode,
  required String apkUrl,
}) =>
    advertisedVersionCode > kAppVersionCode && apkUrl.trim().startsWith('http');

/// Old console metadata advertised attendance correction, a flow that is no
/// longer available to employees. Keep the update prompt truthful while an
/// administrator replaces that old note in System Settings.
String _safeReleaseNotes(Object? raw) {
  final notes = '${raw ?? ''}'.trim();
  if (notes == 'ยืนยันตัวตนพนักงาน + timesheet + แก้เวลา + ดีไซน์ใหม่') {
    return 'ปรับปรุงข้อมูลพนักงาน, Timesheet และความเสถียรของระบบ';
  }
  return notes;
}

class UpdateInfo {
  const UpdateInfo({
    required this.versionCode,
    required this.versionName,
    required this.apkUrl,
    required this.mandatory,
    required this.notes,
  });
  final int versionCode;
  final String versionName;
  final String apkUrl;
  final bool mandatory;
  final String notes;
}

/// Returns update details when the backend advertises a newer app with a usable
/// download link, otherwise null. Never throws — a failed check is silent.
Future<UpdateInfo?> checkForUpdate() async {
  try {
    final d = await BvnApi().version();
    final code = (d['appVersionCode'] as num?)?.toInt() ?? 0;
    final url = '${d['appApkUrl'] ?? ''}'.trim();
    if (!isUpdateAvailable(advertisedVersionCode: code, apkUrl: url)) {
      return null;
    }
    return UpdateInfo(
      versionCode: code,
      versionName: '${d['appVersionName'] ?? ''}'.trim(),
      apkUrl: url,
      mandatory: d['appMandatory'] == true,
      notes: _safeReleaseNotes(d['appNotes']),
    );
  } catch (_) {
    return null;
  }
}

Future<void> _openApk(String url) async {
  try {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  } catch (_) {}
}

/// Shows the update prompt. A mandatory update cannot be dismissed.
Future<void> showUpdateDialog(BuildContext context, UpdateInfo info) async {
  final cs = Theme.of(context).colorScheme;
  await showDialog<void>(
    context: context,
    barrierDismissible: !info.mandatory,
    builder: (ctx) => AlertDialog(
      title: Text(
        info.mandatory ? 'ต้องอัปเดตแอป' : 'มีเวอร์ชันใหม่',
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'เวอร์ชัน ${info.versionName.isEmpty ? info.versionCode : info.versionName}',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
          if (info.notes.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              info.notes,
              style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: 10),
          Text(
            'กดอัปเดตเพื่อดาวน์โหลดไฟล์ติดตั้ง แล้วเปิดไฟล์เพื่อติดตั้งทับของเดิม',
            style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
          ),
        ],
      ),
      actions: [
        if (!info.mandatory)
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('ไว้ก่อน'),
          ),
        FilledButton(
          onPressed: () {
            _openApk(info.apkUrl);
            if (!info.mandatory) Navigator.of(ctx).pop();
          },
          child: const Text('อัปเดต'),
        ),
      ],
    ),
  );
}
