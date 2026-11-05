/**
 * BVN Package Operations API (Google Apps Script).
 * Deploy as the Sheet owner. This script is the only writer to the Sheet.
 * Required Script Properties: ADMIN_API_KEY and MOBILE_TOKEN_PEPPER.
 */
const SPREADSHEET_ID = 'IDKzV-19nTgG7rLB6Cbg29ml9cVECWOisFTEoZEWQEU';
const SHEETS = Object.freeze({
  sites: 'Work_Sites', employees: 'Employees', attendance: 'Attendance_Log',
  payroll: 'Payroll_Periods', payrollLines: 'Payroll_Lines', payrollRules: 'Payroll_Rules', invoices: 'Invoices', tokens: 'Mobile_Access', leaves: 'Leave_Requests', timeRequests: 'Time_Requests',
});
const ICT = 'Asia/Bangkok';
const MAX_ACCURACY_METRES = 100;

function doGet() {
  return reply_(true, 'BVN Package Operations API is online', { service: 'bvn-operations-api' });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = String(payload.action || 'attendance');
    if (action === 'attendance') return recordAttendance_(payload);
    if (action === 'dashboard') return adminDashboard_(payload);
    if (action === 'employee_timeline') return employeeTimeline_(payload);
    if (action === 'leave_request') return submitLeaveRequest_(payload);
    if (action === 'leave_calendar') return leaveCalendar_(payload);
    if (action === 'time_request') return submitTimeRequest_(payload);
    if (action === 'employee_time_requests') return employeeTimeRequests_(payload);
    if (action === 'employee_profile') return employeeProfile_(payload);
    if (action === 'employee_directory') return employeeDirectory_();
    if (action === 'employee_login') return employeeLogin_(payload);
    if (action === 'admin_list_employees') return adminListEmployees_(payload);
    if (action === 'admin_upsert_employee') return adminUpsertEmployee_(payload);
    if (action === 'admin_reset_employee_password') return adminResetEmployeePassword_(payload);
    if (action === 'admin_list_leave_requests') return adminListLeaveRequests_(payload);
    if (action === 'admin_review_leave') return adminReviewLeave_(payload);
    if (action === 'admin_list_time_requests') return adminListTimeRequests_(payload);
    if (action === 'admin_review_time_request') return adminReviewTimeRequest_(payload);
    if (action === 'admin_upsert_pay_rule') return adminUpsertPayRule_(payload);
    if (action === 'admin_preview_payroll') return adminPreviewPayroll_(payload);
    if (action === 'admin_lock_payroll') return adminLockPayroll_(payload);
    if (action === 'admin_list_payrolls') return adminListPayrolls_(payload);
    if (action === 'admin_get_payroll') return adminGetPayroll_(payload);
    if (action === 'admin_list_invoices') return adminListInvoices_(payload);
    if (action === 'admin_create_invoice') return adminCreateInvoice_(payload);
    if (action === 'admin_update_invoice_status') return adminUpdateInvoiceStatus_(payload);
    return reply_(false, 'Unsupported action');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return reply_(false, 'Request could not be processed');
  }
}

/** Run manually as the Sheet owner once before issuing a device token. */
function initializeMobileAccessSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.tokens);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.tokens);
    sheet.appendRow(['Token hash', 'Employee ID', 'Status', 'Issued at', 'Last used at', 'Device label']);
    sheet.setFrozenRows(1);
  }
}

/** Run once as owner. The location policy is controlled only by Admin. */
function initializeEmployeesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.employees);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.employees);
    sheet.appendRow(['Employee ID', 'Name', 'Role', 'Department', 'Work site ID', 'Status', 'Location required', 'Password hash']);
    sheet.setFrozenRows(1);
    return;
  }
  const requiredHeaders = ['Employee ID', 'Name', 'Role', 'Department', 'Work site ID', 'Status', 'Location required', 'Password hash'];
  let headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  requiredHeaders.forEach(header => {
    if (!headers.some(value => normalise_(value) === normalise_(header))) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers = headers.concat([header]);
    }
  });
}

/** Run once as owner. One active rule per employee; changes are audit-relevant. */
function initializePayrollRulesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.payrollRules);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.payrollRules);
    sheet.appendRow(['Employee ID', 'Pay basis', 'Base rate', 'Standard hours/day', 'OT enabled', 'OT multiplier', 'Premium date', 'Premium multiplier', 'Updated at', 'Updated by']);
    sheet.setFrozenRows(1);
  }
}

