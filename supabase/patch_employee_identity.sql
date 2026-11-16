-- BVN Package — employee identity migration
-- Run once in the Supabase SQL Editor before deploying the matching Edge Function.
-- We deliberately preserve the old work-site value under a legacy name instead
-- of relabelling it as a national ID, which would silently corrupt employee PII.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'work_site_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'legacy_work_site_id'
  ) then
    alter table public.employees rename column work_site_id to legacy_work_site_id;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'national_id'
  ) then
    alter table public.employees add column national_id text not null default '';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'phone'
  ) then
    alter table public.employees add column phone text not null default '';
  end if;
end $$;

-- Blanks are permitted for historical rows until their record is completed.
-- Actual national IDs cannot be reused.
create unique index if not exists employees_national_id_unique
  on public.employees (national_id)
  where national_id <> '';

create table if not exists public.employee_identity_requests (
  request_id text primary key,
  employee_id text not null references public.employees(employee_id) on update cascade,
  national_id text not null,
  phone text default '',
  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by text default '',
  reviewed_at timestamptz,
  reviewer_note text default ''
);
create index if not exists employee_identity_requests_pending_idx
  on public.employee_identity_requests(status, submitted_at desc);
