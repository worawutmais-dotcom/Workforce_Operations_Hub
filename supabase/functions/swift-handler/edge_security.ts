const hostedPwaOrigin = "https://worawutmais-dotcom.github.io";

export function corsHeadersFor(origin: string | null): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  if (
    origin === hostedPwaOrigin ||
    /^http:\/\/localhost(?::\d+)?$/.test(origin ?? "")
  ) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function isRetiredMobileAction(action: string): boolean {
  return action === "employee_directory";
}

export function shouldValidateAttendanceLocation(
  eventType: string,
  locationRequired: boolean,
): boolean {
  return locationRequired && (eventType === "check_in" || eventType === "check_out");
}