/** Creates auditable gross-pay preview storage. This is not a tax, SSO or payment ledger. */
function initializePayrollSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let periods = ss.getSheetByName(SHEETS.payroll);
  if (!periods) { periods = ss.insertSheet(SHEETS.payroll); periods.appendRow(['Payroll ID', 'Start date', 'End date', 'Status', 'Locked at', 'Locked by']); periods.setFrozenRows(1); }
  let lines = ss.getSheetByName(SHEETS.payrollLines);
  if (!lines) { lines = ss.insertSheet(SHEETS.payrollLines); lines.appendRow(['Payroll ID', 'Employee ID', 'Regular minutes', 'OT minutes', 'Base gross', 'OT gross', 'Gross pay', 'Created at']); lines.setFrozenRows(1); }
}

function initializeInvoicesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.invoices);
  if (!sheet) { sheet = ss.insertSheet(SHEETS.invoices); sheet.appendRow(['Invoice no', 'Customer', 'Description', 'Subtotal', 'VAT', 'Due date', 'Total', 'Status', 'Created at', 'Updated at', 'Payment reference', 'Paid at']); sheet.setFrozenRows(1); return; }
  const headers = values_(sheet)[0];
  ['Payment reference', 'Paid at'].forEach(header => { if (!headers.some(value => normalise_(value) === normalise_(header))) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); });
}

/** Run manually as owner once. Creates the append-only leave-request register. */
function initializeLeaveRequestsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.leaves);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.leaves);
    sheet.appendRow(['Request ID', 'Employee ID', 'Leave type', 'Start date', 'End date', 'Reason', 'Status', 'Submitted at', 'Reviewed by', 'Reviewed at']);
    sheet.setFrozenRows(1);
  }
}

/** Run once as owner. Holds OT and attendance-correction requests separately from raw attendance. */
function initializeTimeRequestsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.timeRequests);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.timeRequests);
    sheet.appendRow(['Request ID', 'Employee ID', 'Request type', 'Work date', 'Requested minutes', 'Reason', 'Status', 'Submitted at', 'Reviewed by', 'Reviewed at', 'Reviewer note']);
    sheet.setFrozenRows(1);
  }
}

/** Run manually as owner. The raw token is returned once and never stored. */
function issueMobileToken(employeeId, deviceLabel) {
  const employee = findEmployee_(String(employeeId));
  if (!employee || employee.status !== 'active') throw new Error('Employee is not active');
  initializeMobileAccessSheet();
  const rawToken = Utilities.getUuid() + Utilities.getUuid();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.tokens);
  sheet.appendRow([hashMobileToken_(rawToken), employee.id, 'active', new Date(), '', String(deviceLabel || '')]);
  return rawToken;
}

function recordAttendance_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  const employee = findEmployee_(employeeId);
  if (!employee || employee.status !== 'active') return reply_(false, 'Employee is not active');
  const eventType = String(payload.eventType || '');
  if (eventType !== 'check_in' && eventType !== 'check_out') return reply_(false, 'Invalid attendance event');
  const site = findSite_(String(payload.siteId || employee.siteId || ''));
  const latitude = finiteNumber_(payload.latitude), longitude = finiteNumber_(payload.longitude), accuracy = finiteNumber_(payload.accuracy);
  if (employee.locationRequired && (!site || site.id !== employee.siteId)) return reply_(false, 'Work site is not assigned to this employee');
  if (employee.locationRequired && (latitude === null || longitude === null || accuracy === null || accuracy < 0)) return reply_(false, 'Valid GPS location is required for this employee');
  const distance = employee.locationRequired ? metres_(latitude, longitude, site.lat, site.lng) : null;
  const accepted = employee.locationRequired ? accuracy <= MAX_ACCURACY_METRES && distance <= site.radius : true;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const log = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance);
    const todayState = attendanceStateForToday_(log, employee.id, new Date());
    if (eventType === 'check_in' && todayState.checkedIn) return reply_(false, 'วันนี้คุณบันทึกเข้างานแล้ว', todayState);
    if (eventType === 'check_out' && !todayState.checkedIn) return reply_(false, 'ต้องบันทึกเข้างานก่อนจึงจะบันทึกออกงานได้', todayState);
    if (eventType === 'check_out' && todayState.checkedOut) return reply_(false, 'วันนี้คุณบันทึกออกงานแล้ว', todayState);
    log.appendRow([Utilities.getUuid(), employee.id, site ? site.id : employee.siteId, eventType, new Date(), latitude === null ? '' : latitude, longitude === null ? '' : longitude, accuracy === null ? '' : accuracy, distance === null ? '' : Math.round(distance * 100) / 100, accepted ? 'accepted' : 'rejected', String(payload.deviceTimezone || ''), employee.locationRequired ? 'mobile_api_location' : 'mobile_api_no_location', accepted ? 'pending' : 'rejected', new Date()]);
    touchMobileToken_(payload.mobileToken);
  } finally { lock.releaseLock(); }
  return reply_(accepted, accepted ? 'Attendance recorded' : 'Outside permitted radius or GPS accuracy is too low', { decision: accepted ? 'accepted' : 'rejected', locationRequired: employee.locationRequired, distanceMetres: distance === null ? null : Math.round(distance), allowedRadiusMetres: site ? site.radius : null });
}

