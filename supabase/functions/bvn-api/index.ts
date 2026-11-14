// ============================================================================
//  BVN Package — Supabase Edge Function "bvn-api"  (v2, admin console parity)
//  Trusted server with the SAME contract as the old Apps Script backend, backed
//  by Supabase (Postgres) via the service role. Point the console endpoint here.
//
//  Request  (POST, JSON or text/plain JSON): { action, adminToken?, ...fields }
//  Response (JSON): { ok: boolean, message: string, data: object|null }
//
//  Ported: the whole ADMIN/console surface — login, dashboard, employees,
//  attendance (record/list/void), settings, holidays (list/save/delete/import),
//  leave + time requests (list/review/leave-usage/add-overtime), pay rules,
//  payroll (preview/owner-overview/lock/list/get), invoices, advances, sites,
//  admin users, audit log, password requests. Passwords are hashed (PBKDF2);
//  plaintext is still accepted for the seed admin until it is changed.
//
//  Mobile APP actions are also ported: employee_directory/login/profile/sites,
//  attendance (GPS validation + auto-OT on checkout), employee_month, timeline,
//  leave_request/leave_calendar, time_request/employee_time_requests,
//  employee_submit_advance/employee_advances, change/request-reset password.
//
//  Deploy (owner): supabase functions deploy bvn-api --no-verify-jwt
//  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const reply = (ok: boolean, message: string, data: unknown = null) =>
  new Response(JSON.stringify({ ok, message, data }), { headers: CORS });

