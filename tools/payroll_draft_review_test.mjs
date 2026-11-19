import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['admin review fields', read('admin_codex/src/app.js'), ['id="tsBase"', 'id="tsOt"', 'id="tsOther"', 'บันทึกร่างรายการเงินเดือนแล้ว', 'บันทึกและออกสลิป']],
  ['no payslip password prompt', read('admin_codex/src/app.js'), ['issuePayslipWithAdminPassword'], false],
  ['server review overrides', read('supabase/functions/swift-handler/index.ts'), ['base_gross_override', 'ot_gross_override', 'payslipFinanceSession']],
  ['database review overrides', read('supabase/patch_payroll_draft_review.sql'), ['base_gross_override', 'ot_gross_override']],
];

let failed = 0;
for (const [name, text, tokens, mustContain = true] of checks) {
  for (const token of tokens) {
    const ok = text.includes(token) === mustContain;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${mustContain ? 'has' : 'omits'} ${token}`);
    if (!ok) failed++;
  }
}
if (failed) process.exit(1);
console.log('PAYROLL_DRAFT_REVIEW=PASS');
