/**
 * BVN Package Operations API (Google Apps Script).
 * Deploy as the Sheet owner. This script is the only writer to the Sheet.
 * Required Script Properties: ADMIN_API_KEY and MOBILE_TOKEN_PEPPER.
 */
const SPREADSHEET_ID = '1-deVDtN8sZQmDyXTH7cR2TtmXgmm4RHOkONRk-HFdT4';
const SHEETS = Object.freeze({
  sites: 'Work_Sites', employees: 'Employees', attendance: 'Attendance_Log',
  payroll: 'Payroll_Periods', payrollLines: 'Payroll_Lines', payrollRules: 'Payroll_Rules', invoices: 'Invoices', tokens: 'Mobile_Access', leaves: 'Leave_Requests', timeRequests: 'Time_Requests',
  settings: 'Settings', advances: 'Advances', pwRequests: 'Password_Requests', adminUsers: 'Admin_Users', adminSessions: 'Admin_Sessions', audit: 'Audit_Log', holidays: 'Holidays',
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
    if (action === 'sites') return employeeSites_(payload);
    if (action === 'employee_month') return employeeMonth_(payload);
    if (action === 'admin_list_holidays') return adminListHolidays_(payload);
    if (action === 'admin_save_holiday') return adminSaveHoliday_(payload);
    if (action === 'admin_delete_holiday') return adminDeleteHoliday_(payload);
    if (action === 'admin_import_holidays') return adminImportHolidays_(payload);
    if (action === 'employee_directory') return employeeDirectory_();
    if (action === 'employee_login') return employeeLogin_(payload);
    if (action === 'admin_list_employees') return adminListEmployees_(payload);
    if (action === 'admin_upsert_employee') return adminUpsertEmployee_(payload);
    if (action === 'admin_reset_employee_password') return adminResetEmployeePassword_(payload);
    if (action === 'admin_list_leave_requests') return adminListLeaveRequests_(payload);
    if (action === 'admin_review_leave') return adminReviewLeave_(payload);
    if (action === 'admin_list_time_requests') return adminListTimeRequests_(payload);
    if (action === 'admin_review_time_request') return adminReviewTimeRequest_(payload);
    if (action === 'admin_add_overtime') return adminAddOvertime_(payload);
    if (action === 'admin_console_login') return adminConsoleLogin_(payload);
    if (action === 'admin_console_logout') return adminConsoleLogout_(payload);
    if (action === 'admin_list_admin_users') return adminListAdminUsers_(payload);
    if (action === 'admin_upsert_admin_user') return adminUpsertAdminUser_(payload);
    if (action === 'admin_delete_admin_user') return adminDeleteAdminUser_(payload);
    if (action === 'admin_list_audit_log') return adminListAuditLog_(payload);
    if (action === 'admin_leave_usage') return adminLeaveUsage_(payload);
    if (action === 'admin_void_attendance_day') return adminVoidAttendanceDay_(payload);
    if (action === 'admin_upsert_pay_rule') return adminUpsertPayRule_(payload);
    if (action === 'admin_list_pay_rules') return adminListPayRules_(payload);
    if (action === 'admin_preview_payroll') return adminPreviewPayroll_(payload);
    if (action === 'admin_lock_payroll') return adminLockPayroll_(payload);
    if (action === 'admin_list_payrolls') return adminListPayrolls_(payload);
    if (action === 'admin_get_payroll') return adminGetPayroll_(payload);
    if (action === 'admin_list_invoices') return adminListInvoices_(payload);
    if (action === 'admin_create_invoice') return adminCreateInvoice_(payload);
    if (action === 'admin_update_invoice_status') return adminUpdateInvoiceStatus_(payload);
    if (action === 'admin_get_settings') return adminGetSettings_(payload);
    if (action === 'admin_save_settings') return adminSaveSettings_(payload);
    if (action === 'admin_attendance_days') return adminAttendanceDays_(payload);
    if (action === 'admin_owner_overview') return adminOwnerOverview_(payload);
    if (action === 'admin_record_attendance') return adminRecordAttendance_(payload);
    if (action === 'admin_list_sites') return adminListSites_(payload);
    if (action === 'admin_save_site') return adminSaveSite_(payload);
    if (action === 'employee_submit_advance') return employeeSubmitAdvance_(payload);
    if (action === 'employee_advances') return employeeAdvances_(payload);
    if (action === 'admin_list_advances') return adminListAdvances_(payload);
    if (action === 'admin_decide_advance') return adminDecideAdvance_(payload);
    if (action === 'admin_mark_advance_paid') return adminMarkAdvancePaid_(payload);
    if (action === 'employee_change_password') return employeeChangePassword_(payload);
    if (action === 'employee_request_password_reset') return employeeRequestPasswordReset_(payload);
    if (action === 'admin_list_password_requests') return adminListPasswordRequests_(payload);
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
  const latitude = finiteNumber_(payload.latitude), longitude = finiteNumber_(payload.longitude), accuracy = finiteNumber_(payload.accuracy);
  // Check-out can happen anywhere (no location check). Check-in with a location
  // policy must fall inside the radius of ANY active site (multiple sites supported).
  let matchedSite = null, distance = null, accepted = true;
  if (eventType === 'check_in' && employee.locationRequired) {
    if (latitude === null || longitude === null || accuracy === null || accuracy < 0) return reply_(false, 'ต้องระบุตำแหน่ง GPS สำหรับการเช็กอิน');
    if (payload.mocked === true) return reply_(false, 'ตรวจพบการปลอมตำแหน่ง (Mock location) — ปิดแอปจำลองตำแหน่งก่อนเช็กอิน');
    const sites = activeSites_();
    if (!sites.length) return reply_(false, 'ยังไม่ได้ตั้งจุดเช็กอิน กรุณาติดต่อแอดมิน');
    sites.forEach(s => { const d = metres_(latitude, longitude, s.lat, s.lng); if (distance === null || d < distance) { distance = d; matchedSite = s; } });
    accepted = accuracy <= MAX_ACCURACY_METRES && matchedSite != null && distance <= matchedSite.radius;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let overtimeInfo = null;
  try {
    const log = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance);
    const todayState = attendanceStateForToday_(log, employee.id, new Date());
    if (eventType === 'check_in' && todayState.checkedIn) return reply_(false, 'วันนี้คุณบันทึกเข้างานแล้ว', todayState);
    if (eventType === 'check_out' && !todayState.checkedIn) return reply_(false, 'ต้องบันทึกเข้างานก่อนจึงจะบันทึกออกงานได้', todayState);
    if (eventType === 'check_out' && todayState.checkedOut) return reply_(false, 'วันนี้คุณบันทึกออกงานแล้ว', todayState);
    const now = new Date();
    log.appendRow([Utilities.getUuid(), employee.id, matchedSite ? matchedSite.id : (employee.siteId || ''), eventType, now, latitude === null ? '' : latitude, longitude === null ? '' : longitude, accuracy === null ? '' : accuracy, distance === null ? '' : Math.round(distance * 100) / 100, accepted ? 'accepted' : 'rejected', String(payload.deviceTimezone || ''), employee.locationRequired ? 'mobile_api_location' : 'mobile_api_no_location', accepted ? 'pending' : 'rejected', new Date()]);
    touchMobileToken_(payload.mobileToken);
    // Auto-detect overtime on check-out: if the worked time exceeds the employee's
    // standard hours, submit a PENDING overtime request for the admin to approve.
    if (eventType === 'check_out' && accepted) overtimeInfo = autoCreateOvertime_(employee.id, now);
  } finally { lock.releaseLock(); }
  return reply_(accepted, accepted ? 'Attendance recorded' : 'อยู่นอกพื้นที่ที่อนุญาต หรือสัญญาณ GPS ไม่แม่นพอ', { decision: accepted ? 'accepted' : 'rejected', locationRequired: employee.locationRequired, distanceMetres: distance === null ? null : Math.round(distance), allowedRadiusMetres: matchedSite ? matchedSite.radius : null, matchedSite: matchedSite ? matchedSite.name || matchedSite.id : '', overtime: overtimeInfo });
}

// If a check-out means the employee worked past their standard hours (by more than
// a grace window), create a pending overtime request so the admin can approve it.
// Returns a small summary for the app, or null when there is no overtime.
// OT hourly base rate derived from the pay basis.
function otHourly_(rule) {
  const basis = normalise_(rule[1]), rate = Number(rule[2] || 0), hours = Number(rule[3] || 8) || 8;
  if (basis === 'monthly') return rate / (Number(rule[11] || 30) || 30) / hours;
  if (basis === 'daily') return rate / hours;
  return rate;
}
function autoCreateOvertime_(employeeId, checkoutTime) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  initializePayrollRulesSheet();
  const rule = values_(ss.getSheetByName(SHEETS.payrollRules)).slice(1).find(r => String(r[0]).trim().toUpperCase() === String(employeeId).trim().toUpperCase());
  if (!rule || String(rule[4]) !== 'true') return null; // no rule, or OT disabled
  const settings = readSettings_();
  const lunch = Number(settings.lunch_break_min || 60), thresholdMin = Number(settings.ot_threshold_hours || 8) * 60;
  const holidayOt = normalise_(settings.holiday_ot_enabled) === 'true';
  const today = Utilities.formatDate(checkoutTime, ICT, 'yyyy-MM-dd');
  const isHoliday = !!holidayMap_()[today];
  const logs = values_(ss.getSheetByName(SHEETS.attendance)).slice(1)
    .filter(r => String(r[1]) === employeeId && String(r[9]) === 'accepted' && String(r[3]) === 'check_in' && Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd') === today);
  if (!logs.length) return null;
  const inMs = Math.min.apply(null, logs.map(r => new Date(r[4]).getTime()));
  const worked = Math.round((checkoutTime.getTime() - inMs) / 60000);
  const net = Math.max(0, worked - lunch); // deduct lunch break
  // Holiday work (if enabled) = all net time is OT; otherwise OT is time beyond the threshold.
  const overage = (isHoliday && holidayOt) ? net : (net - thresholdMin);
  const GRACE_MINUTES = 15;
  if (overage < GRACE_MINUTES) return null;
  initializeTimeRequestsSheet();
  const trSheet = ss.getSheetByName(SHEETS.timeRequests);
  const already = values_(trSheet).slice(1).some(r => String(r[1]) === employeeId && String(r[2]) === 'overtime' && Utilities.formatDate(new Date(r[3]), ICT, 'yyyy-MM-dd') === today);
  if (already) return { overtimeMinutes: overage, status: 'already_requested' };
  trSheet.appendRow([Utilities.getUuid(), employeeId, 'overtime', new Date(today + 'T00:00:00+07:00'), overage, 'อัตโนมัติ: ทำเกินเวลามาตรฐาน ' + overage + ' นาที', 'pending', new Date(), '', '', '']);
  return { overtimeMinutes: overage, status: 'pending' };
}

// Admin records a check-in/out on behalf of an employee (manual, no GPS). Same
// per-business-day duplicate/order guards. Logged as admin_manual for the audit trail.
function adminRecordAttendance_(payload) {
  requireOperationsRole_(payload);
  const reviewer = adminActor_(payload);
  const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const employee = findEmployee_(employeeId);
  if (!employee) return reply_(false, 'ไม่พบพนักงาน');
  if (employee.status !== 'active') return reply_(false, 'พนักงานนี้ถูกปิดใช้งาน');
  const eventType = String(payload.eventType || '');
  if (eventType !== 'check_in' && eventType !== 'check_out') return reply_(false, 'ประเภทการลงเวลาไม่ถูกต้อง');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const log = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance);
    const todayState = attendanceStateForToday_(log, employee.id, new Date());
    if (eventType === 'check_in' && todayState.checkedIn) return reply_(false, 'พนักงานคนนี้บันทึกเข้างานวันนี้แล้ว', todayState);
    if (eventType === 'check_out' && !todayState.checkedIn) return reply_(false, 'ต้องบันทึกเข้างานก่อนจึงจะบันทึกออกงานได้', todayState);
    if (eventType === 'check_out' && todayState.checkedOut) return reply_(false, 'พนักงานคนนี้บันทึกออกงานวันนี้แล้ว', todayState);
    log.appendRow([Utilities.getUuid(), employee.id, employee.siteId, eventType, new Date(), '', '', '', '', 'accepted', '', 'admin_manual:' + reviewer, 'accepted', new Date()]);
  } finally { lock.releaseLock(); }
  audit_(reviewer, 'attendance_manual_' + eventType, employeeId, '');
  return reply_(true, eventType === 'check_in' ? 'ลงเวลาเข้างานแล้ว' : 'ลงเวลาออกงานแล้ว');
}

