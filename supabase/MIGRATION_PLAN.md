# แผนย้ายฐานข้อมูล: Google Sheets → Supabase (Postgres)

> สถานะ: **เตรียมไว้ ยังไม่ย้าย** — ไฟล์ชุดนี้พร้อมใช้ แต่แอป/คอนโซลยังรันบน Google Sheets ตามเดิม 100% จนกว่าจะทำขั้น "สลับโค้ด" (ขั้นที่ 5)

> ## ⚡ เริ่มสดจากศูนย์ (ข้อมูลใน Sheets เป็นข้อมูลทดลอง — ไม่ย้าย)
> ถ้าไม่ต้องการย้ายข้อมูลเก่า ให้ทำแค่ **ขั้นเดียว**:
> 1. สร้างโปรเจกต์ Supabase (ขั้นที่ 1 ด้านล่าง)
> 2. SQL Editor → วาง **`supabase/setup.sql`** ทั้งไฟล์ → Run (ได้ทั้งตาราง + RLS + ค่าตั้งต้น + จุดเช็กอิน BVN-HQ + บัญชี admin เริ่มต้น)
> 3. **ข้ามขั้นที่ 3–4 (export CSV / รันสคริปต์ย้าย) ไปเลย** — ไม่ต้องทำ
>
> หมายเหตุ: บัญชี admin เริ่มต้นคือ `admin` / `changeme` — **เปลี่ยนรหัสก่อนใช้จริง** (และตารางพนักงานว่าง รอเพิ่มคนจริงผ่านคอนโซลตอน cutover)

ชุดนี้ทำอะไรให้แล้ว (ส่วนที่ทำเสร็จได้โดยไม่ต้องมีบัญชี Supabase):
- `schema.sql` — โครงตารางครบทุกชีต (16 ตาราง) ตรงกับ Sheets 1:1
- `policies.sql` — ตั้ง RLS (ความปลอดภัย) แบบ "ให้เฉพาะเซิร์ฟเวอร์ที่เชื่อถือเข้าถึง"
- `../tools/migrate_sheets_to_supabase.mjs` — สคริปต์ย้ายข้อมูลจาก CSV ของแต่ละชีต

ส่วนที่ **ต้องเป็นคุณทำ** (ผมทำแทนไม่ได้เพราะต้องใช้บัญชี): สมัคร Supabase, รัน SQL, รันสคริปต์ย้าย, สลับโค้ด

---

## ขั้นที่ 1 — สร้างโปรเจกต์ Supabase (ฟรี)
1. ไป https://supabase.com → Sign up (ใช้ Google ได้) → New project
2. ตั้งชื่อ, ตั้งรหัส database, เลือก region ใกล้ไทย (Singapore)
3. รอสร้างเสร็จ (~2 นาที) → ไปที่ **Project Settings → API** จดไว้ 3 ค่า:
   - `Project URL` (เช่น `https://abcd.supabase.co`)
   - `anon` key (ใช้ในฝั่ง client ภายหลัง)
   - `service_role` key (ลับสุด ใช้ตอน import เท่านั้น — ห้ามใส่ในแอป/คอนโซล/ไม่ push ขึ้น git)

## ขั้นที่ 2 — สร้างตาราง
- เปิด **SQL Editor** ใน Supabase → วางเนื้อหา `supabase/schema.sql` ทั้งไฟล์ → Run
- จากนั้นวาง `supabase/policies.sql` → Run

## ขั้นที่ 3 — ส่งออกข้อมูลจาก Sheets เป็น CSV
- เปิด Google Sheets ของระบบ → ทำทีละแท็บ: **File → Download → Comma-separated values (.csv)**
- บันทึกลงโฟลเดอร์เดียว ตั้งชื่อไฟล์ให้ตรงชื่อแท็บเป๊ะ:
  `Employees.csv, Work_Sites.csv, Attendance_Log.csv, Payroll_Rules.csv, Payroll_Periods.csv, Payroll_Lines.csv, Leave_Requests.csv, Time_Requests.csv, Advances.csv, Password_Requests.csv, Invoices.csv, Settings.csv, Holidays.csv, Admin_Users.csv, Admin_Sessions.csv, Mobile_Access.csv, Audit_Log.csv`
- (แท็บไหนไม่มีข้อมูล/ไม่มีไฟล์ สคริปต์จะข้ามให้เอง)

## ขั้นที่ 4 — รันสคริปต์ย้ายข้อมูล
```bash
npm i @supabase/supabase-js
SUPABASE_URL="https://abcd.supabase.co" \
SUPABASE_SERVICE_KEY="<service_role key>" \
node tools/migrate_sheets_to_supabase.mjs ./path/to/csv_folder
```
- สคริปต์ **upsert ตาม primary key** → รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ (เผื่อย้ายหลายรอบ)
- รหัสผ่าน (พนักงาน/แอดมิน) ย้ายมาเป็น plaintext เหมือนเดิม — **ควร hash ก่อนเปิดใช้จริง** (มี TODO กำกับใน `schema.sql`)

