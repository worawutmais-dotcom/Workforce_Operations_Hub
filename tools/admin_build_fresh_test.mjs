// Guard: admin_codex/index.html MUST equal a fresh build from admin_codex/src/.
// index.html is a build artifact; if someone hand-edits it (or forgets to run
// `node tools/build_admin.mjs` after editing src/), the deployed file silently
// drifts from the real source. Run in CI / before every commit. Exit 0 = fresh.
import fs from 'node:fs';
import { buildAdminHtml } from './build_admin.mjs';

const disk = fs.readFileSync(new URL('../admin_codex/index.html', import.meta.url), 'utf8');
const fresh = buildAdminHtml();

if (disk === fresh) {
  console.log('ADMIN_BUILD_FRESH=PASS (index.html matches a build from src/)');
  process.exit(0);
}

// Report the first divergence to help locate the drift.
const a = disk.split('\n');
const b = fresh.split('\n');
let line = -1;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) { line = i; break; }
}
console.error('ADMIN_BUILD_FRESH=FAIL — index.html does not match src/.');
console.error(`  index.html lines: ${a.length}, fresh build lines: ${b.length}`);
if (line >= 0) {
  console.error(`  first difference at line ${line + 1}:`);
  console.error(`    index.html : ${JSON.stringify((a[line] || '').slice(0, 160))}`);
  console.error(`    fresh build: ${JSON.stringify((b[line] || '').slice(0, 160))}`);
}
console.error('  Fix: edit admin_codex/src/*, then run `node tools/build_admin.mjs`.');
console.error('  (Do NOT hand-edit admin_codex/index.html — it is a build artifact.)');
process.exit(1);