function adminDashboard_(payload) {
  try { requireAdmin_(payload); } catch (error) { return reply_(false, 'Administrator authentication failed'); }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const employees = values_(ss.getSheetByName(SHEETS.employees));
  const logs = values_(ss.getSheetByName(SHEETS.attendance));
  const invoices = valuesIfSheet_(ss.getSheetByName(SHEETS.invoices));
  const leaves = valuesIfSheet_(ss.getSheetByName(SHEETS.leaves));
  const timeRequests = valuesIfSheet_(ss.getSheetByName(SHEETS.timeRequests));
  const payrolls = valuesIfSheet_(ss.getSheetByName(SHEETS.payroll));
  const today = Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd');
  // Resolve columns by header: Employee sheets have evolved and a fixed column
  // index can make Dashboard totals disagree with the Admin employee directory.
  const employeeCols = employeeColumns_(employees[0]);
  const activeIds = new Set(employees.slice(1)
    .map(row => employeeFromRow_(row, employeeCols))
    .filter(employee => employee && employee.status === 'active')
    .map(employee => employee.id));
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
  const s = readSettings_();
  return reply_(true, 'Employee profile loaded', { employeeId: employee.id, name: employee.name, role: employee.role, siteId: employee.siteId, locationRequired: employee.locationRequired,
    shiftStart: s.shift_start || '09:00', shiftEnd: s.shift_end || '18:00', workdays: s.workdays || '1,2,3,4,5',
    remindBeforeMin: Number(s.remind_before_min || 15), remindCheckoutAfterMin: Number(s.remind_checkout_after_min || 10) });
}

function employeeDirectory_() {
  const cached = cacheGet_('dir_v1');
  if (cached) return reply_(true, 'Employee directory loaded', { employees: cached });
  const source = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees)), columns = employeeColumns_(source[0]);
  const list = source.slice(1).map(row => employeeFromRow_(row, columns)).filter(e => e && e.status === 'active').map(e => ({ employeeId: e.id, name: e.name, role: e.role }));
  cachePut_('dir_v1', list, 120);
  return reply_(true, 'Employee directory loaded', { employees: list });
}

function employeeLogin_(payload) {
  const employee = findEmployee_(String(payload.employeeId || '').trim().toUpperCase());
  const password = String(payload.password || '');
  if (!employee || employee.status !== 'active' || !employee.passwordHash) return reply_(false, 'ชื่อพนักงานหรือรหัสผ่านไม่ถูกต้อง');
  const stored = String(employee.passwordHash), hashed = hashEmployeePassword_(password);
  const valid = stored.indexOf('h1:') === 0 ? constantTimeEqual_(stored, hashed) : constantTimeEqual_(stored, password);
  if (!valid) return reply_(false, 'ชื่อพนักงานหรือรหัสผ่านไม่ถูกต้อง');
  if (stored.indexOf('h1:') !== 0) migrateEmployeePasswordHash_(employee.id, hashed);
  revokeEmployeeTokens_(employee.id);
  const token = issueMobileToken(employee.id, String(payload.deviceLabel || 'Mobile login'));
  return reply_(true, 'Login successful', { employeeId: employee.id, mobileToken: token, name: employee.name });
}

function adminListEmployees_(payload) {
  requireOperationsRole_(payload);
  const source = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees)), columns = employeeColumns_(source[0]);
  // Password hashes are authentication material, not Admin directory data.
  // Keep them inside server-only employee objects used by employeeLogin_.
  return reply_(true, 'Employees loaded', { employees: source.slice(1).map(row => employeeForAdmin_(employeeFromRow_(row, columns))).filter(Boolean) });
}

function adminUpsertEmployee_(payload) {
  requireOperationsRole_(payload); initializeEmployeesSheet();
  const requestedId = String(payload.employeeId || '').trim().toUpperCase(), name = String(payload.name || '').trim(), role = String(payload.role || '').trim(), siteId = String(payload.siteId || '').trim();
  const status = normalise_(payload.status || 'active') === 'inactive' ? 'inactive' : 'active';
  const locationRequired = payload.locationRequired === false ? 'false' : 'true';
  if (!name || !siteId) return reply_(false, 'Name and work site are required');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees), rows = values_(sheet), columns = employeeColumns_(rows[0]);
  const id = requestedId || nextEmployeeId_(rows);
  const rowIndex = rows.slice(1).findIndex(r => String(r[columns.id]).trim().toUpperCase() === id);
  const existingPasswordHash = rowIndex < 0 ? '' : String(rows[rowIndex + 1][columns.passwordHash] || '');
  const providedPassword = String(payload.password || '').trim();
  // Never re-hash an existing hash. Empty password on edit means keep it; a new
  // account gets an initial password exactly once.
  const generatedPassword = !providedPassword && !existingPasswordHash ? temporaryPassword_() : '';
  const passwordHash = providedPassword ? hashEmployeePassword_(providedPassword) : (existingPasswordHash ? (existingPasswordHash.indexOf('h1:') === 0 ? existingPasswordHash : hashEmployeePassword_(existingPasswordHash)) : hashEmployeePassword_(generatedPassword));
  const values = rowIndex < 0 ? Array(rows[0].length).fill('') : rows[rowIndex + 1].slice();
  values[columns.id] = id; values[columns.name] = name; values[columns.role] = role || 'Employee'; values[columns.department] = String(payload.department || ''); values[columns.siteId] = siteId; values[columns.status] = status; values[columns.locationRequired] = locationRequired; values[columns.passwordHash] = passwordHash;
  if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, values.length).setValues([values]); else sheet.appendRow(values);
  cacheDel_('dir_v1');
  audit_(adminActor_(payload), rowIndex < 0 ? 'employee_created' : 'employee_updated', id, 'status ' + status);
  return reply_(true, 'Employee saved', { employee: employeeForAdmin_(employeeFromRow_(values, columns)), initialPassword: rowIndex < 0 ? (providedPassword || generatedPassword) : '' });
}

function adminResetEmployeePassword_(payload) {
  requireOperationsRole_(payload); const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees), rows = values_(sheet), columns = employeeColumns_(rows[0]), index = rows.slice(1).findIndex(r => String(r[columns.id]).trim().toUpperCase() === employeeId);
  if (index < 0) return reply_(false, 'Employee was not found');
  revokeEmployeeTokens_(employeeId);
  const password = String(payload.password || '').trim() || temporaryPassword_();
  sheet.getRange(index + 2, columns.passwordHash + 1).setValue(hashEmployeePassword_(password));
  const reviewer = adminActor_(payload);
  if (payload.requestId) resolvePwRequest_(String(payload.requestId), reviewer);
  audit_(reviewer, 'password_reset', employeeId, '');
  return reply_(true, 'Temporary password reset', { employeeId: employeeId, temporaryPassword: password });
}

function adminReviewLeave_(payload) {
  requireOperationsRole_(payload); initializeLeaveRequestsSheet();
  const requestId = String(payload.requestId || ''), decision = normalise_(payload.decision), reviewer = adminActor_(payload);
  if (!requestId || !['approved', 'rejected'].includes(decision)) return reply_(false, 'Invalid leave decision');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves), rows = values_(sheet);
  const index = rows.slice(1).findIndex(r => String(r[0]) === requestId && normalise_(r[6]) === 'pending');
  if (index < 0) return reply_(false, 'Pending leave request was not found');
  sheet.getRange(index + 2, 7, 1, 3).setValues([[decision, reviewer, new Date()]]);
  audit_(reviewer, 'leave_' + decision, requestId, '');
  return reply_(true, 'Leave request ' + decision);
}

// #4 Leave quota usage: per active employee, approved leave days used this year by
// type vs the annual quota from Settings.
function adminLeaveUsage_(payload) {
  requireOperationsRole_(payload); initializeLeaveRequestsSheet();
  const settings = readSettings_();
  const quota = { sick: Number(settings.quota_sick || 0), personal: Number(settings.quota_personal || 0), vacation: Number(settings.quota_vacation || 0) };
  const typeKey = (t) => { t = String(t || ''); if (t.indexOf('ป่วย') >= 0) return 'sick'; if (t.indexOf('พักร้อน') >= 0) return 'vacation'; if (t.indexOf('กิจ') >= 0) return 'personal'; return 'other'; };
  const year = Number(Utilities.formatDate(new Date(), ICT, 'yyyy'));
  const names = employeeNameMap_();
  const used = {}; // empId -> {sick,personal,vacation,other}
  values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves)).slice(1).forEach(r => {
    if (normalise_(r[6]) !== 'approved') return;
    const start = new Date(r[3]), end = new Date(r[4]);
    if (isNaN(start) || start.getFullYear() !== year) return;
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const id = String(r[1]), k = typeKey(r[2]);
    (used[id] = used[id] || { sick: 0, personal: 0, vacation: 0, other: 0 })[k] += days;
  });
  const rows = Object.keys(names).filter(id => names[id].status === 'active').map(id => {
    const u = used[id] || { sick: 0, personal: 0, vacation: 0, other: 0 };
    return { employeeId: id, name: names[id].name, usedSick: u.sick, usedPersonal: u.personal, usedVacation: u.vacation, usedOther: u.other };
  }).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return reply_(true, 'Leave usage loaded', { year: year, quota: quota, rows: rows });
}

