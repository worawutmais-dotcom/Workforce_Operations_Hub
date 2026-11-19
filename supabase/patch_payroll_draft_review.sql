-- Payroll draft review: editable deductions before the period is locked.
-- Run once in the Supabase SQL Editor before deploying swift-handler.
-- A row is a temporary review setting for one employee in one payroll period;
-- the locked payroll_lines snapshot remains the accounting record.

create table if not exists payroll_draft_adjustments (
  employee_id text not null references employees(employee_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  sso_enabled boolean,
  sso_amount numeric(12,2),
  advance_deduction numeric(12,2),
  other_deduction numeric(12,2),
  note text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (employee_id, period_start, period_end),
  check (period_end >= period_start),
  check (sso_amount is null or sso_amount >= 0),
  check (advance_deduction is null or advance_deduction >= 0),
  check (other_deduction is null or other_deduction >= 0)
);

-- Per-period payroll review overrides. NULL means use the calculated value
-- from the attendance record and the employee's pay rule.
alter table payroll_draft_adjustments
  add column if not exists base_gross_override numeric(12,2),
  add column if not exists ot_gross_override numeric(12,2);

alter table payroll_draft_adjustments
  drop constraint if exists payroll_draft_adjustments_base_gross_override_check,
  drop constraint if exists payroll_draft_adjustments_ot_gross_override_check;
alter table payroll_draft_adjustments
  add constraint payroll_draft_adjustments_base_gross_override_check check (base_gross_override is null or base_gross_override >= 0),
  add constraint payroll_draft_adjustments_ot_gross_override_check check (ot_gross_override is null or ot_gross_override >= 0);

create index if not exists payroll_draft_adjustments_period_idx
  on payroll_draft_adjustments(period_start, period_end);

alter table payroll_draft_adjustments enable row level security;
revoke all on payroll_draft_adjustments from anon, authenticated;

comment on table payroll_draft_adjustments is
  'Temporary payroll review adjustments. Applied to preview and copied into locked payroll snapshot.';
