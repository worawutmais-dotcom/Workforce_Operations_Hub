-- Financial production controls. Run after setup.sql and
-- patch_payroll_draft_review.sql, then deploy swift-handler.
-- This patch keeps historic payroll documents reproducible and makes payment a
-- deliberate state after the accounting snapshot is locked.

alter table payroll_periods
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text not null default '',
  add column if not exists issuer_snapshot jsonb not null default '{}'::jsonb;

alter table payroll_periods
  drop constraint if exists payroll_periods_payment_status_check;
alter table payroll_periods
  add constraint payroll_periods_payment_status_check
  check (payment_status in ('unpaid','paid'));

drop function if exists lock_payroll_commit(text,date,date,text,jsonb,text[]);
create or replace function lock_payroll_commit(
  p_payroll_id text, p_start date, p_end date, p_locked_by text,
  p_lines jsonb, p_settle_ids text[], p_issuer_snapshot jsonb
) returns void language plpgsql as $$
begin
  if exists (select 1 from payroll_periods where payroll_id = p_payroll_id) then
    raise exception 'PERIOD_EXISTS';
  end if;
  if exists (
    select 1 from payroll_periods
    where start_date <= p_end and end_date >= p_start
  ) then
    raise exception 'PERIOD_OVERLAP';
  end if;
  insert into payroll_periods (
    payroll_id, start_date, end_date, status, locked_at, locked_by,
    payment_status, issuer_snapshot
  ) values (
    p_payroll_id, p_start, p_end, 'locked', now(), p_locked_by,
    'unpaid', coalesce(p_issuer_snapshot, '{}'::jsonb)
  );
  insert into payroll_lines (
    payroll_id, employee_id, regular_minutes, ot_minutes, base_gross, ot_gross,
    gross_pay, advance_deduction, net_pay, sso, other_deduction
  )
  select p_payroll_id, x.employee_id, x.regular_minutes, x.ot_minutes,
    x.base_gross, x.ot_gross, x.gross_pay, x.advance_deduction, x.net_pay,
    x.sso, x.other_deduction
  from jsonb_to_recordset(p_lines) as x(
    employee_id text, regular_minutes int, ot_minutes int, base_gross numeric,
    ot_gross numeric, gross_pay numeric, advance_deduction numeric,
    net_pay numeric, sso numeric, other_deduction numeric
  );
  if p_settle_ids is not null and array_length(p_settle_ids,1) is not null then
    update advances set status='settled', settled_payroll=p_payroll_id
    where advance_id = any(p_settle_ids) and status='paid';
  end if;
end $$;

create index if not exists payroll_periods_range_idx
  on payroll_periods(start_date, end_date);

-- Trim financial evidence manually or by a scheduled job after the stated
-- retention period; do not delete it during normal payroll operations.
comment on table audit_log is
  'Retain financial approval and payroll evidence for six months; not clickstream logs.';
