-- Temporary compatibility bridge for an older deployed swift-handler.
-- The current Edge Function no longer reads employees.work_site_id; it uses
-- work_sites plus the location_required policy. Keep this column only while
-- an older function release is still serving production traffic.

alter table public.employees
  add column if not exists work_site_id text not null default '';

-- Preserve the original site assignment for old function releases. The value
-- was retained by patch_employee_identity.sql when it renamed the old column.
update public.employees
set work_site_id = legacy_work_site_id
where work_site_id = ''
  and coalesce(legacy_work_site_id, '') <> '';