function adminListLeaveRequests_(payload) {
  requireOperationsRole_(payload); initializeLeaveRequestsSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves)).slice(1);
  const requests = rows.map(r => ({ requestId: String(r[0]), employeeId: String(r[1]), leaveType: String(r[2]), startDate: Utilities.formatDate(new Date(r[3]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd'), reason: String(r[5]), status: String(r[6]), submittedAt: Utilities.formatDate(new Date(r[7]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") })).filter(r => r.requestId);
  return reply_(true, 'Leave requests loaded', { requests: requests });
}

function adminUpsertPayRule_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializePayrollRulesSheet();
  const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const basis = normalise_(payload.payBasis);
  const rate = finiteNumber_(payload.baseRate), hours = finiteNumber_(payload.standardHours || 8), otMultiplier = finiteNumber_(payload.otMultiplier || 1.5), premiumMultiplier = finiteNumber_(payload.premiumMultiplier || 1);
  const premiumDate = String(payload.premiumDate || '').trim();
  const otherDeduction = finiteNumber_(payload.otherDeduction != null ? payload.otherDeduction : 0);
  const daysPerMonth = finiteNumber_(payload.daysPerMonth != null ? payload.daysPerMonth : 30);
  if (!findEmployee_(employeeId) || !['hourly', 'daily', 'monthly'].includes(basis) || rate === null || rate < 0 || hours === null || hours <= 0 || otMultiplier === null || otMultiplier < 1 || premiumMultiplier === null || premiumMultiplier < 1) return reply_(false, 'Invalid pay rule');
  if (otherDeduction === null || otherDeduction < 0) return reply_(false, 'หักอื่นๆ ไม่ถูกต้อง');
  if (daysPerMonth === null || daysPerMonth <= 0 || daysPerMonth > 31) return reply_(false, 'วันทำงาน/เดือน ไม่ถูกต้อง');
  if (premiumDate && !parseIsoDate_(premiumDate)) return reply_(false, 'Premium date must be YYYY-MM-DD');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollRules), rows = values_(sheet);
  const actor = adminActor_(payload, payload.updatedBy);
  const row = [employeeId, basis, rate, hours, payload.otEnabled === true ? 'true' : 'false', otMultiplier, premiumDate, premiumMultiplier, new Date(), actor, otherDeduction, daysPerMonth];
  const index = rows.slice(1).findIndex(r => String(r[0]).trim().toUpperCase() === employeeId);
  if (index >= 0) sheet.getRange(index + 2, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  audit_(actor, 'pay_rule_saved', employeeId, basis + ' @ ' + rate);
  return reply_(true, 'Pay rule saved', { employeeId: employeeId, payBasis: basis, baseRate: rate });
}

function adminListPayRules_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializePayrollRulesSheet();
  const names = employeeNameMap_();
  const rules = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollRules)).slice(1)
    .reduce((m, r) => { if (String(r[0])) m[String(r[0]).trim().toUpperCase()] = r; return m; }, {});
  const out = Object.keys(names).map(id => {
    const r = rules[id];
    return {
      employeeId: id, name: names[id].name, role: names[id].role || '', status: names[id].status,
      hasRule: !!r,
      payBasis: r ? String(r[1]) : '', baseRate: r ? Number(r[2] || 0) : null,
      standardHours: r ? Number(r[3] || 8) : 8, otEnabled: r ? String(r[4]) === 'true' : false,
      otMultiplier: r ? Number(r[5] || 1.5) : 1.5, premiumDate: r ? (r[6] ? String(r[6]) : '') : '',
      premiumMultiplier: r ? Number(r[7] || 1) : 1, otherDeduction: r ? Number(r[10] || 0) : 0, daysPerMonth: r ? Number(r[11] || 30) : 30,
      updatedAt: r && r[8] ? Utilities.formatDate(new Date(r[8]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', updatedBy: r ? String(r[9] || '') : ''
    };
  }).sort((a, b) => (a.status === b.status ? a.employeeId.localeCompare(b.employeeId) : (a.status === 'active' ? -1 : 1)));
  return reply_(true, 'Pay rules loaded', { rules: out });
}

function adminPreviewPayroll_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializePayrollRulesSheet(); initializePayrollSheets(); initializeTimeRequestsSheet();
  const start = parseIsoDate_(payload.startDate), end = parseIsoDate_(payload.endDate);
  if (!start || !end || end < start) return reply_(false, 'Invalid payroll period');
  const startText = Utilities.formatDate(start, ICT, 'yyyy-MM-dd'), endText = Utilities.formatDate(end, ICT, 'yyyy-MM-dd');
  const rules = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollRules)).slice(1).reduce((map, row) => { map[String(row[0])] = row; return map; }, {});
  const logs = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance)).slice(1).filter(row => String(row[9]) === 'accepted');
  const approvedOt = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests)).slice(1).filter(row => String(row[2]) === 'overtime' && normalise_(row[6]) === 'approved');
  const byEmployeeDay = {};
  logs.forEach(row => { const day = Utilities.formatDate(new Date(row[4]), ICT, 'yyyy-MM-dd'); if (day < startText || day > endText) return; const key = String(row[1]) + '|' + day; const item = byEmployeeDay[key] || { employeeId: String(row[1]), day: day, in: null, out: null }; if (String(row[3]) === 'check_in') item.in = item.in || new Date(row[4]); if (String(row[3]) === 'check_out') item.out = new Date(row[4]); byEmployeeDay[key] = item; });
  // Detect days that were started but never completed (forgot to check out, or an
  // orphan check-out). These days are NOT paid, so surface them as warnings.
  const nameMap = employeeNameMap_();
  const incompleteDays = [];
  const incompleteByEmp = {};
  Object.values(byEmployeeDay).forEach(item => {
    if (item.in && item.out && item.out > item.in) return; // complete day
    const issue = item.in && !item.out ? 'no_checkout' : (!item.in && item.out ? 'no_checkin' : 'invalid');
    incompleteDays.push({
      employeeId: item.employeeId, name: (nameMap[item.employeeId] || {}).name || item.employeeId, date: item.day, issue: issue,
      checkIn: item.in ? Utilities.formatDate(item.in, ICT, 'HH:mm') : '', checkOut: item.out ? Utilities.formatDate(item.out, ICT, 'HH:mm') : ''
    });
    incompleteByEmp[item.employeeId] = (incompleteByEmp[item.employeeId] || 0) + 1;
  });
  incompleteDays.sort((a, b) => a.date < b.date ? 1 : -1);
  const result = {};
  Object.values(byEmployeeDay).forEach(item => { if (!item.in || !item.out || item.out <= item.in || !rules[item.employeeId]) return; const line = result[item.employeeId] || { employeeId: item.employeeId, regularMinutes: 0, workDays: 0, otMinutes: 0, baseGross: 0, otGross: 0, grossPay: 0, warnings: [] }; const rule = rules[item.employeeId], basis = normalise_(rule[1]), rate = Number(rule[2] || 0), standardMinutes = Number(rule[3] || 8) * 60; const minutes = Math.round((item.out - item.in) / 60000); line.workDays += 1; line.regularMinutes += Math.min(minutes, standardMinutes); if (basis === 'daily') line.baseGross += rate; else if (basis === 'hourly') line.baseGross += Math.min(minutes, standardMinutes) / 60 * rate; /* monthly: flat salary added after the loop */ result[item.employeeId] = line; });
  // Monthly-salary employees get their fixed monthly pay once (not per day) if they worked at least one day.
  Object.values(result).forEach(line => { const rule = rules[line.employeeId]; if (rule && normalise_(rule[1]) === 'monthly') line.baseGross = Number(rule[2] || 0); });
  approvedOt.forEach(row => { const day = Utilities.formatDate(new Date(row[3]), ICT, 'yyyy-MM-dd'), employeeId = String(row[1]); if (day < startText || day > endText || !rules[employeeId]) return; const line = result[employeeId] || { employeeId: employeeId, regularMinutes: 0, workDays: 0, otMinutes: 0, baseGross: 0, otGross: 0, grossPay: 0, warnings: ['Approved OT has no accepted complete attendance day'] }; const rule = rules[employeeId], baseHourly = otHourly_(rule), multiplier = String(rule[4]) === 'true' ? Number(rule[5] || 1.5) : 0, minutes = Number(row[4] || 0); line.otMinutes += minutes; line.otGross += minutes / 60 * baseHourly * multiplier; result[employeeId] = line; });
  const outstanding = outstandingAdvancesByEmployee_();
  const settings = readSettings_();
  const ssoEnabled = normalise_(settings.sso_enabled) === 'true';
  const ssoRate = Number(settings.sso_rate || 5), ssoCap = Number(settings.sso_cap || 750);
  const lines = Object.values(result).map(line => {
    const grossPay = roundMoney_(line.baseGross + line.otGross);
    const rule = rules[line.employeeId] || [];
    const sso = ssoEnabled ? roundMoney_(Math.min(grossPay * ssoRate / 100, ssoCap)) : 0;
    const otherDeduction = roundMoney_(Number(rule[10] || 0));
    // Advances are recovered only from the amount remaining after statutory and
    // configured deductions. Preview and payroll lock must use this identical
    // ceiling, otherwise a locked snapshot can settle debt that was not paid.
    const fit = advanceFit_(outstanding[line.employeeId], Math.max(0, grossPay - sso - otherDeduction));
    if (incompleteByEmp[line.employeeId]) line.warnings.push('ลืมเช็กเอาต์/เวลาไม่ครบ ' + incompleteByEmp[line.employeeId] + ' วัน (ไม่ถูกคิดเงิน)');
    const netPay = roundMoney_(Math.max(0, grossPay - fit.deduction - sso - otherDeduction));
    return { ...line, baseGross: roundMoney_(line.baseGross), otGross: roundMoney_(line.otGross), grossPay: grossPay, advanceDeduction: fit.deduction, sso: sso, otherDeduction: otherDeduction, netPay: netPay };
  });
  const sum = (k) => roundMoney_(lines.reduce((s, line) => s + (line[k] || 0), 0));
  return reply_(true, 'Gross-pay preview loaded', { startDate: startText, endDate: endText, status: 'preview', disclaimer: 'ประมาณการ: หัก = เบิกล่วงหน้า + ประกันสังคม + หักอื่นๆ (ยังไม่รวมภาษี ณ ที่จ่ายแบบขั้นบันได)', lines: lines, incompleteDays: incompleteDays, totalGross: sum('grossPay'), totalAdvance: sum('advanceDeduction'), totalSso: sum('sso'), totalOther: sum('otherDeduction'), totalNet: sum('netPay') });
}

// Outstanding advances per employee = money already handed out (status 'paid') that
// has NOT yet been recovered from salary (not 'settled'). Oldest first (sheet order),
// each with its sheet row so lock can mark exactly these as settled — this is what
// stops the same advance from being deducted again every month.
function outstandingAdvancesByEmployee_() {
  initializeAdvancesSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances));
  const map = {};
  rows.slice(1).forEach((r, i) => {
    const a = advanceFromRow_(r);
    if (a.advanceId && a.status === 'paid') (map[a.employeeId] = map[a.employeeId] || []).push({ sheetRow: i + 2, amount: a.amount });
  });
  return map;
}

// Include whole advances in strict oldest-first order while they fit within the
// available net amount. Do not skip an older advance to settle a newer one.
function advanceFit_(list, availableAmount) {
  let deduction = 0; const sheetRows = [];
  for (const it of (list || [])) {
    if (deduction + it.amount > availableAmount) break;
    deduction += it.amount; sheetRows.push(it.sheetRow);
  }
  return { deduction: roundMoney_(deduction), sheetRows: sheetRows };
}

function adminLockPayroll_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializePayrollSheets();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    // Preview, duplicate check and snapshot write must be one critical section.
    // Otherwise two Admins can lock the same period or settle advances that were
    // not present in the preview they reviewed.
    const preview = adminPreviewPayroll_(payload); const body = JSON.parse(preview.getContent());
    if (!body.ok) return preview;
    const data = body.data, payrollId = 'PAY-' + data.startDate.replace(/-/g, '') + '-' + data.endDate.replace(/-/g, '');
    const periods = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payroll), existing = values_(periods).slice(1).find(row => String(row[0]) === payrollId);
    if (existing) return reply_(false, 'Payroll period is already locked');
    let settledCount = 0;
    periods.appendRow([payrollId, data.startDate, data.endDate, 'locked', new Date(), adminActor_(payload, payload.lockedBy)]);
    const lines = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollLines);
    const advanceSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances);
    const outstanding = outstandingAdvancesByEmployee_();
    data.lines.forEach(line => {
      // Store the frozen snapshot INCLUDING advance deduction and net pay.
      // Freeze the full breakdown: advance(7), net(8), createdAt(9), sso(10), other(11).
      lines.appendRow([payrollId, line.employeeId, line.regularMinutes, line.otMinutes, line.baseGross, line.otGross, line.grossPay, line.advanceDeduction || 0, line.netPay != null ? line.netPay : line.grossPay, new Date(), line.sso || 0, line.otherDeduction || 0]);
      // Recover exactly the advances this paycheck covered → mark them 'settled' so
      // they are never deducted again in a future period.
      const availableForAdvance = Math.max(0, Number(line.grossPay || 0) - Number(line.sso || 0) - Number(line.otherDeduction || 0));
      const fit = advanceFit_(outstanding[line.employeeId], availableForAdvance);
      fit.sheetRows.forEach(rowNo => { advanceSheet.getRange(rowNo, 6).setValue('settled'); advanceSheet.getRange(rowNo, 11).setValue(payrollId); settledCount++; });
    });
    audit_(adminActor_(payload, payload.lockedBy), 'payroll_locked', payrollId, 'net ' + data.totalNet + ' · settled ' + settledCount);
    return reply_(true, 'Payroll period locked', { payrollId: payrollId, totalGross: data.totalGross, totalNet: data.totalNet, advancesSettled: settledCount });
  } finally { lock.releaseLock(); }
}

