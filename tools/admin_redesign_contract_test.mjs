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
  'hr-command-center',
  'hr-attendance-hero',
  'hr-workspace',
  'hr-payroll-bridge',
  'ตรวจ Timesheet · ออกสลิป',
  'พร้อมออกสลิป',
  'const employeeName=',
  '<span class="k">พนักงาน</span> <strong>${esc(employeeName)}</strong>',
  'data-payslip',
  'ออกสลิปเงินเดือน',
  'บันทึกและตรวจเวลาเข้า–ออกแทนพนักงาน',
  'ทะเบียนพนักงานและคิวอนุมัติ',
  'ทะเบียนเงินล่วงหน้า',
  'data-adv-filter',
  'เปิดเอกสารได้',
  'ทีมวันนี้',
  'เลือกชื่อเพื่อดูเวลาเข้า–ออกและประวัติ',
  'employee-review-modal',
  'employee-review-summary',
  'employeeReviewHistory',
  'ตรวจสอบเวลาทำงาน',
  'งานที่ต้องจัดการ',
  'actionQueue',
  'data-action-target',
  'data-att-filter',
  'ownerState={emp:"",filter:""',
  'OT รออนุมัติ',
  'data-payroll-nav',
  'ข้อมูลเอกสารยังไม่ครบ',
  'ยังไม่มีเลขบัตรประชาชน',
];

const missing = required.filter((token) => !html.includes(token));
if (missing.length) {
  console.error(`ADMIN_REDESIGN_CONTRACT=FAIL missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('ADMIN_REDESIGN_CONTRACT=PASS');
