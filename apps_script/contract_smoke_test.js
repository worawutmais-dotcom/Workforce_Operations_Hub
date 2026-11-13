/*
 * Local contract smoke test for Code.gs.
 *
 * This is deliberately dependency-free. It runs the Apps Script source in a
 * small in-memory Google-service shim and validates the release-critical paths
 * that do not require a live Sheet: Admin session lifecycle and header-aware
 * dashboard employee counting.
 *
 * Run: node apps_script/contract_smoke_test.js
 */
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

class Range {
  constructor(sheet, row, column, rows = 1, columns = 1) { this.sheet = sheet; this.row = row; this.column = column; this.rows = rows; this.columns = columns; }
  getValue() { return (this.sheet.rows[this.row - 1] || [])[this.column - 1] || ''; }
  setValue(value) { this.sheet.ensure(this.row, this.column); this.sheet.rows[this.row - 1][this.column - 1] = value; return this; }
  getValues() { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => (this.sheet.rows[this.row - 1 + r] || [])[this.column - 1 + c] || '')); }
  setValues(values) { values.forEach((row, r) => row.forEach((value, c) => this.setCell(r, c, value))); return this; }
  setCell(r, c, value) { this.sheet.ensure(this.row + r, this.column + c); this.sheet.rows[this.row - 1 + r][this.column - 1 + c] = value; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  ensure(row, col) { while (this.rows.length < row) this.rows.push([]); while (this.rows[row - 1].length < col) this.rows[row - 1].push(''); }
  appendRow(row) { this.rows.push(row.slice()); }
  setFrozenRows() {}
  getRange(row, column, rows = 1, columns = 1) { return new Range(this, row, column, rows, columns); }
  getDataRange() { const width = Math.max(1, ...this.rows.map(r => r.length)); return this.getRange(1, 1, Math.max(1, this.rows.length), width); }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
  getLastRow() { return this.rows.length; }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}
class Spreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new Sheet(name); this.sheets.set(name, sheet); return sheet; }
}

const sheet = new Spreadsheet();
const properties = {
  ADMIN_API_KEY: 'owner-key-must-never-reach-normal-login', MOBILE_TOKEN_PEPPER: 'test-pepper',
  INITIAL_ADMIN_USERNAME: 'bootstrap-owner', INITIAL_ADMIN_PASSWORD: 'bootstrap-owner-password', INITIAL_ADMIN_DISPLAY_NAME: 'Bootstrap Owner',
};
const cache = new Map();
let uuid = 0;
let heldLocks = 0;
const sandbox = {
  console,
  Date,
  JSON,
  Math,
  String,
  Number,
  Object,
  Array,
  RegExp,
  Set,
  Error,
  isNaN,
  SpreadsheetApp: { openById: () => sheet },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || '', deleteProperty: key => { delete properties[key]; } }) },
  CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
  LockService: { getScriptLock: () => ({ waitLock: () => { heldLocks += 1; }, releaseLock: () => { heldLocks -= 1; } }) },
  Utilities: {
    getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    computeHmacSha256Signature: (text, secret) => crypto.createHmac('sha256', secret).update(String(text)).digest(),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    formatDate: (date, _tz, pattern) => {
      const d = new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000), p = n => String(n).padStart(2, '0');
      const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
      const hm = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
      if (pattern === 'HH:mm') return hm;
      if (pattern === 'yyyyMMdd-HHmmss') return `${ymd.replace(/-/g, '')}-${hm.replace(':', '')}${p(d.getUTCSeconds())}`;
      if (pattern === 'yyyy-MM-dd HH:mm') return `${ymd} ${hm}`;
      if (pattern === "yyyy-MM-dd'T'HH:mm:ssXXX") return `${ymd}T${hm}:${p(d.getUTCSeconds())}+00:00`;
      return ymd;
    },
  },
  ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ getContent: () => text, setMimeType() { return this; } }) },
};
vm.createContext(sandbox);
const source = fs.readFileSync('apps_script/Code.gs', 'utf8');
vm.runInContext(source, sandbox, { filename: 'Code.gs' });

