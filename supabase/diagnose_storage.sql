-- Run in Supabase SQL Editor to see what actually occupies database disk.
-- This is the evidence to use before changing the compute size based on the
-- Memory commitment chart.
select
  c.relname as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_total_relation_size(c.oid) as total_bytes,
  coalesce(s.n_live_tup, 0) as estimated_rows
from pg_class c
left join pg_stat_user_tables s on s.relid = c.oid
where c.relkind = 'r'
  and c.relnamespace = 'public'::regnamespace
order by pg_total_relation_size(c.oid) desc;

-- Count the business records that Minimal-data mode intentionally preserves.
select 'employees' as source, count(*) as rows from employees
union all select 'attendance_log (last 6 months)', count(*) from attendance_log where event_time >= now() - interval '6 months'
union all select 'attendance_log (older)', count(*) from attendance_log where event_time < now() - interval '6 months'
union all select 'audit_log', count(*) from audit_log;
