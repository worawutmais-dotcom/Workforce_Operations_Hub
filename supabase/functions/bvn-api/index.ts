// ============================================================================
//  BVN Package — Supabase Edge Function "bvn-api"  (CORE actions, v1)
//  A trusted server that speaks the SAME request/response contract as the old
//  Apps Script backend, but reads/writes Supabase (Postgres) with the service
//  role. The app/console just point their endpoint at this function's URL.
//
//  Request  (POST, body JSON or text/plain JSON): { action, adminToken?, ...fields }
//  Response (JSON): { ok: boolean, message: string, data: object|null }
//
//  SCOPE (v1 = core, to trial Supabase + realtime):
//    version, public_branding, admin_console_login, admin_console_logout,
//    dashboard, admin_list_employees, admin_upsert_employee,
//    admin_get_settings, admin_save_settings, admin_list_holidays,
//    admin_save_holiday, admin_delete_holiday,
//    admin_record_attendance, admin_attendance_days,
//    admin_list_leave_requests, admin_list_time_requests
//  NOT YET ported (return a clear "not available in v1" so the UI degrades
//  gracefully): payroll, invoices, advances, OT review, pay rules, audit, etc.
//
//  Auth: this backend issues its OWN sessions (no need to match the old hash).
//  Passwords are compared as plaintext for now (matches the fresh seed) — hash
//  before real production use.
//
//  Deploy (owner runs — see ../MIGRATION_PLAN.md):
//    supabase functions deploy bvn-api --no-verify-jwt --project-ref <ref>
//  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const reply = (ok: boolean, message: string, data: unknown = null) =>
  new Response(JSON.stringify({ ok, message, data }), { headers: CORS });

const BACKEND_VERSION = "2.0.0-supabase";
const ICT_OFFSET = 7 * 60; // minutes
const todayISO = () => new Date(Date.now() + ICT_OFFSET * 60000).toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const hhmm = (ts: string) => {
  const d = new Date(new Date(ts).getTime() + ICT_OFFSET * 60000);
  return d.toISOString().slice(11, 16);
};
const token = () => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

