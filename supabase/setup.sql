-- ============================================================================
--  BVN Package — Supabase fresh setup (schema + RLS + minimal seed)
--  Use when starting Supabase CLEAN (the Google Sheets data is test data and is
--  NOT migrated). Paste this whole file into the Supabase SQL Editor and Run once.
--  Re-runnable: tables use IF NOT EXISTS, seed uses ON CONFLICT DO NOTHING.
--  Does NOT change the running app — the live system still uses Google Sheets.
-- ============================================================================

-- ─────────────────────────── TABLES ───────────────────────────
create table if not exists employees (
  employee_id text primary key, name text not null default '', role text default '',
  department text default '', legacy_work_site_id text default '', national_id text default '', phone text default '', status text not null default 'active',
  location_required boolean not null default true, password text default '' );

create table if not exists employee_identity_requests (
  request_id text primary key, employee_id text not null references employees(employee_id) on update cascade,
  national_id text not null, phone text default '', status text not null default 'pending',
  submitted_at timestamptz not null default now(), reviewed_by text default '', reviewed_at timestamptz,
  reviewer_note text default '' );
create index if not exists employee_identity_requests_pending_idx on employee_identity_requests(status, submitted_at desc);

create table if not exists work_sites (
  site_id text primary key, name text default '', latitude double precision default 0,
  longitude double precision default 0, radius_m integer default 0, active boolean not null default true );

create table if not exists attendance_log (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(employee_id) on update cascade,
  site_id text default '', event_type text not null, event_time timestamptz not null,
  latitude double precision, longitude double precision, accuracy double precision, distance_m double precision,
  validity text not null default 'accepted', device_timezone text default '', source text default '',
  review_status text not null default 'pending', note text default '', created_at timestamptz not null default now() );
create index if not exists attendance_emp_time_idx on attendance_log (employee_id, event_time);
create index if not exists attendance_time_idx on attendance_log (event_time);
create index if not exists attendance_status_idx on attendance_log (review_status);

create table if not exists payroll_rules (
  employee_id text primary key references employees(employee_id) on update cascade,
  pay_basis text not null default 'daily', base_rate numeric(12,2) not null default 0,
  standard_hours numeric(5,2) not null default 8, ot_enabled boolean not null default false,
  ot_multiplier numeric(5,2) not null default 1.5, premium_date text default '',
  premium_multiplier numeric(5,2) not null default 1, updated_at timestamptz, updated_by text default '',
  other_deduction numeric(12,2) not null default 0, days_per_month numeric(5,2) not null default 30 );

create table if not exists payroll_periods (
  payroll_id text primary key, start_date date not null, end_date date not null,
  status text not null default 'locked', locked_at timestamptz, locked_by text default '' );

create table if not exists payroll_lines (
  payroll_id text not null references payroll_periods(payroll_id) on delete cascade,
  employee_id text not null references employees(employee_id) on update cascade,
  regular_minutes integer not null default 0, ot_minutes integer not null default 0,
  base_gross numeric(12,2) not null default 0, ot_gross numeric(12,2) not null default 0,
  gross_pay numeric(12,2) not null default 0, created_at timestamptz not null default now(),
  advance_deduction numeric(12,2) not null default 0, net_pay numeric(12,2) not null default 0,
  sso numeric(12,2) not null default 0, other_deduction numeric(12,2) not null default 0,
  primary key (payroll_id, employee_id) );

create table if not exists leave_requests (
  request_id text primary key, employee_id text not null references employees(employee_id) on update cascade,
  leave_type text default '', start_date date, end_date date, reason text default '',
  status text not null default 'pending', submitted_at timestamptz, reviewed_by text default '', reviewed_at timestamptz );
create index if not exists leave_status_idx on leave_requests (status);

create table if not exists time_requests (
  request_id text primary key, employee_id text not null references employees(employee_id) on update cascade,
  request_type text default '', work_date date, requested_minutes integer not null default 0, reason text default '',
  status text not null default 'pending', submitted_at timestamptz, reviewed_by text default '',
  reviewed_at timestamptz, reviewer_note text default '' );
create index if not exists time_status_idx on time_requests (status);

create table if not exists advances (
  advance_id text primary key, employee_id text not null references employees(employee_id) on update cascade,
  amount numeric(12,2) not null default 0, reason text default '', request_date date,
  status text not null default 'pending', reviewer text default '', decided_at timestamptz,
  paid_at timestamptz, created_at timestamptz not null default now(), settled_payroll text default '' );
create index if not exists advances_status_idx on advances (status);

create table if not exists password_requests (
  request_id text primary key, employee_id text not null references employees(employee_id) on update cascade,
  requested_at timestamptz, status text not null default 'pending', handled_by text default '', handled_at timestamptz );

create table if not exists invoices (
  invoice_no text primary key, customer text default '', description text default '',
  subtotal numeric(12,2) not null default 0, vat numeric(12,2) not null default 0, due_date date,
  total numeric(12,2) not null default 0, status text not null default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  payment_reference text default '', paid_at timestamptz );
create index if not exists invoices_status_idx on invoices (status);

create table if not exists settings ( key text primary key, value text default '' );
create table if not exists holidays ( date text primary key, name text default 'วันหยุด' );

