-- BVN Package — Minimal-data mode
-- Keeps: employees, attendance_log, current payroll/business records,
--        admin users, company settings and the current document logo.
-- Removes: audit history and transient rows that do not need to accumulate.
--
-- Run this in Supabase SQL Editor after deploying the matching Edge Function.
-- This does NOT reduce the compute instance's allocated Memory commitment by
-- itself; it frees table/storage growth. Inspect Supabase table sizes separately
-- if the project Memory chart remains high.

truncate table audit_log restart identity;

create table if not exists attendance_archive_challenges (
  archive_id uuid primary key,
  requested_by text not null,
  cutoff_at timestamptz not null,
  record_count integer not null default 0,
  sha256 text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'downloaded'
);
create index if not exists attendance_archive_challenges_expiry_idx
  on attendance_archive_challenges (expires_at);

delete from admin_sessions
where expires_at < now()
   or (status = 'revoked' and coalesce(last_used_at, expires_at, now()) < now() - interval '1 day');

delete from mobile_access
where status = 'revoked'
  and coalesce(last_used_at, issued_at, now()) < now() - interval '1 day';

delete from password_requests
where status <> 'pending'
  and coalesce(handled_at, requested_at, now()) < now() - interval '7 days';

do $$ begin
  if to_regclass('public.employee_identity_requests') is not null then
    delete from employee_identity_requests
    where status <> 'pending'
      and coalesce(reviewed_at, submitted_at, now()) < now() - interval '7 days';
  end if;
end $$;

-- Optional table introduced by patch_factory_reset.sql.  It is safe to omit
-- this statement if the factory-reset feature has not been installed yet.
do $$ begin
  if to_regclass('public.data_reset_challenges') is not null then
    delete from data_reset_challenges
    where status <> 'pending' and created_at < now() - interval '1 day';
  end if;
end $$;

delete from attendance_archive_challenges where expires_at < now();

-- Statistics only; VACUUM cannot run inside a transaction block in some SQL
-- clients. Use Supabase's database maintenance tooling if physical disk space
-- does not fall after this cleanup.
analyze audit_log;
