# Handoff for Codex — Admin Codex console

อัปเดตล่าสุด: 2026-11-16 (โดย Claude). อ่านไฟล์นี้ + `../AI_COLLAB_BRIEF.md` ก่อนแก้ `index.html`
ทุกครั้ง และอัปเดต changelog ใน brief หลังทำงานเสร็จแต่ละชิ้น

## สถานะปัจจุบันของหลังบ้าน (เพิ่งทำเสร็จ)

### 0. ⚠️ OT multiplier calendar + กติกาตัวคูณ (ต้อง DEPLOY + รัน PATCH ก่อนใช้งานจริง)
ฟีเจอร์นี้แตะ **สูตรคำนวณเงินเดือน** — ต้องให้เจ้าของ deploy Edge Function ใหม่ + รัน SQL patch
ก่อนตัวคูณจะมีผล (frontend ทำงานกับ backend เก่าได้โดยไม่พัง แต่ตัวคูณจะถูกเพิกเฉยจนกว่าจะ deploy)

- **DB**: เพิ่มคอลัมน์ `holidays.multiplier numeric default 0`
  - ตาราง `supabase/schema.sql` อัปเดตแล้ว + patch idempotent: `supabase/patch_ot_calendar.sql`
  - patch ยัง seed คีย์ settings เริ่มต้น (insert เฉพาะที่ยังไม่มี ไม่ทับค่าเจ้าของ)
- **Settings keys ใหม่**: `ot_auto_apply`(true), `ot_multiplier`(1.5), `ot_sunday_multiplier`(2),
  `ot_saturday_enabled`(false), `ot_saturday_multiplier`(1.5), `holiday_multiplier`(2)
- **สูตร** (`supabase/functions/bvn-api/index.ts`):
  - `holidayMultMap(start,end)` + `weekdayOf(date)` + `resolveOtMultiplier(...)` ใหม่
  - `previewPayroll` อ่านตัวคูณรายวันแทนตัวคูณ flat รายคน (บรรทัดที่เดิมใช้ `rule.ot_multiplier`)
  - ลำดับความสำคัญ: ตัวคูณในปฏิทิน(holidays.multiplier>0) → holiday row(ใช้ holiday_multiplier) →
    อาทิตย์/เสาร์ → OT รายคน/ปกติ · ถ้า `ot_auto_apply=false` → กลับไปใช้ตัวคูณ flat รายคน (fallback ปลอดภัย)
  - `admin_list_holidays`/`admin_save_holiday` ส่ง/รับ `multiplier` แล้ว
- **เทสต์เลข**: `tools/ot_multiplier_test.mjs` (mirror ของ resolveOtMultiplier) — `node tools/ot_multiplier_test.mjs`
  ผ่านทั้ง decision table + ตัวอย่าง "อาทิตย์ 3 ชม. @50 = 300". **ถ้าแก้สูตรใน source ต้องแก้ mirror ให้ตรง**
- **Frontend** (`admin_codex/index.html`, หน้า "ค่าจ้างและ OT"):
  - panel "กติกาค่าแรง OT" (`renderOtRules`) + ปฏิทินตัวคูณ (`otCalRender`/`otDayDialog`/`otDayQuickMenu`)
  - คลิกวัน = dialog ตั้งตัวคูณ+ชื่อ · คลิกขวา = เมนูด่วน · "ปกติ ×1" = `admin_delete_holiday` (ลบแถว ไม่ใช่ตั้ง 0)
  - หน้า "วันนี้": การ์ด "รออนุมัติเดือนนี้" (นับ pending เฉพาะเดือนปัจจุบัน กดไปหน้าอนุมัติ)
- **สิ่งที่ยัง NOT ทำ/ตรวจ**: ยังไม่ได้ deploy/รัน patch บน DB จริง; ยังไม่พิสูจน์เลขบน Supabase จริง
  (พิสูจน์แค่ mirror); `autoOvertime` ยังสร้างคำขอ OT ตามเดิม (multiplier ใช้ตอน payroll เท่านั้น ไม่เก็บบน request)

