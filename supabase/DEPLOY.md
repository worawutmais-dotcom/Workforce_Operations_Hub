# Deploy — Edge Function `swift-handler`

อัปเดต: 2026-11-16

ฟังก์ชันจริงที่แอป/คอนโซลเรียกใช้ชื่อ slug = **`swift-handler`** (project ref `vqualksnbctfukcbxqdd`).
source อยู่ที่ `functions/bvn-api/index.ts`; โฟลเดอร์ `functions/swift-handler/` เป็น **copy สำหรับ deploy เท่านั้น**
(CLI deploy จากโฟลเดอร์ที่ชื่อ = slug).

## 1) ติดตั้ง + login (ครั้งเดียว)
```bash
npm i -g supabase
```
```bash
supabase login
```
> `supabase login` จะเปิดเบราว์เซอร์ให้ยืนยันด้วยบัญชีเจ้าของ — token ถูกเก็บในเครื่องคุณเอง ไม่ต้องส่งให้ใคร

## 2) security migration ก่อน deploy (สำหรับ release session hardening)

> การรัน migration `20261125161957_mobile_session_security.sql` จะ revoke mobile session เดิมทั้งหมด
> โดยตั้งใจ ผู้ใช้ต้องล็อกอินใหม่หนึ่งครั้งหลัง release เพื่อแทนที่ token ดิบ
> ด้วย token hash ที่มีอายุ 30 วัน

รัน migration `20261125161957_mobile_session_security.sql` บน UAT ก่อน แล้วทดสอบ
login ใหม่ → เปิดแอปใหม่ → check-in/out ก่อนจึงรันบน production

## 3) sync copy ให้ตรงกับ source แล้ว deploy
```bash
cp supabase/functions/bvn-api/index.ts supabase/functions/swift-handler/index.ts
cp supabase/functions/bvn-api/mobile_session_security.ts supabase/functions/swift-handler/mobile_session_security.ts
```
```bash
supabase functions deploy swift-handler --project-ref vqualksnbctfukcbxqdd
```
(มี `supabase/config.toml` ตั้ง `project_id` ไว้แล้ว จะไม่ใส่ `--project-ref` ก็ได้)

## 4) ตรวจว่า deploy สำเร็จ
เปิดคอนโซล → ควรเรียก action ใหม่ได้ (ไม่ขึ้น "Unsupported action") เช่น:
- `admin_list_identity_requests`, `admin_delete_employee`, `admin_get_ot_policy`, `admin_upload_invoice_logo`
- public `version` ควรตอบ `ok=true` พร้อม `sourceRevision`/capabilities ใหม่

## ก่อน/หลัง deploy — รัน SQL patch (บน UAT ก่อนเสมอ)
รันใน Supabase SQL Editor ตามลำดับ (idempotent):
1. `patch_employee_identity.sql` — เลขบัตร ปชช./เบอร์ + ตารางคำขอยืนยันตัวตน
2. `patch_attendance_corrections.sql` — `attendance_log.note` + การแก้เวลา
3. `patch_ot_calendar.sql` — (ถ้ายังไม่ได้รัน) ตัวคูณ OT + คีย์กติกา
4. ⚠️ `patch_minimal_data_mode.sql` — ปิด audit + prune (ลบข้อมูลบางส่วน อ่านก่อนรัน)
5. ⚠️ `patch_factory_reset.sql` — ติดตั้ง procedure ล้างข้อมูล (destructive — ติดตั้งได้ แต่จะทำงานเมื่อเรียกเท่านั้น)
6. `patch_work_site_compat.sql` — hotfix ชั่วคราว (ลบ column ชดเชยได้หลังยืนยันไม่มีฟังก์ชันเก่าค้าง)
7. `migrations/20261125161957_mobile_session_security.sql` — token hash + session expiry (revoke mobile session เดิมทั้งหมด)

## หลัง deploy
- อัปเวอร์ชันแอปในคอนโซล (ตั้งค่า → เวอร์ชันแอป) ให้ตรงกับ APK ล่าสุด
- ทดสอบตาม `../docs/TEST_RELEASE_PLAN.md` (SIT) บน UAT ก่อนเปิดใช้ production
