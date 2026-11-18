// Unit test for the payroll late-arrival policy.
// Mirrors previewPayroll(): owner-configured complete late arrivals in the
// same period equal one absence-equivalent day. The default threshold is four.

const round = (n) => Math.round(n * 100) / 100;
const absencesFromLateDays = (lateDays, threshold = 4) => Math.floor(Math.max(0, lateDays) / threshold);
const dayRate = ({ basis, rate, standardHours = 8, daysPerMonth = 30 }) => {
  if (basis === 'monthly') return rate / daysPerMonth;
  if (basis === 'hourly') return rate * standardHours;
  return rate;
};
const applyLateAbsence = ({ baseGross, lateDays, lateAbsenceDays = 4, ...pay }) => {
  const absenceDays = absencesFromLateDays(lateDays, lateAbsenceDays);
  const deduction = Math.min(Math.max(0, baseGross), Math.max(0, dayRate(pay) * absenceDays));
  return { absenceDays, deduction: round(deduction), baseGross: round(baseGross - deduction) };
};

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  if (Math.abs(got - want) < 0.01) pass++;
  else { fail++; console.error(`FAIL ${label}: got ${got}, want ${want}`); }
};

eq('three late days do not create absence', absencesFromLateDays(3), 0);
eq('four late days create one absence', absencesFromLateDays(4), 1);
eq('seven late days create one absence', absencesFromLateDays(7), 1);
eq('eight late days create two absences', absencesFromLateDays(8), 2);
eq('custom threshold of two late days creates one absence', absencesFromLateDays(2, 2), 1);
eq('custom threshold keeps remainder within the same absence', absencesFromLateDays(3, 2), 1);

let r = applyLateAbsence({ basis: 'daily', rate: 500, baseGross: 2500, lateDays: 4 });
eq('daily one absence deduction', r.deduction, 500);
eq('daily base after one absence', r.baseGross, 2000);

r = applyLateAbsence({ basis: 'monthly', rate: 15000, daysPerMonth: 30, baseGross: 15000, lateDays: 8 });
eq('monthly two absence deduction', r.deduction, 1000);
eq('monthly base after two absences', r.baseGross, 14000);

r = applyLateAbsence({ basis: 'hourly', rate: 60, standardHours: 8, baseGross: 2400, lateDays: 4 });
eq('hourly absence equals standard day', r.deduction, 480);
eq('hourly base after absence', r.baseGross, 1920);

r = applyLateAbsence({ basis: 'daily', rate: 500, baseGross: 300, lateDays: 4 });
eq('deduction cannot make base negative', r.deduction, 300);
eq('base is bounded at zero', r.baseGross, 0);

r = applyLateAbsence({ basis: 'daily', rate: 500, baseGross: 1500, lateDays: 6, lateAbsenceDays: 3 });
eq('configured threshold is used for payroll deduction', r.deduction, 1000);

console.log(`late_absence_policy_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
