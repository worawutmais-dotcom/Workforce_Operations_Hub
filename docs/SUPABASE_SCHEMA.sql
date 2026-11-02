-- Run in the BVN Package Supabase SQL editor after reviewing with the data owner.
-- Payroll figures are intentionally excluded from this first mobile-attendance migration.
create table public.work_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 25 and 2000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.employee_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text not null unique,
  display_name text not null,
  work_site_id uuid references public.work_sites(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_profiles(id),
  work_site_id uuid not null references public.work_sites(id),
  event_type text not null check (event_type in ('check_in','check_out')),
  occurred_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m numeric(8,2) not null check (accuracy_m >= 0),
  distance_m numeric(10,2) not null check (distance_m >= 0),
  device_timezone text not null,
  created_at timestamptz not null default now()
);
create index attendance_logs_employee_time_idx on public.attendance_logs(employee_id, occurred_at desc);
alter table public.work_sites enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.attendance_logs enable row level security;
create policy "employees can read assigned profile" on public.employee_profiles for select to authenticated using (id = auth.uid());
create policy "employees can read active work sites" on public.work_sites for select to authenticated using (active = true);
create policy "employees can read own attendance" on public.attendance_logs for select to authenticated using (employee_id = auth.uid());
-- Insert must be mediated by an Edge Function or server endpoint that recomputes distance.
-- Do not create a browser direct-insert policy; client-supplied distance is not evidence.
