// Mirror test for the OT multiplier resolution + pay math.
// It re-implements resolveOtMultiplier() exactly as in
// supabase/functions/bvn-api/index.ts so the decision table and example
// payout can be verified without a Deno/Supabase runtime.
// Keep this in sync if the source function changes.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function weekdayOf(date) { return new Date(date + "T00:00:00Z").getUTCDay(); }
function resolveOtMultiplier(workDate, holMult, isHolidayRow, s, rule) {
  if (s.ot_auto_apply === "false") return num(rule?.ot_multiplier) || num(s.ot_multiplier) || 1.5;
  const explicit = holMult[workDate];
  if (explicit && explicit > 0) return explicit;
  if (isHolidayRow) return num(s.holiday_multiplier) || 2;
  const dow = weekdayOf(workDate);
  if (dow === 0) return num(s.ot_sunday_multiplier) || 2;
  if (dow === 6 && s.ot_saturday_enabled === "true") return num(s.ot_saturday_multiplier) || 1.5;
  return num(rule?.ot_multiplier) || num(s.ot_multiplier) || 1.5;
}

const S = { ot_auto_apply: "true", ot_multiplier: "1.5", ot_sunday_multiplier: "2", ot_saturday_enabled: "false", ot_saturday_multiplier: "1.5", holiday_multiplier: "2" };
const rule = { ot_multiplier: 1.5 };
let fail = 0;
const eq = (name, got, want) => { const ok = Math.abs(got - want) < 1e-9; console.log((ok ? "PASS" : "FAIL") + " " + name + " -> " + got + (ok ? "" : " (want " + want + ")")); if (!ok) fail++; };

// 2026-11-18 = Wednesday, 2026-11-15 = Sunday, 2026-11-14 = Saturday
eq("normal weekday OT = 1.5", resolveOtMultiplier("2026-11-18", {}, false, S, rule), 1.5);
eq("Sunday = 2", resolveOtMultiplier("2026-11-15", {}, false, S, rule), 2);
eq("Saturday off by default = 1.5 (OT)", resolveOtMultiplier("2026-11-14", {}, false, S, rule), 1.5);
eq("Saturday enabled = 1.5", resolveOtMultiplier("2026-11-14", {}, false, { ...S, ot_saturday_enabled: "true" }, rule), 1.5);
eq("holiday row no explicit = holiday_multiplier 2", resolveOtMultiplier("2026-11-18", {}, true, S, rule), 2);
eq("explicit per-day x3 beats holiday default", resolveOtMultiplier("2026-11-18", { "2026-11-18": 3 }, true, S, rule), 3);
eq("explicit per-day x3 beats Sunday", resolveOtMultiplier("2026-11-15", { "2026-11-15": 3 }, false, S, rule), 3);
eq("auto off = flat rule multiplier", resolveOtMultiplier("2026-11-15", { "2026-11-15": 3 }, true, { ...S, ot_auto_apply: "false" }, rule), 1.5);

// Example payout: 50 THB/hr, Sunday OT 3 hours -> 50 * 2 * 3 = 300
const otHourly = 50, hours = 3;
const mult = resolveOtMultiplier("2026-11-15", {}, false, S, rule);
const pay = otHourly * mult * hours;
eq("example Sunday 3h payout = 300", pay, 300);

console.log(fail ? ("\n" + fail + " FAILED") : "\nALL PASS");
process.exit(fail ? 1 : 0);
