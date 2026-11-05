-- =====================================================================
-- SUPERSEDED: the runnable backend now lives in supabase/migrations/
-- (0001_schema.sql + 0002_rpc.sql) with the admin-employee Edge Function.
-- This file is kept as a readable single-file reference only.
-- =====================================================================
-- BVN Package — full Postgres/Supabase schema (supersedes SUPABASE_SCHEMA.sql)
-- Review with the data owner before running. Run top-to-bottom in the
-- Supabase SQL editor. Mirrors every table/behaviour in apps_script/Code.gs.
--
-- Design rules carried over from the Apps Script backend:
--   * The server is the only authority. Clients never write business rows
--     directly — all writes go through the security-definer functions /
--     Edge Functions at the bottom. No browser INSERT/UPDATE policies.
--   * Attendance and payroll snapshots are append-only / immutable.
--   * Passwords: handled by Supabase Auth (argon2), NOT a column here.
--   * Admin identity is a real user with a role, not one shared API key.
-- =====================================================================

-- ---------- reference: work sites ----------
create table public.work_sites (
  id          uuid primary key default gen_random_uuid(),
  site_code   text not null unique,                 -- e.g. SITE-001 (matches old sheet IDs)
  name        text not null,
  latitude    double precision not null check (latitude  between  -90 and  90),
  longitude   double precision not null check (longitude between -180 and 180),
  radius_m    integer not null default 150 check (radius_m between 25 and 2000),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- people ----------
-- One row per employee, keyed to the Supabase Auth user.
create table public.employee_profiles (
  id                 uuid primary key references auth.users(id) on delete restrict,
  employee_code      text not null unique,          -- EMP-0001
  display_name       text not null,
  role               text not null default 'Employee',
  department         text,
  work_site_id       uuid references public.work_sites(id),
  location_required  boolean not null default true,
  active             boolean not null default true, -- deactivate, never delete (keeps history)
  created_at         timestamptz not null default now()
);

-- Admins are employees (or dedicated users) flagged here. Replaces ADMIN_API_KEY.
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  label      text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- ---------- attendance (append-only event log) ----------
create table public.attendance_logs (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employee_profiles(id),
  work_site_id    uuid references public.work_sites(id),
  event_type      text not null check (event_type in ('check_in','check_out')),
  occurred_at     timestamptz not null default now(),
  latitude        double precision,
  longitude       double precision,
  accuracy_m      numeric(8,2) check (accuracy_m >= 0),
  distance_m      numeric(10,2) check (distance_m >= 0),   -- recomputed server-side
  decision        text not null check (decision in ('accepted','rejected')),
  device_timezone text,
  source          text not null default 'mobile',
  created_at      timestamptz not null default now()
);
create index attendance_logs_emp_time_idx on public.attendance_logs(employee_id, occurred_at desc);

-- ---------- leave requests ----------
create table public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employee_profiles(id),
  leave_type   text not null,
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by  text,
  reviewed_at  timestamptz
);

-- ---------- OT / attendance-correction requests ----------
create table public.time_requests (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employee_profiles(id),
  request_type      text not null check (request_type in ('overtime','attendance_correction')),
  work_date         date not null,
  requested_minutes integer not null check (requested_minutes > 0 and requested_minutes <= 1440),
  reason            text not null,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at      timestamptz not null default now(),
  reviewed_by       text,
  reviewed_at       timestamptz,
  reviewer_note     text
);

-- ---------- pay rules (one active rule per employee) ----------
create table public.payroll_rules (
  employee_id        uuid primary key references public.employee_profiles(id),
  pay_basis          text not null check (pay_basis in ('hourly','daily')),
  base_rate          numeric(12,2) not null check (base_rate >= 0),
  standard_hours     numeric(5,2)  not null default 8 check (standard_hours > 0),
  ot_enabled         boolean not null default false,
  ot_multiplier      numeric(5,2)  not null default 1.5 check (ot_multiplier >= 1),
  premium_date       date,
  premium_multiplier numeric(5,2)  not null default 1 check (premium_multiplier >= 1),
  updated_at         timestamptz not null default now(),
  updated_by         text
);

