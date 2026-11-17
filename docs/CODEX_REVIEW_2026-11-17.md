# วิจารณ์หลังบ้าน (Codex) + สิ่งที่แก้แล้ว — 2026-11-17

ผู้ตรวจ: Claude · หลักฐาน: Supabase advisor + `pg_proc` grants บน DB จริง (`vqualksnbctfukcbxqdd`)

---

## 🔴 CRITICAL — แก้แล้ว ✅ (ยืนยันหายจาก advisor)

**ปัญหา:** ฟังก์ชัน `app_factory_reset_operational()` (ล้างข้อมูลทั้งระบบ) เป็น `SECURITY DEFINER`
และมี grant `anon=X | authenticated=X` → **ใครก็ตามที่มี publishable key (ซึ่งเป็น public
ฝังอยู่ในคอนโซล + APK) ยิง `POST /rest/v1/rpc/app_factory_reset_operational` ได้ตรงๆ
→ ล้างฐานข้อมูลทั้งบริษัท โดยไม่ต้องรหัสผ่าน ไม่ผ่าน Edge Function** (bypass การยืนยัน 2 ชั้นหมด)

**ต้นเหตุ:** `revoke all ... from public` ใน `patch_factory_reset.sql` ไม่ครอบ role `anon`/`authenticated`
(Supabase grant สองตัวนี้แยกต่างหากบน public function)

**แก้แล้ว (migration `security_hardening_revoke_rpc_and_indexes`):**
```sql
revoke execute on function public.app_factory_reset_operational() from anon, authenticated, public;
revoke execute on function public.lock_payroll_commit(...) from anon, authenticated, public;
```
ตอนนี้ ACL เหลือ `postgres | service_role` เท่านั้น → Edge Function (service_role) ยังใช้ได้ปกติ
advisor ยืนยัน WARN 3 ตัวหายหมด

> **บทเรียนสำหรับ Codex:** ทุกครั้งที่เพิ่ม SECURITY DEFINER RPC ที่ไม่ควรให้ client เรียกตรง
> ต้อง `revoke execute ... from anon, authenticated` เสมอ (ไม่ใช่แค่ `from public`) และรัน
> `get_advisors(security)` หลังเพิ่มทุกครั้ง

---

## 🟡 Hardening — แก้แล้ว ✅
- `lock_payroll_commit` **mutable search_path** (lint 0011) → `alter function ... set search_path = public`
- **7 foreign key ไม่มี covering index** (lint 0001) บน `employee_id`
  (advances, employee_identity_requests, leave_requests, mobile_access, password_requests,
  payroll_lines, time_requests) → เพิ่ม index แล้ว
- `payroll_periods_range_idx` **ไม่เคยถูกใช้** (lint 0005) → drop แล้ว

ทั้งหมดอยู่ใน `supabase/patch_security_hardening.sql` (idempotent, apply กับ env ใหม่ได้)

---

## 🟢 สิ่งที่ "ไม่ใช่ปัญหา" (ยืนยันแล้ว อย่าไปแก้)
- **22 ตาราง RLS เปิดแต่ไม่มี policy** (lint 0008, INFO) = **สถานะปลอดภัยที่ตั้งใจ** —
  สถาปัตย์ใช้ service_role ผ่าน Edge Function เท่านั้น, client ถือแค่ publishable key
  (anon) ซึ่ง RLS-no-policy ปิดตายไม่ให้ query ตารางตรง **อย่าเพิ่ม policy ให้ anon** เด็ดขาด
  (จะเปิดช่องให้ client อ่าน/เขียน DB ตรง)

---

## 🟠 ข้อเสนอที่ยัง "ไม่ได้แก้" (ควรทำต่อ)

1. **Deploy process เปราะ** — source folder `bvn-api/` ≠ slug `swift-handler`,
   dashboard editor รับไฟล์ใหญ่ไม่ไหว ต้อง copy mirror ทุกครั้ง
   → ใช้ Supabase MCP `deploy_edge_function` (slug `swift-handler`) deploy ตรงจาก `bvn-api/index.ts`
   ได้เลย ไม่ต้องมีโฟลเดอร์ mirror (`swift-handler/` เก็บไว้เป็น fallback CLI ได้)
2. **ไฟล์ monolith** — `admin_codex/index.html` ~4,000 บรรทัด + `bvn-api/index.ts` ยาวมาก
   → ค่อยๆ แยกเป็น CSS/JS modules (frontend) และแยก handler เป็นไฟล์ (backend) เพื่อลด
   โอกาส merge conflict ระหว่าง Claude↔Codex และให้ editor/review ไหว
3. **Minimal-data mode ปิด audit log** — ประหยัดพื้นที่แต่เสียร่องรอยการเงิน/สิทธิ์
   → พิจารณาเก็บ audit เฉพาะ event การเงิน/ลบข้อมูล (ไม่เก็บ clickstream) แทนการปิดทั้งหมด
4. **ทุก SECURITY DEFINER RPC อื่น** — ตรวจ grant ซ้ำด้วย `get_advisors` ทุกครั้งที่ deploy DDL

---

## วิธีตรวจซ้ำ (ให้ใครก็ได้ทำ)
```
Supabase MCP → get_advisors(project, 'security')   # ต้องไม่มี WARN เรื่อง RPC/anon
Supabase MCP → get_advisors(project, 'performance')
```
หรือ SQL: `select proname, proacl::text[] from pg_proc where proname='app_factory_reset_operational';`
ต้องเห็นแค่ `postgres | service_role`