function adminDashboard_(payload) {
  if (!constantTimeEqual_(String(payload.adminToken || ''), requiredProperty_('ADMIN_API_KEY'))) return reply_(false, 'Administrator authentication failed');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const employees = values_(ss.getSheetByName(SHEETS.employees));
  const logs = values_(ss.getSheetByName(SHEETS.attendance));
  const invoices = valuesIfSheet_(ss.getSheetByName(SHEETS.invoices));
  const leaves = valuesIfSheet_(ss.getSheetByName(SHEETS.leaves));
  const timeRequests = valuesIfSheet_(ss.getSheetByName(SHEETS.timeRequests));
  const payrolls = valuesIfSheet_(ss.getSheetByName(SHEETS.payroll));
  const today = Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd');
  const activeIds = new Set(employees.slice(1).filter(r => normalise_(r[5]) === 'active').map(r => String(r[0])));
  const presentIds = new Set(logs.slice(1).filter(r => String(r[9]) === 'accepted' && String(r[3]) === 'check_in' && Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd') === today).map(r => String(r[1])));
  const exceptions = logs.slice(1).filter(r => String(r[9]) !== 'accepted' || String(r[12]) === 'pending').length;
  const overdue = invoices.slice(1).filter(r => normalise_(r[7]) === 'issued' && Utilities.formatDate(new Date(r[5]), ICT, 'yyyy-MM-dd') < today).reduce((sum, r) => sum + Number(r[6] || 0), 0);
  const pendingLeaves = leaves.slice(1).filter(r => normalise_(r[6]) === 'pending').length;
  const pendingTimeRequests = timeRequests.slice(1).filter(r => normalise_(r[6]) === 'pending').length;
  const latestPayroll = payrolls.length > 1 ? payrolls[payrolls.length - 1] : null;
  return reply_(true, 'Dashboard loaded', { asOf: Utilities.formatDate(new Date(), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX"), present: [...presentIds].filter(id => activeIds.has(id)).length, totalEmployees: activeIds.size, exceptions: exceptions, pendingApprovals: pendingLeaves + pendingTimeRequests, overdueInvoices: overdue, latestPayrollId: latestPayroll ? String(latestPayroll[0]) : '', latestPayrollStatus: latestPayroll ? String(latestPayroll[3]) : '' });
}

function employeeTimeline_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  const logs = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance)).slice(1)
    .filter(r => String(r[1]) === employeeId).slice(-90).reverse()
    .map(r => ({ eventType: String(r[3]), occurredAt: Utilities.formatDate(new Date(r[4]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX"), status: String(r[9]), approval: String(r[12] || '') }));
  return reply_(true, 'Employee timeline loaded', { employeeId: employeeId, attendance: logs });
}

/** Accepted check-in/out state for one employee in the Bangkok business date. */
function attendanceStateForToday_(sheet, employeeId, now) {
  const today = Utilities.formatDate(now, ICT, 'yyyy-MM-dd');
  const rows = values_(sheet).slice(1).filter(row => String(row[1]) === employeeId && String(row[9]) === 'accepted' && Utilities.formatDate(new Date(row[4]), ICT, 'yyyy-MM-dd') === today);
  return { date: today, checkedIn: rows.some(row => String(row[3]) === 'check_in'), checkedOut: rows.some(row => String(row[3]) === 'check_out') };
}

function employeeProfile_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  const employee = findEmployee_(employeeId);
  if (!employee) return reply_(false, 'Mobile authentication failed');
  return reply_(true, 'Employee profile loaded', { employeeId: employee.id, name: employee.name, role: employee.role, siteId: employee.siteId, locationRequired: employee.locationRequired });
}

function employeeDirectory_() {
  const source = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees)), columns = employeeColumns_(source[0]);
  return reply_(true, 'Employee directory loaded', { employees: source.slice(1).map(row => employeeFromRow_(row, columns)).filter(e => e && e.status === 'active').map(e => ({ employeeId: e.id, name: e.name, role: e.role })) });
}

function employeeLogin_(payload) {
  const employee = findEmployee_(String(payload.employeeId || '').trim().toUpperCase());
  const password = String(payload.password || '');
  if (!employee || employee.status !== 'active' || !employee.passwordHash || !constantTimeEqual_(employee.passwordHash, hashEmployeePassword_(password))) return reply_(false, 'ชื่อพนักงานหรือรหัสผ่านไม่ถูกต้อง');
  revokeEmployeeTokens_(employee.id);
  const token = issueMobileToken(employee.id, String(payload.deviceLabel || 'Mobile login'));
  return reply_(true, 'Login successful', { employeeId: employee.id, mobileToken: token, name: employee.name });
}

function adminListEmployees_(payload) {
  requireAdmin_(payload);
  const source = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees)), columns = employeeColumns_(source[0]);
  return reply_(true, 'Employees loaded', { employees: source.slice(1).map(row => employeeFromRow_(row, columns)).filter(Boolean) });
}

function adminUpsertEmployee_(payload) {
  requireAdmin_(payload); initializeEmployeesSheet();
  const requestedId = String(payload.employeeId || '').trim().toUpperCase(), name = String(payload.name || '').trim(), role = String(payload.role || '').trim(), siteId = String(payload.siteId || '').trim();
  const status = normalise_(payload.status || 'active') === 'inactive' ? 'inactive' : 'active';
  const locationRequired = payload.locationRequired === false ? 'false' : 'true';
  if (!name || !siteId) return reply_(false, 'Name and work site are required');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees), rows = values_(sheet), columns = employeeColumns_(rows[0]);
  const id = requestedId || nextEmployeeId_(rows);
  const rowIndex = rows.slice(1).findIndex(r => String(r[columns.id]).trim().toUpperCase() === id);
  const needsPassword = rowIndex < 0 || !String(rows[rowIndex + 1][columns.passwordHash] || '');
  const initialPassword = needsPassword ? temporaryPassword_() : String(rows[rowIndex + 1][columns.passwordHash] || '');
  const values = rowIndex < 0 ? Array(rows[0].length).fill('') : rows[rowIndex + 1].slice();
  values[columns.id] = id; values[columns.name] = name; values[columns.role] = role || 'Employee'; values[columns.department] = String(payload.department || ''); values[columns.siteId] = siteId; values[columns.status] = status; values[columns.locationRequired] = locationRequired; values[columns.passwordHash] = needsPassword ? hashEmployeePassword_(initialPassword) : initialPassword;
  if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, values.length).setValues([values]); else sheet.appendRow(values);
  return reply_(true, 'Employee saved', { employee: employeeFromRow_(values, columns), initialPassword: needsPassword ? initialPassword : null });
}

