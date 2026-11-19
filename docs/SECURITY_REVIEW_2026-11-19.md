# Supabase Security & RLS Review — 19 พ.ย. 2569
Project: `vqualksnbctfukcbxqdd` · วิธี: Supabase database advisors (read-only, ไม่แก้ DB)
ตอบประเด็น HIGH ของ `docs/ENTERPRISE_REVIEW_2026-11-18.md` เรื่อง "RLS review".

## สรุป: ✅ posture ปลอดภัย (ตามสถาปัตยกรรม backend-mediated)

### Row Level Security
- **ทั้ง 22 ตารางใน schema `public` เปิด RLS ครบ** (admin_sessions, admin_users, advances, attendance_log, audit_log, employees, invoices, leave_requests, login_attempts, mobile_access, password_requests, payroll_draft_adjustments, payroll_lines, payroll_periods, payroll_rules, settings, time_requests, work_sites, holidays, employee_identity_requests, attendance_archive_challenges, data_reset_challenges).
- **ไม่มีตารางไหน RLS ปิด** — ซึ่งเป็นเคสอันตรายจริง (`rls_disabled_in_public`) ที่ advisor **ไม่พบเลย**.
- advisor แจ้ง `rls_enabled_no_policy` (ระดับ **INFO**) 22 รายการ: RLS เปิดแต่ไม่มี policy = **deny‑all** ต่อ role `anon`/`authenticated` (publishable key). แปลว่า client (console/APK) **อ่านหรือเขียนตารางตรง ๆ ไม่ได้เลย**.
- เส้นทางเข้าถึงข้อมูลมีทางเดียว: **Edge Function `swift-handler` ที่ใช้ `service_role` key** (bypass RLS โดยออกแบบ) ซึ่ง validate สิทธิ์เอง (token + role FIN/OPS/owner).

> สรุป: การที่ "RLS เปิด + ไม่มี policy" ในระบบที่ทุกคำขอผ่าน Edge Function คือ **การตั้งค่าที่ถูกต้องและปลอดภัย** ไม่ใช่ช่องโหว่. publishable key ที่ฝังใน client เป็น public‑safe เพราะ RLS ปฏิเสธการเข้าถึงตารางทั้งหมดอยู่แล้ว.

### Performance
- `unused_index` (INFO) 5 รายการ: `*_employee_id_idx` บน employee_identity_requests / mobile_access / password_requests / payroll_lines / time_requests. เป็นตาราง traffic ต่ำ — "ไม่เคยถูกใช้" มักแปลว่า query ยังน้อย ไม่ใช่ index เสีย. **แนะนำ: ไม่ต้องลบ** (เสี่ยงกว่าประโยชน์เมื่อ scale).

## ข้อควรระวัง / คำแนะนำ
1. **อย่าปิด RLS** บนตารางใด ๆ และ **อย่าเพิ่ม policy แบบเปิดกว้าง** ให้ `anon`/`authenticated` — จะทำให้ client เข้าถึงข้อมูลตรงได้ทันที. ถ้าจะให้ client อ่านตรง (เช่นทำ realtime) ค่อยเพิ่ม policy เฉพาะเจาะจงทีละตาราง.
2. **`service_role` key เป็นความลับสูงสุด** — ต้องอยู่ใน Edge Function secret เท่านั้น ห้ามหลุดไปฝั่ง client/คอมมิต. (publishable key เท่านั้นที่ฝังใน client ได้)
3. Edge Function เป็นด่านความปลอดภัยเดียว → การ validate สิทธิ์/บทบาทใน handler ต้องครบทุก action (ปัจจุบันใช้ `verify(token, ROLES)` — ควรคงไว้ทุก handler ใหม่).
4. รัน advisor นี้ซ้ำหลังทุกครั้งที่มี DDL/migration ใหม่ (เพื่อจับตารางที่เผลอสร้างโดยไม่เปิด RLS).

## ที่ยังอยู่นอกขอบเขตรีวิวนี้ (ต้องทำแยก)
- **Penetration test / auth‑flow test** ของ Edge Function handler แต่ละตัว (เช่น ยิง action โดยไม่มี token, token ผิด role) — ควรทำเป็น integration test บน test tenant.
- **Audit ที่การันตีเขียน** (ปัจจุบัน audit เป็น best‑effort try/catch) — HIGH item แยกต่างหาก.
