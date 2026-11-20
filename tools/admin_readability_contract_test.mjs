import fs from 'node:fs';

const css = fs.readFileSync(new URL('../admin_codex/src/app.css', import.meta.url), 'utf8');
const required = [
  'Cross-console readability contract',
  '--ui-text:#152f49',
  '--ui-secondary:#48647e',
  '--ui-success:#08704e',
  '.page table thead th',
  '.page table tbody td',
  '.page .btn{min-height:32px;font-size:12px',
  '#page-dashboard .cc-work .tc-pill{font-size:10px!important}',
  '#page-dashboard .cc-summary-tiles .cc-stat small{color:#071824!important}',
  '#page-dashboard .wq-copy span{color:#314a61!important}',
  '#page-owner .pm-person small',
  '#page-people .pc-status-grid small',
  '#page-settings .settings-command-card b{color:#102a43',
  '@media(max-width:760px)',
];

const missing = required.filter((token) => !css.includes(token));
if (missing.length) {
  console.error(`ADMIN_READABILITY_CONTRACT=FAIL missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('ADMIN_READABILITY_CONTRACT=PASS');