function adminResetEmployeePassword_(payload) {
  requireAdmin_(payload); const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees), rows = values_(sheet), columns = employeeColumns_(rows[0]), index = rows.slice(1).findIndex(r => String(r[columns.id]).trim().toUpperCase() === employeeId);
  if (index < 0) return reply_(false, 'Employee was not found');
  revokeEmployeeTokens_(employeeId);
  const password = temporaryPassword_(); sheet.getRange(index + 2, columns.passwordHash + 1).setValue(hashEmployeePassword_(password));
  return reply_(true, 'Temporary password reset', { employeeId: employeeId, temporaryPassword: password });
}

function adminReviewLeave_(payload) {
  requireAdmin_(payload); initializeLeaveRequestsSheet();
  const requestId = String(payload.requestId || ''), decision = normalise_(payload.decision), reviewer = String(payload.reviewer || 'Admin').trim();
  if (!requestId || !['approved', 'rejected'].includes(decision)) return reply_(false, 'Invalid leave decision');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves), rows = values_(sheet);
  const index = rows.slice(1).findIndex(r => String(r[0]) === requestId && normalise_(r[6]) === 'pending');
  if (index < 0) return reply_(false, 'Pending leave request was not found');
  sheet.getRange(index + 2, 7, 1, 3).setValues([[decision, reviewer, new Date()]]);
  return reply_(true, 'Leave request ' + decision);
}