function adminListPayrolls_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializePayrollSheets();
  const periods = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payroll)).slice(1)
    .map(row => ({ payrollId: String(row[0]), startDate: Utilities.formatDate(new Date(row[1]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(row[2]), ICT, 'yyyy-MM-dd'), status: String(row[3]), lockedAt: row[4] ? Utilities.formatDate(new Date(row[4]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', lockedBy: String(row[5] || '') }))
    .filter(period => period.payrollId).reverse();
  return reply_(true, 'Payroll periods loaded', { periods: periods });
}

function adminGetPayroll_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializePayrollSheets();
  const payrollId = String(payload.payrollId || '').trim();
  if (!payrollId) return reply_(false, 'Payroll ID is required');
  const period = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payroll)).slice(1).find(row => String(row[0]) === payrollId);
  if (!period) return reply_(false, 'Payroll period not found');
  const names = employeeNameMap_();
  const lines = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.payrollLines)).slice(1).filter(row => String(row[0]) === payrollId)
    .map(row => {
      const employeeId = String(row[1]); const grossPay = Number(row[6] || 0);
      // New rows (length >= 9) store the frozen advance deduction + net pay; old rows do not.
      const hasSnapshot = row.length >= 9;
      const advanceDeduction = hasSnapshot ? roundMoney_(Number(row[7] || 0)) : 0;
      const netPay = hasSnapshot ? roundMoney_(Number(row[8] || grossPay)) : grossPay;
      const sso = row.length >= 11 ? roundMoney_(Number(row[10] || 0)) : 0;
      const otherDeduction = row.length >= 12 ? roundMoney_(Number(row[11] || 0)) : 0;
      return { employeeId: employeeId, name: (names[employeeId] || {}).name || employeeId, role: (names[employeeId] || {}).role || '', regularMinutes: Number(row[2] || 0), otMinutes: Number(row[3] || 0), baseGross: Number(row[4] || 0), otGross: Number(row[5] || 0), grossPay: grossPay, advanceDeduction: advanceDeduction, sso: sso, otherDeduction: otherDeduction, netPay: netPay };
    });
  return reply_(true, 'Payroll snapshot loaded', { payrollId: payrollId, startDate: Utilities.formatDate(new Date(period[1]), ICT, 'yyyy-MM-dd'), endDate: Utilities.formatDate(new Date(period[2]), ICT, 'yyyy-MM-dd'), status: String(period[3]), lines: lines, totalGross: roundMoney_(lines.reduce((sum, line) => sum + line.grossPay, 0)), totalAdvance: roundMoney_(lines.reduce((sum, line) => sum + line.advanceDeduction, 0)), totalSso: roundMoney_(lines.reduce((sum, line) => sum + (line.sso || 0), 0)), totalOther: roundMoney_(lines.reduce((sum, line) => sum + (line.otherDeduction || 0), 0)), totalNet: roundMoney_(lines.reduce((sum, line) => sum + line.netPay, 0)) });
}

/* =========================== Owner settings & analytics =========================== */
var SETTINGS_DEFAULTS = { pay_frequency: 'monthly', pay_day_1: 'end', pay_day_2: '15', workdays: '1,2,3,4,5', sso_enabled: 'false', sso_rate: '5', sso_cap: '750', quota_sick: '30', quota_personal: '6', quota_vacation: '6', shift_start: '09:00', shift_end: '18:00', shift_grace_min: '5', lunch_break_min: '60', ot_threshold_hours: '8', holiday_ot_enabled: 'false', remind_before_min: '15', remind_checkout_after_min: '10' };
var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function initializeSettingsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.settings);
  if (!sheet) { sheet = ss.insertSheet(SHEETS.settings); sheet.appendRow(['Key', 'Value']); sheet.setFrozenRows(1); }
  const existing = values_(sheet).slice(1).reduce((m, r) => { m[String(r[0])] = true; return m; }, {});
  Object.keys(SETTINGS_DEFAULTS).forEach(k => { if (!existing[k]) sheet.appendRow([k, SETTINGS_DEFAULTS[k]]); });
}

function readSettings_() {
  initializeSettingsSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.settings)).slice(1);
  const out = Object.assign({}, SETTINGS_DEFAULTS);
  rows.forEach(r => { const k = String(r[0]); if (k) out[k] = String(r[1]); });
  return out;
}

function adminGetSettings_(payload) { requireOwner_(payload); return reply_(true, 'Settings loaded', { settings: readSettings_() }); }

function adminSaveSettings_(payload) {
  requireOwner_(payload); initializeSettingsSheet();
  const incoming = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const freq = normalise_(incoming.pay_frequency);
  if (freq && !['monthly', 'semimonthly', 'weekly'].includes(freq)) return reply_(false, 'Invalid pay frequency');
  const validDay = (v) => { v = String(v).trim().toLowerCase(); if (v === 'end' || v === 'last') return 'end'; const n = parseInt(v, 10); return (n >= 1 && n <= 31) ? String(n) : null; };
  const next = Object.assign(readSettings_(), {});
  if (incoming.pay_frequency) next.pay_frequency = freq;
  if (incoming.pay_day_1 != null) { const d = validDay(incoming.pay_day_1); if (d === null) return reply_(false, 'Invalid pay day'); next.pay_day_1 = d; }
  if (incoming.pay_day_2 != null) { const d = validDay(incoming.pay_day_2); if (d === null) return reply_(false, 'Invalid pay day 2'); next.pay_day_2 = d; }
  if (incoming.workdays != null) {
    const days = String(incoming.workdays).split(',').map(s => s.trim()).filter(s => s !== '');
    if (!days.every(d => /^[0-6]$/.test(d))) return reply_(false, 'Workdays must be 0-6 (0=Sun)');
    next.workdays = days.join(',');
  }
  if (incoming.sso_enabled != null) next.sso_enabled = (incoming.sso_enabled === true || normalise_(incoming.sso_enabled) === 'true') ? 'true' : 'false';
  if (incoming.sso_rate != null) { const r = finiteNumber_(incoming.sso_rate); if (r === null || r < 0 || r > 100) return reply_(false, 'อัตราประกันสังคมไม่ถูกต้อง'); next.sso_rate = String(r); }
  if (incoming.sso_cap != null) { const c = finiteNumber_(incoming.sso_cap); if (c === null || c < 0) return reply_(false, 'เพดานประกันสังคมไม่ถูกต้อง'); next.sso_cap = String(c); }
  ['quota_sick', 'quota_personal', 'quota_vacation'].forEach(k => { if (incoming[k] != null) { const q = finiteNumber_(incoming[k]); if (q !== null && q >= 0) next[k] = String(q); } });
  if (incoming.shift_start != null) { const t = String(incoming.shift_start).trim(); if (!/^\d{1,2}:\d{2}$/.test(t)) return reply_(false, 'เวลาเข้างานต้องเป็น HH:MM'); next.shift_start = t.length === 4 ? '0' + t : t; }
  if (incoming.shift_end != null) { const t = String(incoming.shift_end).trim(); if (!/^\d{1,2}:\d{2}$/.test(t)) return reply_(false, 'เวลาเลิกงานต้องเป็น HH:MM'); next.shift_end = t.length === 4 ? '0' + t : t; }
  ['remind_before_min', 'remind_checkout_after_min'].forEach(k => { if (incoming[k] != null) { const n = finiteNumber_(incoming[k]); if (n !== null && n >= 0) next[k] = String(Math.round(n)); } });
  ['shift_grace_min', 'lunch_break_min'].forEach(k => { if (incoming[k] != null) { const n = finiteNumber_(incoming[k]); if (n !== null && n >= 0) next[k] = String(Math.round(n)); } });
  if (incoming.ot_threshold_hours != null) { const h = finiteNumber_(incoming.ot_threshold_hours); if (h !== null && h > 0 && h <= 24) next.ot_threshold_hours = String(h); }
  if (incoming.holiday_ot_enabled != null) next.holiday_ot_enabled = (incoming.holiday_ot_enabled === true || normalise_(incoming.holiday_ot_enabled) === 'true') ? 'true' : 'false';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.settings), rows = values_(sheet);
  Object.keys(next).forEach(key => {
    const idx = rows.slice(1).findIndex(r => String(r[0]) === key);
    if (idx >= 0) sheet.getRange(idx + 2, 2).setValue(next[key]); else sheet.appendRow([key, next[key]]);
  });
  audit_(adminActor_(payload), 'settings_saved', '', 'freq ' + next.pay_frequency);
  return reply_(true, 'Settings saved', { settings: next });
}

function currentMonthRange_() {
  const todayYmd = Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd'), parts = todayYmd.split('-').map(Number);
  const last = new Date(parts[0], parts[1], 0).getDate();
  return { start: ymd_(parts[0], parts[1], 1), end: ymd_(parts[0], parts[1], last), label: TH_MONTHS[parts[1] - 1] + ' ' + (parts[0] + 543) };
}
function ymd_(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function resolveDayOfMonth_(y, m, dayVal) { const last = new Date(y, m, 0).getDate(); if (String(dayVal) === 'end') return last; return Math.min(Math.max(parseInt(dayVal, 10) || last, 1), last); }
function nextMonthlyPayday_(todayYmd, dayVal) {
  const p = todayYmd.split('-').map(Number), thisDay = resolveDayOfMonth_(p[0], p[1], dayVal);
  if (p[2] <= thisDay) return ymd_(p[0], p[1], thisDay);
  const nm = p[1] === 12 ? 1 : p[1] + 1, ny = p[1] === 12 ? p[0] + 1 : p[0];
  return ymd_(ny, nm, resolveDayOfMonth_(ny, nm, dayVal));
}
function nextPayday_(settings) {
  const todayYmd = Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd');
  if (settings.pay_frequency === 'weekly') {
    const t = new Date(todayYmd + 'T00:00:00+07:00'), add = ((5 - t.getDay()) + 7) % 7 || 7; // next Friday
    t.setDate(t.getDate() + add); return Utilities.formatDate(t, ICT, 'yyyy-MM-dd');
  }
  if (settings.pay_frequency === 'semimonthly') {
    const a = nextMonthlyPayday_(todayYmd, settings.pay_day_1), b = nextMonthlyPayday_(todayYmd, settings.pay_day_2);
    return a < b ? a : b;
  }
  return nextMonthlyPayday_(todayYmd, settings.pay_day_1);
}

function employeeNameMap_() {
  const src = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees)), cols = employeeColumns_(src[0]);
  return src.slice(1).reduce((m, r) => { const e = employeeFromRow_(r, cols); if (e) m[e.id] = { name: e.name, role: e.role, status: e.status }; return m; }, {});
}

function adminAttendanceDays_(payload) {
  requireOperationsRole_(payload);
  const range = (parseIsoDate_(payload.startDate) && parseIsoDate_(payload.endDate))
    ? { start: Utilities.formatDate(parseIsoDate_(payload.startDate), ICT, 'yyyy-MM-dd'), end: Utilities.formatDate(parseIsoDate_(payload.endDate), ICT, 'yyyy-MM-dd') }
    : currentMonthRange_();
  const names = employeeNameMap_();
  const logs = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance)).slice(1).filter(r => String(r[9]) === 'accepted');
  const byDay = {};
  logs.forEach(r => {
    const day = Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd'); if (day < range.start || day > range.end) return;
    if (payload.employeeId && String(r[1]).toUpperCase() !== String(payload.employeeId).toUpperCase()) return;
    const key = String(r[1]) + '|' + day, it = byDay[key] || { employeeId: String(r[1]), date: day, in: null, out: null };
    const ts = new Date(r[4]);
    if (String(r[3]) === 'check_in') it.in = it.in ? (ts < it.in ? ts : it.in) : ts;
    if (String(r[3]) === 'check_out') it.out = it.out ? (ts > it.out ? ts : it.out) : ts;
    byDay[key] = it;
  });
  const days = Object.values(byDay).map(it => {
    const worked = it.in && it.out && it.out > it.in ? Math.round((it.out - it.in) / 60000) : 0;
    return { employeeId: it.employeeId, name: (names[it.employeeId] || {}).name || it.employeeId, date: it.date,
      checkIn: it.in ? Utilities.formatDate(it.in, ICT, 'HH:mm') : '', checkOut: it.out ? Utilities.formatDate(it.out, ICT, 'HH:mm') : '',
      workedMinutes: worked, status: (it.in && it.out) ? 'complete' : 'incomplete' };
  }).sort((a, b) => a.date === b.date ? a.employeeId.localeCompare(b.employeeId) : (a.date < b.date ? 1 : -1));
  return reply_(true, 'Attendance days loaded', { startDate: range.start, endDate: range.end, days: days });
}

