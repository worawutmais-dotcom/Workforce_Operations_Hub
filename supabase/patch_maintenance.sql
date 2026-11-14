-- ============================================================================
--  BVN Package — maintenance (optional): nightly pruning via pg_cron
--  Keeps audit_log, sessions and mobile tokens from growing forever.
--  The Edge Function already prunes dead sessions opportunistically on login;
--  this adds a scheduled sweep + trims the audit log (which login can't bound).
--
--  Requires the pg_cron extension. In Supabase: Database → Extensions → enable
--  "pg_cron" (schema: pg_catalog or extensions). Then run this file once.
--  Adjust the retention windows to taste.
-- ============================================================================

create extension if not exists pg_cron;

-- keep ~6 months of audit history
select cron.schedule(
  'bvn_prune_audit',
  '15 3 * * *',                                   -- 03:15 daily (UTC)
  $$ delete from audit_log where ts < now() - interval '180 days' $$
);

-- drop expired/revoked admin sessions and revoked mobile tokens
select cron.schedule(
  'bvn_prune_sessions',
  '20 3 * * *',
  $$ delete from admin_sessions where (status = 'revoked' or expires_at < now()) and coalesce(last_used_at, 'epoch') < now() - interval '30 days';
     delete from mobile_access  where status = 'revoked' and coalesce(last_used_at, 'epoch') < now() - interval '30 days';
     delete from login_attempts where coalesce(locked_until, 'epoch') < now() - interval '1 day' and fail_count = 0 $$
);

-- To inspect / remove jobs later:
--   select * from cron.job;
--   select cron.unschedule('bvn_prune_audit');