function adminListLeaveRequests_(payload) {
  requireAdmin_(payload); initializeLeaveRequestsSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves)).slice(1);
  const requests = rows.map(r => ({ requestId: String(r[0]), employeeId: String(r[1]), leaveType: String(r[2]), startDate: Utilities.formatDate(new Date(r[3]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd'), reason: String(r[5]), status: String(r[6]), submittedAt: Utilities.formatDate(new Date(r[7]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") })).filter(r => r.requestId);
  return reply_(true, 'Leave requests loaded', { requests: requests });
}

function adminUpsertPayRule_(payload) {
  requireAdmin_(payload); initializePayrollRulesSheet();
  const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const basis = normalise_(payload.payBasis);
  const rate = finiteNumber_(payload.baseRate), hours = finiteNumber_(payload.standardHours || 8), otMultiplier = finiteNumber_(payload.otMultiplier || 1.5), premiumMultiplier = finiteNumber_(payload.premiumMultiplier || 1);
  const premiumDate = String(payload.premiumDate || '').trim();
  if (!findEmployee_(employeeId) || !['hourly', 'daily'].includes(basis) || rate === null || rate < 0 || hours === null || hours <= 0 || otMultiplier === null || otMultiplier < 1 || premiumMultiplier === null || premiumMultiplier < 1) return reply_(false, 'Invalid pay rule');
  if (premiumDate && !parseIsoDate_(premiumDate)) return reply_(false, 'Premium date must be YYYY-MM-DD');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollRules), rows = values_(sheet);
  const row = [employeeId, basis, rate, hours, payload.otEnabled === true ? 'true' : 'false', otMultiplier, premiumDate, premiumMultiplier, new Date(), String(payload.updatedBy || 'Admin')];
  const index = rows.slice(1).findIndex(r => String(r[0]).trim().toUpperCase() === employeeId);
  if (index >= 0) sheet.getRange(index + 2, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return reply_(true, 'Pay rule saved', { employeeId: employeeId, payBasis: basis, baseRate: rate });
}

function adminPreviewPayroll_(payload) {
  requireAdmin_(payload); initializePayrollRulesSheet(); initializePayrollSheets(); initializeTimeRequestsSheet();
  const start = parseIsoDate_(payload.startDate), end = parseIsoDate_(payload.endDate);
  if (!start || !end || end < start) return reply_(false, 'Invalid payroll period');
  const startText = Utilities.formatDate(start, ICT, 'yyyy-MM-dd'), endText = Utilities.formatDate(end, ICT, 'yyyy-MM-dd');
  const rules = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollRules)).slice(1).reduce((map, row) => { map[String(row[0])] = row; return map; }, {});
  const logs = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance)).slice(1).filter(row => String(row[9]) === 'accepted');
  const approvedOt = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests)).slice(1).filter(row => String(row[2]) === 'overtime' && normalise_(row[6]) === 'approved');
  const byEmployeeDay = {};
  logs.forEach(row => { const day = Utilities.formatDate(new Date(row[4]), ICT, 'yyyy-MM-dd'); if (day < startText || day > endText) return; const key = String(row[1]) + '|' + day; const item = byEmployeeDay[key] || { employeeId: String(row[1]), day: day, in: null, out: null }; if (String(row[3]) === 'check_in') item.in = item.in || new Date(row[4]); if (String(row[3]) === 'check_out') item.out = new Date(row[4]); byEmployeeDay[key] = item; });
  const result = {};
  Object.values(byEmployeeDay).forEach(item => { if (!item.in || !item.out || item.out <= item.in || !rules[item.employeeId]) return; const line = result[item.employeeId] || { employeeId: item.employeeId, regularMinutes: 0, workDays: 0, otMinutes: 0, baseGross: 0, otGross: 0, grossPay: 0, warnings: [] }; const rule = rules[item.employeeId], basis = normalise_(rule[1]), rate = Number(rule[2] || 0), standardMinutes = Number(rule[3] || 8) * 60; const minutes = Math.round((item.out - item.in) / 60000); line.workDays += 1; line.regularMinutes += Math.min(minutes, standardMinutes); if (basis === 'daily') line.baseGross += rate; else line.baseGross += Math.min(minutes, standardMinutes) / 60 * rate; result[item.employeeId] = line; });
  approvedOt.forEach(row => { const day = Utilities.formatDate(new Date(row[3]), ICT, 'yyyy-MM-dd'), employeeId = String(row[1]); if (day < startText || day > endText || !rules[employeeId]) return; const line = result[employeeId] || { employeeId: employeeId, regularMinutes: 0, workDays: 0, otMinutes: 0, baseGross: 0, otGross: 0, grossPay: 0, warnings: ['Approved OT has no accepted complete attendance day'] }; const rule = rules[employeeId], baseHourly = normalise_(rule[1]) === 'daily' ? Number(rule[2] || 0) / Number(rule[3] || 8) : Number(rule[2] || 0), multiplier = String(rule[4]) === 'true' ? Number(rule[5] || 1.5) : 0, minutes = Number(row[4] || 0); line.otMinutes += minutes; line.otGross += minutes / 60 * baseHourly * multiplier; result[employeeId] = line; });
  const lines = Object.values(result).map(line => ({ ...line, baseGross: roundMoney_(line.baseGross), otGross: roundMoney_(line.otGross), grossPay: roundMoney_(line.baseGross + line.otGross) }));
  return reply_(true, 'Gross-pay preview loaded', { startDate: startText, endDate: endText, status: 'preview', disclaimer: 'Gross-pay preview only. Tax, SSO, withholding and payment are excluded.', lines: lines, totalGross: roundMoney_(lines.reduce((sum, line) => sum + line.grossPay, 0)) });
}

function adminLockPayroll_(payload) {
  requireAdmin_(payload); initializePayrollSheets();
  const preview = adminPreviewPayroll_(payload); const body = JSON.parse(preview.getContent());
  if (!body.ok) return preview;
  const data = body.data, payrollId = 'PAY-' + data.startDate.replace(/-/g, '') + '-' + data.endDate.replace(/-/g, '');
  const periods = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payroll), existing = values_(periods).slice(1).find(row => String(row[0]) === payrollId);
  if (existing) return reply_(false, 'Payroll period is already locked');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { periods.appendRow([payrollId, data.startDate, data.endDate, 'locked', new Date(), String(payload.lockedBy || 'Admin')]); const lines = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollLines); data.lines.forEach(line => lines.appendRow([payrollId, line.employeeId, line.regularMinutes, line.otMinutes, line.baseGross, line.otGross, line.grossPay, new Date()])); } finally { lock.releaseLock(); }
  return reply_(true, 'Payroll period locked', { payrollId: payrollId, totalGross: data.totalGross });
}

