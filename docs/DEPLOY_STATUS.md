# สถานะการ Deploy — BVN Package

อัปเดต: 2026-11-18 · ยืนยันด้วยการเรียก `version` แบบ read-only ที่ backend จริง

## ✅ Deploy เสร็จและทำงานจริงแล้ว

เจ้าของได้ทำครบ 2 ขั้น:
1. Deploy Edge Function `swift-handler` (โฟลเดอร์ source คือ `supabase/functions/bvn-api/`) เวอร์ชันล่าสุด
2. รัน `supabase/patch_ot_calendar.sql` บนฐานข้อมูล

### ผลการตรวจสอบ (live)
- ✅ Endpoint `swift-handler` ตอบ `backendVersion: 2.0.1-supabase` และ `sourceRevision: 2026-11-18-late-absence-policy`
- ✅ Capability หลักตรงกับนโยบายปัจจุบัน: identity/profile, ลบพนักงาน, OT calendar, Timesheet/Payroll review, payment control, shortfall และ late-absence policy; `attendanceCorrection` เป็น `false`
- ✅ คอลัมน์ `holidays.multiplier` ใช้งานได้ — บันทึก/อ่านตัวคูณรายวันได้ (ทดสอบ set ×3 → อ่านกลับได้ ×3)
- ✅ คีย์ตั้งค่า OT ครบในระบบ:
  | คีย์ | ค่า |
  |---|---|
  | `ot_auto_apply` | `true` (คิดตัวคูณอัตโนมัติเมื่ออนุมัติ) |
  | `ot_multiplier` | `1.5` (OT วันทำงานปกติ) |
  | `ot_sunday_multiplier` | `2` (วันอาทิตย์) |
  | `ot_saturday_enabled` | `false` (ปิด — วันเสาร์ยังไม่คิดพิเศษ) |
  | `ot_saturday_multiplier` | `1.5` (ใช้เมื่อเปิดวันเสาร์) |
  | `holiday_multiplier` | `2` (วันหยุดนักขัตฤกษ์) |

## วิธีทำงานของตัวคูณ OT (ตอนนี้มีผลจริงกับเงินเดือน)

ลำดับความสำคัญ (ตัวบนชนะ) — ใช้ทั้งในการคำนวณเงินเดือนและที่แอปแสดงป้าย ×N:
1. **ตัวคูณที่ตั้งเองในปฏิทิน** (`holidays.multiplier` > 0) — ตั้งจากหน้า "ค่าจ้างและ OT" หรือหน้าอนุมัติ
2. **วันหยุดนักขัตฤกษ์** (แถวใน `holidays` ที่ไม่ได้ตั้งตัวคูณเอง) → ใช้ `holiday_multiplier`
3. **วันอาทิตย์** → `ot_sunday_multiplier` · **วันเสาร์** (ถ้าเปิด) → `ot_saturday_multiplier`
4. **OT วันทำงานปกติ** → `ot_multiplier` ของรายคน หรือค่าเริ่มต้น

> ถ้า `ot_auto_apply = false` ระบบจะกลับไปใช้ตัวคูณ OT แบบ flat รายคนแบบเดิม (fallback ปลอดภัย)

## การใช้งานหลังบ้าน
- **ตั้งตัวคูณรายวัน**: เมนู "เงินเดือน" → แท็บ "ตั้งเรตค่าจ้าง · OT" → ปฏิทินตัวคูณ OT (คลิกวัน / คลิกขวา) — หรือคลิกวันในปฏิทินหน้า "บุคคล & อนุมัติ"
- **ดึงวันหยุดแบงก์ชาติ**: ปุ่ม "ดึงวันหยุดแบงก์ชาติ" บนปฏิทิน OT — เติมวันหยุดราชการของปี + เปิด OT ที่ ×2 (ตาม `holiday_multiplier`)
- **กติกา OT**: แก้ค่าในแผง "กติกาค่าแรง OT และวันพิเศษ" บนหน้าเดียวกัน (วันทำงาน/สัปดาห์ · เสาร์/อาทิตย์ · วันหยุด)

## ฝั่งแอปพนักงาน (APK)
- หน้า "เวลาทำงาน" แสดงป้าย **×N** บนวันหยุด/เสาร์/อาทิตย์ (ดึงจาก `employee_month.multiplier` ซึ่งอ่านกติกาเดียวกัน)
- OT คิดอัตโนมัติเมื่อเช็กเอาต์เกินเวลาเลิกงาน — พนักงานขอ OT เองไม่ได้
- Source APK ปัจจุบัน: **1.0.14 / version code 14** (`employee_mobile/pubspec.yaml`) ส่วนค่าที่ตั้งอยู่บน backend จริงจากการตรวจล่าสุดคือ **1.0.12 / version code 12** — ต้องอัปโหลด APK 1.0.14 และบันทึกเวอร์ชันในตั้งค่าระบบก่อนจึงจะถือว่าเผยแพร่แล้ว
- เวลาเช็กอิน/เช็กเอาต์ถูกเก็บเป็น UTC แต่แอปแสดงเป็น **Asia/Bangkok (UTC+7)**; มี regression test `employee_mobile/test/bangkok_attendance_time_test.dart` ครอบคลุม `02:48Z → 09:48` และเส้นแบ่งวันไทย

## ยังค้าง

- Publish `admin_codex/index.html` รุ่นล่าสุดไปยังช่องทางที่ผู้ดูแลใช้งานจริง; `run.bat` เปิดได้เฉพาะ localhost
- ทดสอบเลขเงินเดือนจริงแบบครบวงจรบนข้อมูล UAT (อนุมัติ OT วันอาทิตย์/วันหยุด → พรีวิว → เทียบยอด → ตรวจสลิปก่อนพิมพ์)
- Build และเผยแพร่ APK 1.0.14 จาก source ปัจจุบัน แล้วทดสอบบนอุปกรณ์จริง: เวลา Asia/Bangkok, GPS check-in/out และ profile reminder
- ปรับข้อความ release note ในตั้งค่าระบบ: ข้อความ live ปัจจุบันยังกล่าวถึง “แก้เวลา” แต่ capability `attendanceCorrection` ปิดอยู่

### ตรวจสภาพ Production แบบ read-only

ใช้ `node tools/production_readiness_probe.mjs` เพื่อเช็ก revision, capability หลัก, เวอร์ชัน APK และลิงก์ดาวน์โหลด โดยไม่อ่านหรือเขียนข้อมูลพนักงาน/เงินเดือน. Script จะเตือนเมื่อข้อความอัปเดตยังขัดกับนโยบายปิดการแก้เวลา
