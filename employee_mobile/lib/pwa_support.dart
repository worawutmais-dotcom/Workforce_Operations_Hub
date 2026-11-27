/// Returns whether an iPhone Safari session should show the lightweight
/// "Add to Home Screen" guidance. The caller owns persistence of dismissal;
/// keeping this predicate pure makes the browser state testable.
bool shouldShowPwaInstallGuide({
  required bool isIosWeb,
  required bool isStandalone,
  required bool isDismissed,
}) =>
    isIosWeb && !isStandalone && !isDismissed;

/// A required location is captured only for Check-in. Check-out does not
/// start a location request by itself.
bool shouldRequestCheckInLocation({
  required bool locationRequired,
  required String eventType,
}) =>
    locationRequired && eventType == 'check_in';