function adminListPayrolls_(payload) {
  requireAdmin_(payload); initializePayrollSheets();
  const periods = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payroll)).slice(1)
    .map(row => ({ payrollId: String(row[0]), startDate: Utilities.formatDate(new Date(row[1]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(row[2]), ICT, 'yyyy-MM-dd'), status: String(row[3]), lockedAt: row[4] ? Utilities.formatDate(new Date(row[4]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', lockedBy: String(row[5] || '') }))
    .filter(period => period.payrollId).reverse();
  return reply_(true, 'Payroll periods loaded', { periods: periods });
}

function adminGetPayroll_(payload) {
  requireAdmin_(payload); initializePayrollSheets();
  const payrollId = String(payload.payrollId || '').trim();
  if (!payrollId) return reply_(false, 'Payroll ID is required');
  const period = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payroll)).slice(1).find(row => String(row[0]) === payrollId);
  if (!period) return reply_(false, 'Payroll period not found');
  const lines = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollLines)).slice(1).filter(row => String(row[0]) === payrollId)
    .map(row => ({ employeeId: String(row[1]), regularMinutes: Number(row[2] || 0), otMinutes: Number(row[3] || 0), baseGross: Number(row[4] || 0), otGross: Number(row[5] || 0), grossPay: Number(row[6] || 0) }));
  return reply_(true, 'Payroll snapshot loaded', { payrollId: payrollId, startDate: Utilities.formatDate(new Date(period[1]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(period[2]), ICT, 'yyyy-MM-dd'), status: String(period[3]), lines: lines, totalGross: roundMoney_(lines.reduce((sum, line) => sum + line.grossPay, 0)) });
}

function adminListInvoices_(payload) {
  requireAdmin_(payload); initializeInvoicesSheet();
  const today = Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd');
  const invoices = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.invoices)).slice(1).map((row, index) => invoiceFromRow_(row, index + 2, today)).filter(invoice => invoice.invoiceNo);
  return reply_(true, 'Invoices loaded', { invoices: invoices });
}

function adminCreateInvoice_(payload) {
  requireAdmin_(payload); initializeInvoicesSheet();
  const customer = String(payload.customer || '').trim(), description = String(payload.description || '').trim(), subtotal = finiteNumber_(payload.subtotal), due = parseIsoDate_(payload.dueDate);
  if (!customer || !description || subtotal === null || subtotal < 0 || !due) return reply_(false, 'Invalid invoice');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.invoices), rows = values_(sheet), month = Utilities.formatDate(new Date(), ICT, 'yyyyMM');
    const serial = rows.slice(1).filter(row => String(row[0]).indexOf('INV-' + month + '-') === 0).length + 1;
    const invoiceNo = 'INV-' + month + '-' + String(serial).padStart(3, '0'), vat = roundMoney_(subtotal * 0.07), total = roundMoney_(subtotal + vat);
    sheet.appendRow([invoiceNo, customer, description, roundMoney_(subtotal), vat, due, total, 'draft', new Date(), new Date()]);
    return reply_(true, 'Invoice created', { invoice: invoiceFromRow_([invoiceNo, customer, description, subtotal, vat, due, total, 'draft', new Date(), new Date()], sheet.getLastRow(), Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd')) });
  } finally { lock.releaseLock(); }
}

function adminUpdateInvoiceStatus_(payload) {
  requireAdmin_(payload); initializeInvoicesSheet();
  const invoiceNo = String(payload.invoiceNo || '').trim(), status = normalise_(payload.status);
  if (!invoiceNo || !['draft', 'issued', 'paid', 'void'].includes(status)) return reply_(false, 'Invalid invoice status');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.invoices), rows = values_(sheet), index = rows.slice(1).findIndex(row => String(row[0]) === invoiceNo);
  if (index < 0) return reply_(false, 'Invoice not found');
  const current = normalise_(rows[index + 1][7]), allowed = { draft: ['issued', 'void'], issued: ['paid', 'void'] };
  if (!(allowed[current] || []).includes(status)) return reply_(false, 'Invoice status transition is not allowed');
  const paymentReference = String(payload.paymentReference || '').trim();
  if (status === 'paid' && !paymentReference) return reply_(false, 'Payment reference is required when marking paid');
  sheet.getRange(index + 2, 8, 1, 5).setValues([[status, rows[index + 1][8], new Date(), status === 'paid' ? paymentReference : rows[index + 1][10], status === 'paid' ? new Date() : rows[index + 1][11]]]);
  return reply_(true, 'Invoice status updated');
}

