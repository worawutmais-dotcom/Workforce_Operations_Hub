import assert from "node:assert/strict";
import test from "node:test";

import {
  corsHeadersFor,
  isRetiredMobileAction,
  shouldValidateAttendanceLocation,
} from "./edge_security.ts";

test("allows only the hosted PWA and localhost browser origins", () => {
  assert.equal(
    corsHeadersFor("https://worawutmais-dotcom.github.io").get(
      "Access-Control-Allow-Origin",
    ),
    "https://worawutmais-dotcom.github.io",
  );
  assert.equal(
    corsHeadersFor("http://localhost:5173").get(
      "Access-Control-Allow-Origin",
    ),
    "http://localhost:5173",
  );
  assert.equal(
    corsHeadersFor("https://untrusted.example").has(
      "Access-Control-Allow-Origin",
    ),
    false,
  );
});

test("retires anonymous employee directory access", () => {
  assert.equal(isRetiredMobileAction("employee_directory"), true);
  assert.equal(isRetiredMobileAction("employee_login"), false);
});

test("requires the GPS geofence for both check-in and check-out", () => {
  assert.equal(shouldValidateAttendanceLocation("check_in", true), true);
  assert.equal(shouldValidateAttendanceLocation("check_out", true), true);
  assert.equal(shouldValidateAttendanceLocation("check_out", false), false);
});