-- ---------- payroll periods + immutable line snapshots ----------
create table public.payroll_periods (
  id          text primary key,                      -- PAY-YYYYMMDD-YYYYMMDD
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  status      text not null default 'locked' check (status in ('locked')),
  total_gross numeric(14,2) not null default 0,
  locked_at   timestamptz not null default now(),
  locked_by   text
);
create table public.payroll_lines (
  payroll_id      text not null references public.payroll_periods(id) on delete restrict,
  employee_id     uuid not null references public.employee_profiles(id),
  regular_minutes integer not null default 0,
  ot_minutes      integer not null default 0,
  base_gross      numeric(12,2) not null default 0,
  ot_gross        numeric(12,2) not null default 0,
  gross_pay       numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  primary key (payroll_id, employee_id)
);

-- Immutability: a locked period and its lines can never be updated or deleted.
create or replace function public.block_mutation() returns trigger
language plpgsql as $$ begin raise exception 'Locked payroll rows are immutable'; end; $$;
create trigger payroll_periods_immutable before update or delete on public.payroll_periods
  for each row execute function public.block_mutation();
create trigger payroll_lines_immutable before update or delete on public.payroll_lines
  for each row execute function public.block_mutation();

-- ---------- invoices ----------
create table public.invoices (
  invoice_no        text primary key,                -- INV-YYYYMM-NNN
  customer          text not null,
  description       text not null,
  subtotal          numeric(14,2) not null check (subtotal >= 0),
  vat               numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  due_date          date not null,
  status            text not null default 'draft' check (status in ('draft','issued','paid','void')),
  payment_reference text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
--   Reads: employees see only their own rows; admins see everything.
--   Writes: NONE from clients. Done by security-definer functions below.
-- =====================================================================
alter table public.work_sites        enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.attendance_logs   enable row level security;
alter table public.leave_requests    enable row level security;
alter table public.time_requests     enable row level security;
alter table public.payroll_rules     enable row level security;
alter table public.payroll_periods   enable row level security;
alter table public.payroll_lines     enable row level security;
alter table public.invoices          enable row level security;

create policy sites_read   on public.work_sites        for select to authenticated using (active or public.is_admin());
create policy emp_self     on public.employee_profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy att_self     on public.attendance_logs   for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy leave_self   on public.leave_requests    for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy time_self    on public.time_requests     for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy rules_admin  on public.payroll_rules     for select to authenticated using (public.is_admin());
create policy period_admin on public.payroll_periods   for select to authenticated using (public.is_admin());
create policy lines_admin  on public.payroll_lines     for select to authenticated using (public.is_admin());
create policy inv_admin    on public.invoices          for select to authenticated using (public.is_admin());

-- =====================================================================
-- Write path (sketch). Each maps 1:1 to an apps_script/Code.gs action.
-- Implement as SQL security-definer functions, except the two marked
-- [edge] which need the Auth Admin API (service-role) and so live in a
-- Supabase Edge Function:
--
--   mobile:  record_attendance()  -- recompute distance_m from work_sites,
--                                    enforce dup check_in/out per ICT day
--            submit_leave_request(), submit_time_request()
--   admin:   admin_upsert_employee()      [edge] create/disable auth user
--            admin_reset_employee_password [edge] issue temp password
--            admin_review_leave(), admin_review_time_request()
--            admin_upsert_pay_rule()
--            admin_preview_payroll()  -- pure SQL, returns rows, no write
--            admin_lock_payroll()     -- insert period+lines once, immutable
--            admin_create_invoice(), admin_update_invoice_status()
--            admin_dashboard()        -- aggregate read
--
-- Guard every admin_* function with:  if not public.is_admin() then
--   raise exception 'forbidden'; end if;
-- Keep the Haversine distance + payroll math in ONE SQL/TS function each,
-- with their own tests — never inline them the way Code.gs did.
-- =====================================================================
