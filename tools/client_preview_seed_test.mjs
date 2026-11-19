import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const seed = fs.readFileSync(path.join(root, 'supabase', 'seed_client_preview_10_employees.sql'), 'utf8');
const app = fs.readFileSync(path.join(root, 'admin_codex', 'src', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'admin_codex', 'src', 'app.css'), 'utf8');
const checks = [
  ['ten demo identifiers', new Set([...seed.matchAll(/'BVN-(9\d{3})'/g)].map((m) => m[1])).size === 10],
  ['demo cleanup remains scoped', seed.includes("employee_id between 'BVN-9001' and 'BVN-9010'") && seed.includes("invoice_no like 'DEMO-INV-%'")],
  ['four-month attendance range', seed.includes("date_trunc('month', current_date) - interval '3 months'")],
  ['invoice lifecycle samples', ['DRAFT','ISSUED','OVERDUE','PAID'].every((state) => seed.includes(`DEMO-INV-${state}-001`))],
  ['compact calendar copy', app.includes('>ตรวจ ${fmtInt(missing)}</span>') && app.includes('>ทำงาน ${fmtInt(open)}</span>')],
  ['calendar compact height', css.includes('min-height:56px')],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('CLIENT_PREVIEW_SEED=PASS');
