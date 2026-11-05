-- =====================================================================
-- 0002 — RPC. Every business write/aggregate, one function each. Replaces the
-- apps_script/Code.gs actions. All SECURITY DEFINER with search_path pinned.
-- Mobile functions act for auth.uid(); admin functions gate on is_admin().
-- The two employee-account operations that need the Auth Admin API live in the
-- Edge Function supabase/functions/admin-employee, not here.
-- =====================================================================

-- ---------- helpers ----------
create or replace function public.haversine_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns numeric language sql immutable as $$
  select (2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::numeric;
$$;

create or replace function public.ict_date(ts timestamptz)
returns date language sql immutable as $$ select (ts at time zone 'Asia/Bangkok')::date; $$;

-- =====================================================================
-- MOBILE (caller = the authenticated employee)
-- =====================================================================
create or replace function public.record_attendance(
  p_event text, p_lat double precision, p_lng double precision,
  p_accuracy numeric, p_device_tz text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  emp public.employee_profiles;
  site public.work_sites;
  v_distance numeric := null;
  v_accepted boolean;
  v_today date := ict_date(now());
  v_has_in boolean;
  v_has_out boolean;
begin
  if p_event not in ('check_in','check_out') then raise exception 'Invalid attendance event'; end if;
  select * into emp from employee_profiles where id = auth.uid() and active;
  if not found then raise exception 'Employee is not active'; end if;

  select * into site from work_sites where id = emp.work_site_id and active;

  if emp.location_required then
    if site.id is null then raise exception 'Work site is not assigned to this employee'; end if;
    if p_lat is null or p_lng is null or p_accuracy is null or p_accuracy < 0 then
      raise exception 'Valid GPS location is required';
    end if;
    v_distance := haversine_m(p_lat, p_lng, site.latitude, site.longitude);
    v_accepted := p_accuracy <= 100 and v_distance <= site.radius_m;
  else
    v_accepted := true;
  end if;

  -- One accepted check-in and one accepted check-out per Bangkok business day.
  select exists(select 1 from attendance_logs where employee_id = emp.id and decision = 'accepted'
                 and event_type = 'check_in'  and ict_date(occurred_at) = v_today),
         exists(select 1 from attendance_logs where employee_id = emp.id and decision = 'accepted'
                 and event_type = 'check_out' and ict_date(occurred_at) = v_today)
    into v_has_in, v_has_out;
  if p_event = 'check_in'  and v_has_in  then raise exception 'วันนี้คุณบันทึกเข้างานแล้ว'; end if;
  if p_event = 'check_out' and not v_has_in then raise exception 'ต้องบันทึกเข้างานก่อน'; end if;
  if p_event = 'check_out' and v_has_out then raise exception 'วันนี้คุณบันทึกออกงานแล้ว'; end if;

  insert into attendance_logs(employee_id, work_site_id, event_type, latitude, longitude,
                              accuracy_m, distance_m, decision, device_timezone)
  values (emp.id, site.id, p_event, p_lat, p_lng, p_accuracy,
          round(v_distance, 2), case when v_accepted then 'accepted' else 'rejected' end, p_device_tz);

  return jsonb_build_object('decision', case when v_accepted then 'accepted' else 'rejected' end,
                            'locationRequired', emp.location_required,
                            'distanceMetres', round(v_distance),
                            'allowedRadiusMetres', site.radius_m);
end; $$;

create or replace function public.submit_leave_request(
  p_leave_type text, p_start date, p_end date, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_leave_type),'') = '' or coalesce(trim(p_reason),'') = ''
     or p_start is null or p_end is null or p_end < p_start then
    raise exception 'Invalid leave request';
  end if;
  insert into leave_requests(employee_id, leave_type, start_date, end_date, reason)
  values (auth.uid(), p_leave_type, p_start, p_end, p_reason) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.submit_time_request(
  p_type text, p_work_date date, p_minutes integer, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_type not in ('overtime','attendance_correction') or p_work_date is null
     or coalesce(trim(p_reason),'') = '' or p_minutes is null or p_minutes <= 0 or p_minutes > 1440 then
    raise exception 'Invalid time request';
  end if;
  insert into time_requests(employee_id, request_type, work_date, requested_minutes, reason)
  values (auth.uid(), p_type, p_work_date, p_minutes, p_reason) returning id into v_id;
  return v_id;
end; $$;

-- =====================================================================
-- ADMIN  (gate every one on is_admin)
-- =====================================================================
create or replace function public._require_admin() returns void
language plpgsql stable as $$ begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
end; $$;

create or replace function public.admin_review_leave(p_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update leave_requests set status = p_decision, reviewed_by = current_actor(), reviewed_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'Pending leave request was not found'; end if;
end; $$;

create or replace function public.admin_review_time_request(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update time_requests set status = p_decision, reviewed_by = current_actor(),
         reviewed_at = now(), reviewer_note = p_note
   where id = p_id and status = 'pending';
  if not found then raise exception 'Pending time request was not found'; end if;
end; $$;

create or replace function public.admin_upsert_pay_rule(
  p_employee_id uuid, p_pay_basis text, p_base_rate numeric, p_standard_hours numeric,
  p_ot_enabled boolean, p_ot_multiplier numeric, p_premium_date date, p_premium_multiplier numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  if p_pay_basis not in ('hourly','daily') or p_base_rate < 0 or p_standard_hours <= 0
     or p_ot_multiplier < 1 or p_premium_multiplier < 1 then raise exception 'Invalid pay rule'; end if;
  insert into payroll_rules(employee_id, pay_basis, base_rate, standard_hours, ot_enabled,
                            ot_multiplier, premium_date, premium_multiplier, updated_at, updated_by)
  values (p_employee_id, p_pay_basis, p_base_rate, p_standard_hours, coalesce(p_ot_enabled,false),
          p_ot_multiplier, p_premium_date, p_premium_multiplier, now(), current_actor())
  on conflict (employee_id) do update set
    pay_basis = excluded.pay_basis, base_rate = excluded.base_rate,
    standard_hours = excluded.standard_hours, ot_enabled = excluded.ot_enabled,
    ot_multiplier = excluded.ot_multiplier, premium_date = excluded.premium_date,
    premium_multiplier = excluded.premium_multiplier, updated_at = now(), updated_by = current_actor();
end; $$;

-- Gross-pay preview. Pure read. Pairs min(check_in)/max(check_out) per ICT day,
-- regular = min(worked, standard), base by rule; OT from approved overtime requests.
create or replace function public.preview_payroll(p_start date, p_end date)
returns table(employee_id uuid, work_days int, regular_minutes int, ot_minutes int,
              base_gross numeric, ot_gross numeric, gross_pay numeric)
language sql stable security definer set search_path = public as $$
  with guard as (select case when public.is_admin() then true
                        else (select 1/0)::boolean end),  -- raises if not admin
  days as (
    select a.employee_id, ict_date(a.occurred_at) as d,
           min(a.occurred_at) filter (where a.event_type='check_in')  as t_in,
           max(a.occurred_at) filter (where a.event_type='check_out') as t_out
    from attendance_logs a
    where a.decision = 'accepted' and ict_date(a.occurred_at) between p_start and p_end
    group by a.employee_id, ict_date(a.occurred_at)
  ),
  worked as (
    select d.employee_id, d.d,
           greatest(0, round(extract(epoch from (d.t_out - d.t_in))/60))::int as minutes
    from days d
    where d.t_in is not null and d.t_out is not null and d.t_out > d.t_in
  ),
  reg as (
    select w.employee_id,
           count(*)::int as work_days,
           sum(least(w.minutes, (r.standard_hours*60)::int))::int as regular_minutes,
           sum(case when r.pay_basis='daily' then r.base_rate
                    else least(w.minutes, (r.standard_hours*60)::int)/60.0 * r.base_rate end)::numeric as base_gross
    from worked w join payroll_rules r on r.employee_id = w.employee_id
    group by w.employee_id
  ),
  ot as (
    select t.employee_id,
           sum(t.requested_minutes)::int as ot_minutes,
           sum(t.requested_minutes/60.0
               * case when r.pay_basis='daily' then r.base_rate/nullif(r.standard_hours,0) else r.base_rate end
               * case when r.ot_enabled then r.ot_multiplier else 0 end)::numeric as ot_gross
    from time_requests t join payroll_rules r on r.employee_id = t.employee_id
    where t.request_type='overtime' and t.status='approved' and t.work_date between p_start and p_end
    group by t.employee_id
  )
  select coalesce(reg.employee_id, ot.employee_id) as employee_id,
         coalesce(reg.work_days,0), coalesce(reg.regular_minutes,0), coalesce(ot.ot_minutes,0),
         round(coalesce(reg.base_gross,0),2), round(coalesce(ot.ot_gross,0),2),
         round(coalesce(reg.base_gross,0) + coalesce(ot.ot_gross,0),2)
  from reg full outer join ot on ot.employee_id = reg.employee_id, guard;
$$;

create or replace function public.lock_payroll(p_start date, p_end date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text; v_total numeric;
begin
  perform _require_admin();
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Invalid payroll period'; end if;
  v_id := 'PAY-' || to_char(p_start,'YYYYMMDD') || '-' || to_char(p_end,'YYYYMMDD');
  if exists(select 1 from payroll_periods where id = v_id) then raise exception 'Payroll period is already locked'; end if;

  -- Snapshot the preview once (preview_payroll itself enforces is_admin()).
  create temporary table _lock_lines on commit drop as select * from preview_payroll(p_start, p_end);
  select coalesce(sum(gross_pay),0) into v_total from _lock_lines;

  -- Insert the period WITH its total up front: the immutability trigger blocks any later UPDATE.
  insert into payroll_periods(id, start_date, end_date, status, total_gross, locked_by)
    values (v_id, p_start, p_end, 'locked', v_total, current_actor());
  insert into payroll_lines(payroll_id, employee_id, regular_minutes, ot_minutes, base_gross, ot_gross, gross_pay)
    select v_id, employee_id, regular_minutes, ot_minutes, base_gross, ot_gross, gross_pay from _lock_lines;
  return jsonb_build_object('payrollId', v_id, 'totalGross', v_total);
end; $$;

create or replace function public.admin_create_invoice(
  p_customer text, p_description text, p_subtotal numeric, p_due date)
returns text language plpgsql security definer set search_path = public as $$
declare v_no text; v_serial int; v_month text := to_char(now() at time zone 'Asia/Bangkok','YYYYMM');
        v_vat numeric; v_total numeric;
begin
  perform _require_admin();
  if coalesce(trim(p_customer),'')='' or coalesce(trim(p_description),'')='' or p_subtotal is null or p_subtotal < 0 or p_due is null then
    raise exception 'Invalid invoice';
  end if;
  select count(*)+1 into v_serial from invoices where invoice_no like 'INV-'||v_month||'-%';
  v_no := 'INV-'||v_month||'-'||lpad(v_serial::text,3,'0');
  v_vat := round(p_subtotal * 0.07, 2); v_total := round(p_subtotal + v_vat, 2);
  insert into invoices(invoice_no, customer, description, subtotal, vat, total, due_date, status)
  values (v_no, p_customer, p_description, round(p_subtotal,2), v_vat, v_total, p_due, 'draft');
  return v_no;
end; $$;

create or replace function public.admin_update_invoice_status(
  p_invoice_no text, p_status text, p_payment_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_current text;
begin
  perform _require_admin();
  select status into v_current from invoices where invoice_no = p_invoice_no;
  if not found then raise exception 'Invoice not found'; end if;
  if not ( (v_current='draft'  and p_status in ('issued','void'))
        or (v_current='issued' and p_status in ('paid','void')) ) then
    raise exception 'Invoice status transition is not allowed';
  end if;
  if p_status='paid' and coalesce(trim(p_payment_reference),'')='' then
    raise exception 'Payment reference is required when marking paid';
  end if;
  update invoices set status = p_status, updated_at = now(),
         payment_reference = case when p_status='paid' then p_payment_reference else payment_reference end,
         paid_at = case when p_status='paid' then now() else paid_at end
   where invoice_no = p_invoice_no;
end; $$;

create or replace function public.admin_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := ict_date(now()); r jsonb;
begin
  perform _require_admin();
  select jsonb_build_object(
    'asOf', now(),
    'totalEmployees', (select count(*) from employee_profiles where active),
    'present', (select count(distinct a.employee_id) from attendance_logs a join employee_profiles e on e.id=a.employee_id
                 where e.active and a.decision='accepted' and a.event_type='check_in' and ict_date(a.occurred_at)=v_today),
    'exceptions', (select count(*) from attendance_logs where decision='rejected'),
    'pendingApprovals', (select count(*) from leave_requests where status='pending')
                      + (select count(*) from time_requests where status='pending'),
    'overdueInvoices', (select coalesce(sum(total),0) from invoices where status='issued' and due_date < v_today),
    'latestPayrollId', (select id from payroll_periods order by locked_at desc limit 1),
    'latestPayrollStatus', (select status from payroll_periods order by locked_at desc limit 1)
  ) into r;
  return r;
end; $$;

-- Execute grants: authenticated may call; each function enforces its own scope.
grant execute on all functions in schema public to authenticated;
