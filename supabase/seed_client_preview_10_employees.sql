-- BVN Package — Client-preview data only
-- Ten clearly-labelled sample employees with four calendar months of attendance.
-- Safe to re-run. It removes only BVN-9001..BVN-9010 and DEMO-* documents.
-- Run this in the connected Supabase project for a presentation, then remove
-- the sample data by running only the DELETE block directly below.

-- Reset the prior client-preview set without touching real employees or records.
delete from attendance_log where employee_id between 'BVN-9001' and 'BVN-9010';
delete from time_requests where employee_id between 'BVN-9001' and 'BVN-9010';
delete from payroll_draft_adjustments where employee_id between 'BVN-9001' and 'BVN-9010';
delete from payroll_lines where payroll_id like 'DEMO-PAY-%';
delete from payroll_periods where payroll_id like 'DEMO-PAY-%';
delete from payroll_rules where employee_id between 'BVN-9001' and 'BVN-9010';
delete from employees where employee_id between 'BVN-9001' and 'BVN-9010';
delete from invoices where invoice_no like 'DEMO-INV-%';

insert into employees
  (employee_id, name, role, department, legacy_work_site_id, status, location_required, password, national_id, phone, work_site_id)
values
  ('BVN-9001','ตัวอย่าง อรุณี','พนักงานขาย','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9002','ตัวอย่าง ธนกฤต','พนักงานคลัง','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9003','ตัวอย่าง ปาริชาติ','แคชเชียร์','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9004','ตัวอย่าง วรพล','พนักงานจัดส่ง','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9005','ตัวอย่าง ศิริพร','ธุรการ','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9006','ตัวอย่าง กิตติพงศ์','หัวหน้ากะ','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9007','ตัวอย่าง นภัสสร','บัญชี','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9008','ตัวอย่าง พีรพัฒน์','ช่างเทคนิค','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9009','ตัวอย่าง รุ่งทิวา','ฝ่ายบริการ','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','',''),
  ('BVN-9010','ตัวอย่าง ภาณุวัฒน์','พนักงานขาย','ตัวอย่างสำหรับนำเสนอ','BVN-HQ','active',true,'','','','');

insert into payroll_rules
  (employee_id, pay_basis, base_rate, standard_hours, ot_enabled, ot_multiplier, days_per_month, other_deduction, updated_at, updated_by)
values
  ('BVN-9001','daily',620,8,true,1.5,26,0,now(),'CLIENT PREVIEW'),
  ('BVN-9002','daily',580,8,true,1.5,26,0,now(),'CLIENT PREVIEW'),
  ('BVN-9003','daily',560,8,true,1.5,26,0,now(),'CLIENT PREVIEW'),
  ('BVN-9004','daily',650,8,true,1.5,26,0,now(),'CLIENT PREVIEW'),
  ('BVN-9005','monthly',21000,8,true,1.5,30,0,now(),'CLIENT PREVIEW'),
  ('BVN-9006','monthly',28000,8,true,1.5,30,0,now(),'CLIENT PREVIEW'),
  ('BVN-9007','monthly',26000,8,true,1.5,30,0,now(),'CLIENT PREVIEW'),
  ('BVN-9008','daily',720,8,true,1.5,26,0,now(),'CLIENT PREVIEW'),
  ('BVN-9009','daily',590,8,true,1.5,26,0,now(),'CLIENT PREVIEW'),
  ('BVN-9010','daily',630,8,true,1.5,26,0,now(),'CLIENT PREVIEW');

-- Four calendar months: every weekday has a realistic in/out pair. A few days
-- are intentionally late, absent or still open so the review queue is visible.
with workdays as (
  select e.employee_id,
         right(e.employee_id, 1)::int as seq,
         d::date as work_date,
         ((extract(day from d)::int + right(e.employee_id, 1)::int * 3) % 23 = 0) as absent,
         ((extract(day from d)::int + right(e.employee_id, 1)::int * 5) % 17 = 0) as late,
         ((extract(day from d)::int + right(e.employee_id, 1)::int * 7) % 19 = 0) as short_day
  from employees e
  cross join generate_series(date_trunc('month', current_date) - interval '3 months', current_date, interval '1 day') d
  where e.employee_id between 'BVN-9001' and 'BVN-9010'
    and extract(isodow from d) between 1 and 5
), worked as (
  select * from workdays where not absent
)
insert into attendance_log (employee_id, site_id, event_type, event_time, validity, review_status, source, note)
select employee_id, 'BVN-HQ', 'check_in',
       (work_date::timestamp + interval '8 hours' + make_interval(mins => case when late then 68 + (seq * 2) else 8 + (seq * 3) end)) at time zone 'Asia/Bangkok',
       'accepted','accepted','client_preview','ข้อมูลตัวอย่างสำหรับนำเสนอ'
from worked
union all
select employee_id, 'BVN-HQ', 'check_out',
       (work_date::timestamp + case when short_day then interval '15 hours 40 minutes' else interval '17 hours 38 minutes' + make_interval(mins => seq) end) at time zone 'Asia/Bangkok',
       'accepted','accepted','client_preview','ข้อมูลตัวอย่างสำหรับนำเสนอ'
from worked
where not (work_date = current_date and seq in (3,7));