### 1. Hash routing (commit `1b938c7`)
- `go(page)` push `#<page>` เข้า history; `popstate` listener คืนหน้าเมื่อกด Back/Forward;
  `enterApp` คืนหน้าที่ deep-link ตอน refresh ไม่งั้น anchor ที่ `#dashboard`
- ตัวแปรกันลูป: `_navFromPop` (ต้องคง guard นี้ไว้ถ้าแตะ `go`)

### 2. Export / Backup (commit ล่าสุด)
- `downloadCSV(filename, rows, msg)` — helper กลาง (มี UTF-8 BOM ให้ Excel อ่านไทยได้) ใช้ร่วมกันทุก export
- `exportEmployeesCSV()` — ปุ่ม "ส่งออก CSV" ในหน้าพนักงาน (`#expEmpBtn`). **ไม่ส่งออกรหัสผ่าน** โดยเจตนา
- `exportAttendanceCSV(start,end)` + `attendanceExportDialog()` — ปุ่มในหน้าเวลาทำงาน แท็บ "บันทึกเวลา" (`#expAttBtn`),
  มี dialog เลือกช่วงวันที่ (ดีฟอลต์เดือนปัจจุบัน). ใช้ action **`admin_attendance_days`** (ชื่อ action นี้คือของจริง
  — ระวัง: `admin_attendance_report` **ไม่มี** ในแบ็กเอนด์)
- `exportFullBackup()` — ปุ่มในหน้าตั้งค่า (`#backupBtn`) ดาวน์โหลด JSON รวม
  settings/employees/payRules/sites/holidays/payrolls เป็นไฟล์เดียว (กัน "ข้อมูลโดนจับเป็นตัวประกัน")

## สิ่งที่ยัง "ไม่ได้ทำ" — งานค้างเรียงตามความสำคัญ

### A. แยกไฟล์ monolith (ใหญ่/เสี่ยง — คุยกันก่อนทำ)
`index.html` ยาว ~3,500 บรรทัด (HTML+CSS+JS กองเดียว) ทำให้แก้ต่อลำบากและเสี่ยง merge conflict ระหว่างเรา
- แนวทางที่เสนอ (ค่อยเป็นค่อยไป ไม่ต้องรื้อทีเดียว):
  1. แยก CSS block → `admin_codex/styles.css`
  2. แยก JS → ES modules เช่น `js/api.js` (api/esc/downloadCSV), `js/router.js` (go/popstate),
     `js/pages/*.js` (render แต่ละหน้า)
  3. คงพฤติกรรม/คลาส/ชื่อ selector เดิมไว้ทั้งหมด เพื่อไม่ให้ UI หรือ test พัง
- **อย่ารื้อ** จนกว่าจะตกลงขอบเขตกันใน brief ก่อน (ไฟล์เดียวยังทำงานได้ดี การแยกคือเรื่อง maintainability ล้วนๆ)

### B. ลิงก์ APK ค้าง (เล็ก)
ตั้ง version 5 ไว้แล้วในแบ็กเอนด์ แต่ช่อง `#appUrl` ยังว่าง (รอลิงก์ Google Drive จากเจ้าของ) —
พนักงานยังไม่เห็น prompt อัปเดตจนกว่าจะใส่ลิงก์ (ยืนยันแล้วใน `employee_mobile/lib/update.dart:34`)

### C. ของควรพิจารณาต่อ (ยังไม่จำเป็นเร่งด่วน)
- Backup อัตโนมัติตามเวลา (ตอนนี้เป็น manual ปุ่มเดียว)
- รวม attendance ลงในไฟล์ backup JSON ด้วย (ตอนนี้แยกเป็น CSV เพราะข้อมูลอาจใหญ่)

## กติกาที่ต้องรักษา (จาก CLAUDE.md + งานที่ผ่านมา)
- อย่าทับงานอีก agent โดยไม่ดู working tree + handoff ก่อน
- รหัสผ่านต้อง hash; **ห้าม** ส่งออก/โชว์ค่า hash หรือ plaintext ของรหัสพนักงาน
- publishable apikey เป็น public ปลอดภัย; service_role key ลับ ห้ามเข้า repo/แชต
- ทุก export ใช้ `downloadCSV`/Blob ฝั่ง client เท่านั้น — ไม่มีการส่งข้อมูลออกนอกไปที่ third-party
