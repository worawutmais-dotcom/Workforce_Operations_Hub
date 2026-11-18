import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../admin_codex/index.html', import.meta.url), 'utf8');
const match = html.match(/function payrollRange[\s\S]*?function applyPayrollPeriod/);
if (!match) throw new Error('PAYROLL_PERIOD_POLICY=FAIL helper missing');
const source = match[0].slice(0, match[0].lastIndexOf('function applyPayrollPeriod'));
const context = { todayISO: () => '2026-11-18' };
vm.createContext(context);
vm.runInContext(`${source}; this.payrollRange=payrollRange;`, context);
const check = (kind, date, start, end) => {
  const actual = context.payrollRange(kind, date);
  if (actual.start !== start || actual.end !== end) throw new Error(`PAYROLL_PERIOD_POLICY=FAIL ${kind}/${date}: ${actual.start}..${actual.end}`);
};
check('current', '2026-11-18', '2026-11-01', '2026-11-18');
check('previous', '2026-11-18', '2026-10-01', '2026-10-31');
check('previous', '2026-01-05', '2025-12-01', '2025-12-31');
console.log('PAYROLL_PERIOD_POLICY=PASS');