-- Approved OT shows the payroll rule that only approved OT is paid.
insert into time_requests (request_id, employee_id, request_type, work_date, requested_minutes, reason, status, submitted_at, reviewed_by, reviewed_at, reviewer_note)
with workdays as (
  select e.employee_id,
         right(e.employee_id, 1)::int as seq,
         d::date as work_date,
         ((extract(day from d)::int + right(e.employee_id, 1)::int * 3) % 23 = 0) as absent
  from employees e
  cross join generate_series(date_trunc('month', current_date) - interval '3 months', current_date, interval '1 day') d
  where e.employee_id between 'BVN-9001' and 'BVN-9010'
    and extract(isodow from d) between 1 and 5
), numbered as (
  select employee_id, seq, work_date, row_number() over (partition by employee_id order by work_date) as rn
  from workdays where not absent and work_date < current_date
)
select 'DEMO-OT-' || employee_id || '-' || to_char(work_date,'YYYYMMDD'), employee_id, 'overtime', work_date,
       60 + (seq * 15), 'ข้อมูลตัวอย่าง: ทำงานเกินเวลาตามตาราง', 'approved',
       (work_date::timestamp + interval '18 hours') at time zone 'Asia/Bangkok', 'CLIENT PREVIEW',
       (work_date::timestamp + interval '18 hours 10 minutes') at time zone 'Asia/Bangkok', 'อนุมัติเพื่อแสดงตัวอย่าง Payroll'
from numbered
where rn in (8, 24, 41, 57);

-- Three historical locked snapshots so the customer can open old payrolls and payslips.
insert into payroll_periods (payroll_id, start_date, end_date, status, locked_at, locked_by, payment_status, paid_at, payment_reference, issuer_snapshot)
select 'DEMO-PAY-' || to_char(m,'YYYYMM'), m::date, (m + interval '1 month - 1 day')::date,
       'locked', (m + interval '1 month') at time zone 'Asia/Bangkok', 'CLIENT PREVIEW', 'paid',
       (m + interval '1 month' + interval '2 days') at time zone 'Asia/Bangkok', 'DEMO-TRANSFER-' || to_char(m,'YYYYMM'),
       jsonb_build_object('invoice_company_name','บริษัท พนมพร พาณิชย์ จำกัด')
from generate_series(date_trunc('month', current_date) - interval '3 months', date_trunc('month', current_date) - interval '1 month', interval '1 month') m;

insert into payroll_lines (payroll_id, employee_id, regular_minutes, ot_minutes, base_gross, ot_gross, gross_pay, advance_deduction, sso, other_deduction, net_pay)
select p.payroll_id, r.employee_id, 22 * 480, 240,
       case when r.pay_basis = 'monthly' then r.base_rate else r.base_rate * 22 end,
       round((case when r.pay_basis = 'monthly' then r.base_rate / r.days_per_month / r.standard_hours else r.base_rate / r.standard_hours end) * 1.5 * 4),
       round((case when r.pay_basis = 'monthly' then r.base_rate else r.base_rate * 22 end) +
             ((case when r.pay_basis = 'monthly' then r.base_rate / r.days_per_month / r.standard_hours else r.base_rate / r.standard_hours end) * 1.5 * 4)),
       0, 0, 0,
       round((case when r.pay_basis = 'monthly' then r.base_rate else r.base_rate * 22 end) +
             ((case when r.pay_basis = 'monthly' then r.base_rate / r.days_per_month / r.standard_hours else r.base_rate / r.standard_hours end) * 1.5 * 4))
from payroll_periods p
cross join payroll_rules r
where p.payroll_id like 'DEMO-PAY-%'
  and r.employee_id between 'BVN-9001' and 'BVN-9010';

-- Billing lifecycle samples: draft, issued, overdue and paid.
insert into invoices (invoice_no, customer, description, subtotal, vat, total, due_date, status, created_at, updated_at, payment_reference, paid_at)
values
  ('DEMO-INV-PAID-001','บริษัท ตัวอย่างคู่ค้า จำกัด','ค่าบริการรายเดือน สิงหาคม',25000,1750,26750,current_date - 75,'paid',now() - interval '90 days',now() - interval '70 days','DEMO-REF-001',now() - interval '70 days'),
  ('DEMO-INV-OVERDUE-001','บริษัท ตัวอย่างเอ จำกัด','ค่าบริการรายเดือน ตุลาคม',32000,2240,34240,current_date - 12,'issued',now() - interval '40 days',now() - interval '40 days','',null),
  ('DEMO-INV-ISSUED-001','บริษัท ตัวอย่างบี จำกัด','ค่าบริการรายเดือน พฤศจิกายน',18500,1295,19795,current_date + 14,'issued',now() - interval '5 days',now() - interval '5 days','',null),
  ('DEMO-INV-DRAFT-001','บริษัท ตัวอย่างซี จำกัด','ค่าบริการเพิ่มเติมประจำเดือน',12000,840,12840,current_date + 30,'draft',now(),now(),' ',null);

-- Expected result: 10 preview employees, four months of Timesheet, three
-- paid payroll snapshots and four invoice states. To remove the preview only,
-- run the DELETE block at the top of this file.
