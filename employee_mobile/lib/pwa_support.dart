/// Returns whether an iPhone Safari session should show the lightweight
/// "Add to Home Screen" guidance. The caller owns persistence of dismissal;
/// keeping this predicate pure makes the browser state testable.
bool shouldShowPwaInstallGuide({
  required bool isIosWeb,
  required bool isStandalone,
  required bool isDismissed,
}) => isIosWeb && !isStandalone && !isDismissed;

/// A required location is captured for both attendance events. The server
/// applies the same geofence and anti-mock-location rule at check-in/out.
bool shouldRequestCheckInLocation({
  required bool locationRequired,
  required String eventType,
}) => locationRequired && (eventType == 'check_in' || eventType == 'check_out');
