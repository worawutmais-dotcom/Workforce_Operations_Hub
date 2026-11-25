-- Mobile session security hardening.
-- Existing active sessions are intentionally revoked because legacy rows hold
-- raw bearer tokens and cannot be safely converted into one-way digests.

begin;

alter table public.mobile_access
  add column if not exists expires_at timestamptz;

create index if not exists mobile_access_expiry_idx
  on public.mobile_access (expires_at);

update public.mobile_access
  set status = 'revoked'
  where status = 'active';

commit;