function replyData(reply) { return JSON.parse(reply.getContent()); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const generatedTemporaryPassword = sandbox.temporaryPassword_();
assert(/^[A-F0-9]{6}-[A-F0-9]{6}$/.test(generatedTemporaryPassword), 'temporary passwords must be UUID-derived, uppercase and non-trivial');

// Simple-store mode writes the requested readable password, then deletes the
// temporary Script Properties.
const bootstrap = sandbox.bootstrapInitialAdmin();
const admins = sheet.getSheetByName('Admin_Users');
assert(bootstrap.username === 'bootstrap-owner' && admins.rows[1][1] === 'bootstrap-owner-password', 'bootstrap must create a readable Owner password');
assert(!properties.INITIAL_ADMIN_PASSWORD && !properties.INITIAL_ADMIN_USERNAME, 'bootstrap must delete temporary owner credentials');
let secondBootstrapRejected = false;
try { sandbox.bootstrapInitialAdmin(); } catch (_) { secondBootstrapRejected = true; }
assert(secondBootstrapRejected, 'bootstrap must refuse to run after an Admin exists');
// Deactivate the bootstrap fixture so the legacy account below remains the
// sole active Owner for final-Owner contract coverage.
admins.rows[1][3] = 'false';
// Plain Admin password rows remain readable in simple-store mode.
admins.appendRow(['ops-test', 'temporary-test-password', 'Operations Test', 'true', new Date()]);
const employees = sheet.insertSheet('Employees');
// Intentionally place Status after Location required: fixed-index Dashboard code
// would read the wrong column and report zero active employees.
employees.appendRow(['Employee ID', 'Name', 'Role', 'Department', 'Work site ID', 'Location required', 'Status', 'Password hash']);
employees.appendRow(['EMP-9001', 'Test Worker', 'Worker', 'Ops', 'BVN-HQ', 'true', 'active', 'h1:x']);
const attendance = sheet.insertSheet('Attendance_Log');
attendance.appendRow(['ID', 'Employee ID', 'Site', 'Event', 'At', '', '', '', '', 'Status']);
attendance.appendRow(['ATT-1', 'EMP-9001', 'BVN-HQ', 'check_in', new Date('2026-01-15T02:00:00Z'), '', '', '', '', 'accepted']);
attendance.appendRow(['ATT-2', 'EMP-9001', 'BVN-HQ', 'check_out', new Date('2026-01-15T10:00:00Z'), '', '', '', '', 'accepted']);
const payRules = sheet.insertSheet('Payroll_Rules');
payRules.appendRow(['Employee ID', 'Pay basis', 'Base rate', 'Standard hours/day', 'OT enabled', 'OT multiplier', 'Premium date', 'Premium multiplier', 'Updated at', 'Updated by', 'Other deduction', 'Days per month']);
payRules.appendRow(['EMP-9001', 'hourly', 100, 8, 'true', 1.5, '', 1, new Date(), 'Payroll Test', 50, 30]);
const timeRequests = sheet.insertSheet('Time_Requests');
timeRequests.appendRow(['Request ID', 'Employee ID', 'Request type', 'Work date', 'Requested minutes', 'Reason', 'Status', 'Submitted at', 'Reviewed by', 'Reviewed at', 'Reviewer note']);
timeRequests.appendRow(['OT-1', 'EMP-9001', 'overtime', new Date('2026-01-15T00:00:00Z'), 60, 'UAT OT', 'approved', new Date(), 'Operations Test', new Date(), '']);
const settings = sheet.insertSheet('Settings');
settings.appendRow(['Key', 'Value']);
settings.appendRow(['sso_enabled', 'true']);
settings.appendRow(['sso_rate', '5']);
settings.appendRow(['sso_cap', '750']);
const advances = sheet.insertSheet('Advances');
advances.appendRow(['Advance ID', 'Employee ID', 'Amount', 'Reason', 'Request date', 'Status', 'Reviewer', 'Decided at', 'Paid at', 'Settled payroll ID', '']);
advances.appendRow(['ADV-9001', 'EMP-9001', 500, 'UAT advance', new Date(), 'approved', '', '', '', '', '']);
advances.appendRow(['ADV-9002', 'EMP-9001', 100, 'Already paid UAT advance', new Date(), 'paid', '', '', new Date(), '', '']);

const login = replyData(sandbox.adminConsoleLogin_({ username: 'ops-test', password: 'temporary-test-password' }));
assert(login.ok, 'normal Admin login must succeed');
assert(login.data.adminToken && login.data.adminToken !== properties.ADMIN_API_KEY, 'normal login must never return the owner key');
assert(String(admins.rows[2][1]) === 'temporary-test-password', 'plain Admin password must remain readable after login');
const authenticatedPayload = { adminToken: login.data.adminToken };
const actor = sandbox.requireAdmin_(authenticatedPayload);
assert(actor.displayName === 'Operations Test' && authenticatedPayload._adminActor === 'Operations Test', 'session must establish a verified actor');
const spoofedActorPayload = { adminToken: login.data.adminToken, reviewer: 'Untrusted browser name' };
sandbox.requireAdmin_(spoofedActorPayload);
assert(sandbox.adminActor_(spoofedActorPayload) === 'Operations Test', 'browser reviewer text must not override the verified session actor');
const legacyOwnerPayload = { adminToken: properties.ADMIN_API_KEY, reviewer: 'Untrusted browser name' };
sandbox.requireAdmin_(legacyOwnerPayload);
assert(sandbox.adminActor_(legacyOwnerPayload) === 'System owner', 'legacy owner recovery must use a fixed audited actor');
const dashboard = replyData(sandbox.adminDashboard_({ adminToken: login.data.adminToken }));
assert(dashboard.ok && dashboard.data.totalEmployees === 1, 'Dashboard must use header-aware active status');
// Employee IDs are public in the mobile picker, so password guessing remains
// throttled even though the owner deliberately selected simple-store mode.
employees.rows[1][7] = 'employee-pass-123';
for (let attempt = 0; attempt < 5; attempt += 1) {
  const failedEmployeeLogin = replyData(sandbox.employeeLogin_({ employeeId: 'EMP-9001', password: 'wrong-password', deviceLabel: 'contract test' }));
  assert(!failedEmployeeLogin.ok, 'incorrect employee password must be rejected');
}
const throttledEmployeeLogin = replyData(sandbox.employeeLogin_({ employeeId: 'EMP-9001', password: 'employee-pass-123', deviceLabel: 'contract test' }));
assert(!throttledEmployeeLogin.ok, 'repeated employee password failures must throttle a correct password temporarily');
cache.clear();
const employeeLogin = replyData(sandbox.employeeLogin_({ employeeId: 'EMP-9001', password: 'employee-pass-123', deviceLabel: 'contract test' }));
assert(employeeLogin.ok && employeeLogin.data.mobileToken, 'employee login must issue a mobile token after throttle recovery');
const payrollPreview = replyData(sandbox.adminPreviewPayroll_({ adminToken: login.data.adminToken, startDate: '2026-01-15', endDate: '2026-01-15' }));
assert(payrollPreview.ok && payrollPreview.data.lines.length === 1, 'Payroll preview must return the controlled employee line');
const previewLine = payrollPreview.data.lines[0];
assert(previewLine.baseGross === 800 && previewLine.otGross === 150 && previewLine.grossPay === 950, 'Payroll preview must calculate hourly regular pay plus approved OT');
assert(previewLine.sso === 47.5 && previewLine.otherDeduction === 50 && previewLine.advanceDeduction === 100 && previewLine.netPay === 752.5, 'Payroll preview must deduct SSO, other deductions and only affordable paid advances');
const lockedPayroll = replyData(sandbox.adminLockPayroll_({ adminToken: login.data.adminToken, startDate: '2026-01-15', endDate: '2026-01-15' }));
assert(lockedPayroll.ok && lockedPayroll.data.totalNet === 752.5, 'Payroll lock must retain the reviewed preview total');
assert(advances.rows[2][5] === 'settled' && advances.rows[2][10] === lockedPayroll.data.payrollId, 'Payroll lock must settle exactly the advance included in the snapshot');
const payrollLines = sheet.getSheetByName('Payroll_Lines');
assert(payrollLines.rows[0].join('|') === 'Payroll ID|Employee ID|Regular minutes|OT minutes|Base gross|OT gross|Gross pay|Created at|Advance deduction|Net pay|SSO|Other deduction', 'Payroll line header must use one canonical financial snapshot order');
assert(payrollLines.rows[1][7] instanceof Date && payrollLines.rows[1][8] === 100 && payrollLines.rows[1][9] === 752.5, 'Locked payroll must preserve Created at before frozen deductions');
const lockedDetail = replyData(sandbox.adminGetPayroll_({ adminToken: login.data.adminToken, payrollId: lockedPayroll.data.payrollId }));
assert(lockedDetail.ok && lockedDetail.data.lines[0].advanceDeduction === 100 && lockedDetail.data.lines[0].netPay === 752.5, 'Payroll detail must read the canonical frozen snapshot');
// Mimic the short-lived malformed pre-release row: advance/net/date were in
// the wrong order under an old eight-column header. Initialization must repair
// it safely before any payroll detail is read.
payrollLines.appendRow(['PAY-MIG', 'EMP-9001', 480, 60, 800, 150, 950, 100, 752.5, new Date(), 47.5, 50]);
sandbox.initializePayrollSheets();
assert(payrollLines.rows[2][7] instanceof Date && payrollLines.rows[2][8] === 100 && payrollLines.rows[2][9] === 752.5, 'Payroll schema migration must repair the unambiguous malformed row');
const duplicatePayrollLock = replyData(sandbox.adminLockPayroll_({ adminToken: login.data.adminToken, startDate: '2026-01-15', endDate: '2026-01-15' }));
assert(!duplicatePayrollLock.ok, 'Duplicate payroll period lock must be rejected');
const createdInvoice = replyData(sandbox.adminCreateInvoice_({ adminToken: login.data.adminToken, customer: 'Contract Customer', description: 'UAT service', subtotal: 1000, dueDate: '2026-01-31' }));
assert(createdInvoice.ok && createdInvoice.data.invoice.invoiceNo && createdInvoice.data.invoice.createdAt, 'Invoice creation must create a dated draft under the shared lock');
const invoiceNo = createdInvoice.data.invoice.invoiceNo;
const auditRows = sheet.getSheetByName('Audit_Log').rows;
assert(auditRows.some(row => row[2] === 'invoice_created' && row[3] === invoiceNo && row[1] === 'Operations Test'), 'Invoice creation must be attributed to the verified session actor');
const issuedInvoice = replyData(sandbox.adminUpdateInvoiceStatus_({ adminToken: login.data.adminToken, invoiceNo, status: 'issued' }));
assert(issuedInvoice.ok, 'Draft invoice must transition to issued under the shared lock');
const paidWithoutReference = replyData(sandbox.adminUpdateInvoiceStatus_({ adminToken: login.data.adminToken, invoiceNo, status: 'paid' }));
assert(!paidWithoutReference.ok && heldLocks === 0, 'Invoice payment without a reference must be rejected and release the shared lock');
const paidInvoice = replyData(sandbox.adminUpdateInvoiceStatus_({ adminToken: login.data.adminToken, invoiceNo, status: 'paid', paymentReference: 'UAT-REF-001' }));
assert(paidInvoice.ok && heldLocks === 0, 'Issued invoice must become paid with a reference and release the shared lock');
const doublePaidInvoice = replyData(sandbox.adminUpdateInvoiceStatus_({ adminToken: login.data.adminToken, invoiceNo, status: 'paid', paymentReference: 'UAT-REF-002' }));
assert(!doublePaidInvoice.ok && heldLocks === 0, 'Invoice transitions must reject a stale second payment');
const adminDirectory = replyData(sandbox.adminListEmployees_({ adminToken: login.data.adminToken }));
assert(adminDirectory.ok && adminDirectory.data.employees.length === 1, 'Admin employee directory must load');
assert(!Object.hasOwn(adminDirectory.data.employees[0], 'passwordHash'), 'Admin employee directory must not return internal hash fields');
assert(adminDirectory.data.employees[0].password === 'employee-pass-123', 'Admin employee directory must return the readable password in simple-store mode');
assert(adminDirectory.data.employees[0].department === 'Ops', 'Admin employee directory must retain department data');
const updatedEmployee = replyData(sandbox.adminUpsertEmployee_({
  adminToken: login.data.adminToken, employeeId: 'EMP-9001', name: 'Test Worker', role: 'Worker', department: 'Ops', siteId: 'BVN-HQ', status: 'active', locationRequired: true,
}));
assert(updatedEmployee.ok && !Object.hasOwn(updatedEmployee.data.employee, 'passwordHash'), 'Employee save response must not return internal hash fields');
assert(updatedEmployee.data.employee.department === 'Ops', 'Employee save response must retain department data');
const siteFreeEmployee = replyData(sandbox.adminUpsertEmployee_({
  adminToken: login.data.adminToken, name: 'No Site Worker', role: 'Worker', department: 'Ops', status: 'active', locationRequired: true,
}));
assert(siteFreeEmployee.ok && siteFreeEmployee.data.employee.siteId === '', 'Employee creation must not require a site; active company check-in locations remain the GPS policy');
const strictOldestAdvance = sandbox.advanceFit_([{ sheetRow: 2, amount: 800 }, { sheetRow: 3, amount: 200 }], 500);
assert(strictOldestAdvance.deduction === 0 && strictOldestAdvance.sheetRows.length === 0, 'Advance recovery must not skip an older unpaid advance to settle a newer one');
const affordableAdvance = sandbox.advanceFit_([{ sheetRow: 2, amount: 350 }, { sheetRow: 3, amount: 50 }], 400);
assert(affordableAdvance.deduction === 400 && affordableAdvance.sheetRows.join(',') === '2,3', 'Advance recovery must settle whole advances oldest-first within the available net amount');
for (let attempt = 0; attempt < 5; attempt += 1) {
  const failed = replyData(sandbox.adminConsoleLogin_({ username: 'ops-test', password: 'wrong-password' }));
  assert(!failed.ok, 'incorrect password must be rejected');
}
const throttled = replyData(sandbox.adminConsoleLogin_({ username: 'ops-test', password: 'temporary-test-password' }));
assert(!throttled.ok, 'repeated failures must throttle a correct password temporarily');
cache.clear();
const ownerDowngrade = replyData(sandbox.adminUpsertAdminUser_({
  adminToken: login.data.adminToken, username: 'ops-test', displayName: 'Operations Test', password: '', role: 'finance', active: true,
}));
assert(!ownerDowngrade.ok, 'the last active Owner must not be downgraded');
const createdFinance = replyData(sandbox.adminUpsertAdminUser_({
  adminToken: login.data.adminToken, username: 'finance-test', displayName: 'Finance Test', password: 'finance-pass-123', role: 'finance', active: true,
}));
assert(createdFinance.ok, 'Owner must be able to create a scoped Admin');
const financeLogin = replyData(sandbox.adminConsoleLogin_({ username: 'finance-test', password: 'finance-pass-123' }));
assert(financeLogin.ok && financeLogin.data.role === 'finance', 'Finance role must persist into its session');
assert(sandbox.requireRole_({ adminToken: financeLogin.data.adminToken }, ['owner', 'manager', 'finance']).role === 'finance', 'Finance role must pass finance permission');
const financeDashboard = replyData(sandbox.adminDashboard_({ adminToken: financeLogin.data.adminToken }));
assert(financeDashboard.ok && financeDashboard.data.capabilities.financial && !financeDashboard.data.capabilities.attendance, 'Finance Dashboard must receive only finance capability');
assert(!Object.hasOwn(financeDashboard.data, 'present') && !Object.hasOwn(financeDashboard.data, 'pendingApprovals'), 'Finance Dashboard must not receive attendance or approval counts');
let financeDenied = false;
try { sandbox.requireOwner_({ adminToken: financeLogin.data.adminToken }); } catch (_) { financeDenied = true; }
assert(financeDenied, 'Finance role must not pass owner-only permission');
let financeEmployeeDenied = false;
try { sandbox.adminListEmployees_({ adminToken: financeLogin.data.adminToken }); } catch (_) { financeEmployeeDenied = true; }
assert(financeEmployeeDenied, 'Finance role must not access employee operations through a hidden API route');
const changedFinance = replyData(sandbox.adminUpsertAdminUser_({
  adminToken: login.data.adminToken, username: 'finance-test', displayName: 'Finance Test', password: '', role: 'operations', active: true,
}));
assert(changedFinance.ok, 'Owner must be able to change an Admin role');
let changedSessionRejected = false;
try { sandbox.requireAdmin_({ adminToken: financeLogin.data.adminToken }); } catch (_) { changedSessionRejected = true; }
assert(changedSessionRejected, 'Admin role change must revoke the old session');
const operationsLogin = replyData(sandbox.adminConsoleLogin_({ username: 'finance-test', password: 'finance-pass-123' }));
assert(operationsLogin.ok && operationsLogin.data.role === 'operations', 'changed role must apply on the next login');
const operationsDashboard = replyData(sandbox.adminDashboard_({ adminToken: operationsLogin.data.adminToken }));
assert(operationsDashboard.ok && operationsDashboard.data.capabilities.attendance && !operationsDashboard.data.capabilities.financial, 'Operations Dashboard must receive only operations capability');
assert(!Object.hasOwn(operationsDashboard.data, 'overdueInvoices') && !Object.hasOwn(operationsDashboard.data, 'latestPayrollId'), 'Operations Dashboard must not receive invoice or payroll information');
let operationsPayrollDenied = false;
try { sandbox.adminOwnerOverview_({ adminToken: operationsLogin.data.adminToken }); } catch (_) { operationsPayrollDenied = true; }
assert(operationsPayrollDenied, 'Operations role must not receive financial owner overview');
let operationsHolidayDenied = false;
try { sandbox.adminListHolidays_({ adminToken: operationsLogin.data.adminToken }); } catch (_) { operationsHolidayDenied = true; }
assert(operationsHolidayDenied, 'Operations role must not alter payroll-impacting holiday configuration through a hidden API route');
const paidAdvance = replyData(sandbox.adminMarkAdvancePaid_({ adminToken: operationsLogin.data.adminToken, advanceId: 'ADV-9001' }));
assert(paidAdvance.ok && advances.rows[1][5] === 'paid', 'Approved advance must become paid inside the shared lock');
const doublePaidAdvance = replyData(sandbox.adminMarkAdvancePaid_({ adminToken: operationsLogin.data.adminToken, advanceId: 'ADV-9001' }));
assert(!doublePaidAdvance.ok && heldLocks === 0, 'A duplicate advance payment must be rejected and always release the shared lock');
const payrollBlock = source.slice(source.indexOf('function adminLockPayroll_'), source.indexOf('function adminListPayrolls_'));
assert(payrollBlock.indexOf('LockService.getScriptLock') < payrollBlock.indexOf('adminPreviewPayroll_'), 'Payroll lock must acquire its shared lock before generating the snapshot preview');
assert(replyData(sandbox.adminConsoleLogout_({ adminToken: login.data.adminToken })).ok, 'logout must succeed');
let rejected = false;
try { sandbox.requireAdmin_({ adminToken: login.data.adminToken }); } catch (_) { rejected = true; }
assert(rejected, 'revoked session must be rejected');

console.log('APPS_SCRIPT_CONTRACT_SMOKE=PASS');