function adminOwnerOverview_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']);
  const settings = readSettings_();
  const range = (parseIsoDate_(payload.startDate) && parseIsoDate_(payload.endDate))
    ? { start: Utilities.formatDate(parseIsoDate_(payload.startDate), ICT, 'yyyy-MM-dd'), end: Utilities.formatDate(parseIsoDate_(payload.endDate), ICT, 'yyyy-MM-dd'), label: '' }
    : currentMonthRange_();
  const previewOut = adminPreviewPayroll_({ adminToken: payload.adminToken, startDate: range.start, endDate: range.end });
  const preview = JSON.parse(previewOut.getContent());
  if (!preview.ok) return previewOut;
  const names = employeeNameMap_();
  const lines = preview.data.lines.map(l => ({
    employeeId: l.employeeId, name: (names[l.employeeId] || {}).name || l.employeeId, role: (names[l.employeeId] || {}).role || '',
    workDays: l.workDays, regularMinutes: l.regularMinutes, otMinutes: l.otMinutes, baseGross: l.baseGross, otGross: l.otGross, grossPay: l.grossPay,
    advanceDeduction: l.advanceDeduction, sso: l.sso, otherDeduction: l.otherDeduction, netPay: l.netPay
  })).sort((a, b) => b.netPay - a.netPay);
  const activeCount = Object.values(names).filter(e => e.status === 'active').length;
  initializeAdvancesSheet();
  const advances = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances)).slice(1).map(advanceFromRow_).filter(a => a.advanceId);
  const sumAmt = (arr) => roundMoney_(arr.reduce((s, a) => s + a.amount, 0));
  const pending = advances.filter(a => a.status === 'pending'), approvedUnpaid = advances.filter(a => a.status === 'approved'), paidUnsettled = advances.filter(a => a.status === 'paid');
  return reply_(true, 'Owner overview loaded', {
    settings: settings, period: range, nextPayday: nextPayday_(settings),
    lines: lines, incompleteDays: preview.data.incompleteDays || [], totalGross: preview.data.totalGross, totalAdvance: preview.data.totalAdvance, totalSso: preview.data.totalSso, totalOther: preview.data.totalOther, totalNet: preview.data.totalNet, paidCount: lines.length, activeEmployees: activeCount,
    advancesPending: { count: pending.length, total: sumAmt(pending) },
    advancesApprovedUnpaid: { count: approvedUnpaid.length, total: sumAmt(approvedUnpaid) },
    advancesPaidUnsettled: { count: paidUnsettled.length, total: sumAmt(paidUnsettled) }
  });
}

/* =========================== Work site (shop location) =========================== */
function initializeWorkSitesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!ss.getSheetByName(SHEETS.sites)) { const s = ss.insertSheet(SHEETS.sites); s.appendRow(['Site ID', 'Name', 'Latitude', 'Longitude', 'Radius (m)', 'Active']); s.setFrozenRows(1); }
}
function adminListSites_(payload) {
  requireRole_(payload, ['owner', 'manager', 'operations']); initializeWorkSitesSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.sites)).slice(1)
    .map(r => ({ siteId: String(r[0]), name: String(r[1] || ''), lat: Number(r[2] || 0), lng: Number(r[3] || 0), radius: Number(r[4] || 0), active: normalise_(r[5]) !== 'false' }))
    .filter(x => x.siteId);
  return reply_(true, 'Sites loaded', { sites: rows });
}
function adminSaveSite_(payload) {
  requireOwner_(payload); initializeWorkSitesSheet();
  const siteId = String(payload.siteId || '').trim(), name = String(payload.name || '').trim();
  const lat = finiteNumber_(payload.lat), lng = finiteNumber_(payload.lng), radius = finiteNumber_(payload.radius);
  if (!siteId) return reply_(false, 'ต้องระบุรหัสร้าน/ไซต์');
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return reply_(false, 'พิกัดไม่ถูกต้อง');
  if (radius === null || radius <= 0) return reply_(false, 'รัศมีต้องมากกว่า 0 เมตร');
  const active = payload.active === false ? 'false' : 'true';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.sites), rows = values_(sheet);
  const idx = rows.slice(1).findIndex(r => String(r[0]).trim() === siteId);
  const row = [siteId, name, lat, lng, radius, active];
  if (idx >= 0) sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  cacheDel_('sites_v1');
  audit_(adminActor_(payload), idx >= 0 ? 'site_updated' : 'site_created', siteId, name + ' · radius ' + radius + 'm');
  return reply_(true, 'บันทึกตำแหน่งร้านแล้ว', { siteId: siteId });
}

/* =========================== Salary advance (เบิกเงินล่วงหน้า) =========================== */
function initializeAdvancesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!ss.getSheetByName(SHEETS.advances)) { const s = ss.insertSheet(SHEETS.advances); s.appendRow(['Advance ID', 'Employee ID', 'Amount', 'Reason', 'Request date', 'Status', 'Reviewer', 'Decided at', 'Paid at', 'Created at', 'Settled payroll']); s.setFrozenRows(1); }
}
function advanceFromRow_(r) {
  const dt = (v) => v ? Utilities.formatDate(new Date(v), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '';
  return { advanceId: String(r[0]), employeeId: String(r[1]), amount: Number(r[2] || 0), reason: String(r[3] || ''), requestDate: r[4] ? Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd') : '', status: normalise_(r[5]), reviewer: String(r[6] || ''), decidedAt: dt(r[7]), paidAt: dt(r[8]) };
}
function employeeSubmitAdvance_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  initializeAdvancesSheet();
  const amount = finiteNumber_(payload.amount), reason = String(payload.reason || '').trim();
  if (amount === null || amount <= 0) return reply_(false, 'จำนวนเงินไม่ถูกต้อง');
  if (amount > 100000) return reply_(false, 'จำนวนเงินเกินวงเงินที่อนุญาต');
  const id = 'ADV-' + Utilities.formatDate(new Date(), ICT, 'yyyyMMdd-HHmmss');
  SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances).appendRow([id, employeeId, amount, reason, Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd'), 'pending', '', '', '', new Date()]);
  return reply_(true, 'ส่งคำขอเบิกเงินล่วงหน้าแล้ว', { advanceId: id });
}
function employeeAdvances_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  initializeAdvancesSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances)).slice(1)
    .map(advanceFromRow_).filter(a => a.advanceId && a.employeeId === employeeId).reverse();
  return reply_(true, 'Advances loaded', { advances: rows });
}
function adminListAdvances_(payload) {
  requireOperationsRole_(payload); initializeAdvancesSheet();
  const names = employeeNameMap_();
  const wanted = normalise_(payload.status || '');
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances)).slice(1)
    .map(advanceFromRow_).filter(a => a.advanceId && (!wanted || a.status === wanted))
    .map(a => Object.assign(a, { name: (names[a.employeeId] || {}).name || a.employeeId })).reverse();
  return reply_(true, 'Advances loaded', { advances: rows });
}
function adminDecideAdvance_(payload) {
  requireOperationsRole_(payload); initializeAdvancesSheet();
  const advanceId = String(payload.advanceId || '').trim(), decision = normalise_(payload.decision), reviewer = adminActor_(payload);
  if (!advanceId || !['approved', 'rejected'].includes(decision)) return reply_(false, 'คำสั่งไม่ถูกต้อง');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances), rows = values_(sheet);
  const idx = rows.slice(1).findIndex(r => String(r[0]) === advanceId && normalise_(r[5]) === 'pending');
  if (idx < 0) return reply_(false, 'ไม่พบคำขอที่รออนุมัติ');
  sheet.getRange(idx + 2, 6, 1, 3).setValues([[decision, reviewer, new Date()]]);
  audit_(reviewer, 'advance_' + decision, advanceId, '');
  return reply_(true, 'คำขอเบิกเงิน' + (decision === 'approved' ? 'ได้รับการอนุมัติ' : 'ถูกปฏิเสธ'));
}
function adminMarkAdvancePaid_(payload) {
  requireOperationsRole_(payload); initializeAdvancesSheet();
  const advanceId = String(payload.advanceId || '').trim();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.advances), rows = values_(sheet);
    const idx = rows.slice(1).findIndex(r => String(r[0]) === advanceId && normalise_(r[5]) === 'approved');
    if (idx < 0) return reply_(false, 'ต้องเป็นคำขอที่อนุมัติแล้วเท่านั้น');
    sheet.getRange(idx + 2, 6).setValue('paid');
    sheet.getRange(idx + 2, 9).setValue(new Date());
    audit_(adminActor_(payload), 'advance_paid', advanceId, '');
    return reply_(true, 'บันทึกการจ่ายเงินเบิกล่วงหน้าแล้ว');
  } finally { lock.releaseLock(); }
}

/* =========================== Password: self-change & reset requests =========================== */
function initializePwRequestsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!ss.getSheetByName(SHEETS.pwRequests)) { const s = ss.insertSheet(SHEETS.pwRequests); s.appendRow(['Request ID', 'Employee ID', 'Requested at', 'Status', 'Handled by', 'Handled at']); s.setFrozenRows(1); }
}
// Employee changes own password; requires the current password.
function employeeChangePassword_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  const oldPw = String(payload.oldPassword || ''), newPw = String(payload.newPassword || '').trim();
  if (newPw.length < 4) return reply_(false, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัว');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees), rows = values_(sheet), columns = employeeColumns_(rows[0]);
  const index = rows.slice(1).findIndex(r => String(r[columns.id]).trim().toUpperCase() === employeeId);
  if (index < 0) return reply_(false, 'ไม่พบพนักงาน');
  const current = String(rows[index + 1][columns.passwordHash] || '');
  if (!constantTimeEqual_(current, hashEmployeePassword_(oldPw))) return reply_(false, 'รหัสผ่านเดิมไม่ถูกต้อง');
  sheet.getRange(index + 2, columns.passwordHash + 1).setValue(hashEmployeePassword_(newPw));
  return reply_(true, 'เปลี่ยนรหัสผ่านแล้ว');
}
// Employee asks Admin to reset their password (logged for the Admin queue).
function employeeRequestPasswordReset_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  initializePwRequestsSheet();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.pwRequests), rows = values_(sheet);
  if (rows.slice(1).some(r => String(r[1]).toUpperCase() === employeeId && normalise_(r[3]) === 'pending')) return reply_(true, 'มีคำขออยู่แล้ว รอแอดมินดำเนินการ');
  const id = 'PWR-' + Utilities.formatDate(new Date(), ICT, 'yyyyMMdd-HHmmss');
  sheet.appendRow([id, employeeId, new Date(), 'pending', '', '']);
  return reply_(true, 'ส่งคำขอรีเซ็ตรหัสผ่านให้แอดมินแล้ว', { requestId: id });
}
function adminListPasswordRequests_(payload) {
  requireOperationsRole_(payload); initializePwRequestsSheet();
  const names = employeeNameMap_();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.pwRequests)).slice(1)
    .map(r => ({ requestId: String(r[0]), employeeId: String(r[1]), name: (names[String(r[1])] || {}).name || String(r[1]), requestedAt: r[2] ? Utilities.formatDate(new Date(r[2]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', status: normalise_(r[3]) }))
    .filter(x => x.requestId && x.status === 'pending').reverse();
  return reply_(true, 'Password requests loaded', { requests: rows });
}
function resolvePwRequest_(requestId, handledBy) {
  initializePwRequestsSheet();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.pwRequests), rows = values_(sheet);
  const idx = rows.slice(1).findIndex(r => String(r[0]) === requestId);
  if (idx >= 0) sheet.getRange(idx + 2, 4, 1, 3).setValues([['done', handledBy, new Date()]]);
}

/* =========================== Demo data seeder (run once from the editor as owner) =========================== */
function seedDemoData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  initializeEmployeesSheet(); initializePayrollRulesSheet(); initializeSettingsSheet(); initializeWorkSitesSheet(); initializeAdvancesSheet();
  const roster = [['สมชาย ใจดี', 'ผู้จัดการร้าน'], ['สมหญิง รักงาน', 'แคชเชียร์'], ['อนุชา พากเพียร', 'คลังสินค้า'], ['กนกวรรณ ศรีสุข', 'พนักงานขาย'], ['ธนากร มั่นคง', 'พนักงานขาย'], ['ปรียา วงศ์ทอง', 'บัญชี'], ['วิชัย แสงทอง', 'ช่างซ่อม'], ['นภา ดวงเดือน', 'ธุรการ'], ['ชัยวัฒน์ รุ่งเรือง', 'จัดส่ง'], ['มาลี บุญมา', 'แม่บ้าน']];
  const empSheet = ss.getSheetByName(SHEETS.employees), eCols = employeeColumns_(values_(empSheet)[0]), width = values_(empSheet)[0].length;
  const ruleSheet = ss.getSheetByName(SHEETS.payrollRules);
  let seq = values_(empSheet).slice(1).reduce((mx, r) => { const m = /EMP-0*(\d+)/.exec(String(r[eCols.id])); return m ? Math.max(mx, parseInt(m[1], 10)) : mx; }, 0);
  const created = [];
  roster.forEach((nm, i) => {
    seq++; const id = 'EMP-' + String(seq).padStart(4, '0'), pw = 'demo' + (1000 + seq);
    const row = Array(width).fill('');
    row[eCols.id] = id; row[eCols.name] = nm[0]; row[eCols.role] = nm[1]; row[eCols.department] = 'สาขาหลัก'; row[eCols.siteId] = 'BVN-HQ'; row[eCols.status] = 'active'; row[eCols.locationRequired] = 'false'; row[eCols.passwordHash] = hashEmployeePassword_(pw);
    empSheet.appendRow(row);
    const daily = i % 2 === 0, rate = daily ? 400 + i * 20 : 55 + i * 3;
    ruleSheet.appendRow([id, daily ? 'daily' : 'hourly', rate, 8, i % 3 === 0 ? 'true' : 'false', 1.5, '', 1, new Date(), 'seed']);
    created.push(id);
  });
  const log = ss.getSheetByName(SHEETS.attendance), out = [], today = new Date();
  for (let d = 0; d < 365; d++) {
    const day = new Date(today.getTime() - d * 86400000); if (day.getDay() === 0) continue; // skip Sundays
    const y = day.getFullYear(), mo = day.getMonth(), da = day.getDate();
    created.forEach(id => {
      if (Math.random() < 0.08) return; // ~8% absence
      const tIn = new Date(y, mo, da, 8, Math.floor(Math.random() * 25)), tOut = new Date(y, mo, da, 17, Math.floor(Math.random() * 40));
      out.push([Utilities.getUuid(), id, 'BVN-HQ', 'check_in', tIn, '', '', '', '', 'accepted', '', 'seed', 'accepted', new Date()]);
      out.push([Utilities.getUuid(), id, 'BVN-HQ', 'check_out', tOut, '', '', '', '', 'accepted', '', 'seed', 'accepted', new Date()]);
    });
  }
  if (out.length) log.getRange(log.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
  const sites = ss.getSheetByName(SHEETS.sites);
  if (!values_(sites).slice(1).some(r => String(r[0]) === 'BVN-HQ')) sites.appendRow(['BVN-HQ', 'ร้าน BVN สาขาหลัก', 13.762962071350593, 100.5582875856417, 200, 'true']);
  return 'Seeded ' + created.length + ' employees + ' + out.length + ' attendance rows (' + created.join(', ') + ')';
}

function adminListInvoices_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializeInvoicesSheet();
  const today = Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd');
  const invoices = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.invoices)).slice(1).map((row, index) => invoiceFromRow_(row, index + 2, today)).filter(invoice => invoice.invoiceNo);
  return reply_(true, 'Invoices loaded', { invoices: invoices });
}