// ---------- session ----------
async function verify(adminToken: string, roles?: string[]) {
  if (!adminToken) throw new Error("ไม่พบ session กรุณาเข้าสู่ระบบใหม่");
  const { data } = await db.from("admin_sessions").select("*").eq("token_hash", adminToken)
    .eq("status", "active").maybeSingle();
  if (!data || (data.expires_at && new Date(data.expires_at).getTime() < Date.now()))
    throw new Error("session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  if (roles && !roles.includes(data.role)) throw new Error("บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้");
  db.from("admin_sessions").update({ last_used_at: nowISO() }).eq("token_hash", adminToken).then(() => {});
  return data as { username: string; display_name: string; role: string };
}

async function settingsMap(): Promise<Record<string, string>> {
  const { data } = await db.from("settings").select("key,value");
  const m: Record<string, string> = {};
  (data || []).forEach((r: any) => (m[r.key] = r.value ?? ""));
  return m;
}

// ---------- action handlers ----------
const H: Record<string, (p: any) => Promise<Response>> = {

  async version() {
    const s = await settingsMap();
    return reply(true, "ok", {
      backendVersion: BACKEND_VERSION,
      appVersionCode: Number(s.app_version_code || 0),
      appVersionName: s.app_version_name || "",
      appApkUrl: s.app_apk_url || "",
      appMandatory: (s.app_update_mandatory || "") === "true",
      appNotes: s.app_update_notes || "",
    });
  },

  async public_branding() {
    const s = await settingsMap();
    return reply(true, "ok", { name: s.invoice_company_name || "พนมพร พาณิชย์", logoUrl: s.invoice_logo_url || "" });
  },

  async admin_console_login(p) {
    const username = String(p.username || "").trim();
    const password = String(p.password || "");
    if (!username || !password) return reply(false, "กรอกชื่อผู้ใช้และรหัสผ่าน");
    const { data: u } = await db.from("admin_users").select("*")
      .ilike("username", username).eq("active", true).maybeSingle();
    if (!u || String(u.password) !== password) return reply(false, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    const tk = token();
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    await db.from("admin_sessions").insert({
      token_hash: tk, username: u.username, display_name: u.display_name || u.username,
      expires_at: expiresAt, last_used_at: nowISO(), status: "active", role: u.role || "owner",
    });
    return reply(true, "เข้าสู่ระบบสำเร็จ", {
      adminToken: tk, username: u.username, displayName: u.display_name || u.username,
      role: u.role || "owner", expiresAt,
    });
  },

  async admin_console_logout(p) {
    if (p.adminToken) await db.from("admin_sessions").update({ status: "revoked" }).eq("token_hash", p.adminToken);
    return reply(true, "ออกจากระบบแล้ว");
  },

  async admin_list_employees(p) {
    await verify(p.adminToken);
    const { data } = await db.from("employees").select("*").order("employee_id");
    const employees = (data || []).map((e: any) => ({
      id: e.employee_id, name: e.name, role: e.role || "", department: e.department || "",
      siteId: e.work_site_id || "", status: e.status || "active",
      locationRequired: e.location_required !== false, password: e.password || "",
    }));
    return reply(true, "Employees loaded", { employees });
  },

  async admin_upsert_employee(p) {
    await verify(p.adminToken, ["owner", "manager"]);
    const id = String(p.employeeId || p.id || "").trim();
    if (!id) return reply(false, "ต้องมีรหัสพนักงาน");
    const row: any = {
      employee_id: id, name: String(p.name || "").trim(), role: String(p.role || ""),
      department: String(p.department || ""), work_site_id: String(p.siteId || ""),
      status: String(p.status || "active"), location_required: p.locationRequired !== false,
    };
    if (p.password != null && String(p.password) !== "") row.password = String(p.password);
    const { error } = await db.from("employees").upsert(row, { onConflict: "employee_id" });
    if (error) return reply(false, error.message);
    return reply(true, "บันทึกพนักงานแล้ว", { id });
  },

  async admin_get_settings(p) {
    await verify(p.adminToken);
    return reply(true, "Settings loaded", { settings: await settingsMap() });
  },

  async admin_save_settings(p) {
    await verify(p.adminToken, ["owner"]);
    const incoming = p.settings && typeof p.settings === "object" ? p.settings : p;
    const rows = Object.keys(incoming)
      .filter((k) => k !== "action" && k !== "adminToken" && k !== "settings")
      .map((k) => ({ key: k, value: String(incoming[k] ?? "") }));
    if (rows.length) {
      const { error } = await db.from("settings").upsert(rows, { onConflict: "key" });
      if (error) return reply(false, error.message);
    }
    return reply(true, "บันทึกการตั้งค่าแล้ว");
  },

  async admin_list_holidays(p) {
    await verify(p.adminToken);
    const { data } = await db.from("holidays").select("date,name").order("date");
    return reply(true, "Holidays loaded", { holidays: data || [] });
  },

  async admin_save_holiday(p) {
    await verify(p.adminToken, ["owner"]);
    const date = String(p.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(false, "วันที่ต้องเป็น YYYY-MM-DD");
    await db.from("holidays").upsert({ date, name: String(p.name || "วันหยุด") }, { onConflict: "date" });
    return reply(true, "บันทึกวันหยุดแล้ว");
  },

  async admin_delete_holiday(p) {
    await verify(p.adminToken, ["owner"]);
    await db.from("holidays").delete().eq("date", String(p.date || ""));
    return reply(true, "ลบวันหยุดแล้ว");
  },

  async admin_record_attendance(p) {
    const actor = await verify(p.adminToken, ["owner", "manager", "operations"]);
    const employeeId = String(p.employeeId || "").trim();
    const eventType = String(p.eventType || "");
    if (!employeeId || !["check_in", "check_out"].includes(eventType)) return reply(false, "ข้อมูลไม่ครบ");
    const { data: emp } = await db.from("employees").select("work_site_id").eq("employee_id", employeeId).maybeSingle();
    const { error } = await db.from("attendance_log").insert({
      employee_id: employeeId, site_id: emp?.work_site_id || "", event_type: eventType,
      event_time: nowISO(), validity: "accepted", source: "admin_manual:" + (actor.display_name || "Admin"),
      review_status: "accepted",
    });
    if (error) return reply(false, error.message);
    return reply(true, eventType === "check_in" ? "ลงเวลาเข้าแล้ว" : "ลงเวลาออกแล้ว");
  },

  async admin_attendance_days(p) {
    await verify(p.adminToken);
    const start = String(p.startDate || todayISO());
    const end = String(p.endDate || todayISO());
    let q = db.from("attendance_log").select("employee_id,event_type,event_time,review_status")
      .eq("review_status", "accepted")
      .gte("event_time", start + "T00:00:00+07:00").lte("event_time", end + "T23:59:59+07:00");
    if (p.employeeId) q = q.eq("employee_id", String(p.employeeId));
    const { data: logs } = await q;
    const { data: emps } = await db.from("employees").select("employee_id,name");
    const nameOf: Record<string, string> = {};
    (emps || []).forEach((e: any) => (nameOf[e.employee_id] = e.name));
    const byKey: Record<string, any> = {};
    (logs || []).forEach((r: any) => {
      const day = new Date(new Date(r.event_time).getTime() + ICT_OFFSET * 60000).toISOString().slice(0, 10);
      const key = r.employee_id + "|" + day;
      const it = byKey[key] || { employeeId: r.employee_id, date: day, inTs: null, outTs: null };
      const t = new Date(r.event_time).getTime();
      if (r.event_type === "check_in") it.inTs = it.inTs ? Math.min(it.inTs, t) : t;
      if (r.event_type === "check_out") it.outTs = it.outTs ? Math.max(it.outTs, t) : t;
      byKey[key] = it;
    });
    const days = Object.values(byKey).map((it: any) => {
      const worked = it.inTs && it.outTs && it.outTs > it.inTs ? Math.round((it.outTs - it.inTs) / 60000) : 0;
      return {
        employeeId: it.employeeId, name: nameOf[it.employeeId] || it.employeeId, date: it.date,
        checkIn: it.inTs ? hhmm(new Date(it.inTs).toISOString()) : "",
        checkOut: it.outTs ? hhmm(new Date(it.outTs).toISOString()) : "",
        workedMinutes: worked, status: it.inTs && it.outTs ? "complete" : "incomplete",
      };
    }).sort((a: any, b: any) => (a.date === b.date ? a.employeeId.localeCompare(b.employeeId) : a.date < b.date ? 1 : -1));
    return reply(true, "Attendance days loaded", { startDate: start, endDate: end, days });
  },

  async admin_list_leave_requests(p) {
    await verify(p.adminToken);
    const { data } = await db.from("leave_requests").select("*").order("submitted_at", { ascending: false });
    const requests = (data || []).map((r: any) => ({
      requestId: r.request_id, employeeId: r.employee_id, leaveType: r.leave_type,
      startDate: r.start_date, endDate: r.end_date, reason: r.reason, status: r.status,
      submittedAt: r.submitted_at, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
    }));
    return reply(true, "Leave requests loaded", { requests });
  },

  async admin_list_time_requests(p) {
    await verify(p.adminToken);
    const { data } = await db.from("time_requests").select("*").order("submitted_at", { ascending: false });
    const requests = (data || []).map((r: any) => ({
      requestId: r.request_id, employeeId: r.employee_id, requestType: r.request_type,
      workDate: r.work_date, requestedMinutes: r.requested_minutes, reason: r.reason,
      status: r.status, submittedAt: r.submitted_at, reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at, reviewerNote: r.reviewer_note,
    }));
    return reply(true, "Time requests loaded", { requests });
  },

  async dashboard(p) {
    await verify(p.adminToken);
    const day = todayISO();
    const { data: emps } = await db.from("employees").select("employee_id,status");
    const active = (emps || []).filter((e: any) => (e.status || "active") === "active");
    const { data: todayLogs } = await db.from("attendance_log").select("employee_id,event_type")
      .eq("review_status", "accepted")
      .gte("event_time", day + "T00:00:00+07:00").lte("event_time", day + "T23:59:59+07:00");
    const presentSet = new Set((todayLogs || []).filter((r: any) => r.event_type === "check_in").map((r: any) => r.employee_id));
    const [{ count: leaveN }, { count: timeN }] = await Promise.all([
      db.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("time_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const pending = (leaveN || 0) + (timeN || 0);
    return reply(true, "ok", {
      present: presentSet.size, totalEmployees: active.length, pendingApprovals: pending,
      exceptions: 0, overdueInvoices: 0, asOf: nowISO(),
      latestPayrollId: "", latestPayrollStatus: "",
      capabilities: { attendance: true, financial: true, approvals: true },
    });
  },
};

const NOT_READY = new Set([
  "admin_preview_payroll", "admin_owner_overview", "admin_list_payrolls", "admin_get_payroll",
  "admin_lock_payroll", "admin_list_invoices", "admin_create_invoice", "admin_update_invoice_status",
  "admin_list_advances", "admin_list_pay_rules", "admin_list_audit_log", "admin_get_invoice_settings",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = JSON.parse(await req.text() || "{}"); } catch { return reply(false, "คำขอไม่ถูกต้อง"); }
  const action = String(payload.action || "");
  try {
    if (H[action]) return await H[action](payload);
    if (NOT_READY.has(action)) return reply(false, "ฟังก์ชันนี้ยังไม่พร้อมในเวอร์ชันทดลอง Supabase (v1)");
    return reply(false, "ไม่รู้จัก action: " + action);
  } catch (e) {
    return reply(false, (e as Error).message || "เกิดข้อผิดพลาด");
  }
});
