// Edge Function: admin employee lifecycle. The only writes that need the Auth
// Admin API (service role) — creating/disabling the Supabase Auth user and
// setting temporary passwords. Everything else is in 0002_rpc.sql.
//
// Deploy:  supabase functions deploy admin-employee
// Secrets it needs (set with `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (provided automatically in prod),
//   SUPABASE_ANON_KEY
//
// POST body: { action, ...fields }
//   action = "upsert_employee" | "reset_password"
//
// Auth: caller must send their Authorization: Bearer <jwt>. We verify the
// caller is in app_admins before doing anything.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EMAIL_DOMAIN = "bvn.local";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function tempPassword(): string {
  // 8 cryptographically-random digits, shown once.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1e8;
  return n.toString().padStart(8, "0");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { ok: false, message: "Missing token" });

  // Caller-scoped client: respects RLS, used only to confirm the caller is an admin.
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json(401, { ok: false, message: "Invalid session" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdminRow } = await admin.from("app_admins").select("user_id").eq("user_id", me.user.id).maybeSingle();
  if (!isAdminRow) return json(403, { ok: false, message: "forbidden" });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(400, { ok: false, message: "Invalid JSON" }); }
  const action = String(payload.action ?? "");

  try {
    if (action === "upsert_employee") return await upsertEmployee(admin, payload);
    if (action === "reset_password") return await resetPassword(admin, payload);
    return json(400, { ok: false, message: "Unsupported action" });
  } catch (e) {
    return json(400, { ok: false, message: (e as Error).message });
  }
});

async function nextEmployeeCode(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await admin.from("employee_profiles").select("employee_code");
  let max = 0;
  for (const r of data ?? []) {
    const m = /^EMP-(\d+)$/.exec(String((r as { employee_code: string }).employee_code));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return "EMP-" + String(max + 1).padStart(4, "0");
}

async function upsertEmployee(admin: ReturnType<typeof createClient>, p: Record<string, unknown>): Promise<Response> {
  const name = String(p.name ?? "").trim();
  const siteId = String(p.siteId ?? "").trim();
  if (!name || !siteId) return json(400, { ok: false, message: "Name and work site are required" });

  const role = String(p.role ?? "Employee").trim() || "Employee";
  const department = String(p.department ?? "").trim();
  const locationRequired = p.locationRequired !== false;
  const active = String(p.status ?? "active") !== "inactive";

  // UPDATE path: an existing employee_code was supplied.
  const existingCode = String(p.employeeId ?? "").trim().toUpperCase();
  if (existingCode) {
    const { data: prof, error } = await admin.from("employee_profiles")
      .update({ display_name: name, role, department, work_site_id: siteId,
                location_required: locationRequired, active })
      .eq("employee_code", existingCode).select().maybeSingle();
    if (error) throw error;
    if (!prof) return json(404, { ok: false, message: "Employee not found" });
    if (!active) await admin.auth.admin.updateUserById(prof.id, { ban_duration: "87600h" }); // ~10y disable
    return json(200, { ok: true, data: { employee: prof, initialPassword: null } });
  }

  // CREATE path: new Auth user + profile, one-time password returned.
  const code = await nextEmployeeCode(admin);
  const email = `${code.toLowerCase().replace("-", "")}@${EMAIL_DOMAIN}`; // emp0001@bvn.local
  const password = tempPassword();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { employee_code: code },
  });
  if (cErr) throw cErr;

  const { data: prof, error: pErr } = await admin.from("employee_profiles").insert({
    id: created.user.id, employee_code: code, display_name: name, role, department,
    work_site_id: siteId, location_required: locationRequired, active,
  }).select().single();
  if (pErr) { await admin.auth.admin.deleteUser(created.user.id); throw pErr; } // roll back the orphan user

  return json(200, { ok: true, data: { employee: prof, initialPassword: password } });
}

async function resetPassword(admin: ReturnType<typeof createClient>, p: Record<string, unknown>): Promise<Response> {
  const code = String(p.employeeId ?? "").trim().toUpperCase();
  const { data: prof } = await admin.from("employee_profiles").select("id, employee_code").eq("employee_code", code).maybeSingle();
  if (!prof) return json(404, { ok: false, message: "Employee not found" });
  const password = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(prof.id, { password });
  if (error) throw error;
  // Revoke existing sessions so the old device must sign in again.
  await admin.auth.admin.signOut(prof.id, "global").catch(() => {});
  return json(200, { ok: true, data: { employeeId: code, temporaryPassword: password } });
}