create table if not exists admin_users (
  username text primary key, password text default '', display_name text default '',
  active boolean not null default true, created_at timestamptz, role text not null default 'owner' );

create table if not exists admin_sessions (
  token_hash text primary key, username text not null, display_name text default '',
  expires_at timestamptz, last_used_at timestamptz, status text not null default 'active', role text default 'owner' );

create table if not exists mobile_access (
  token_hash text primary key, employee_id text not null references employees(employee_id) on update cascade,
  status text not null default 'active', issued_at timestamptz, expires_at timestamptz, last_used_at timestamptz, device_label text default '' );
create index if not exists mobile_access_expiry_idx on mobile_access (expires_at);

create table if not exists audit_log (
  id bigserial primary key, ts timestamptz not null default now(),
  actor text default 'Admin', action text default '', target text default '', detail text default '' );
create index if not exists audit_ts_idx on audit_log (ts desc);

-- ─────────────────────────── RLS (lock to the trusted server / service_role) ───────────────────────────
do $$ declare t text; begin
  foreach t in array array['employees','work_sites','attendance_log','payroll_rules','payroll_periods',
    'payroll_lines','leave_requests','time_requests','advances','password_requests','invoices','settings',
    'holidays','admin_users','admin_sessions','mobile_access','audit_log']
  loop execute format('alter table %I enable row level security;', t); end loop;
end $$;

-- ─────────────────────────── SEED (defaults only — no test data) ───────────────────────────
-- Company settings defaults (same keys as Code.gs SETTINGS_DEFAULTS)
insert into settings (key, value) values
  ('pay_frequency','monthly'),('pay_day_1','end'),('pay_day_2','15'),('workdays','1,2,3,4,5'),
  ('sso_enabled','false'),('sso_rate','5'),('sso_cap','750'),
  ('quota_sick','30'),('quota_personal','6'),('quota_vacation','6'),
  ('shift_start','09:00'),('shift_end','18:00'),('shift_grace_min','5'),('lunch_break_min','60'),
  ('ot_threshold_hours','8'),('holiday_ot_enabled','false'),
  ('remind_before_min','15'),('remind_checkout_after_min','10'),
  ('app_version_code','0'),('app_version_name',''),('app_apk_url',''),('app_update_mandatory','false'),('app_update_notes',''),
  ('invoice_company_name','บริษัท พนมพร พาณิชย์ จำกัด'),('invoice_company_name_en','Phanomporn Phanich Co., Ltd.'),
  ('invoice_address','479/162 ซอยสุทธิพร แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400'),
  ('invoice_phone','096-797-9923'),('invoice_tax_id','0105569191266'),('invoice_vat_rate','7'),
  ('invoice_prefix','INV'),('invoice_footer','ขอบคุณที่ใช้บริการ'),
  ('invoice_logo_file_id',''),('invoice_logo_url',''),('invoice_logo_folder_id','')
on conflict (key) do nothing;

-- Default work site (BVN HQ) — same coords as Code.gs seed
insert into work_sites (site_id, name, latitude, longitude, radius_m, active) values
  ('BVN-HQ','ร้าน BVN สาขาหลัก',13.762962071350593,100.5582875856417,200,true)
on conflict (site_id) do nothing;

-- Default owner login. CHANGE THIS before real use (and hash the password at go-live).
insert into admin_users (username, password, display_name, active, created_at, role) values
  ('admin','changeme','ผู้ดูแลระบบ',true, now(),'owner')
on conflict (username) do nothing;

-- Employees start empty — add real staff later via the console (post-cutover).

-- ─────────────────────────── SECURITY (login throttling + atomic payroll lock) ───────────────────────────
create table if not exists login_attempts (
  id text primary key, fail_count int not null default 0, locked_until timestamptz );
alter table login_attempts enable row level security;

create or replace function lock_payroll_commit(
  p_payroll_id text, p_start date, p_end date, p_locked_by text, p_lines jsonb, p_settle_ids text[]
) returns void language plpgsql as $$
begin
  if exists (select 1 from payroll_periods where payroll_id = p_payroll_id) then raise exception 'PERIOD_EXISTS'; end if;
  insert into payroll_periods (payroll_id, start_date, end_date, status, locked_at, locked_by)
    values (p_payroll_id, p_start, p_end, 'locked', now(), p_locked_by);
  insert into payroll_lines (payroll_id, employee_id, regular_minutes, ot_minutes, base_gross, ot_gross, gross_pay, advance_deduction, net_pay, sso, other_deduction)
    select p_payroll_id, x.employee_id, x.regular_minutes, x.ot_minutes, x.base_gross, x.ot_gross, x.gross_pay, x.advance_deduction, x.net_pay, x.sso, x.other_deduction
    from jsonb_to_recordset(p_lines) as x(employee_id text, regular_minutes int, ot_minutes int, base_gross numeric, ot_gross numeric, gross_pay numeric, advance_deduction numeric, net_pay numeric, sso numeric, other_deduction numeric);
  if p_settle_ids is not null and array_length(p_settle_ids,1) is not null then
    update advances set status='settled', settled_payroll=p_payroll_id where advance_id = any(p_settle_ids) and status='paid';
  end if;
end $$;