function adminCreateInvoice_(payload) {
  requireRole_(payload, ['owner', 'manager', 'finance']); initializeInvoicesSheet();
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
  requireRole_(payload, ['owner', 'manager', 'finance']); initializeInvoicesSheet();
  const invoiceNo = String(payload.invoiceNo || '').trim(), status = normalise_(payload.status);
  if (!invoiceNo || !['draft', 'issued', 'paid', 'void'].includes(status)) return reply_(false, 'Invalid invoice status');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.invoices), rows = values_(sheet), index = rows.slice(1).findIndex(row => String(row[0]) === invoiceNo);
  if (index < 0) return reply_(false, 'Invoice not found');
  const current = normalise_(rows[index + 1][7]), allowed = { draft: ['issued', 'void'], issued: ['paid', 'void'] };
  if (!(allowed[current] || []).includes(status)) return reply_(false, 'Invoice status transition is not allowed');
  const paymentReference = String(payload.paymentReference || '').trim();
  if (status === 'paid' && !paymentReference) return reply_(false, 'Payment reference is required when marking paid');
  sheet.getRange(index + 2, 8, 1, 5).setValues([[status, rows[index + 1][8], new Date(), status === 'paid' ? paymentReference : rows[index + 1][10], status === 'paid' ? new Date() : rows[index + 1][11]]]);
  audit_(adminActor_(payload), 'invoice_' + status, invoiceNo, paymentReference);
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
  requireOperationsRole_(payload); initializeTimeRequestsSheet();
  const requests = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests)).slice(1)
    .map(row => timeRequestFromRow_(row)).filter(request => request.requestId);
  return reply_(true, 'Time requests loaded', { requests: requests });
}

function adminReviewTimeRequest_(payload) {
  requireOperationsRole_(payload); initializeTimeRequestsSheet();
  const requestId = String(payload.requestId || '').trim(), decision = normalise_(payload.decision);
  const reviewer = adminActor_(payload), note = String(payload.reviewerNote || '').trim();
  if (!requestId || !['approved', 'rejected'].includes(decision)) return reply_(false, 'Invalid time request decision');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests), rows = values_(sheet);
  const index = rows.slice(1).findIndex(row => String(row[0]) === requestId && normalise_(row[6]) === 'pending');
  if (index < 0) return reply_(false, 'Pending time request was not found');
  sheet.getRange(index + 2, 7, 1, 5).setValues([[decision, rows[index + 1][7], reviewer, new Date(), note]]);
  audit_(reviewer, 'time_request_' + decision, requestId, note);
  return reply_(true, 'Time request ' + decision);
}

// Admin voids a whole attendance day for one employee (both check-in and check-out
// rows of that Bangkok date). Non-destructive: the row stays in the sheet for audit,
// its status becomes 'voided' so payroll and the attendance view stop counting it.
function adminVoidAttendanceDay_(payload) {
  requireOperationsRole_(payload);
  const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const date = String(payload.date || '').trim();
  const reviewer = adminActor_(payload);
  if (!employeeId || !parseIsoDate_(date)) return reply_(false, 'ต้องระบุพนักงานและวันที่');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  let voided = 0;
  try {
    const rows = values_(sheet);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[1]).trim().toUpperCase() !== employeeId) continue;
      if (normalise_(r[9]) !== 'accepted') continue;
      const day = Utilities.formatDate(new Date(r[4]), ICT, 'yyyy-MM-dd');
      if (day !== date) continue;
      sheet.getRange(i + 1, 10).setValue('voided');
      sheet.getRange(i + 1, 11).setValue('voided by ' + reviewer + ' @ ' + Utilities.formatDate(new Date(), ICT, 'yyyy-MM-dd HH:mm'));
      voided++;
    }
  } finally { lock.releaseLock(); }
  if (!voided) return reply_(false, 'ไม่พบบันทึกเวลาที่ใช้งานอยู่ของวันนั้น');
  audit_(reviewer, 'attendance_voided', employeeId, date + ' · ' + voided + ' rows');
  return reply_(true, 'ยกเลิกบันทึกเวลาแล้ว (เก็บไว้ใน Sheet เพื่อ audit)', { employeeId: employeeId, date: date, voided: voided });
}

