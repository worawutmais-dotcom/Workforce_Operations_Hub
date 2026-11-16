-- BVN Package: audit-friendly manual attendance correction.
-- Safe to run more than once on an existing Supabase project.
alter table public.attendance_log
  add column if not exists note text not null default '';

comment on column public.attendance_log.note is
  'Operator-supplied reason for a manual attendance correction.';
