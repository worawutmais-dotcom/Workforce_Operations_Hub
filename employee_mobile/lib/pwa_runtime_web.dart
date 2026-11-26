import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

bool get isIosPwaBrowser => defaultTargetPlatform == TargetPlatform.iOS;

bool get isPwaStandalone =>
    web.window.matchMedia('(display-mode: standalone)').matches;
