-- Patch: OT multiplier calendar + configurable OT rules
-- Run once on an existing database. Safe to re-run (idempotent).

-- 1) Per-day OT multiplier on the holiday/special-day calendar.
--    0 (default) means "no explicit value" -> the app falls back to
--    settings.holiday_multiplier for a holiday row, or the weekday/OT rules.
alter table holidays add column if not exists multiplier numeric default 0;

-- 2) Default OT rule settings (only inserted if missing; never overwrites
--    values an owner already set).
insert into settings (key, value) values
  ('ot_auto_apply',        'true'),   -- compute OT pay by day rules automatically
  ('ot_multiplier',        '1.5'),    -- OT on a normal working day
  ('ot_sunday_multiplier', '2'),      -- Sunday
  ('ot_saturday_enabled',  'false'),  -- treat Saturday as premium?
  ('ot_saturday_multiplier','1.5'),   -- Saturday (when enabled)
  ('holiday_multiplier',   '2'),      -- public holiday without an explicit per-day value
  ('holiday_ot_enabled',   'true')    -- count the whole holiday as OT
on conflict (key) do nothing;
