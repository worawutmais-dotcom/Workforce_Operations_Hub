-- BVN Package — controlled operational data reset
-- Run once in Supabase SQL Editor BEFORE deploying the Edge Function that
-- exposes the reset UI.  This deliberately preserves admin_users and settings
-- (company / logo / connection configuration), but removes operational data.

create table if not exists data_reset_challenges (
  challenge_id uuid primary key,
  requested_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  status text not null default 'pending'
);
create index if not exists data_reset_challenges_active_idx
  on data_reset_challenges (requested_by, expires_at desc)
  where status = 'pending';

create or replace function app_factory_reset_operational()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_count integer := 0;
begin
  select count(*) into employee_count from employees;

  -- Delete dependent records before the employee register.  Payroll lines are
  -- removed with their period, so a fresh operation cannot inherit a snapshot.
  truncate table employee_identity_requests, mobile_access, attendance_log,
    leave_requests, time_requests, advances, password_requests, invoices,
    payroll_lines, payroll_periods, audit_log restart identity;

  if to_regclass('public.login_attempts') is not null then
    truncate table login_attempts restart identity;
  end if;

  -- `where true` is required: Supabase runs with sql_safe_updates on, which
  -- rejects an unqualified DELETE ("DELETE requires a WHERE clause").
  -- payroll_rules has a mandatory foreign key to employees.  It must be
  -- deleted before the employee register; deleting employees first causes
  -- PostgreSQL error 23503 (payroll_rules_employee_id_fkey).
  delete from payroll_rules where true;
  delete from employees where true;
  delete from work_sites where true;
  delete from holidays where true;

  return jsonb_build_object('employeesRemoved', employee_count);
end;
$$;

revoke all on function app_factory_reset_operational() from public;
