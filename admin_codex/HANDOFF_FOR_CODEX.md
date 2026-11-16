# Handoff for Codex — BVN Package

อัปเดต: 2026-11-16 (Claude). อ่านไฟล์นี้ + `../AI_COLLAB_BRIEF.md` + `../docs/DEPLOY_STATUS.md`
ก่อนแก้ทุกครั้ง และอัปเดต changelog ใน brief หลังทำงานเสร็จแต่ละชิ้น

## ภาพรวมสถาปัตยกรรม
- **แอปพนักงาน (APK)** = Flutter `employee_mobile/` → เรียก **Edge Function เดียว** → **Supabase Postgres**
- **หลังบ้าน (คอนโซล)** = ไฟล์เดียว `admin_codex/index.html` (HTML+CSS+JS) → Edge Function เดียวกัน
- **Edge Function**: slug จริง = **`swift-handler`** (source อยู่โฟลเดอร์ `supabase/functions/bvn-api/index.ts`)
  ⚠️ deploy ต้องใช้ slug `swift-handler` เท่านั้น ห้าม deploy เป็น `bvn-api`
- **DB**: 17 ตาราง (ดู `supabase/schema.sql`). ทุก action คุยผ่าน `{action, adminToken|mobileToken, ...}` → `{ok,message,data}`
- **ไม่มี auto-host** สำหรับคอนโซล — ไฟล์ `index.html` ต้อง deploy/เปิดเองที่ไหนสักที่ (ถามเจ้าของว่าเปิดจากไหน)

## สถานะล่าสุด (deploy แล้ว ทำงานจริง)
ระบบ **ตัวคูณ OT/วันหยุด** deploy + รัน `supabase/patch_ot_calendar.sql` แล้ว ยืนยัน live (ดู `docs/DEPLOY_STATUS.md`).
APK ล่าสุด **1.0.8+9** (console app-version = 9). เหลือใส่ลิงก์ APK บน Drive (`appApkUrl` ยังว่าง).

## สิ่งที่ทำเสร็จในรอบนี้ (อยู่ใน main แล้ว)
1. **รีแบรนด์โทนน้ำเงินเข้ม (navy #1e3a5f)** ทั้งคอนโซล + แอป + โลโก้/ไอคอน BVN
   - token หลักอยู่ `:root` (บล็อก redesign-v2 ที่ประมาณบรรทัดหลังสุด) — `--blue`=navy, `--green`=emerald(สถานะมาทำงาน), `--amber`,`--red`
   - สถานะ "มาทำงาน/สำเร็จ" = emerald, แบรนด์ = navy
2. **หน้ารวม "บุคคล & อนุมัติ"** (`renderPeople`, page id `people`) — รวม พนักงาน + งานรออนุมัติ
   - ซ้าย: รายชื่อ (ค้นหา, badge งานค้าง, ไอคอน GPS ถ้า `locationRequired`, ไอคอนปฏิทิน, เมนู ⋯ = แก้ไข/รีเซ็ตรหัส/ปิดใช้งาน, แผง `#pwReqPanel`)
   - ขวา: 3 โหมด segmented — OT&วันหยุด / การลา(มีตารางโควตา) / เบิกเงิน — reuse `reviewLeave/reviewTime/decideAdvance/markAdvancePaid`
   - หน้าเดิม `employees`/`approvals` ยังมีใน PAGES (ไม่มีปุ่มเมนู) ไว้เป็น deep-link
   - review handler ทั้งหมดรีเฟรชหน้าปัจจุบันด้วย `PAGES[state.page].load()`
3. **หน้าวันนี้: donut รายคน** (`renderPeoplePulse`) — มา(เขียว)/สาย(ส้ม)/ขาด(แดง) + ตัวเลข, คลิกเปิดปฏิทิน
   - "ขาด" = วันทำงานที่ควรมา (settings.workdays − holidays − วันที่มา)
4. **ปฏิทินตัวคูณ OT** (`otCalRender`/`otEffectiveMult`) — ลงสีเสาร์/อาทิตย์+วันหยุดตามกติกา, ×N จาง=มาจากกติกา ×N เข้ม=ตั้งเอง
   - ปุ่ม "ดึงวันหยุดแบงก์ชาติ" (`otImportBotHolidays`) → `admin_import_holidays` + `defaultMultiplier`
5. **กติกา OT** (`renderOtRules`) — ot_multiplier/sunday/saturday/holiday + toggle auto
6. **Login ใหม่**: คอนโซล navy gradient + การ์ดลอย · แอป แบบมินิมอลขาว (option 3)
7. **APK**: โทน navy, โลโก้ในแอป BVN (`PppBrandMark._fallback`), launcher icon (flutter_launcher_icons),
   เอาการขอ OT เองออก (OT อัตโนมัติจากเช็กเอาต์), `employee_month` ส่ง `multiplier` ให้แอปแสดง ×N

## ลำดับการคำนวณตัวคูณ OT (backend `resolveOtMultiplier`)
ปฏิทินรายวัน(holidays.multiplier>0) → holiday(ใช้ holiday_multiplier) → อาทิตย์/เสาร์ → OT รายคน/ปกติ
(`ot_auto_apply=false` → กลับไปใช้ flat). เทสต์ mirror: `node tools/ot_multiplier_test.mjs`.

## งานที่ยัง "ไม่ได้ทำ" / ทำต่อได้ (เรียงตามคุณค่า)
- **ลิงก์ APK บน Drive** — ใส่ใน `appApkUrl` (หน้าตั้งค่า) เพื่อเปิดระบบอัปเดต (เล็ก รอลิงก์จากเจ้าของ)
- **ฝังปฏิทินรายคน + ปฏิทินลา เข้าโหมด inline** — ตอนนี้โหมด OT ลิงก์ไปหน้า payrules, คลิกคนเปิด modal ปฏิทิน
- **แยกไฟล์ monolith** — `index.html` ~3,900 บรรทัด + `main.dart` ~3,500 บรรทัด (งานใหญ่ ค่อยเป็นค่อยไป, คุยก่อน)
- **ทดสอบเลขเงินเดือนจริงครบวงจร** — อนุมัติ OT วันอาทิตย์/วันหยุด → พรีวิว → เทียบยอด (แนะนำบนข้อมูลไม่สำคัญ)

## กติกาที่ต้องรักษา (CLAUDE.md + งานที่ผ่านมา)
- อย่าทับงานอีก agent โดยไม่ดู working tree + handoff ก่อน
- รหัสผ่านต้อง hash; ห้ามส่งออก/โชว์ค่า hash/plaintext; publishable apikey เป็น public ปลอดภัย, service_role ลับ ห้ามเข้า repo/แชต
- ทุก export ใช้ `downloadCSV`/Blob ฝั่ง client เท่านั้น
- commit ลงท้ายด้วย `Co-Authored-By: ...`; push เมื่อเจ้าของสั่งเท่านั้น
- ก่อน deploy: slug ต้องเป็น `swift-handler`