function invoiceFromRow_(row, rowIndex, today) {
  const dueDate = Utilities.formatDate(new Date(row[5]), ICT, 'yyyy-MM-dd');
  const status = normalise_(row[7]) === 'issued' && dueDate < today ? 'overdue' : normalise_(row[7]);
  return { rowIndex: rowIndex, invoiceNo: String(row[0]), customer: String(row[1]), description: String(row[2]), subtotal: Number(row[3] || 0), vat: Number(row[4] || 0), dueDate: dueDate, total: Number(row[6] || 0), status: status, paymentReference: String(row[10] || ''), paidAt: row[11] ? Utilities.formatDate(new Date(row[11]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '' };
}

function submitLeaveRequest_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  const leaveType = String(payload.leaveType || '').trim();
  const reason = String(payload.reason || '').trim();
  const start = parseIsoDate_(payload.startDate), end = parseIsoDate_(payload.endDate);
  if (!leaveType || !reason || !start || !end || end < start) return reply_(false, 'Invalid leave request');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    initializeLeaveRequestsSheet();
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves).appendRow([Utilities.getUuid(), employeeId, leaveType, start, end, reason, 'pending', new Date(), '', '']);
    touchMobileToken_(payload.mobileToken);
  } finally { lock.releaseLock(); }
  return reply_(true, 'Leave request submitted', { status: 'pending' });
}

function leaveCalendar_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  initializeLeaveRequestsSheet();
  const requests = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves)).slice(1)
    .filter(r => String(r[1]) === employeeId)
    .map(r => ({ requestId: String(r[0]), leaveType: String(r[2]), startDate: Utilities.formatDate(new Date(r[3]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd'), status: String(r[6]) }));
  return reply_(true, 'Leave calendar loaded', { employeeId: employeeId, requests: requests });
}

function submitTimeRequest_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  const requestType = normalise_(payload.requestType);
  const workDate = parseIsoDate_(payload.workDate);
  const requestedMinutes = finiteNumber_(payload.requestedMinutes);
  const reason = String(payload.reason || '').trim();
  if (!['overtime', 'attendance_correction'].includes(requestType) || !workDate || !reason || requestedMinutes === null || requestedMinutes <= 0 || requestedMinutes > 1440) return reply_(false, 'Invalid time request');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    initializeTimeRequestsSheet();
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests).appendRow([Utilities.getUuid(), employeeId, requestType, workDate, Math.round(requestedMinutes), reason, 'pending', new Date(), '', '', '']);
    touchMobileToken_(payload.mobileToken);
  } finally { lock.releaseLock(); }
  return reply_(true, 'Time request submitted', { status: 'pending', requestType: requestType });
}

function employeeTimeRequests_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  initializeTimeRequestsSheet();
  const requests = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests)).slice(1)
    .filter(row => String(row[1]) === employeeId)
    .map(row => timeRequestFromRow_(row));
  return reply_(true, 'Time requests loaded', { employeeId: employeeId, requests: requests });
}

function adminListTimeRequests_(payload) {
  requireAdmin_(payload); initializeTimeRequestsSheet();
  const requests = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests)).slice(1)
    .map(row => timeRequestFromRow_(row)).filter(request => request.requestId);
  return reply_(true, 'Time requests loaded', { requests: requests });
}

function adminReviewTimeRequest_(payload) {
  requireAdmin_(payload); initializeTimeRequestsSheet();
  const requestId = String(payload.requestId || '').trim(), decision = normalise_(payload.decision);
  const reviewer = String(payload.reviewer || 'Admin').trim(), note = String(payload.reviewerNote || '').trim();
  if (!requestId || !['approved', 'rejected'].includes(decision)) return reply_(false, 'Invalid time request decision');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests), rows = values_(sheet);
  const index = rows.slice(1).findIndex(row => String(row[0]) === requestId && normalise_(row[6]) === 'pending');
  if (index < 0) return reply_(false, 'Pending time request was not found');
  sheet.getRange(index + 2, 7, 1, 5).setValues([[decision, rows[index + 1][7], reviewer, new Date(), note]]);
  return reply_(true, 'Time request ' + decision);
}