## ขั้นที่ 5 — สลับโค้ดให้ชี้ Supabase (ขั้นที่ "ย้ายจริง")
> ยังไม่ทำในชุดนี้ — เป็นงานรอบถัดไป ทำทีละฝั่งได้ (เปิด-ปิดด้วย flag)
- **ทางเลือก A (แนะนำ, เปลี่ยนน้อย):** ทำ **Supabase Edge Function** 1 ตัวเลียนแบบ `doPost` ของ Apps Script (action-dispatch เดิม) ให้ถือ `service_role` อ่าน/เขียน Postgres — แล้วแค่เปลี่ยน endpoint ในแอป/คอนโซลไปชี้ Edge Function จบ (โครง client เดิมแทบไม่ต้องแก้ ได้ realtime ผ่าน Supabase Realtime เพิ่ม)
- **ทางเลือก B (เปลี่ยนเยอะ):** ให้แอป (Flutter `supabase_flutter`) และคอนโซล (`@supabase/supabase-js`) คุย Supabase ตรงๆ ด้วย anon key + เขียน RLS ต่อผู้ใช้จริง — ได้ realtime `onSnapshot`/stream เต็มตัว แต่ต้องรื้อ auth ใหม่

---

## ⭐ เวอร์ชันทดลองใช้งานจริงบน Supabase — v1 (core) ด้วย Edge Function

ไฟล์ `supabase/functions/bvn-api/index.ts` คือ "ตัวกลาง" ใหม่ (แทน Apps Script) — พูดภาษาเดียวกับคอนโซลเป๊ะ แต่คุยกับ Supabase แทน Sheets

**v1 ทำได้:** ล็อกอินแอดมิน, หน้าวันนี้ (dashboard), รายชื่อ/แก้พนักงาน, ลงเวลาแทน + ดูการลงเวลา (รายคน/รายวัน) + realtime, ตั้งค่าระบบ, วันหยุด, รายการลา/OT (อ่าน)
**v1 ยังไม่ทำ:** เงินเดือน/บิล/เบิกเงิน/อนุมัติ OT/เรตค่าจ้าง/audit — กดแล้วจะขึ้น "ยังไม่พร้อมในเวอร์ชันทดลอง" (ไว้เพิ่มรอบถัดถ้า trial ผ่าน)

### Deploy (คุณรันเอง — ต้องมี Supabase CLI)
```bash
# 1) ติดตั้ง CLI (ครั้งเดียว) — เลือกวิธีใดก็ได้
npm i -g supabase            # หรือ: scoop install supabase / brew install supabase/tap/supabase

# 2) ล็อกอิน + ผูกโปรเจกต์
supabase login               # เปิดเบราว์เซอร์ให้ยืนยัน
supabase link --project-ref vqualksnbctfukcbxqdd

# 3) deploy ฟังก์ชัน (เปิดให้เรียกได้โดยไม่ต้องแนบ JWT — ฟังก์ชันเช็ก session เอง)
supabase functions deploy bvn-api --no-verify-jwt
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` แพลตฟอร์มใส่ให้อัตโนมัติ ไม่ต้องตั้งเอง

URL ฟังก์ชันที่ได้:
```
https://vqualksnbctfukcbxqdd.supabase.co/functions/v1/bvn-api
```

### ชี้คอนโซลมาที่ Supabase (ไม่ต้องแก้โค้ด)
1. เปิดคอนโซล → หน้า **login** มีช่อง endpoint (หรือเข้าแล้วไป **ตั้งค่า → การเชื่อมต่อ** ช่อง endpoint)
2. วาง URL ฟังก์ชันด้านบน → บันทึก
3. ล็อกอินด้วย **admin / changeme** (จาก setup.sql — เปลี่ยนรหัสทีหลังได้)
4. ลอง: เพิ่มพนักงาน → หน้าวันนี้ → ลงเวลาแทน → เปิด 2 แท็บ เช็กว่าหน้าวันนี้อัปเดตเอง (poll ~6 วิ)

> อยากกลับไปใช้ Sheets: แค่เปลี่ยน endpoint กลับเป็น `/exec` เดิม — ข้อมูลใน Sheets ยังอยู่ครบ (คนละ database กับ Supabase)

### realtime จริง (ทางเลือก, ทำทีหลัง)
ตอนนี้คอนโซลยังใช้ poll 6 วิ (เหมือนเดิม) ซึ่งพอสำหรับ trial ถ้าอยาก push จริง <1 วิ ค่อยเพิ่ม Supabase Realtime (`.channel().on('postgres_changes')`) ที่ตาราง `attendance_log` ในคอนโซลรอบถัดไป

---

## Rollback (ถ้าเจอปัญหา)
- จนกว่าจะทำขั้น 5 เสร็จ ระบบจริงยังอยู่บน Google Sheets → **rollback = ไม่ต้องทำอะไร** แค่ไม่ไปขั้น 5
- ถ้าเริ่มสลับแล้วอยากถอย: ชี้ endpoint เดิมกลับไป Apps Script `/exec` (ข้อมูลใน Sheets ยังอยู่ครบ) — แนะนำ **หยุดเขียน Sheets หรือ Supabase อย่างใดอย่างหนึ่งช่วงทดสอบ** กันข้อมูลสองที่ไม่ตรงกัน

---

## หมายเหตุความถูกต้อง
- ตารางแมปตามชีตปัจจุบันของ `Code.gs` (ดู comment บนสุดของ `schema.sql`) — คอลัมน์แมปตาม **ลำดับคอลัมน์** ไม่ใช่ชื่อหัว ดังนั้นหัวตารางภาษาไทย/อังกฤษไม่กระทบ
- ชนิดวันที่/เวลา: คอลัมน์เวลาเป็น `timestamptz`, วันที่ล้วนเป็น `date`/`text` (วันหยุดเก็บเป็น text `YYYY-MM-DD` ให้ตรง Sheets)
- ถ้าโครงชีตจริงต่างจากนี้ (เพิ่ม/ลดคอลัมน์) ให้ปรับ `TABLES` ใน `migrate_sheets_to_supabase.mjs` และ `schema.sql` ให้ตรงก่อนรัน