const BACKEND_VERSION = "2.0.0-supabase";
const ICT = 7 * 60;
const todayISO = () => new Date(Date.now() + ICT * 60000).toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const dayOf = (ts: string) => new Date(new Date(ts).getTime() + ICT * 60000).toISOString().slice(0, 10);
const hhmm = (ms: number) => new Date(ms + ICT * 60000).toISOString().slice(11, 16);
const round = (n: number) => Math.round(Number(n || 0) * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();

// ---------- password hashing (PBKDF2-SHA256) ----------
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function hashPw(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$100000$${b64(salt.buffer)}$${b64(bits)}`;
}
async function verifyPw(pw: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2$")) return pw === stored; // legacy plaintext (e.g. the 'changeme' seed)
  const [, iter, saltB64, hashB64] = stored.split("$");
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: Number(iter), hash: "SHA-256" }, key, 256);
  return b64(bits) === hashB64;
}

// ---------- shared helpers ----------
async function settingsMap(): Promise<Record<string, string>> {
  const { data } = await db.from("settings").select("key,value");
  const m: Record<string, string> = {};
  (data || []).forEach((r: any) => (m[r.key] = r.value ?? ""));
  return m;
}
async function nameMap(): Promise<Record<string, { name: string; role: string; status: string }>> {
  const { data } = await db.from("employees").select("employee_id,name,role,status");
  const m: Record<string, any> = {};
  (data || []).forEach((e: any) => (m[e.employee_id] = { name: e.name, role: e.role || "", status: e.status || "active" }));
  return m;
}
async function verify(adminToken: string, roles?: string[]) {
  if (!adminToken) throw new Error("ไม่พบ session กรุณาเข้าสู่ระบบใหม่");
  const { data } = await db.from("admin_sessions").select("*").eq("token_hash", adminToken).eq("status", "active").maybeSingle();
  if (!data || (data.expires_at && new Date(data.expires_at).getTime() < Date.now()))
    throw new Error("session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  if (roles && !roles.includes(data.role)) throw new Error("บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้");
  db.from("admin_sessions").update({ last_used_at: nowISO() }).eq("token_hash", adminToken).then(() => {});
  return data as { username: string; display_name: string; role: string };
}
const OPS = ["owner", "manager", "operations"];
const FIN = ["owner", "manager", "finance"];
async function audit(actor: string, action: string, target: string, detail = "") {
  try { await db.from("audit_log").insert({ ts: nowISO(), actor, action, target, detail }); } catch { /* ignore */ }
}

// ---------- mobile (employee app) helpers ----------
const MAX_ACCURACY_M = 100;
function metres(a: number, b: number, c: number, d: number): number {
  const R = 6371e3, x = ((c - a) * Math.PI) / 180, y = ((d - b) * Math.PI) / 180;
  const q = Math.sin(x / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
async function activeSites() {
  const { data } = await db.from("work_sites").select("*").eq("active", true);
  return (data || []).map((r: any) => ({ id: r.site_id, name: r.name || "", lat: num(r.latitude), lng: num(r.longitude), radius: num(r.radius_m) }));
}
async function authMobile(token: string) {
  if (!token) return null;
  const { data } = await db.from("mobile_access").select("employee_id").eq("token_hash", token).eq("status", "active").maybeSingle();
  if (!data) return null;
  const { data: e } = await db.from("employees").select("*").eq("employee_id", data.employee_id).maybeSingle();
  if (!e || e.status !== "active") return null;
  db.from("mobile_access").update({ last_used_at: nowISO() }).eq("token_hash", token).then(() => {});
  return e;
}
async function holidayMap(year: number): Promise<Record<string, string>> {
  const { data } = await db.from("holidays").select("date,name").like("date", year + "-%");
  const m: Record<string, string> = {}; (data || []).forEach((h: any) => (m[h.date] = h.name)); return m;
}
async function todayAttState(employeeId: string) {
  const day = todayISO();
  const { data } = await db.from("attendance_log").select("event_type").eq("employee_id", employeeId).eq("validity", "accepted")
    .gte("event_time", day + "T00:00:00+07:00").lte("event_time", day + "T23:59:59+07:00");
  return { date: day, checkedIn: (data || []).some((r: any) => r.event_type === "check_in"), checkedOut: (data || []).some((r: any) => r.event_type === "check_out") };
}
async function autoOvertime(employeeId: string, checkoutMs: number) {
  const { data: rule } = await db.from("payroll_rules").select("*").eq("employee_id", employeeId).maybeSingle();
  if (!rule || !rule.ot_enabled) return null;
  const s = await settingsMap();
  const lunch = num(s.lunch_break_min) || 60, thr = (num(s.ot_threshold_hours) || 8) * 60, holOt = s.holiday_ot_enabled === "true";
  const day = dayOf(new Date(checkoutMs).toISOString());
  const isHoliday = !!(await holidayMap(Number(day.slice(0, 4))))[day];
  const { data: ins } = await db.from("attendance_log").select("event_time").eq("employee_id", employeeId).eq("validity", "accepted").eq("event_type", "check_in")
    .gte("event_time", day + "T00:00:00+07:00").lte("event_time", day + "T23:59:59+07:00");
  if (!ins || !ins.length) return null;
  const inMs = Math.min(...ins.map((r: any) => new Date(r.event_time).getTime()));
  const net = Math.max(0, Math.round((checkoutMs - inMs) / 60000) - lunch);
  const overage = isHoliday && holOt ? net : net - thr;
  if (overage < 15) return null;
  const { data: already } = await db.from("time_requests").select("request_id").eq("employee_id", employeeId).eq("request_type", "overtime").eq("work_date", day).limit(1);
  if (already && already.length) return { overtimeMinutes: overage, status: "already_requested" };
  await db.from("time_requests").insert({ request_id: crypto.randomUUID(), employee_id: employeeId, request_type: "overtime", work_date: day, requested_minutes: overage, reason: "อัตโนมัติ: ทำเกินเวลามาตรฐาน " + overage + " นาที", status: "pending", submitted_at: nowISO() });
  return { overtimeMinutes: overage, status: "pending" };
}

function otHourly(rule: any): number {
  const basis = lc(rule.pay_basis), rate = num(rule.base_rate), hours = num(rule.standard_hours) || 8;
  if (basis === "monthly") return rate / (num(rule.days_per_month) || 30) / hours;
  if (basis === "daily") return rate / hours;
  return rate;
}
async function outstandingAdvances(): Promise<Record<string, { amount: number }[]>> {
  const { data } = await db.from("advances").select("employee_id,amount,created_at").eq("status", "paid").order("created_at", { ascending: true });
  const m: Record<string, { amount: number }[]> = {};
  (data || []).forEach((a: any) => (m[a.employee_id] = m[a.employee_id] || []).push({ amount: num(a.amount) }));
  return m;
}
function advanceFit(list: { amount: number }[] | undefined, avail: number): number {
  let d = 0;
  for (const it of list || []) { if (d + it.amount > avail) break; d += it.amount; }
  return round(d);
}

// ---------- payroll preview (ported from adminPreviewPayroll_) ----------
async function previewPayroll(start: string, end: string) {
  const [rulesRes, logsRes, otRes, settings] = await Promise.all([
    db.from("payroll_rules").select("*"),
    db.from("attendance_log").select("employee_id,event_type,event_time").eq("validity", "accepted")
      .gte("event_time", start + "T00:00:00+07:00").lte("event_time", end + "T23:59:59+07:00"),
    db.from("time_requests").select("employee_id,requested_minutes,work_date").eq("request_type", "overtime")
      .eq("status", "approved").gte("work_date", start).lte("work_date", end),
    settingsMap(),
  ]);
  const ruleBy: Record<string, any> = {};
  (rulesRes.data || []).forEach((r: any) => (ruleBy[r.employee_id] = r));
  const byDay: Record<string, any> = {};
  (logsRes.data || []).forEach((r: any) => {
    const day = dayOf(r.event_time), key = r.employee_id + "|" + day, t = new Date(r.event_time).getTime();
    const it = byDay[key] || { employeeId: r.employee_id, inTs: null, outTs: null };
    if (r.event_type === "check_in") it.inTs = it.inTs ? Math.min(it.inTs, t) : t;
    if (r.event_type === "check_out") it.outTs = it.outTs ? Math.max(it.outTs, t) : t;
    byDay[key] = it;
  });
  const result: Record<string, any> = {};
  const incompleteByEmp: Record<string, number> = {};
  Object.values(byDay).forEach((it: any) => {
    if (!it.inTs || !it.outTs || it.outTs <= it.inTs) { incompleteByEmp[it.employeeId] = (incompleteByEmp[it.employeeId] || 0) + 1; return; }
    const rule = ruleBy[it.employeeId]; if (!rule) return;
    const line = result[it.employeeId] || { employeeId: it.employeeId, regularMinutes: 0, workDays: 0, otMinutes: 0, baseGross: 0, otGross: 0 };
    const basis = lc(rule.pay_basis), rate = num(rule.base_rate), std = (num(rule.standard_hours) || 8) * 60;
    const minutes = Math.round((it.outTs - it.inTs) / 60000);
    line.workDays += 1; line.regularMinutes += Math.min(minutes, std);
    if (basis === "daily") line.baseGross += rate;
    else if (basis === "hourly") line.baseGross += (Math.min(minutes, std) / 60) * rate;
    result[it.employeeId] = line;
  });
  Object.values(result).forEach((line: any) => { const r = ruleBy[line.employeeId]; if (r && lc(r.pay_basis) === "monthly") line.baseGross = num(r.base_rate); });
  (otRes.data || []).forEach((r: any) => {
    const rule = ruleBy[r.employee_id]; if (!rule) return;
    const line = result[r.employee_id] || { employeeId: r.employee_id, regularMinutes: 0, workDays: 0, otMinutes: 0, baseGross: 0, otGross: 0 };
    const mult = rule.ot_enabled ? num(rule.ot_multiplier) || 1.5 : 0, m = num(r.requested_minutes);
    line.otMinutes += m; line.otGross += (m / 60) * otHourly(rule) * mult;
    result[r.employee_id] = line;
  });
  const outstanding = await outstandingAdvances();
  const ssoEnabled = settings.sso_enabled === "true", ssoRate = num(settings.sso_rate) || 5, ssoCap = num(settings.sso_cap) || 750;
  const lines = Object.values(result).map((line: any) => {
    const gross = round(line.baseGross + line.otGross), rule = ruleBy[line.employeeId] || {};
    const sso = ssoEnabled ? round(Math.min((gross * ssoRate) / 100, ssoCap)) : 0;
    const other = round(num(rule.other_deduction));
    const adv = advanceFit(outstanding[line.employeeId], Math.max(0, gross - sso - other));
    const net = round(Math.max(0, gross - adv - sso - other));
    return { ...line, baseGross: round(line.baseGross), otGross: round(line.otGross), grossPay: gross, advanceDeduction: adv, sso, otherDeduction: other, netPay: net };
  });
  const sum = (k: string) => round(lines.reduce((s: number, l: any) => s + (l[k] || 0), 0));
  return {
    startDate: start, endDate: end, status: "preview",
    disclaimer: "ประมาณการ: หัก = เบิกล่วงหน้า + ประกันสังคม + หักอื่นๆ",
    lines, incompleteDays: [],
    totalGross: sum("grossPay"), totalAdvance: sum("advanceDeduction"), totalSso: sum("sso"), totalOther: sum("otherDeduction"), totalNet: sum("netPay"),
  };
}

// ---------- action handlers ----------
const H: Record<string, (p: any) => Promise<Response>> = {
  async version() {
    const s = await settingsMap();
    return reply(true, "ok", { backendVersion: BACKEND_VERSION, appVersionCode: num(s.app_version_code), appVersionName: s.app_version_name || "", appApkUrl: s.app_apk_url || "", appMandatory: s.app_update_mandatory === "true", appNotes: s.app_update_notes || "" });
  },
  async public_branding() {
    const s = await settingsMap();
    return reply(true, "ok", { name: s.invoice_company_name || "พนมพร พาณิชย์", logoUrl: s.invoice_logo_url || "" });
  },

  async admin_console_login(p) {
    const username = String(p.username || "").trim(), password = String(p.password || "");
    if (!username || !password) return reply(false, "กรอกชื่อผู้ใช้และรหัสผ่าน");
    const { data: u } = await db.from("admin_users").select("*").ilike("username", username).eq("active", true).maybeSingle();
    if (!u || !(await verifyPw(password, String(u.password || "")))) return reply(false, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    const tk = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    await db.from("admin_sessions").insert({ token_hash: tk, username: u.username, display_name: u.display_name || u.username, expires_at: expiresAt, last_used_at: nowISO(), status: "active", role: u.role || "owner" });
    audit(u.display_name || u.username, "admin_login", u.username, "");
    return reply(true, "เข้าสู่ระบบสำเร็จ", { adminToken: tk, username: u.username, displayName: u.display_name || u.username, role: u.role || "owner", expiresAt });
  },
  async admin_console_logout(p) {
    if (p.adminToken) await db.from("admin_sessions").update({ status: "revoked" }).eq("token_hash", p.adminToken);
    return reply(true, "ออกจากระบบแล้ว");
  },

  async dashboard(p) {
    const s = await verify(p.adminToken);
    const day = todayISO();
    const [{ data: emps }, { data: todayLogs }, { count: leaveN }, { count: timeN }, { data: inv }, { data: pays }, { count: exc }] = await Promise.all([
      db.from("employees").select("employee_id,status"),
      db.from("attendance_log").select("employee_id,event_type").eq("validity", "accepted").gte("event_time", day + "T00:00:00+07:00").lte("event_time", day + "T23:59:59+07:00"),
      db.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("time_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("invoices").select("total,status,due_date").eq("status", "issued").lt("due_date", day),
      db.from("payroll_periods").select("payroll_id,status").order("start_date", { ascending: true }),
      db.from("attendance_log").select("*", { count: "exact", head: true }).eq("review_status", "pending"),
    ]);
    const active = (emps || []).filter((e: any) => (e.status || "active") === "active");
    const present = new Set((todayLogs || []).filter((r: any) => r.event_type === "check_in").map((r: any) => r.employee_id));
    const overdue = (inv || []).reduce((t: number, r: any) => t + num(r.total), 0);
    const last = (pays || []).length ? pays![pays!.length - 1] : null;
    return reply(true, "ok", {
      present: active.filter((e: any) => present.has(e.employee_id)).length, totalEmployees: active.length,
      pendingApprovals: (leaveN || 0) + (timeN || 0), exceptions: exc || 0, overdueInvoices: round(overdue),
      latestPayrollId: last ? last.payroll_id : "", latestPayrollStatus: last ? last.status : "", asOf: nowISO(),
      capabilities: { attendance: OPS.includes(s.role), approvals: OPS.includes(s.role), financial: FIN.includes(s.role) },
    });
  },

  async admin_list_employees(p) {
    await verify(p.adminToken, OPS);
    const { data } = await db.from("employees").select("*").order("employee_id");
    return reply(true, "Employees loaded", {
      employees: (data || []).map((e: any) => ({ id: e.employee_id, name: e.name, role: e.role || "", department: e.department || "", siteId: e.work_site_id || "", status: e.status || "active", locationRequired: e.location_required !== false, password: e.password || "" })),
    });
  },
  async admin_upsert_employee(p) {
    const a = await verify(p.adminToken, OPS);
    let id = String(p.employeeId || p.id || "").trim().toUpperCase();
    const name = String(p.name || "").trim();
    if (!name) return reply(false, "ต้องมีชื่อพนักงาน");
    if (!id) {
      const { data: all } = await db.from("employees").select("employee_id");
      let max = 0;
      (all || []).forEach((e: any) => { const m = /EMP-(\d+)/i.exec(e.employee_id); if (m) max = Math.max(max, Number(m[1])); });
      id = "EMP-" + String(max + 1).padStart(3, "0");
    }
    const row: any = { employee_id: id, name, role: String(p.role || ""), department: String(p.department || ""), work_site_id: String(p.siteId || ""), status: lc(p.status) === "inactive" ? "inactive" : "active", location_required: p.locationRequired !== false };
    if (p.password != null && String(p.password) !== "") row.password = await hashPw(String(p.password));
    const { error } = await db.from("employees").upsert(row, { onConflict: "employee_id" });
    if (error) return reply(false, error.message);
    audit(a.display_name, "employee_saved", id, name);
    return reply(true, "บันทึกพนักงานแล้ว", { id });
  },
  async admin_reset_employee_password(p) {
    const a = await verify(p.adminToken, OPS);
    const id = String(p.employeeId || "").trim().toUpperCase();
    const pw = String(p.password || "").trim() || "bvn" + Math.floor(1000 + Math.random() * 9000);
    const { error } = await db.from("employees").update({ password: await hashPw(pw) }).eq("employee_id", id);
    if (error) return reply(false, error.message);
    if (p.requestId) await db.from("password_requests").update({ status: "done", handled_by: a.display_name, handled_at: nowISO() }).eq("request_id", p.requestId);
    audit(a.display_name, "password_reset", id, "");
    return reply(true, "ตั้งรหัสผ่านชั่วคราวแล้ว", { employeeId: id, temporaryPassword: pw });
  },

  async admin_get_settings(p) { await verify(p.adminToken, ["owner"]); return reply(true, "Settings loaded", { settings: await settingsMap() }); },
  async admin_save_settings(p) {
    await verify(p.adminToken, ["owner"]);
    const inc = p.settings && typeof p.settings === "object" ? p.settings : p;
    const rows = Object.keys(inc).filter((k) => !["action", "adminToken", "settings"].includes(k)).map((k) => ({ key: k, value: String(inc[k] ?? "") }));
    if (rows.length) { const { error } = await db.from("settings").upsert(rows, { onConflict: "key" }); if (error) return reply(false, error.message); }
    return reply(true, "บันทึกการตั้งค่าแล้ว");
  },
  async admin_get_invoice_settings(p) {
    await verify(p.adminToken, FIN);
    const s = await settingsMap(), keys = ["invoice_company_name", "invoice_company_name_en", "invoice_address", "invoice_phone", "invoice_tax_id", "invoice_vat_rate", "invoice_prefix", "invoice_footer", "invoice_logo_file_id", "invoice_logo_url"];
    const out: Record<string, string> = {}; keys.forEach((k) => (out[k] = s[k] || ""));
    return reply(true, "Invoice settings loaded", { settings: out });
  },

  async admin_list_holidays(p) { await verify(p.adminToken); const { data } = await db.from("holidays").select("date,name").order("date"); return reply(true, "Holidays loaded", { holidays: data || [] }); },
  async admin_save_holiday(p) {
    const a = await verify(p.adminToken, ["owner"]); const date = String(p.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(false, "วันที่ต้องเป็น YYYY-MM-DD");
    await db.from("holidays").upsert({ date, name: String(p.name || "วันหยุด") }, { onConflict: "date" });
    audit(a.display_name, "holiday_saved", date, String(p.name || "")); return reply(true, "บันทึกวันหยุดแล้ว");
  },
  async admin_delete_holiday(p) { const a = await verify(p.adminToken, ["owner"]); await db.from("holidays").delete().eq("date", String(p.date || "")); audit(a.display_name, "holiday_deleted", String(p.date || "")); return reply(true, "ลบวันหยุดแล้ว"); },
  async admin_import_holidays(p) {
    const a = await verify(p.adminToken, ["owner"]); const y = Number(p.year) || new Date().getFullYear();
    const fixed: [string, string][] = [
      [`${y}-01-01`, "วันขึ้นปีใหม่"], [`${y}-04-06`, "วันจักรี"], [`${y}-04-13`, "วันสงกรานต์"], [`${y}-04-14`, "วันสงกรานต์"], [`${y}-04-15`, "วันสงกรานต์"],
      [`${y}-05-01`, "วันแรงงาน"], [`${y}-05-04`, "วันฉัตรมงคล"], [`${y}-06-03`, "วันเฉลิมฯ พระราชินี"], [`${y}-07-28`, "วันเฉลิมฯ ร.10"],
      [`${y}-08-12`, "วันแม่แห่งชาติ"], [`${y}-10-13`, "วันคล้ายวันสวรรคต ร.9"], [`${y}-10-23`, "วันปิยมหาราช"], [`${y}-12-05`, "วันพ่อแห่งชาติ"], [`${y}-12-10`, "วันรัฐธรรมนูญ"], [`${y}-12-31`, "วันสิ้นปี"],
    ];
    await db.from("holidays").upsert(fixed.map(([date, name]) => ({ date, name })), { onConflict: "date" });
    audit(a.display_name, "holidays_imported", String(y), `${fixed.length} วัน (วันหยุดคงที่)`);
    return reply(true, `เติมวันหยุดคงที่ปี ${y} แล้ว (${fixed.length} วัน) — วันหยุดตามจันทรคติเพิ่มเองภายหลัง`, { year: y, added: fixed.length });
  },

  async admin_record_attendance(p) {
    const a = await verify(p.adminToken, OPS);
    const employeeId = String(p.employeeId || "").trim().toUpperCase(), eventType = String(p.eventType || "");
    if (!employeeId || !["check_in", "check_out"].includes(eventType)) return reply(false, "ข้อมูลไม่ครบ");
    const { data: emp } = await db.from("employees").select("work_site_id").eq("employee_id", employeeId).maybeSingle();
    const { error } = await db.from("attendance_log").insert({ employee_id: employeeId, site_id: emp?.work_site_id || "", event_type: eventType, event_time: nowISO(), validity: "accepted", source: "admin_manual:" + a.display_name, review_status: "accepted" });
    if (error) return reply(false, error.message);
    audit(a.display_name, "attendance_admin", employeeId, eventType);
    return reply(true, eventType === "check_in" ? "ลงเวลาเข้าแล้ว" : "ลงเวลาออกแล้ว");
  },
  async admin_attendance_days(p) {
    await verify(p.adminToken);
    const start = String(p.startDate || todayISO()), end = String(p.endDate || todayISO());
    let q = db.from("attendance_log").select("employee_id,event_type,event_time").eq("validity", "accepted")
      .gte("event_time", start + "T00:00:00+07:00").lte("event_time", end + "T23:59:59+07:00");
    if (p.employeeId) q = q.eq("employee_id", String(p.employeeId).toUpperCase());
    const [{ data: logs }, names] = await Promise.all([q, nameMap()]);
    const byKey: Record<string, any> = {};
    (logs || []).forEach((r: any) => {
      const day = dayOf(r.event_time), key = r.employee_id + "|" + day, t = new Date(r.event_time).getTime();
      const it = byKey[key] || { employeeId: r.employee_id, date: day, inTs: null, outTs: null };
      if (r.event_type === "check_in") it.inTs = it.inTs ? Math.min(it.inTs, t) : t;
      if (r.event_type === "check_out") it.outTs = it.outTs ? Math.max(it.outTs, t) : t;
      byKey[key] = it;
    });
    const days = Object.values(byKey).map((it: any) => ({
      employeeId: it.employeeId, name: names[it.employeeId]?.name || it.employeeId, date: it.date,
      checkIn: it.inTs ? hhmm(it.inTs) : "", checkOut: it.outTs ? hhmm(it.outTs) : "",
      workedMinutes: it.inTs && it.outTs && it.outTs > it.inTs ? Math.round((it.outTs - it.inTs) / 60000) : 0,
      status: it.inTs && it.outTs ? "complete" : "incomplete",
    })).sort((a: any, b: any) => (a.date === b.date ? a.employeeId.localeCompare(b.employeeId) : a.date < b.date ? 1 : -1));
    return reply(true, "Attendance days loaded", { startDate: start, endDate: end, days });
  },
  async admin_void_attendance_day(p) {
    const a = await verify(p.adminToken, OPS);
    const employeeId = String(p.employeeId || "").trim().toUpperCase(), date = String(p.date || "").trim();
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(false, "ต้องระบุพนักงานและวันที่");
    const { data } = await db.from("attendance_log").select("id,event_time").eq("employee_id", employeeId).eq("validity", "accepted")
      .gte("event_time", date + "T00:00:00+07:00").lte("event_time", date + "T23:59:59+07:00");
    const ids = (data || []).map((r: any) => r.id);
    if (!ids.length) return reply(false, "ไม่พบบันทึกเวลาที่ใช้งานอยู่ของวันนั้น");
    await db.from("attendance_log").update({ validity: "voided", source: "voided by " + a.display_name }).in("id", ids);
    audit(a.display_name, "attendance_voided", employeeId, date + " · " + ids.length + " rows");
    return reply(true, "ยกเลิกบันทึกเวลาแล้ว (เก็บไว้เพื่อ audit)", { employeeId, date, voided: ids.length });
  },

  async admin_list_leave_requests(p) {
    await verify(p.adminToken, OPS);
    const { data } = await db.from("leave_requests").select("*").order("submitted_at", { ascending: false });
    return reply(true, "ok", { requests: (data || []).map((r: any) => ({ requestId: r.request_id, employeeId: r.employee_id, leaveType: r.leave_type, startDate: r.start_date, endDate: r.end_date, reason: r.reason, status: r.status, submittedAt: r.submitted_at, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at })) });
  },
  async admin_review_leave(p) {
    const a = await verify(p.adminToken, OPS);
    const id = String(p.requestId || ""), decision = lc(p.decision);
    if (!id || !["approved", "rejected"].includes(decision)) return reply(false, "คำสั่งไม่ถูกต้อง");
    const { data } = await db.from("leave_requests").update({ status: decision, reviewed_by: a.display_name, reviewed_at: nowISO() }).eq("request_id", id).eq("status", "pending").select();
    if (!data || !data.length) return reply(false, "ไม่พบคำขอที่รออนุมัติ");
    audit(a.display_name, "leave_" + decision, id, ""); return reply(true, "บันทึกการตัดสินใจแล้ว");
  },
  async admin_leave_usage(p) {
    await verify(p.adminToken, OPS);
    const s = await settingsMap(), year = new Date().getFullYear();
    const quota = { sick: num(s.quota_sick), personal: num(s.quota_personal), vacation: num(s.quota_vacation) };
    const [{ data: lv }, names] = await Promise.all([db.from("leave_requests").select("*").eq("status", "approved"), nameMap()]);
    const key = (t: string) => (t.includes("ป่วย") ? "sick" : t.includes("พักร้อน") ? "vacation" : t.includes("กิจ") ? "personal" : "other");
    const used: Record<string, any> = {};
    (lv || []).forEach((r: any) => {
      const st = new Date(r.start_date); if (isNaN(+st) || st.getFullYear() !== year) return;
      const days = Math.max(1, Math.round((+new Date(r.end_date) - +st) / 86400000) + 1);
      (used[r.employee_id] = used[r.employee_id] || { sick: 0, personal: 0, vacation: 0, other: 0 })[key(String(r.leave_type || ""))] += days;
    });
    const rows = Object.keys(names).filter((id) => names[id].status === "active").map((id) => {
      const u = used[id] || { sick: 0, personal: 0, vacation: 0, other: 0 };
      return { employeeId: id, name: names[id].name, usedSick: u.sick, usedPersonal: u.personal, usedVacation: u.vacation, usedOther: u.other };
    }).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    return reply(true, "ok", { year, quota, rows });
  },

  async admin_list_time_requests(p) {
    await verify(p.adminToken, OPS);
    const { data } = await db.from("time_requests").select("*").order("submitted_at", { ascending: false });
    return reply(true, "ok", { requests: (data || []).map((r: any) => ({ requestId: r.request_id, employeeId: r.employee_id, requestType: r.request_type, workDate: r.work_date, requestedMinutes: r.requested_minutes, reason: r.reason, status: r.status, submittedAt: r.submitted_at, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, reviewerNote: r.reviewer_note })) });
  },
  async admin_review_time_request(p) {
    const a = await verify(p.adminToken, OPS);
    const id = String(p.requestId || ""), decision = lc(p.decision), note = String(p.reviewerNote || "").trim();
    if (!id || !["approved", "rejected"].includes(decision)) return reply(false, "คำสั่งไม่ถูกต้อง");
    const { data } = await db.from("time_requests").update({ status: decision, reviewed_by: a.display_name, reviewed_at: nowISO(), reviewer_note: note }).eq("request_id", id).eq("status", "pending").select();
    if (!data || !data.length) return reply(false, "ไม่พบคำขอที่รออนุมัติ");
    audit(a.display_name, "time_request_" + decision, id, note); return reply(true, "บันทึกการตัดสินใจแล้ว");
  },
  async admin_add_overtime(p) {
    const a = await verify(p.adminToken, OPS);
    const employeeId = String(p.employeeId || "").trim().toUpperCase(), workDate = String(p.workDate || "");
    const minutes = Math.round(num(p.requestedMinutes));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || minutes <= 0 || minutes > 1440) return reply(false, "ข้อมูล OT ไม่ถูกต้อง");
    await db.from("time_requests").insert({ request_id: crypto.randomUUID(), employee_id: employeeId, request_type: "overtime", work_date: workDate, requested_minutes: minutes, reason: String(p.reason || "OT (บันทึกโดยแอดมิน)"), status: "approved", submitted_at: nowISO(), reviewed_by: a.display_name, reviewed_at: nowISO(), reviewer_note: "บันทึกโดยแอดมินโดยตรง" });
    audit(a.display_name, "overtime_added", employeeId, workDate + " · " + minutes + " นาที");
    return reply(true, "บันทึก OT แล้ว", { employeeId, workDate, requestedMinutes: minutes });
  },

  async admin_list_pay_rules(p) {
    await verify(p.adminToken, FIN);
    const [{ data: rules }, names] = await Promise.all([db.from("payroll_rules").select("*"), nameMap()]);
    const by: Record<string, any> = {}; (rules || []).forEach((r: any) => (by[r.employee_id] = r));
    const out = Object.keys(names).map((id) => {
      const r = by[id];
      return { employeeId: id, name: names[id].name, role: names[id].role, status: names[id].status, hasRule: !!r,
        payBasis: r ? r.pay_basis : "", baseRate: r ? num(r.base_rate) : null, standardHours: r ? num(r.standard_hours) : 8,
        otEnabled: r ? !!r.ot_enabled : false, otMultiplier: r ? num(r.ot_multiplier) : 1.5, premiumDate: r ? r.premium_date || "" : "",
        premiumMultiplier: r ? num(r.premium_multiplier) : 1, otherDeduction: r ? num(r.other_deduction) : 0, daysPerMonth: r ? num(r.days_per_month) : 30,
        updatedAt: r ? r.updated_at || "" : "", updatedBy: r ? r.updated_by || "" : "" };
    }).sort((a, b) => (a.status === b.status ? a.employeeId.localeCompare(b.employeeId) : a.status === "active" ? -1 : 1));
    return reply(true, "ok", { rules: out });
  },
  async admin_upsert_pay_rule(p) {
    const a = await verify(p.adminToken, FIN);
    const id = String(p.employeeId || "").trim().toUpperCase(), basis = lc(p.payBasis);
    if (!["daily", "hourly", "monthly"].includes(basis)) return reply(false, "รูปแบบค่าจ้างไม่ถูกต้อง");
    const row = { employee_id: id, pay_basis: basis, base_rate: num(p.baseRate), standard_hours: num(p.standardHours) || 8, ot_enabled: p.otEnabled === true, ot_multiplier: num(p.otMultiplier) || 1.5, premium_date: String(p.premiumDate || ""), premium_multiplier: num(p.premiumMultiplier) || 1, other_deduction: num(p.otherDeduction), days_per_month: num(p.daysPerMonth) || 30, updated_at: nowISO(), updated_by: a.display_name };
    const { error } = await db.from("payroll_rules").upsert(row, { onConflict: "employee_id" });
    if (error) return reply(false, error.message);
    audit(a.display_name, "pay_rule_saved", id, basis + " @ " + row.base_rate);
    return reply(true, "บันทึกเรตค่าจ้างแล้ว", { employeeId: id });
  },

  async admin_preview_payroll(p) {
    await verify(p.adminToken, FIN);
    const data = await previewPayroll(String(p.startDate), String(p.endDate));
    return reply(true, "ok", data);
  },
  async admin_owner_overview(p) {
    await verify(p.adminToken, FIN);
    const start = String(p.startDate || todayISO().slice(0, 8) + "01"), end = String(p.endDate || todayISO());
    const [prev, names, advRes, s] = await Promise.all([previewPayroll(start, end), nameMap(), db.from("advances").select("status,amount"), settingsMap()]);
    const lines = prev.lines.map((l: any) => ({ ...l, name: names[l.employeeId]?.name || l.employeeId, role: names[l.employeeId]?.role || "" })).sort((a: any, b: any) => b.netPay - a.netPay);
    const activeCount = Object.values(names).filter((e) => e.status === "active").length;
    const grp = (st: string) => { const a = (advRes.data || []).filter((x: any) => x.status === st); return { count: a.length, total: round(a.reduce((t: number, x: any) => t + num(x.amount), 0)) }; };
    return reply(true, "ok", { settings: s, period: { start, end, label: "" }, nextPayday: "", lines, incompleteDays: [], totalGross: prev.totalGross, totalAdvance: prev.totalAdvance, totalSso: prev.totalSso, totalOther: prev.totalOther, totalNet: prev.totalNet, paidCount: lines.length, activeEmployees: activeCount, advancesPending: grp("pending"), advancesApprovedUnpaid: grp("approved"), advancesPaidUnsettled: grp("paid") });
  },
  async admin_lock_payroll(p) {
    const a = await verify(p.adminToken, FIN);
    const data = await previewPayroll(String(p.startDate), String(p.endDate));
    const payrollId = "PAY-" + data.startDate.replace(/-/g, "") + "-" + data.endDate.replace(/-/g, "");
    const { data: ex } = await db.from("payroll_periods").select("payroll_id").eq("payroll_id", payrollId).maybeSingle();
    if (ex) return reply(false, "งวดนี้ถูกล็อกไปแล้ว");
    await db.from("payroll_periods").insert({ payroll_id: payrollId, start_date: data.startDate, end_date: data.endDate, status: "locked", locked_at: nowISO(), locked_by: a.display_name });
    if (data.lines.length) await db.from("payroll_lines").insert(data.lines.map((l: any) => ({ payroll_id: payrollId, employee_id: l.employeeId, regular_minutes: l.regularMinutes, ot_minutes: l.otMinutes, base_gross: l.baseGross, ot_gross: l.otGross, gross_pay: l.grossPay, advance_deduction: l.advanceDeduction, net_pay: l.netPay, sso: l.sso, other_deduction: l.otherDeduction })));
    // settle the advances this run covered (oldest-first, within net-after-statutory)
    const outstanding = await outstandingAdvances();
    let settled = 0;
    for (const l of data.lines as any[]) {
      const avail = Math.max(0, l.grossPay - l.sso - l.otherDeduction);
      let d = 0; const amts: number[] = [];
      for (const it of outstanding[l.employeeId] || []) { if (d + it.amount > avail) break; d += it.amount; amts.push(it.amount); }
      if (amts.length) {
        const { data: rows } = await db.from("advances").select("advance_id,amount,created_at").eq("employee_id", l.employeeId).eq("status", "paid").order("created_at", { ascending: true }).limit(amts.length);
        for (const r of rows || []) { await db.from("advances").update({ status: "settled", settled_payroll: payrollId }).eq("advance_id", r.advance_id); settled++; }
      }
    }
    audit(a.display_name, "payroll_locked", payrollId, "net " + data.totalNet + " · settled " + settled);
    return reply(true, "ล็อกงวดแล้ว", { payrollId, totalGross: data.totalGross, totalNet: data.totalNet, advancesSettled: settled });
  },
  async admin_list_payrolls(p) {
    await verify(p.adminToken, FIN);
    const { data } = await db.from("payroll_periods").select("*").order("start_date", { ascending: false });
    return reply(true, "ok", { periods: (data || []).map((r: any) => ({ payrollId: r.payroll_id, startDate: r.start_date, endDate: r.end_date, status: r.status, lockedAt: r.locked_at, lockedBy: r.locked_by })) });
  },
  async admin_get_payroll(p) {
    await verify(p.adminToken, FIN);
    const id = String(p.payrollId || "").trim();
    const { data: period } = await db.from("payroll_periods").select("*").eq("payroll_id", id).maybeSingle();
    if (!period) return reply(false, "ไม่พบงวดนี้");
    const [{ data: lineRows }, names] = await Promise.all([db.from("payroll_lines").select("*").eq("payroll_id", id), nameMap()]);
    const lines = (lineRows || []).map((r: any) => ({ employeeId: r.employee_id, name: names[r.employee_id]?.name || r.employee_id, role: names[r.employee_id]?.role || "", regularMinutes: r.regular_minutes, otMinutes: r.ot_minutes, baseGross: num(r.base_gross), otGross: num(r.ot_gross), grossPay: num(r.gross_pay), advanceDeduction: num(r.advance_deduction), sso: num(r.sso), otherDeduction: num(r.other_deduction), netPay: num(r.net_pay) }));
    const sum = (k: string) => round(lines.reduce((s: number, l: any) => s + (l[k] || 0), 0));
    return reply(true, "ok", { payrollId: id, startDate: period.start_date, endDate: period.end_date, status: period.status, lines, totalGross: sum("grossPay"), totalAdvance: sum("advanceDeduction"), totalSso: sum("sso"), totalOther: sum("otherDeduction"), totalNet: sum("netPay") });
  },

  async admin_list_invoices(p) {
    await verify(p.adminToken, FIN); const today = todayISO();
    const { data } = await db.from("invoices").select("*").order("created_at", { ascending: false });
    const invoices = (data || []).map((r: any) => ({ invoiceNo: r.invoice_no, customer: r.customer, description: r.description, subtotal: num(r.subtotal), vat: num(r.vat), dueDate: r.due_date, total: num(r.total), status: r.status === "issued" && r.due_date < today ? "overdue" : r.status, createdAt: r.created_at, paymentReference: r.payment_reference || "", paidAt: r.paid_at || "" }));
    return reply(true, "ok", { invoices });
  },
  async admin_create_invoice(p) {
    const a = await verify(p.adminToken, FIN);
    const customer = String(p.customer || "").trim(), description = String(p.description || "").trim(), subtotal = num(p.subtotal), due = String(p.dueDate || "");
    if (!customer || !description || subtotal < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return reply(false, "ข้อมูลใบแจ้งหนี้ไม่ครบ");
    const s = await settingsMap(), prefix = String(s.invoice_prefix || "INV").toUpperCase(), month = todayISO().slice(0, 7).replace("-", "");
    const { count } = await db.from("invoices").select("*", { count: "exact", head: true }).ilike("invoice_no", `${prefix}-${month}-%`);
    const invoiceNo = `${prefix}-${month}-${String((count || 0) + 1).padStart(3, "0")}`;
    const vat = round(subtotal * (num(s.invoice_vat_rate) / 100)), total = round(subtotal + vat);
    const { error } = await db.from("invoices").insert({ invoice_no: invoiceNo, customer, description, subtotal: round(subtotal), vat, due_date: due, total, status: "draft", created_at: nowISO(), updated_at: nowISO() });
    if (error) return reply(false, error.message);
    audit(a.display_name, "invoice_created", invoiceNo, customer + " · " + total);
    return reply(true, "สร้างใบแจ้งหนี้แล้ว", { invoice: { invoiceNo, customer, description, subtotal, vat, dueDate: due, total, status: "draft" } });
  },
  async admin_update_invoice_status(p) {
    const a = await verify(p.adminToken, FIN);
    const invoiceNo = String(p.invoiceNo || "").trim(), status = lc(p.status), ref = String(p.paymentReference || "").trim();
    if (!invoiceNo || !["issued", "paid", "void"].includes(status)) return reply(false, "สถานะไม่ถูกต้อง");
    const { data: cur } = await db.from("invoices").select("status").eq("invoice_no", invoiceNo).maybeSingle();
    if (!cur) return reply(false, "ไม่พบใบแจ้งหนี้");
    const allowed: Record<string, string[]> = { draft: ["issued", "void"], issued: ["paid", "void"] };
    if (!(allowed[cur.status] || []).includes(status)) return reply(false, "เปลี่ยนสถานะแบบนี้ไม่ได้");
    if (status === "paid" && !ref) return reply(false, "ต้องระบุอ้างอิงการชำระเมื่อทำเครื่องหมายจ่ายแล้ว");
    const upd: any = { status, updated_at: nowISO() };
    if (status === "paid") { upd.payment_reference = ref; upd.paid_at = nowISO(); }
    await db.from("invoices").update(upd).eq("invoice_no", invoiceNo);
    audit(a.display_name, "invoice_" + status, invoiceNo, ref); return reply(true, "อัปเดตสถานะแล้ว");
  },

  async admin_list_advances(p) {
    await verify(p.adminToken, OPS);
    const wanted = lc(p.status);
    const [{ data }, names] = await Promise.all([db.from("advances").select("*").order("created_at", { ascending: false }), nameMap()]);
    const advances = (data || []).filter((a: any) => !wanted || a.status === wanted).map((r: any) => ({ advanceId: r.advance_id, employeeId: r.employee_id, name: names[r.employee_id]?.name || r.employee_id, amount: num(r.amount), reason: r.reason || "", requestDate: r.request_date || "", status: r.status, reviewer: r.reviewer || "", decidedAt: r.decided_at || "", paidAt: r.paid_at || "" }));
    return reply(true, "ok", { advances });
  },
  async admin_decide_advance(p) {
    const a = await verify(p.adminToken, OPS);
    const id = String(p.advanceId || ""), decision = lc(p.decision);
    if (!id || !["approved", "rejected"].includes(decision)) return reply(false, "คำสั่งไม่ถูกต้อง");
    const { data } = await db.from("advances").update({ status: decision, reviewer: a.display_name, decided_at: nowISO() }).eq("advance_id", id).eq("status", "pending").select();
    if (!data || !data.length) return reply(false, "ไม่พบคำขอที่รออนุมัติ");
    audit(a.display_name, "advance_" + decision, id, ""); return reply(true, "บันทึกการตัดสินใจแล้ว");
  },
  async admin_mark_advance_paid(p) {
    const a = await verify(p.adminToken, OPS);
    const id = String(p.advanceId || "");
    const { data } = await db.from("advances").update({ status: "paid", paid_at: nowISO() }).eq("advance_id", id).eq("status", "approved").select();
    if (!data || !data.length) return reply(false, "ต้องเป็นคำขอที่อนุมัติแล้วเท่านั้น");
    audit(a.display_name, "advance_paid", id, ""); return reply(true, "บันทึกการจ่ายเงินแล้ว");
  },

  async admin_list_sites(p) {
    await verify(p.adminToken, OPS);
    const { data } = await db.from("work_sites").select("*");
    return reply(true, "ok", { sites: (data || []).map((r: any) => ({ siteId: r.site_id, name: r.name || "", lat: num(r.latitude), lng: num(r.longitude), radius: num(r.radius_m), active: r.active !== false })) });
  },
  async admin_save_site(p) {
    const a = await verify(p.adminToken, ["owner"]);
    const siteId = String(p.siteId || "").trim();
    const lat = num(p.lat), lng = num(p.lng), radius = num(p.radius);
    if (!siteId) return reply(false, "ต้องระบุรหัสไซต์");
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return reply(false, "พิกัดไม่ถูกต้อง");
    if (radius <= 0) return reply(false, "รัศมีต้องมากกว่า 0");
    const { error } = await db.from("work_sites").upsert({ site_id: siteId, name: String(p.name || ""), latitude: lat, longitude: lng, radius_m: Math.round(radius), active: p.active !== false }, { onConflict: "site_id" });
    if (error) return reply(false, error.message);
    audit(a.display_name, "site_saved", siteId, String(p.name || "")); return reply(true, "บันทึกจุดเช็กอินแล้ว", { siteId });
  },

  async admin_list_admin_users(p) {
    await verify(p.adminToken, ["owner"]);
    const { data } = await db.from("admin_users").select("*");
    return reply(true, "ok", { users: (data || []).map((u: any) => ({ username: u.username, password: String(u.password || "").startsWith("pbkdf2$") ? "" : u.password || "", displayName: u.display_name || u.username, active: u.active !== false, role: u.role || "owner" })) });
  },
  async admin_upsert_admin_user(p) {
    const a = await verify(p.adminToken, ["owner"]);
    const username = String(p.username || "").trim(), password = String(p.password || ""), displayName = String(p.displayName || username).trim();
    const role = lc(p.role) || "owner", active = p.active !== false;
    if (!username) return reply(false, "ต้องมีชื่อผู้ใช้");
    if (password && password.length < 8) return reply(false, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
    const { data: ex } = await db.from("admin_users").select("*").ilike("username", username).maybeSingle();
    const row: any = { username, display_name: displayName, active, role };
    if (password) row.password = await hashPw(password);
    if (!ex) { if (!password) return reply(false, "ผู้ใช้ใหม่ต้องตั้งรหัสผ่าน"); row.created_at = nowISO(); }
    const { error } = await db.from("admin_users").upsert(row, { onConflict: "username" });
    if (error) return reply(false, error.message);
    await db.from("admin_sessions").update({ status: "revoked" }).eq("username", username);
    audit(a.display_name, "admin_user_saved", username, ""); return reply(true, "บันทึกบัญชีแอดมินแล้ว", { username });
  },
  async admin_delete_admin_user(p) {
    const a = await verify(p.adminToken, ["owner"]);
    const username = String(p.username || "").trim();
    const { count } = await db.from("admin_users").select("*", { count: "exact", head: true }).eq("active", true).neq("username", username);
    if (!count) return reply(false, "ต้องมีบัญชีแอดมินที่ใช้งานได้อย่างน้อย 1 บัญชี");
    await db.from("admin_sessions").update({ status: "revoked" }).eq("username", username);
    await db.from("admin_users").delete().eq("username", username);
    audit(a.display_name, "admin_user_deleted", username, ""); return reply(true, "ลบบัญชีแอดมินแล้ว", { username });
  },

  async admin_list_audit_log(p) {
    await verify(p.adminToken, ["owner", "manager"]);
    const { data } = await db.from("audit_log").select("*").order("ts", { ascending: false }).limit(400);
    return reply(true, "ok", { entries: (data || []).map((r: any) => ({ at: r.ts, actor: r.actor || "", action: r.action || "", target: r.target || "", detail: r.detail || "" })) });
  },
  async admin_list_password_requests(p) {
    await verify(p.adminToken, OPS);
    const { data } = await db.from("password_requests").select("*").eq("status", "pending").order("requested_at", { ascending: false });
    return reply(true, "ok", { requests: (data || []).map((r: any) => ({ requestId: r.request_id, employeeId: r.employee_id, requestedAt: r.requested_at, status: r.status })) });
  },

  // ===================== Mobile (employee app) =====================
  async employee_directory() {
    const { data } = await db.from("employees").select("employee_id,name,role,status").eq("status", "active");
    return reply(true, "ok", { employees: (data || []).map((e: any) => ({ employeeId: e.employee_id, name: e.name, role: e.role || "" })) });
  },
  async employee_login(p) {
    const employeeId = String(p.employeeId || "").trim().toUpperCase(), password = String(p.password || "");
    const { data: e } = await db.from("employees").select("*").eq("employee_id", employeeId).maybeSingle();
    if (!e || e.status !== "active" || !e.password || !(await verifyPw(password, String(e.password)))) return reply(false, "ชื่อพนักงานหรือรหัสผ่านไม่ถูกต้อง");
    await db.from("mobile_access").update({ status: "revoked" }).eq("employee_id", employeeId);
    const tk = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await db.from("mobile_access").insert({ token_hash: tk, employee_id: employeeId, status: "active", issued_at: nowISO(), last_used_at: nowISO(), device_label: String(p.deviceLabel || "Mobile login") });
    return reply(true, "เข้าสู่ระบบสำเร็จ", { employeeId, mobileToken: tk, name: e.name });
  },
  async employee_profile(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const s = await settingsMap();
    return reply(true, "ok", { employeeId: e.employee_id, name: e.name, role: e.role, siteId: e.work_site_id, locationRequired: e.location_required !== false,
      shiftStart: s.shift_start || "09:00", shiftEnd: s.shift_end || "18:00", shift_start: s.shift_start || "09:00", shift_end: s.shift_end || "18:00",
      workdays: s.workdays || "1,2,3,4,5", remindBeforeMin: num(s.remind_before_min) || 15, remindCheckoutAfterMin: num(s.remind_checkout_after_min) || 10 });
  },
  async sites(p) {
    if (!(await authMobile(p.mobileToken))) return reply(false, "Mobile authentication failed");
    return reply(true, "ok", { sites: await activeSites() });
  },
  async attendance(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const eventType = String(p.eventType || "");
    if (!["check_in", "check_out"].includes(eventType)) return reply(false, "Invalid attendance event");
    const lat = Number(p.latitude), lng = Number(p.longitude), acc = Number(p.accuracy);
    let matched: any = null, distance: number | null = null, accepted = true;
    if (eventType === "check_in" && e.location_required !== false) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(acc) || acc < 0) return reply(false, "ต้องระบุตำแหน่ง GPS สำหรับการเช็กอิน");
      if (p.mocked === true) return reply(false, "ตรวจพบการปลอมตำแหน่ง (Mock location) — ปิดแอปจำลองตำแหน่งก่อนเช็กอิน");
      const sites = await activeSites();
      if (!sites.length) return reply(false, "ยังไม่ได้ตั้งจุดเช็กอิน กรุณาติดต่อแอดมิน");
      sites.forEach((s) => { const d = metres(lat, lng, s.lat, s.lng); if (distance === null || d < distance) { distance = d; matched = s; } });
      accepted = acc <= MAX_ACCURACY_M && matched != null && distance! <= matched.radius;
    }
    const st = await todayAttState(e.employee_id);
    if (eventType === "check_in" && st.checkedIn) return reply(false, "วันนี้คุณบันทึกเข้างานแล้ว", st);
    if (eventType === "check_out" && !st.checkedIn) return reply(false, "ต้องบันทึกเข้างานก่อนจึงจะบันทึกออกงานได้", st);
    if (eventType === "check_out" && st.checkedOut) return reply(false, "วันนี้คุณบันทึกออกงานแล้ว", st);
    const now = nowISO();
    await db.from("attendance_log").insert({ employee_id: e.employee_id, site_id: matched ? matched.id : (e.work_site_id || ""), event_type: eventType, event_time: now,
      latitude: Number.isFinite(lat) ? lat : null, longitude: Number.isFinite(lng) ? lng : null, accuracy: Number.isFinite(acc) ? acc : null,
      distance_m: distance === null ? null : Math.round(distance * 100) / 100, validity: accepted ? "accepted" : "rejected",
      device_timezone: String(p.deviceTimezone || ""), source: e.location_required !== false ? "mobile_api_location" : "mobile_api_no_location", review_status: accepted ? "pending" : "rejected" });
    let overtime = null;
    if (eventType === "check_out" && accepted) overtime = await autoOvertime(e.employee_id, Date.now());
    return reply(accepted, accepted ? "บันทึกเวลาแล้ว" : "อยู่นอกพื้นที่ที่อนุญาต หรือสัญญาณ GPS ไม่แม่นพอ",
      { decision: accepted ? "accepted" : "rejected", locationRequired: e.location_required !== false, distanceMetres: distance === null ? null : Math.round(distance), allowedRadiusMetres: matched ? matched.radius : null, matchedSite: matched ? matched.name || matched.id : "", overtime });
  },
  async employee_month(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const now = new Date(Date.now() + ICT * 60000);
    let year = parseInt(p.year, 10), month = parseInt(p.month, 10);
    if (!year || !month || month < 1 || month > 12) { year = now.getUTCFullYear(); month = now.getUTCMonth() + 1; }
    const s = await settingsMap();
    const shiftMin = (() => { const q = String(s.shift_start || "09:00").split(":"); return (Number(q[0]) || 9) * 60 + (Number(q[1]) || 0); })();
    const grace = num(s.shift_grace_min) || 5, lunch = num(s.lunch_break_min) || 60, otThr = (num(s.ot_threshold_hours) || 8) * 60, holOt = s.holiday_ot_enabled === "true";
    const workdays = String(s.workdays || "1,2,3,4,5").split(",").map((x) => x.trim());
    const mm = String(month).padStart(2, "0");
    const [holidays, leaveRows, attRows] = await Promise.all([
      holidayMap(year),
      db.from("leave_requests").select("leave_type,start_date,end_date").eq("employee_id", e.employee_id).eq("status", "approved"),
      db.from("attendance_log").select("event_type,event_time").eq("employee_id", e.employee_id).eq("validity", "accepted").gte("event_time", `${year}-${mm}-01T00:00:00+07:00`).lte("event_time", `${year}-${mm}-31T23:59:59+07:00`),
    ]);
    const leaveByDate: Record<string, string> = {};
    (leaveRows.data || []).forEach((r: any) => { for (let d = new Date(r.start_date); d <= new Date(r.end_date); d.setDate(d.getDate() + 1)) { if (d.getFullYear() === year && d.getMonth() + 1 === month) leaveByDate[d.toISOString().slice(0, 10)] = r.leave_type || "ลา"; } });
    const byDay: Record<string, any> = {};
    (attRows.data || []).forEach((r: any) => { const day = dayOf(r.event_time), t = new Date(r.event_time).getTime(), it = byDay[day] || { inTs: null, outTs: null }; if (r.event_type === "check_in") it.inTs = it.inTs ? Math.min(it.inTs, t) : t; if (r.event_type === "check_out") it.outTs = it.outTs ? Math.max(it.outTs, t) : t; byDay[day] = it; });
    const todayStr = todayISO(), daysInMonth = new Date(year, month, 0).getDate(), days = [];
    for (let dn = 1; dn <= daysInMonth; dn++) {
      const dateStr = `${year}-${mm}-${String(dn).padStart(2, "0")}`;
      const dow = new Date(dateStr + "T00:00:00+07:00").getDay(), rec = byDay[dateStr], isHoliday = !!holidays[dateStr], leaveType = leaveByDate[dateStr] || "";
      let status = "", inStr = "", outStr = "", worked = 0, ot = 0, late = false;
      if (rec && rec.inTs) {
        inStr = hhmm(rec.inTs);
        const inMin = new Date(rec.inTs + ICT * 60000).getUTCHours() * 60 + new Date(rec.inTs + ICT * 60000).getUTCMinutes();
        late = !isHoliday && !leaveType && inMin > shiftMin + grace;
        if (rec.outTs && rec.outTs > rec.inTs) { outStr = hhmm(rec.outTs); worked = Math.round((rec.outTs - rec.inTs) / 60000); const net = Math.max(0, worked - lunch); ot = isHoliday && holOt ? net : Math.max(0, net - otThr); status = isHoliday ? "holiday_work" : late ? "late" : "normal"; }
        else status = "incomplete";
      } else if (leaveType) status = "leave";
      else if (isHoliday) status = "holiday";
      else if (dateStr > todayStr) status = "future";
      else if (workdays.indexOf(String(dow)) >= 0) status = "absent";
      else status = "off";
      days.push({ date: dateStr, day: dn, dow, status, checkIn: inStr, checkOut: outStr, workedMinutes: worked, otMinutes: ot, late, holidayName: holidays[dateStr] || "", leaveType });
    }
    return reply(true, "ok", { year, month, shiftStart: s.shift_start, shiftEnd: s.shift_end, shift_start: s.shift_start, shift_end: s.shift_end, days });
  },
  async employee_timeline(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const { data } = await db.from("attendance_log").select("event_type,event_time,validity,review_status").eq("employee_id", e.employee_id).order("event_time", { ascending: false }).limit(90);
    return reply(true, "ok", { employeeId: e.employee_id, attendance: (data || []).map((r: any) => ({ eventType: r.event_type, occurredAt: r.event_time, status: r.validity, approval: r.review_status || "" })) });
  },
  async leave_request(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const leaveType = String(p.leaveType || "").trim(), reason = String(p.reason || "").trim(), start = String(p.startDate || ""), end = String(p.endDate || "");
    if (!leaveType || !reason || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return reply(false, "Invalid leave request");
    await db.from("leave_requests").insert({ request_id: crypto.randomUUID(), employee_id: e.employee_id, leave_type: leaveType, start_date: start, end_date: end, reason, status: "pending", submitted_at: nowISO() });
    return reply(true, "ส่งคำขอลาแล้ว", { status: "pending" });
  },
  async leave_calendar(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const { data } = await db.from("leave_requests").select("*").eq("employee_id", e.employee_id);
    return reply(true, "ok", { employeeId: e.employee_id, requests: (data || []).map((r: any) => ({ requestId: r.request_id, leaveType: r.leave_type, startDate: r.start_date, endDate: r.end_date, status: r.status })) });
  },
  async time_request(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const requestType = lc(p.requestType), workDate = String(p.workDate || ""), minutes = Math.round(num(p.requestedMinutes)), reason = String(p.reason || "").trim();
    if (!["overtime", "attendance_correction"].includes(requestType) || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !reason || minutes <= 0 || minutes > 1440) return reply(false, "Invalid time request");
    await db.from("time_requests").insert({ request_id: crypto.randomUUID(), employee_id: e.employee_id, request_type: requestType, work_date: workDate, requested_minutes: minutes, reason, status: "pending", submitted_at: nowISO() });
    return reply(true, "ส่งคำขอแล้ว", { status: "pending", requestType });
  },
  async employee_time_requests(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const { data } = await db.from("time_requests").select("*").eq("employee_id", e.employee_id).order("submitted_at", { ascending: false });
    return reply(true, "ok", { employeeId: e.employee_id, requests: (data || []).map((r: any) => ({ requestId: r.request_id, requestType: r.request_type, workDate: r.work_date, requestedMinutes: r.requested_minutes, reason: r.reason, status: r.status, submittedAt: r.submitted_at, reviewerNote: r.reviewer_note })) });
  },
  async employee_submit_advance(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const amount = num(p.amount), reason = String(p.reason || "").trim();
    if (amount <= 0) return reply(false, "จำนวนเงินไม่ถูกต้อง");
    if (amount > 100000) return reply(false, "จำนวนเงินเกินวงเงินที่อนุญาต");
    const id = "ADV-" + new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    await db.from("advances").insert({ advance_id: id, employee_id: e.employee_id, amount, reason, request_date: todayISO(), status: "pending", created_at: nowISO() });
    return reply(true, "ส่งคำขอเบิกเงินล่วงหน้าแล้ว", { advanceId: id });
  },
  async employee_advances(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const { data } = await db.from("advances").select("*").eq("employee_id", e.employee_id).order("created_at", { ascending: false });
    return reply(true, "ok", { advances: (data || []).map((r: any) => ({ advanceId: r.advance_id, employeeId: r.employee_id, amount: num(r.amount), reason: r.reason || "", requestDate: r.request_date || "", status: r.status, reviewer: r.reviewer || "", decidedAt: r.decided_at || "", paidAt: r.paid_at || "" })) });
  },
  async employee_change_password(p) {
    const e = await authMobile(p.mobileToken); if (!e) return reply(false, "Mobile authentication failed");
    const oldPw = String(p.oldPassword || ""), newPw = String(p.newPassword || "").trim();
    if (newPw.length < 4) return reply(false, "รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัว");
    if (!e.password || !(await verifyPw(oldPw, String(e.password)))) return reply(false, "รหัสผ่านเดิมไม่ถูกต้อง");
    await db.from("employees").update({ password: await hashPw(newPw) }).eq("employee_id", e.employee_id);
    return reply(true, "เปลี่ยนรหัสผ่านแล้ว");
  },
  async employee_request_password_reset(p) {
    const employeeId = String(p.employeeId || "").trim().toUpperCase();
    if (!employeeId) return reply(false, "ต้องระบุรหัสพนักงาน");
    const { data: e } = await db.from("employees").select("employee_id").eq("employee_id", employeeId).maybeSingle();
    if (e) await db.from("password_requests").insert({ request_id: crypto.randomUUID(), employee_id: employeeId, requested_at: nowISO(), status: "pending" });
    return reply(true, "ส่งคำขอรีเซ็ตรหัสผ่านให้แอดมินแล้ว"); // same reply whether or not the id exists
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = JSON.parse((await req.text()) || "{}"); } catch { return reply(false, "คำขอไม่ถูกต้อง"); }
  const action = String(payload.action || "");
  try {
    if (H[action]) return await H[action](payload);
    return reply(false, "ยังไม่รองรับ action นี้บน Supabase: " + action);
  } catch (e) {
    return reply(false, (e as Error).message || "เกิดข้อผิดพลาด");
  }
});