/* =========================== Audit log (who did what, when) =========================== */
function initializeAuditLogSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!ss.getSheetByName(SHEETS.audit)) { const s = ss.insertSheet(SHEETS.audit); s.appendRow(['Timestamp', 'Actor', 'Action', 'Target', 'Detail']); s.setFrozenRows(1); }
}
// Best-effort audit entry — never let logging break the real operation.
function audit_(actor, action, target, detail) {
  try {
    initializeAuditLogSheet();
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.audit)
      .appendRow([new Date(), String(actor || 'Admin'), String(action || ''), String(target || ''), String(detail || '')]);
  } catch (e) { /* ignore logging failures */ }
}
function adminListAuditLog_(payload) {
  requireRole_(payload, ['owner', 'manager']); initializeAuditLogSheet();
  const rows = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.audit)).slice(1)
    .map(r => ({ at: r[0] ? Utilities.formatDate(new Date(r[0]), ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") : '', actor: String(r[1] || ''), action: String(r[2] || ''), target: String(r[3] || ''), detail: String(r[4] || '') }))
    .filter(r => r.at).reverse().slice(0, 400);
  return reply_(true, 'Audit log loaded', { entries: rows });
}

/* =========================== Admin console accounts (user + password login) =========================== */
// Passwords are HMAC-hashed with the server-side pepper. Legacy plaintext rows
// are migrated only after a successful login and are never returned via the API.
function initializeAdminUsersSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.adminUsers);
  if (!sheet) { sheet = ss.insertSheet(SHEETS.adminUsers); sheet.appendRow(['Username', 'Password hash', 'Display name', 'Active', 'Created at', 'Role']); sheet.setFrozenRows(1); }
  if (normalise_(sheet.getRange(1, 2).getValue()) === 'password') sheet.getRange(1, 2).setValue('Password hash');
  const headers = values_(sheet)[0] || [];
  if (!headers.some(value => normalise_(value) === 'role')) sheet.getRange(1, headers.length + 1).setValue('Role');
  return sheet;
}

/**
 * Editor-only, one-time owner bootstrap. Set INITIAL_ADMIN_USERNAME and
 * INITIAL_ADMIN_PASSWORD in Script Properties, then run this function manually
 * as the Sheet owner. It refuses to run when any Admin already exists and
 * deletes the temporary properties immediately after writing the HMAC hash.
 */
function bootstrapInitialAdmin() {
  const sheet = initializeAdminUsersSheet(), rows = values_(sheet);
  if (rows.slice(1).some(row => String(row[0] || '').trim())) throw new Error('มีบัญชี Admin อยู่แล้ว — ใช้ Admin Codex เพื่อสร้างบัญชีใหม่');
  const props = PropertiesService.getScriptProperties();
  const username = String(props.getProperty('INITIAL_ADMIN_USERNAME') || '').trim();
  const password = String(props.getProperty('INITIAL_ADMIN_PASSWORD') || '');
  const displayName = String(props.getProperty('INITIAL_ADMIN_DISPLAY_NAME') || username).trim();
  if (!username || password.length < 8) throw new Error('ตั้ง INITIAL_ADMIN_USERNAME และ INITIAL_ADMIN_PASSWORD (อย่างน้อย 8 ตัวอักษร) ก่อน bootstrap');
  sheet.appendRow([username, hashAdminPassword_(password), displayName || username, 'true', new Date(), 'owner']);
  ['INITIAL_ADMIN_USERNAME', 'INITIAL_ADMIN_PASSWORD', 'INITIAL_ADMIN_DISPLAY_NAME'].forEach(key => props.deleteProperty(key));
  return { username: username, displayName: displayName || username, role: 'owner' };
}

/** Ephemeral sessions mean the desktop never needs the owner API key after login. */
function initializeAdminSessionsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.adminSessions);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.adminSessions);
    sheet.appendRow(['Token hash', 'Username', 'Display name', 'Expires at', 'Last used at', 'Status', 'Role']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function issueAdminSession_(username, displayName, role) {
  const rawToken = Utilities.getUuid() + Utilities.getUuid();
  const now = new Date(), expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const sheet = initializeAdminSessionsSheet();
  pruneAdminSessions_(sheet, now);
  sheet.appendRow([hashMobileToken_(rawToken), username, displayName, expiresAt, now, 'active', normaliseAdminRole_(role)]);
  return { token: rawToken, expiresAt: Utilities.formatDate(expiresAt, ICT, "yyyy-MM-dd'T'HH:mm:ssXXX") };
}

// Keep the temporary-session sheet operationally bounded. The most recent
// sessions remain; expired/revoked sessions older than 30 days are audit noise.
function pruneAdminSessions_(sheet, now) {
  const rows = values_(sheet), cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (let i = rows.length - 1; i >= 1; i--) {
    const expiresAt = new Date(rows[i][3]).getTime(), status = normalise_(rows[i][5]);
    if ((status === 'revoked' || status === 'expired' || (expiresAt && expiresAt < now.getTime())) && (expiresAt || 0) < cutoff) sheet.deleteRow(i + 1);
  }
}

function authenticateAdminSession_(rawToken) {
  if (!rawToken) return null;
  const sheet = initializeAdminSessionsSheet(), rows = values_(sheet), tokenHash = hashMobileToken_(rawToken), now = new Date();
  const index = rows.slice(1).findIndex(row => constantTimeEqual_(String(row[0] || ''), tokenHash)
    && normalise_(row[5]) === 'active' && new Date(row[3]).getTime() > now.getTime());
  if (index < 0) return null;
  const row = rows[index + 1];
  sheet.getRange(index + 2, 5).setValue(now);
  return { username: String(row[1] || ''), displayName: String(row[2] || row[1] || 'Admin'), role: normaliseAdminRole_(row[6]) };
}

function adminConsoleLogout_(payload) {
  const rawToken = String(payload.adminToken || '');
  if (!rawToken) return reply_(true, 'ออกจากระบบแล้ว');
  const sheet = initializeAdminSessionsSheet(), rows = values_(sheet), tokenHash = hashMobileToken_(rawToken);
  const index = rows.slice(1).findIndex(row => constantTimeEqual_(String(row[0] || ''), tokenHash));
  if (index >= 0) sheet.getRange(index + 2, 6).setValue('revoked');
  return reply_(true, 'ออกจากระบบแล้ว');
}

function revokeAdminSessionsForUser_(username) {
  const sheet = initializeAdminSessionsSheet(), rows = values_(sheet), target = String(username || '').trim().toLowerCase();
  rows.slice(1).forEach((row, index) => {
    if (String(row[1] || '').trim().toLowerCase() === target && normalise_(row[5]) === 'active') sheet.getRange(index + 2, 6).setValue('revoked');
  });
}

function adminConsoleLogin_(payload) {
  const sheet = initializeAdminUsersSheet();
  const username = String(payload.username || '').trim(), password = String(payload.password || '');
  if (!username || !password) return reply_(false, 'กรอกชื่อผู้ใช้และรหัสผ่าน');
  if (adminLoginLocked_(username)) return reply_(false, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  const rows = values_(sheet);
  const rowIndex = rows.slice(1).findIndex(r => String(r[0]).trim().toLowerCase() === username.toLowerCase() && normalise_(r[3]) !== 'false');
  if (rowIndex < 0) { recordFailedAdminLogin_(username); return reply_(false, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); }
  const row = rows[rowIndex + 1], stored = String(row[1] || ''), hashed = hashAdminPassword_(password);
  const valid = stored.indexOf('h1:') === 0 ? constantTimeEqual_(stored, hashed) : constantTimeEqual_(stored, password);
  if (!valid) { recordFailedAdminLogin_(username); return reply_(false, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); }
  if (stored.indexOf('h1:') !== 0) sheet.getRange(rowIndex + 2, 2).setValue(hashed);
  clearFailedAdminLogin_(username);
  const role = normaliseAdminRole_(row[5]);
  const session = issueAdminSession_(String(row[0]), String(row[2] || row[0]), role);
  audit_(String(row[2] || row[0]), 'admin_login', String(row[0]), 'console session issued');
  return reply_(true, 'เข้าสู่ระบบสำเร็จ', { adminToken: session.token, username: String(row[0]), displayName: String(row[2] || row[0]), role: role, expiresAt: session.expiresAt });
}

function adminListAdminUsers_(payload) {
  requireOwner_(payload);
  const rows = values_(initializeAdminUsersSheet()).slice(1)
    .map(r => ({ username: String(r[0]), displayName: String(r[2] || r[0]), active: normalise_(r[3]) !== 'false', role: normaliseAdminRole_(r[5]) }))
    .filter(u => u.username);
  return reply_(true, 'Admin users loaded', { users: rows });
}

function adminUpsertAdminUser_(payload) {
  requireOwner_(payload);
  const sheet = initializeAdminUsersSheet();
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const displayName = String(payload.displayName || username).trim();
  const role = normaliseAdminRole_(payload.role);
  const active = payload.active === false ? 'false' : 'true';
  if (!username) return reply_(false, 'ต้องมีชื่อผู้ใช้');
  if (password && password.length < 8) return reply_(false, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  const rows = values_(sheet);
  const idx = rows.slice(1).findIndex(r => String(r[0]).trim().toLowerCase() === username.toLowerCase());
  if (idx >= 0) {
    const existing = rows[idx + 1];
    const activeOwners = rows.slice(1).filter(r => normalise_(r[3]) !== 'false' && normaliseAdminRole_(r[5]) === 'owner').length;
    if (normaliseAdminRole_(existing[5]) === 'owner' && activeOwners <= 1 && (role !== 'owner' || active === 'false')) return reply_(false, 'ต้องมีบัญชี Owner ที่ใช้งานได้อย่างน้อย 1 บัญชี');
    const finalPasswordHash = password ? hashAdminPassword_(password) : String(existing[1] || '');
    if (!finalPasswordHash) return reply_(false, 'ต้องมีรหัสผ่าน');
    sheet.getRange(idx + 2, 1, 1, 6).setValues([[username, finalPasswordHash, displayName, active, existing[4] || new Date(), role]]);
  } else {
    if (!password) return reply_(false, 'ผู้ใช้ใหม่ต้องตั้งรหัสผ่าน');
    sheet.appendRow([username, hashAdminPassword_(password), displayName, active, new Date(), role]);
  }
  revokeAdminSessionsForUser_(username);
  audit_(adminActor_(payload), 'admin_user_saved', username, '');
  return reply_(true, 'บันทึกบัญชีแอดมินแล้ว', { username: username });
}

function adminDeleteAdminUser_(payload) {
  requireOwner_(payload);
  const sheet = initializeAdminUsersSheet();
  const username = String(payload.username || '').trim();
  if (!username) return reply_(false, 'ต้องมีชื่อผู้ใช้');
  const rows = values_(sheet).slice(1).filter(r => String(r[0]));
  const activeOthers = rows.filter(r => String(r[0]).trim().toLowerCase() !== username.toLowerCase() && normalise_(r[3]) !== 'false');
  if (activeOthers.length === 0) return reply_(false, 'ต้องมีบัญชีแอดมินที่ใช้งานได้อย่างน้อย 1 บัญชี');
  const target = rows.find(r => String(r[0]).trim().toLowerCase() === username.toLowerCase());
  const activeOwners = rows.filter(r => normalise_(r[3]) !== 'false' && normaliseAdminRole_(r[5]) === 'owner').length;
  if (target && normaliseAdminRole_(target[5]) === 'owner' && activeOwners <= 1) return reply_(false, 'ต้องมีบัญชี Owner ที่ใช้งานได้อย่างน้อย 1 บัญชี');
  const all = values_(sheet);
  const idx = all.slice(1).findIndex(r => String(r[0]).trim().toLowerCase() === username.toLowerCase());
  if (idx < 0) return reply_(false, 'ไม่พบบัญชีนี้');
  revokeAdminSessionsForUser_(username);
  sheet.deleteRow(idx + 2);
  audit_(adminActor_(payload), 'admin_user_deleted', username, '');
  return reply_(true, 'ลบบัญชีแอดมินแล้ว', { username: username });
}

// Admin records overtime directly (OT is no longer submitted from the mobile app).
// Writes an already-approved OT row so payroll picks it up immediately.
function adminAddOvertime_(payload) {
  requireOperationsRole_(payload); initializeTimeRequestsSheet();
  const employeeId = String(payload.employeeId || '').trim().toUpperCase();
  const workDate = parseIsoDate_(payload.workDate);
  const requestedMinutes = finiteNumber_(payload.requestedMinutes);
  const reason = String(payload.reason || 'OT (บันทึกโดยแอดมิน)').trim();
  const reviewer = adminActor_(payload);
  if (!findEmployee_(employeeId)) return reply_(false, 'Employee was not found');
  if (!workDate || requestedMinutes === null || requestedMinutes <= 0 || requestedMinutes > 1440) return reply_(false, 'Invalid overtime entry');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const now = new Date();
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.timeRequests)
      .appendRow([Utilities.getUuid(), employeeId, 'overtime', workDate, Math.round(requestedMinutes), reason, 'approved', now, reviewer, now, 'บันทึกโดยแอดมินโดยตรง']);
  } finally { lock.releaseLock(); }
  audit_(reviewer, 'overtime_added', employeeId, Utilities.formatDate(workDate, ICT, 'yyyy-MM-dd') + ' · ' + Math.round(requestedMinutes) + ' นาที');
  return reply_(true, 'Overtime recorded', { employeeId: employeeId, workDate: Utilities.formatDate(workDate, ICT, 'yyyy-MM-dd'), requestedMinutes: Math.round(requestedMinutes) });
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

function migrateEmployeePasswordHash_(employeeId, passwordHash) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.employees), rows = values_(sheet), columns = employeeColumns_(rows[0]);
  const index = rows.slice(1).findIndex(row => String(row[columns.id]) === String(employeeId));
  if (index >= 0) sheet.getRange(index + 2, columns.passwordHash + 1).setValue(passwordHash);
}
function employeeColumns_(headers) {
  const position = (name) => headers.findIndex(h => normalise_(h) === name);
  const columns = { id: position('employee id'), name: position('name'), role: position('role'), department: position('department'), siteId: position('work site id'), status: position('status'), locationRequired: position('location required'), passwordHash: position('password hash') };
  if (Object.values(columns).some(index => index < 0)) throw new Error('Employees sheet headers are incomplete. Run initializeEmployeesSheet.');
  return columns;
}
function employeeFromRow_(row, columns) { const c = columns || { id: 0, name: 1, role: 2, department: 3, siteId: 4, status: 5, locationRequired: 6, passwordHash: 7 }; if (!row) return null; const locRaw = row[c.locationRequired]; const locationRequired = !(locRaw === false || String(locRaw).trim().toLowerCase() === 'false'); return { id: String(row[c.id]), name: String(row[c.name] || ''), role: String(row[c.role] || ''), department: String(row[c.department] || ''), siteId: String(row[c.siteId] || ''), status: normalise_(row[c.status]), locationRequired: locationRequired, passwordHash: String(row[c.passwordHash] || '') }; }
function employeeForAdmin_(employee) {
  if (!employee) return null;
  return { id: employee.id, name: employee.name, role: employee.role, department: employee.department, siteId: employee.siteId, status: employee.status, locationRequired: employee.locationRequired };
}
function findSite_(siteId) {
  const row = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.sites)).slice(1).find(r => String(r[0]) === siteId && normalise_(r[5]) === 'true');
  return row ? { id: String(row[0]), lat: Number(row[2]), lng: Number(row[3]), radius: Number(row[4]) } : null;
}
// All active check-in sites (blank "Active" counts as active, matching the admin list).
function activeSites_() {
  const cached = cacheGet_('sites_v1');
  if (cached) return cached;
  initializeWorkSitesSheet();
  const list = values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.sites)).slice(1)
    .filter(r => String(r[0]) && normalise_(r[5]) !== 'false')
    .map(r => ({ id: String(r[0]), name: String(r[1] || ''), lat: Number(r[2]), lng: Number(r[3]), radius: Number(r[4]) }));
  cachePut_('sites_v1', list, 120);
  return list;
}
function employeeSites_(payload) {
  if (!authenticateMobile_(payload.mobileToken)) return reply_(false, 'Mobile authentication failed');
  return reply_(true, 'Sites loaded', { sites: activeSites_() });
}

/* =========================== Holidays =========================== */
function initializeHolidaysSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!ss.getSheetByName(SHEETS.holidays)) { const s = ss.insertSheet(SHEETS.holidays); s.appendRow(['Date', 'Name']); s.setFrozenRows(1); }
}
function holidayMap_() {
  initializeHolidaysSheet();
  return values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.holidays)).slice(1).reduce(function (m, r) {
    const d = r[0] ? Utilities.formatDate(new Date(r[0]), ICT, 'yyyy-MM-dd') : ''; if (d) m[d] = String(r[1] || 'วันหยุด'); return m;
  }, {});
}
function adminListHolidays_(payload) {
  requireOwner_(payload);
  const map = holidayMap_();
  const rows = Object.keys(map).sort().map(function (d) { return { date: d, name: map[d] }; });
  return reply_(true, 'Holidays loaded', { holidays: rows });
}
function adminSaveHoliday_(payload) {
  requireOwner_(payload); initializeHolidaysSheet();
  const date = String(payload.date || '').trim(), name = String(payload.name || 'วันหยุด').trim();
  if (!parseIsoDate_(date)) return reply_(false, 'วันที่ต้องเป็น YYYY-MM-DD');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.holidays), rows = values_(sheet);
  const idx = rows.slice(1).findIndex(function (r) { return r[0] && Utilities.formatDate(new Date(r[0]), ICT, 'yyyy-MM-dd') === date; });
  if (idx >= 0) sheet.getRange(idx + 2, 1, 1, 2).setValues([[date, name]]); else sheet.appendRow([date, name]);
  audit_(adminActor_(payload), 'holiday_saved', date, name);
  return reply_(true, 'บันทึกวันหยุดแล้ว', { date: date, name: name });
}
function adminDeleteHoliday_(payload) {
  requireOwner_(payload); initializeHolidaysSheet();
  const date = String(payload.date || '').trim();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.holidays), rows = values_(sheet);
  const idx = rows.slice(1).findIndex(function (r) { return r[0] && Utilities.formatDate(new Date(r[0]), ICT, 'yyyy-MM-dd') === date; });
  if (idx < 0) return reply_(false, 'ไม่พบวันหยุดนี้');
  sheet.deleteRow(idx + 2);
  audit_(adminActor_(payload), 'holiday_deleted', date, '');
  return reply_(true, 'ลบวันหยุดแล้ว', { date: date });
}

