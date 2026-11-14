-- ============================================================================
--  BVN Package — security patch (run once in the Supabase SQL Editor)
--  Adds: (1) login-attempt throttling table, (2) an atomic payroll-lock function.
--  Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- (1) brute-force protection: one row per login identity
create table if not exists login_attempts (
  id           text primary key,          -- 'admin:<username>' | 'emp:<employeeId>'
  fail_count   int not null default 0,
  locked_until timestamptz
);
alter table login_attempts enable row level security;   -- service_role only (function)

-- (2) atomic payroll lock: period + lines + advance settlement in ONE transaction.
--     Raises PERIOD_EXISTS (→ rolled back) if the period was already locked.
create or replace function lock_payroll_commit(
  p_payroll_id text,
  p_start      date,
  p_end        date,
  p_locked_by  text,
  p_lines      jsonb,
  p_settle_ids text[]
) returns void
language plpgsql
as $$
begin
  if exists (select 1 from payroll_periods where payroll_id = p_payroll_id) then
    raise exception 'PERIOD_EXISTS';
  end if;

  insert into payroll_periods (payroll_id, start_date, end_date, status, locked_at, locked_by)
    values (p_payroll_id, p_start, p_end, 'locked', now(), p_locked_by);

  insert into payroll_lines (payroll_id, employee_id, regular_minutes, ot_minutes, base_gross, ot_gross, gross_pay, advance_deduction, net_pay, sso, other_deduction)
    select p_payroll_id, x.employee_id, x.regular_minutes, x.ot_minutes, x.base_gross, x.ot_gross, x.gross_pay, x.advance_deduction, x.net_pay, x.sso, x.other_deduction
    from jsonb_to_recordset(p_lines) as x(
      employee_id text, regular_minutes int, ot_minutes int,
      base_gross numeric, ot_gross numeric, gross_pay numeric,
      advance_deduction numeric, net_pay numeric, sso numeric, other_deduction numeric);

  if p_settle_ids is not null and array_length(p_settle_ids, 1) is not null then
    update advances set status = 'settled', settled_payroll = p_payroll_id
      where advance_id = any(p_settle_ids) and status = 'paid';
  end if;
end $$;
