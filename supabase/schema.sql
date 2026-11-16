-- ============================================================================
--  BVN Package — Supabase (PostgreSQL) schema
--  Mirrors the current Google Sheets tabs 1:1 so migration is a straight copy.
--  Sheet tab -> table:
--    Employees->employees, Work_Sites->work_sites, Attendance_Log->attendance_log,
--    Payroll_Rules->payroll_rules, Payroll_Periods->payroll_periods,
--    Payroll_Lines->payroll_lines, Invoices->invoices, Leave_Requests->leave_requests,
--    Time_Requests->time_requests, Settings->settings, Advances->advances,
--    Password_Requests->password_requests, Admin_Users->admin_users,
--    Admin_Sessions->admin_sessions, Mobile_Access->mobile_access,
--    Audit_Log->audit_log, Holidays->holidays
--  Run this in the Supabase SQL editor (or `psql`) on a fresh project.
--  NOTE: this does NOT switch the live app over — it only prepares the database.
-- ============================================================================

-- ---------- Core people & places ----------
create table if not exists employees (
  employee_id        text primary key,
  name               text not null default '',
  role               text default '',
  department         text default '',
  work_site_id       text default '',
  status             text not null default 'active',   -- active | inactive
  location_required  boolean not null default true,
  password           text default ''                   -- TODO: hash before go-live (currently plaintext, matches Sheets)
);

create table if not exists work_sites (
  site_id   text primary key,
  name      text default '',
  latitude  double precision default 0,
  longitude double precision default 0,
  radius_m  integer default 0,
  active    boolean not null default true
);

-- ---------- Attendance ----------
create table if not exists attendance_log (
  id              uuid primary key default gen_random_uuid(),
  employee_id     text not null references employees(employee_id) on update cascade,
  site_id         text default '',
  event_type      text not null,                         -- check_in | check_out
  event_time      timestamptz not null,
  latitude        double precision,
  longitude       double precision,
  accuracy        double precision,
  distance_m      double precision,
  validity        text not null default 'accepted',      -- accepted | rejected (GPS/site check)
  device_timezone text default '',
  source          text default '',                       -- mobile_api_location | admin_manual:<who> | ...
  review_status   text not null default 'pending',       -- pending | accepted | rejected
  created_at      timestamptz not null default now()
);
create index if not exists attendance_emp_time_idx on attendance_log (employee_id, event_time);
create index if not exists attendance_time_idx      on attendance_log (event_time);
create index if not exists attendance_status_idx    on attendance_log (review_status);

-- ---------- Pay configuration & runs ----------
create table if not exists payroll_rules (
  employee_id        text primary key references employees(employee_id) on update cascade,
  pay_basis          text not null default 'daily',      -- daily | hourly | monthly
  base_rate          numeric(12,2) not null default 0,
  standard_hours     numeric(5,2) not null default 8,
  ot_enabled         boolean not null default false,
  ot_multiplier      numeric(5,2) not null default 1.5,
  premium_date       text default '',
  premium_multiplier numeric(5,2) not null default 1,
  updated_at         timestamptz,
  updated_by         text default '',
  other_deduction    numeric(12,2) not null default 0,
  days_per_month     numeric(5,2) not null default 30
);

create table if not exists payroll_periods (
  payroll_id text primary key,
  start_date date not null,
  end_date   date not null,
  status     text not null default 'locked',             -- locked
  locked_at  timestamptz,
  locked_by  text default ''
);

create table if not exists payroll_lines (
  payroll_id        text not null references payroll_periods(payroll_id) on delete cascade,
  employee_id       text not null references employees(employee_id) on update cascade,
  regular_minutes   integer not null default 0,
  ot_minutes        integer not null default 0,
  base_gross        numeric(12,2) not null default 0,
  ot_gross          numeric(12,2) not null default 0,
  gross_pay         numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  advance_deduction numeric(12,2) not null default 0,
  net_pay           numeric(12,2) not null default 0,
  sso               numeric(12,2) not null default 0,
  other_deduction   numeric(12,2) not null default 0,
  primary key (payroll_id, employee_id)
);

-- ---------- Requests ----------
create table if not exists leave_requests (
  request_id  text primary key,
  employee_id text not null references employees(employee_id) on update cascade,
  leave_type  text default '',
  start_date  date,
  end_date    date,
  reason      text default '',
  status      text not null default 'pending',           -- pending | approved | rejected
  submitted_at timestamptz,
  reviewed_by text default '',
  reviewed_at timestamptz
);
create index if not exists leave_status_idx on leave_requests (status);

create table if not exists time_requests (
  request_id       text primary key,
  employee_id      text not null references employees(employee_id) on update cascade,
  request_type     text default '',                      -- overtime | time_edit
  work_date        date,
  requested_minutes integer not null default 0,
  reason           text default '',
  status           text not null default 'pending',      -- pending | approved | rejected
  submitted_at     timestamptz,
  reviewed_by      text default '',
  reviewed_at      timestamptz,
  reviewer_note    text default ''
);
create index if not exists time_status_idx on time_requests (status);

create table if not exists advances (
  advance_id      text primary key,
  employee_id     text not null references employees(employee_id) on update cascade,
  amount          numeric(12,2) not null default 0,
  reason          text default '',
  request_date    date,
  status          text not null default 'pending',        -- pending | approved | paid | settled | rejected
  reviewer        text default '',
  decided_at      timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  settled_payroll text default ''
);
create index if not exists advances_status_idx on advances (status);

create table if not exists password_requests (
  request_id   text primary key,
  employee_id  text not null references employees(employee_id) on update cascade,
  requested_at timestamptz,
  status       text not null default 'pending',
  handled_by   text default '',
  handled_at   timestamptz
);

-- ---------- Billing ----------
create table if not exists invoices (
  invoice_no        text primary key,
  customer          text default '',
  description       text default '',
  subtotal          numeric(12,2) not null default 0,
  vat               numeric(12,2) not null default 0,
  due_date          date,
  total             numeric(12,2) not null default 0,
  status            text not null default 'draft',        -- draft | issued | paid | ...
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  payment_reference text default '',
  paid_at           timestamptz
);
create index if not exists invoices_status_idx on invoices (status);

-- ---------- Config / auth / audit ----------
create table if not exists settings (
  key   text primary key,
  value text default ''
);

create table if not exists holidays (
  date text primary key,            -- 'YYYY-MM-DD' (kept as text to match Sheets exactly)
  name text default 'วันหยุด',
  multiplier numeric default 0      -- OT pay multiplier for this day; 0 = use settings.holiday_multiplier
);

create table if not exists admin_users (
  username     text primary key,
  password     text default '',      -- TODO: hash before go-live
  display_name text default '',
  active       boolean not null default true,
  created_at   timestamptz,
  role         text not null default 'owner'
);

create table if not exists admin_sessions (
  token_hash   text primary key,
  username     text not null,
  display_name text default '',
  expires_at   timestamptz,
  last_used_at timestamptz,
  status       text not null default 'active',
  role         text default 'owner'
);

create table if not exists mobile_access (
  token_hash   text primary key,
  employee_id  text not null references employees(employee_id) on update cascade,
  status       text not null default 'active',
  issued_at    timestamptz,
  last_used_at timestamptz,
  device_label text default ''
);

create table if not exists audit_log (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  actor      text default 'Admin',
  action     text default '',
  target     text default '',
  detail     text default ''
);
create index if not exists audit_ts_idx on audit_log (ts desc);
