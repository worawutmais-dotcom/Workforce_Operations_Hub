-- ============================================================================
--  BVN Package — DEMO seed data (2 employees, ~2 years of attendance)
--  Run in the Supabase SQL Editor AFTER setup.sql. Safe to re-run: it clears
--  the two demo employees' rows first, then regenerates them.
--  Pattern: Mon–Fri workdays, ~8% absent, ~15% late, with today still "working".
--  Passwords are plaintext '1234' (the function accepts plaintext for login;
--  reset to a hashed one from the console later).
-- ============================================================================

-- clean previous demo rows for these two ids (idempotent)
delete from attendance_log where employee_id in ('EMP-101','EMP-102');
delete from payroll_rules  where employee_id in ('EMP-101','EMP-102');
delete from employees      where employee_id in ('EMP-101','EMP-102');

-- employees
insert into employees (employee_id, name, role, department, legacy_work_site_id, status, location_required, password) values
  ('EMP-101','สมศักดิ์ ตั้งใจ','พนักงานขาย','หน้าร้าน','BVN-HQ','active',true,'1234'),
  ('EMP-102','วิภา ขยันงาน','พนักงานคลัง','คลังสินค้า','BVN-HQ','active',true,'1234');

-- pay rules (daily wage so payroll computes)
insert into payroll_rules (employee_id, pay_basis, base_rate, standard_hours, ot_enabled, ot_multiplier, days_per_month) values
  ('EMP-101','daily',520,8,true,1.5,26),
  ('EMP-102','daily',480,8,true,1.5,26);

-- ~2 years of attendance: one check-in + check-out per worked day
with d as (
  select e.employee_id,
         g::date                       as day,
         (random() < 0.15)             as late,
         (random() < 0.08)             as absent
  from (values ('EMP-101'),('EMP-102')) e(employee_id),
       generate_series(current_date - 730, current_date - 1, interval '1 day') g
  where extract(dow from g) between 1 and 5      -- Mon..Fri only
),
worked as (select * from d where not absent)
insert into attendance_log (employee_id, site_id, event_type, event_time, validity, review_status, source)
select employee_id, 'BVN-HQ', 'check_in',
       (day::timestamp
         + case when late then interval '9 hour'  + (floor(random()*50))  * interval '1 minute'   -- 09:00–09:50 (late)
                else           interval '8 hour'  + (floor(random()*55))  * interval '1 minute'   -- 08:00–08:55
           end) at time zone 'Asia/Bangkok',
       'accepted','accepted','seed'
from worked
union all
select employee_id, 'BVN-HQ', 'check_out',
       (day::timestamp + interval '17 hour' + (floor(random()*90)) * interval '1 minute')          -- 17:00–18:30
         at time zone 'Asia/Bangkok',
       'accepted','accepted','seed'
from worked;

-- today: both are in (one on time, one late) and still working (no check-out yet)
insert into attendance_log (employee_id, site_id, event_type, event_time, validity, review_status, source) values
  ('EMP-101','BVN-HQ','check_in', (current_date::timestamp + interval '8 hour'  + interval '20 minute') at time zone 'Asia/Bangkok','accepted','accepted','seed'),
  ('EMP-102','BVN-HQ','check_in', (current_date::timestamp + interval '9 hour'  + interval '35 minute') at time zone 'Asia/Bangkok','accepted','accepted','seed');

-- quick check
select employee_id, count(*) filter (where event_type='check_in') as check_ins
from attendance_log where employee_id in ('EMP-101','EMP-102') group by employee_id;
