import fs from 'node:fs';

const html = fs.readFileSync(new URL('../admin_codex/index.html', import.meta.url), 'utf8');
const required = [
  'bvn-route',
  'bvn-page-head',
  'ops-action-ledger',
  'employee-workspace',
  'finance-workbench',
  'settings-workspace',
  'dashboard-personal-time',
  'owner-time-workspace',
  'peoplePulse',
  'renderPeoplePulse(dashboardTeam',
  'LEGACY_ROUTE_REDIRECT',
  'const AUTO_REFRESH_MS={dashboard:6000}',
  'dashboard-checkin-sites',
  'id="siteRows"',
  'dashboard-team-calendar',
  'openTeamDayDialog',
  'data-team-day',
];

const missing = required.filter((token) => !html.includes(token));
if (missing.length) {
  console.error(`ADMIN_REDESIGN_CONTRACT=FAIL missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('ADMIN_REDESIGN_CONTRACT=PASS');
