// Guard: the Edge Function source and its deploy mirror MUST stay byte-identical.
// A silent drift between these two files is a financial-correctness hazard — the
// console calls `swift-handler` (the deployed name) while development happens in
// `bvn-api`, so any handler that exists in one but not the other ships wrong math
// or a missing action. Run in CI / before every commit. Exit 0 = in sync.
import fs from 'node:fs';

const root = new URL('../supabase/functions/', import.meta.url);
const source = fs.readFileSync(new URL('bvn-api/index.ts', root), 'utf8');
const mirror = fs.readFileSync(new URL('swift-handler/index.ts', root), 'utf8');

if (source === mirror) {
  console.log('MIRROR_SYNC=PASS (bvn-api and swift-handler are byte-identical)');
  process.exit(0);
}

// Report the first divergence so a human can see what drifted.
const a = source.split('\n');
const b = mirror.split('\n');
const max = Math.max(a.length, b.length);
let firstDiff = -1;
for (let i = 0; i < max; i++) {
  if (a[i] !== b[i]) { firstDiff = i; break; }
}
console.error('MIRROR_SYNC=FAIL — bvn-api/index.ts and swift-handler/index.ts have drifted.');
console.error(`  source lines: ${a.length}, mirror lines: ${b.length}`);
if (firstDiff >= 0) {
  console.error(`  first difference at line ${firstDiff + 1}:`);
  console.error(`    bvn-api     : ${JSON.stringify((a[firstDiff] || '').slice(0, 160))}`);
  console.error(`    swift-handler: ${JSON.stringify((b[firstDiff] || '').slice(0, 160))}`);
}
console.error('  Fix: cp supabase/functions/bvn-api/index.ts supabase/functions/swift-handler/index.ts');
process.exit(1);
