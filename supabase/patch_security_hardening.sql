-- Security + performance hardening.
-- APPLIED to production 2026-11-17 (Supabase migration security_hardening_revoke_rpc_and_indexes).
-- Idempotent — safe to re-run. Run in SQL Editor on any new environment.

-- 1) CRITICAL — stop anon/authenticated from calling destructive / privileged
--    RPCs directly via /rest/v1/rpc. app_factory_reset_operational() is
--    SECURITY DEFINER (runs as owner, bypasses RLS) and wipes all operational
--    data; before this it was callable by anyone holding the publishable key.
--    The Edge Function uses service_role, which is unaffected.
revoke execute on function public.app_factory_reset_operational() from anon, authenticated, public;
revoke execute on function public.lock_payroll_commit(text, date, date, text, jsonb, text[], jsonb) from anon, authenticated, public;

-- 2) Pin the payroll lock function's search_path (linter 0011).
alter function public.lock_payroll_commit(text, date, date, text, jsonb, text[], jsonb) set search_path = public;

-- 3) Covering indexes for employee_id foreign keys (linter 0001).
create index if not exists advances_employee_id_idx on public.advances (employee_id);
create index if not exists employee_identity_requests_employee_id_idx on public.employee_identity_requests (employee_id);
create index if not exists leave_requests_employee_id_idx on public.leave_requests (employee_id);
create index if not exists mobile_access_employee_id_idx on public.mobile_access (employee_id);
create index if not exists password_requests_employee_id_idx on public.password_requests (employee_id);
create index if not exists payroll_lines_employee_id_idx on public.payroll_lines (employee_id);
create index if not exists time_requests_employee_id_idx on public.time_requests (employee_id);

-- 4) Drop the never-used index (linter 0005).
drop index if exists public.payroll_periods_range_idx;
