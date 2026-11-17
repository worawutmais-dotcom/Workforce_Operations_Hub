// Unit test for the payroll short-day policy (payroll_shortfall_policy).
// Mirrors the logic in supabase/functions/bvn-api/index.ts (previewPayroll):
//   none        -> pay the short day in full
//   deduct_wage -> prorate base pay by hours actually worked
//   trim_ot     -> keep base pay, cancel OT up to the period shortfall
// Run: node tools/shortfall_policy_test.mjs   (exit 0 = all pass)

const round = (n) => Math.round(n * 100) / 100;
const normalizePolicy = (value) => {
  const policy = String(value ?? "").trim().toLowerCase();
  return ["none", "deduct_wage", "trim_ot"].includes(policy) ? policy : "none";
};

// Pure mirror of the per-employee calculation for one pay period.
// days: [{minutes}] complete days; otMinutes: approved OT for the period.
function calcLine({ basis, rate, std = 480, daysPerMonth = 30, days, otMinutes = 0, otHourly = null, mult = 1.5, policy = "none" }) {
  let baseGross = 0, regularMinutes = 0, shortfallMinutes = 0, shortDays = 0, shortfallDeduction = 0, otTrimmedMinutes = 0;
  for (const d of days) {
    const workedReg = Math.min(d.minutes, std);
    const shortfall = Math.max(0, std - d.minutes);
    regularMinutes += workedReg;
    if (shortfall > 0) { shortfallMinutes += shortfall; shortDays += 1; }
    if (basis === "daily") {
      const dayPay = (policy === "deduct_wage" && shortfall > 0 && std > 0) ? rate * (workedReg / std) : rate;
      baseGross += dayPay;
      if (dayPay < rate) shortfallDeduction += (rate - dayPay);
    } else if (basis === "hourly") {
      baseGross += (workedReg / 60) * rate;
    }
  }
  if (basis === "monthly") {
    baseGross = rate;
    if (policy === "deduct_wage" && shortfallMinutes > 0) {
      const dailyRate = daysPerMonth > 0 ? rate / daysPerMonth : 0;
      const ded = std > 0 ? dailyRate * (shortfallMinutes / std) : 0;
      baseGross = Math.max(0, baseGross - ded);
      shortfallDeduction += ded;
    }
  }
  const hourly = otHourly != null ? otHourly : (basis === "hourly" ? rate : rate / (std / 60));
  let otGross = (otMinutes / 60) * hourly * mult;
  let otMin = otMinutes;
  if (policy === "trim_ot" && shortfallMinutes > 0 && otMin > 0) {
    const keep = Math.max(0, otMin - shortfallMinutes);
    const ratio = otMin > 0 ? keep / otMin : 0;
    otTrimmedMinutes = otMin - keep;
    otGross = otGross * ratio;
    otMin = keep;
  }
  return { baseGross: round(baseGross), regularMinutes, shortfallMinutes, shortDays, shortfallDeduction: round(shortfallDeduction), otMinutes: otMin, otGross: round(otGross), otTrimmedMinutes };
}

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = Math.abs(got - want) < 0.01;
  if (ok) { pass++; } else { fail++; console.error(`FAIL ${label}: got ${got}, want ${want}`); }
}

// 1) daily 500/day, 6h day (360m), policy none -> full 500, no deduction
let r = calcLine({ basis: "daily", rate: 500, days: [{ minutes: 360 }], policy: "none" });
eq("daily/none base", r.baseGross, 500);
eq("daily/none deduction", r.shortfallDeduction, 0);
eq("daily/none shortDays", r.shortDays, 1);

// 2) daily 500/day, 6h day, policy deduct_wage -> 500*6/8 = 375, deduct 125
r = calcLine({ basis: "daily", rate: 500, days: [{ minutes: 360 }], policy: "deduct_wage" });
eq("daily/deduct base", r.baseGross, 375);
eq("daily/deduct deduction", r.shortfallDeduction, 125);

// 3) daily full 8h day -> no shortfall regardless of policy
r = calcLine({ basis: "daily", rate: 500, days: [{ minutes: 480 }], policy: "deduct_wage" });
eq("daily/full base", r.baseGross, 500);
eq("daily/full shortDays", r.shortDays, 0);

// 4) monthly 15000, dpm 30, shortfall 120m (0.25 day), deduct_wage
//    dailyRate=500, ded=500*120/480=125 -> base 14875
r = calcLine({ basis: "monthly", rate: 15000, daysPerMonth: 30, days: [{ minutes: 360 }], policy: "deduct_wage" });
eq("monthly/deduct base", r.baseGross, 14875);
eq("monthly/deduct deduction", r.shortfallDeduction, 125);

// 5) trim_ot: base untouched, OT 240m, shortfall 120m -> keep 120m, OT halved
r = calcLine({ basis: "daily", rate: 500, days: [{ minutes: 360 }], otMinutes: 240, mult: 1.5, policy: "trim_ot" });
eq("trim_ot base full", r.baseGross, 500); // base not cut under trim_ot
eq("trim_ot ot minutes kept", r.otMinutes, 120);
eq("trim_ot ot trimmed", r.otTrimmedMinutes, 120);
// otHourly = 500/8 = 62.5 ; full OT = (240/60)*62.5*1.5 = 375 ; halved -> 187.5
eq("trim_ot ot gross halved", r.otGross, 187.5);

// 6) trim_ot but no shortfall -> OT intact
r = calcLine({ basis: "daily", rate: 500, days: [{ minutes: 480 }], otMinutes: 240, mult: 1.5, policy: "trim_ot" });
eq("trim_ot/full ot intact", r.otMinutes, 240);

// 7) corrupt/legacy setting must fall back safely to the no-change policy.
if (normalizePolicy(" made-up-policy ") === "none") { pass++; } else { fail++; console.error("FAIL invalid policy must normalize to none"); }
if (normalizePolicy("TRIM_OT") === "trim_ot") { pass++; } else { fail++; console.error("FAIL policy normalization"); }

console.log(`\nshortfall_policy_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