function timeRequestFromRow_(row) {
  return { requestId: String(row[0]), employeeId: String(row[1]), requestType: String(row[2]), workDate: Utilities.formatDate(new Date(row[3]), ICT, 'yyyy-MM-dd'), requestedMinutes: Number(row[4] || 0), reason: String(row[5]), status: String(row[6]), submittedAt: row[7] ? Utilities.formatDate(new Date(row[7]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', reviewer: String(row[8] || ''), reviewedAt: row[9] ? Utilities.formatDate(new Date(row[9]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', reviewerNote: String(row[10] || '') };
}

function authenticateMobile_(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.tokens);
  if (!sheet) return '';
  const target = hashMobileToken_(rawToken);
  const row = values_(sheet).slice(1).find(r => constantTimeEqual_(String(r[0]), target) && normalise_(r[2]) === 'active');
  return row ? String(row[1]) : '';
}
function touchMobileToken_(rawToken) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.tokens), target = hashMobileToken_(rawToken), rows = values_(sheet);
  const index = rows.slice(1).findIndex(r => constantTimeEqual_(String(r[0]), target));
  if (index >= 0) sheet.getRange(index + 2, 5).setValue(new Date());
}
function revokeEmployeeTokens_(employeeId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.tokens);
  if (!sheet) return;
  const rows = values_(sheet);
  rows.slice(1).forEach((row, index) => {
    if (String(row[1]) === employeeId && normalise_(row[2]) === 'active') sheet.getRange(index + 2, 3).setValue('revoked');
  });
}
function findEmployee_(employeeId) {
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees)), columns = employeeColumns_(rows[0]);
  const row = rows.slice(1).find(r => String(r[columns.id]) === employeeId);
  return employeeFromRow_(row, columns);
}
function employeeColumns_(headers) {
  const position = (name) => headers.findIndex(h => normalise_(h) === name);
  const columns = { id: position('employee id'), name: position('name'), role: position('role'), department: position('department'), siteId: position('work site id'), status: position('status'), locationRequired: position('location required'), passwordHash: position('password hash') };
  if (Object.values(columns).some(index => index < 0)) throw new Error('Employees sheet headers are incomplete. Run initializeEmployeesSheet.');
  return columns;
}
function employeeFromRow_(row, columns) { const c = columns || { id: 0, name: 1, role: 2, siteId: 4, status: 5, locationRequired: 6, passwordHash: 7 }; if (!row) return null; const locRaw = row[c.locationRequired]; const locationRequired = !(locRaw === false || String(locRaw).trim().toLowerCase() === 'false'); return { id: String(row[c.id]), name: String(row[c.name] || ''), role: String(row[c.role] || ''), siteId: String(row[c.siteId] || ''), status: normalise_(row[c.status]), locationRequired: locationRequired, passwordHash: String(row[c.passwordHash] || '') }; }
function findSite_(siteId) {
  const row = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.sites)).slice(1).find(r => String(r[0]) === siteId && normalise_(r[5]) === 'true');
  return row ? { id: String(row[0]), lat: Number(row[2]), lng: Number(row[3]), radius: Number(row[4]) } : null;
}
function parsePayload_(e) { if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 20000) throw new Error('Invalid request body'); const payload = JSON.parse(e.postData.contents); if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid JSON object'); return payload; }
function values_(sheet) { if (!sheet) throw new Error('Required spreadsheet tab is missing'); return sheet.getDataRange().getValues(); }
function valuesIfSheet_(sheet) { return sheet ? sheet.getDataRange().getValues() : [[]]; }
function requiredProperty_(key) { const value = PropertiesService.getScriptProperties().getProperty(key); if (!value) throw new Error('Missing Script Property: ' + key); return value; }
function requireAdmin_(payload) { if (!constantTimeEqual_(String(payload.adminToken || ''), requiredProperty_('ADMIN_API_KEY'))) throw new Error('Administrator authentication failed'); }
function hashMobileToken_(rawToken) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(rawToken), requiredProperty_('MOBILE_TOKEN_PEPPER'))); }
function hashEmployeePassword_(password) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('password:' + String(password), requiredProperty_('MOBILE_TOKEN_PEPPER'))); }
function temporaryPassword_() { return String(Math.floor(10000000 + Math.random() * 90000000)); }
function nextEmployeeId_(rows) { const idColumn = employeeColumns_(rows[0]).id; const numbers = rows.slice(1).map(r => /^EMP-(\d+)$/.exec(String(r[idColumn] || ''))).filter(Boolean).map(m => Number(m[1])); return 'EMP-' + String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0'); }
function finiteNumber_(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function roundMoney_(value) { return Math.round(Number(value || 0) * 100) / 100; }
function parseIsoDate_(value) { const text = String(value || ''); const parts = text.split('-'); if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2 || parts.some(p => isNaN(Number(p)))) return null; const date = new Date(text + 'T00:00:00+07:00'); return isNaN(date.getTime()) ? null : date; }
function normalise_(value) { return String(value || '').trim().toLowerCase(); }
function constantTimeEqual_(a, b) { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
function metres_(a, b, c, d) { const r = 6371e3, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180, q = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)); }
function reply_(ok, message, data) { return ContentService.createTextOutput(JSON.stringify({ ok: ok, message: message, data: data || null })).setMimeType(ContentService.MimeType.JSON); }
