-- ============================================================================
--  BVN Package — Supabase Row Level Security (RLS) starter
--  Run AFTER schema.sql. Default posture: lock everything to the trusted server.
--
--  RECOMMENDED ARCHITECTURE (mirrors today's Apps Script "trusted middle"):
--    clients (app + console)  ->  a trusted server that holds the service_role
--    key (a Supabase Edge Function, or keep a small API)  ->  Supabase.
--  With that, RLS can simply deny anon/auth'd direct access and let the
--  service_role (which bypasses RLS) do all reads/writes. This keeps the
--  current security model and avoids a full per-user auth rebuild on day one.
--
--  If you later want the Flutter app to talk to Supabase DIRECTLY with the anon
--  key, you must write real per-row policies (e.g. an employee can read only
--  their own attendance). That is a separate, larger auth task — not required
--  to migrate the data or to run the console through a trusted server.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'employees','work_sites','attendance_log','payroll_rules','payroll_periods',
    'payroll_lines','leave_requests','time_requests','advances','password_requests',
    'invoices','settings','holidays','admin_users','admin_sessions','mobile_access','audit_log'
  ] loop
    execute format('alter table %I enable row level security;', t);
    -- No anon/authenticated policies are created => direct client access is denied.
    -- service_role bypasses RLS, so the trusted server keeps full access.
  end loop;
end $$;

-- ----------------------------------------------------------------------------
--  DEV ONLY — uncomment to allow the anon key full read/write while prototyping.
--  NEVER leave this enabled in production.
-- ----------------------------------------------------------------------------
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'employees','work_sites','attendance_log','payroll_rules','payroll_periods',
--     'payroll_lines','leave_requests','time_requests','advances','password_requests',
--     'invoices','settings','holidays','admin_users','admin_sessions','mobile_access','audit_log'
--   ] loop
--     execute format('drop policy if exists dev_all on %I;', t);
--     execute format('create policy dev_all on %I for all to anon using (true) with check (true);', t);
--   end loop;
-- end $$;