// Import Thai public holidays for a year from a free source (date.nager.at), skipping any already present.
function adminImportHolidays_(payload) {
  requireOwner_(payload); initializeHolidaysSheet();
  const year = parseInt(payload.year, 10) || Number(Utilities.formatDate(new Date(), ICT, 'yyyy'));
  let added = 0;
  try {
    const res = UrlFetchApp.fetch('https://date.nager.at/api/v3/PublicHolidays/' + year + '/TH', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return reply_(false, 'ดึงข้อมูลวันหยุดไม่สำเร็จ (HTTP ' + res.getResponseCode() + ')');
    const list = JSON.parse(res.getContentText());
    if (!Array.isArray(list)) return reply_(false, 'รูปแบบข้อมูลวันหยุดไม่ถูกต้อง');
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.holidays);
    const existing = holidayMap_();
    list.forEach(function (h) { const d = String(h.date || ''); const name = String(h.localName || h.name || 'วันหยุด'); if (d && !existing[d]) { sheet.appendRow([d, name]); existing[d] = name; added++; } });
  } catch (e) { return reply_(false, 'ดึงข้อมูลไม่สำเร็จ: ' + e.message); }
  audit_(adminActor_(payload), 'holidays_imported', String(year), 'added ' + added);
  return reply_(true, 'ดึงวันหยุดราชการปี ' + year + ' แล้ว (เพิ่ม ' + added + ' วัน)', { year: year, added: added });
}

/* =========================== Employee monthly attendance (calendar) =========================== */
// Returns per-day status for one employee across a month, applying the shift-start
// (late), lunch deduction + 8h OT threshold, holidays, and approved leaves.
function employeeMonth_(payload) {
  const employeeId = authenticateMobile_(payload.mobileToken);
  if (!employeeId) return reply_(false, 'Mobile authentication failed');
  const today = new Date();
  let year = parseInt(payload.year, 10), month = parseInt(payload.month, 10); // month 1-12
  if (!year || !month || month < 1 || month > 12) { year = Number(Utilities.formatDate(today, ICT, 'yyyy')); month = Number(Utilities.formatDate(today, ICT, 'MM')); }
  const settings = readSettings_();
  const shiftParts = String(settings.shift_start || '09:00').split(':');
  const shiftMinutes = (Number(shiftParts[0]) || 9) * 60 + (Number(shiftParts[1]) || 0);
  const grace = Number(settings.shift_grace_min || 5), lunch = Number(settings.lunch_break_min || 60);
  const otThreshold = Number(settings.ot_threshold_hours || 8) * 60, holidayOt = normalise_(settings.holiday_ot_enabled) === 'true';
  const workdays = String(settings.workdays || '1,2,3,4,5').split(',').map(function (s) { return s.trim(); });
  const holidays = holidayMap_();
  // approved leaves overlapping this month → date -> type
  const leaveByDate = {};
  initializeLeaveRequestsSheet();
  values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.leaves)).slice(1).forEach(function (r) {
    if (String(r[1]) !== employeeId || normalise_(r[6]) !== 'approved') return;
    var d = new Date(r[3]), end = new Date(r[4]); if (isNaN(d) || isNaN(end)) return;
    for (; d <= end; d.setDate(d.getDate() + 1)) { if (d.getFullYear() === year && (d.getMonth() + 1) === month) leaveByDate[Utilities.formatDate(d, ICT, 'yyyy-MM-dd')] = String(r[2] || 'ลา'); }
  });
  // attendance grouped by day (accepted)
  const byDay = {};
  values_(SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.attendance)).slice(1).forEach(function (r) {
    if (String(r[1]) !== employeeId || String(r[9]) !== 'accepted') return;
    const ts = new Date(r[4]); if (ts.getFullYear() !== year || (ts.getMonth() + 1) !== month) return;
    const day = Utilities.formatDate(ts, ICT, 'yyyy-MM-dd'), it = byDay[day] || { in: null, out: null };
    if (String(r[3]) === 'check_in') it.in = it.in ? (ts < it.in ? ts : it.in) : ts;
    if (String(r[3]) === 'check_out') it.out = it.out ? (ts > it.out ? ts : it.out) : ts;
    byDay[day] = it;
  });
  const todayStr = Utilities.formatDate(today, ICT, 'yyyy-MM-dd');
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  for (let dn = 1; dn <= daysInMonth; dn++) {
    const dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(dn).padStart(2, '0');
    const dow = new Date(dateStr + 'T00:00:00+07:00').getDay();
    const rec = byDay[dateStr], isHoliday = !!holidays[dateStr], leaveType = leaveByDate[dateStr] || '';
    let status, inStr = '', outStr = '', workedMinutes = 0, otMinutes = 0, late = false;
    if (rec && rec.in) {
      inStr = Utilities.formatDate(rec.in, ICT, 'HH:mm');
      const inMin = rec.in.getHours() * 60 + rec.in.getMinutes();
      late = !isHoliday && leaveType === '' && inMin > shiftMinutes + grace;
      if (rec.out && rec.out > rec.in) {
        outStr = Utilities.formatDate(rec.out, ICT, 'HH:mm');
        workedMinutes = Math.round((rec.out - rec.in) / 60000);
        const net = Math.max(0, workedMinutes - lunch);
        otMinutes = (isHoliday && holidayOt) ? net : Math.max(0, net - otThreshold);
        status = isHoliday ? 'holiday_work' : (late ? 'late' : 'normal');
      } else { status = 'incomplete'; }
    } else if (leaveType) { status = 'leave'; }
    else if (isHoliday) { status = 'holiday'; }
    else if (dateStr > todayStr) { status = 'future'; }
    else if (workdays.indexOf(String(dow)) >= 0) { status = 'absent'; }
    else { status = 'off'; }
    days.push({ date: dateStr, day: dn, dow: dow, status: status, checkIn: inStr, checkOut: outStr, workedMinutes: workedMinutes, otMinutes: otMinutes, late: late, holidayName: holidays[dateStr] || '', leaveType: leaveType });
  }
  return reply_(true, 'Month loaded', { year: year, month: month, shiftStart: settings.shift_start, lunchBreakMin: lunch, otThresholdHours: Number(settings.ot_threshold_hours || 8), days: days });
}
function parsePayload_(e) { if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 20000) throw new Error('Invalid request body'); const payload = JSON.parse(e.postData.contents); if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid JSON object'); return payload; }
function values_(sheet) { if (!sheet) throw new Error('Required spreadsheet tab is missing'); return sheet.getDataRange().getValues(); }
function valuesIfSheet_(sheet) { return sheet ? sheet.getDataRange().getValues() : [[]]; }
function requiredProperty_(key) { const value = PropertiesService.getScriptProperties().getProperty(key); if (!value) throw new Error('Missing Script Property: ' + key); return value; }
function requireAdmin_(payload) {
  const token = String(payload.adminToken || '');
  // Compatibility path for the original desktop client and emergency owner recovery.
  // The normal Admin Codex login never receives this master key.
  if (constantTimeEqual_(token, requiredProperty_('ADMIN_API_KEY'))) {
    payload._adminActor = 'System owner';
    payload._adminRole = 'owner';
    return { username: 'system-owner', displayName: 'System owner', role: 'owner', master: true };
  }
  const session = authenticateAdminSession_(token);
  if (!session) throw new Error('Administrator authentication failed');
  payload._adminActor = session.displayName;
  payload._adminRole = session.role;
  return session;
}
function normaliseAdminRole_(value) {
  const role = normalise_(value);
  // Blank is intentionally Owner for existing rows so deployment cannot lock
  // out the business owner. New account creation always persists an explicit role.
  return ['owner', 'manager', 'operations', 'finance'].indexOf(role) >= 0 ? role : 'owner';
}
function adminLoginThrottleKey_(username) { return 'bvn_admin_login_' + hashMobileToken_(normalise_(username)); }
function adminLoginLocked_(username) {
  const raw = CacheService.getScriptCache().get(adminLoginThrottleKey_(username));
  if (!raw) return false;
  try { return Number(JSON.parse(raw).lockedUntil || 0) > Date.now(); } catch (_) { return false; }
}
function recordFailedAdminLogin_(username) {
  const cache = CacheService.getScriptCache(), key = adminLoginThrottleKey_(username), now = Date.now();
  let previous = {};
  try { previous = JSON.parse(cache.get(key) || '{}'); } catch (_) { previous = {}; }
  const count = Number(previous.count || 0) + 1;
  // Five failures cause a short lock. The generic client response avoids
  // revealing whether a username exists or whether it is temporarily locked.
  const lockedUntil = count >= 5 ? now + 15 * 60 * 1000 : 0;
  cache.put(key, JSON.stringify({ count: count, lockedUntil: lockedUntil }), lockedUntil ? 15 * 60 : 15 * 60);
}
function clearFailedAdminLogin_(username) { CacheService.getScriptCache().remove(adminLoginThrottleKey_(username)); }
function requireRole_(payload, allowedRoles) {
  const actor = requireAdmin_(payload);
  if (allowedRoles.indexOf(actor.role) < 0) throw new Error('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');
  return actor;
}
function requireOwner_(payload) { return requireRole_(payload, ['owner']); }
function requireOperationsRole_(payload) { return requireRole_(payload, ['owner', 'manager', 'operations']); }
function adminActor_(payload, fallback) { return String(payload._adminActor || fallback || payload.reviewer || 'Admin'); }
function hashMobileToken_(rawToken) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(rawToken), requiredProperty_('MOBILE_TOKEN_PEPPER'))); }
function hashAdminPassword_(password) { return 'h1:' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(password), requiredProperty_('MOBILE_TOKEN_PEPPER'))); }
function hashEmployeePassword_(password) { return 'h1:' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(password), requiredProperty_('MOBILE_TOKEN_PEPPER'))); }
function temporaryPassword_() { return String(Math.floor(10000000 + Math.random() * 90000000)); }
function nextEmployeeId_(rows) { const idColumn = employeeColumns_(rows[0]).id; const numbers = rows.slice(1).map(r => /^EMP-(\d+)$/.exec(String(r[idColumn] || ''))).filter(Boolean).map(m => Number(m[1])); return 'EMP-' + String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0'); }
function finiteNumber_(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function roundMoney_(value) { return Math.round(Number(value || 0) * 100) / 100; }
function parseIsoDate_(value) { const text = String(value || ''); const parts = text.split('-'); if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2 || parts.some(p => isNaN(Number(p)))) return null; const date = new Date(text + 'T00:00:00+07:00'); return isNaN(date.getTime()) ? null : date; }
function normalise_(value) { return String(value || '').trim().toLowerCase(); }
function constantTimeEqual_(a, b) { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
function metres_(a, b, c, d) { const r = 6371e3, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180, q = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)); }
function reply_(ok, message, data) { return ContentService.createTextOutput(JSON.stringify({ ok: ok, message: message, data: data || null })).setMimeType(ContentService.MimeType.JSON); }

/* =========================== DANGER: data reset (run manually from the editor) ===========================
   Clears ALL operational data but KEEPS admin accounts (Admin_Users) and Settings.
   Run from the Apps Script editor: select resetAllDataKeepAdmin → Run. IRREVERSIBLE.
   It only wipes data rows (row 2 onward); header rows and sheet structure stay. */
function resetAllDataKeepAdmin() {
  const KEEP = [SHEETS.adminUsers, SHEETS.settings]; // admin login + config are preserved
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const report = [];
  Object.keys(SHEETS).forEach(function (k) {
    const name = SHEETS[k];
    if (KEEP.indexOf(name) >= 0) return;
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last > 1) { sheet.deleteRows(2, last - 1); report.push(name + ': cleared ' + (last - 1)); }
    else { report.push(name + ': already empty'); }
  });
  try { CacheService.getScriptCache().removeAll(['dir_v1', 'sites_v1']); } catch (e) { }
  Logger.log('RESET DONE (kept: ' + KEEP.join(', ') + ')\n' + report.join('\n'));
  return report;
}

/* ---- Lightweight read cache (Script-wide) to cut repeated full-sheet reads ---- */
function cacheGet_(key) { try { const v = CacheService.getScriptCache().get(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cachePut_(key, obj, seconds) { try { CacheService.getScriptCache().put(key, JSON.stringify(obj), seconds || 60); } catch (e) { /* value too big or quota — skip */ } }
function cacheDel_(key) { try { CacheService.getScriptCache().remove(key); } catch (e) { } }
