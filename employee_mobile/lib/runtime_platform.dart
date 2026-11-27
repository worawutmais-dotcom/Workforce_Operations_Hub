import 'package:flutter/foundation.dart';

String deviceLabelForRuntime({
  required bool isWeb,
  required String platformName,
}) {
  if (isWeb) return 'PWA web';
  return platformName.toLowerCase() == 'android' ? 'Android app' : 'Mobile app';
}

String get currentDeviceLabel => deviceLabelForRuntime(
  isWeb: kIsWeb,
  platformName: defaultTargetPlatform.name,
);

bool shouldCheckForApkUpdate({required bool isWeb}) => !isWeb;
