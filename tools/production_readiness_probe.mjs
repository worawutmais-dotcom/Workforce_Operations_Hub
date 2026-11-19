const endpoint = process.argv[2] || 'https://vqualksnbctfukcbxqdd.supabase.co/functions/v1/swift-handler';
const expectedRevision = '2026-11-19-payslip-finance-session';

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'version' }),
});
if (!response.ok) throw new Error(`VERSION_HTTP_${response.status}`);
const payload = await response.json();
if (!payload?.ok || !payload?.data) throw new Error(payload?.message || 'VERSION_PAYLOAD_INVALID');

const data = payload.data;
const checks = [
  ['revision', data.sourceRevision === expectedRevision, `${data.sourceRevision || 'missing'}`],
  ['attendanceCorrectionDisabled', data.capabilities?.attendanceCorrection === false, `${data.capabilities?.attendanceCorrection}`],
  ['payrollReview', data.capabilities?.payrollReview === true, `${data.capabilities?.payrollReview}`],
  ['lateAbsencePolicy', data.capabilities?.payrollLateAbsencePolicy === true, `${data.capabilities?.payrollLateAbsencePolicy}`],
  ['payslipFinanceSession', data.capabilities?.payslipFinanceSession === true, `${data.capabilities?.payslipFinanceSession}`],
  ['apkVersion', Number(data.appVersionCode) >= 12, `${data.appVersionName || 'missing'}+${data.appVersionCode || 'missing'}`],
  ['apkLink', Boolean(data.appApkUrl), data.appApkUrl ? 'set' : 'missing'],
];
let failed = 0;
for (const [name, pass, detail] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} = ${detail}`);
  if (!pass) failed++;
}
if (/แก้เวลา/.test(String(data.appNotes || ''))) console.warn('WARN appNotes mentions time correction while attendanceCorrection=false');
console.log(failed ? `PRODUCTION_READINESS=FAIL (${failed})` : 'PRODUCTION_READINESS=PASS');
if (failed) process.exit(1);
