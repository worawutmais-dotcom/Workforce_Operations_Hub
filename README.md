# Workforce Operations Hub — BVN Package

ระบบบริหารจัดการพนักงานภายในองค์กร (Thai-first) สำหรับ **บริษัท พนมพร พาณิชย์ จำกัด**
ครอบคลุมการลงเวลาเข้า-ออกงานผ่านมือถือ, อนุมัติคำขอ (ลา/OT/แก้เวลา), คำนวณเงินเดือน,
เบิกเงินล่วงหน้า และออกใบแจ้งหนี้ — โดยมี Google Sheets เป็นฐานข้อมูลกลาง

> ⚠️ ระบบใช้งานภายในกันเอง (internal use) ยังไม่ใช่ระบบบัญชี/เงินเดือนที่สมบูรณ์ตามกฎหมาย

---

## สถาปัตยกรรม (Architecture)

```
          ┌──────────────────┐        ┌──────────────────────┐
          │  Employee Mobile │        │   Admin Back-office  │
          │  (Flutter/Android)│       │  (Web HTML / Desktop)│
          └────────┬─────────┘        └──────────┬───────────┘
                   │  HTTPS POST (JSON)           │
                   └───────────┬──────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Google Apps Script │  ← headless API (doPost dispatch)
                    │      (Code.gs)      │     server validation = ผู้มีอำนาจตัดสิน
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │    Google Sheets    │  ← ฐานข้อมูล / audit trail
                    └─────────────────────┘
```

- **Apps Script เป็น API แบบ headless** — ตรรกะตรวจสอบสิทธิ์/กติกาอยู่ฝั่งเซิร์ฟเวอร์เสมอ
- **Google Sheets เป็น datastore ชั่วคราว** ไม่ใช่หน้า Admin
- การสื่อสารใช้ `Content-Type: text/plain` เพื่อเลี่ยง CORS preflight; `/exec` ตอบ 302 → ต้อง follow เป็น GET

---

## โครงสร้างโฟลเดอร์ (Repository layout)

| โฟลเดอร์ | คำอธิบาย |
|---|---|
| `apps_script/` | Backend — `Code.gs` (action-dispatch API) + `DEPLOYMENT.md` |
| `admin_console/` | หน้า Admin เว็บ (single-file `index.html` วานิลลา JS) + `run.bat` |
| `admin_desktop/` | หน้า Admin เดสก์ท็อป (Python/PyInstaller) + EXE ที่ build แล้วใน `dist/` |
| `employee_mobile/` | แอปพนักงาน Flutter (Android) — `lib/main.dart`, `lib/bvn_api.dart` |
| `supabase/` | สคีมา/สคริปต์ทางเลือก (สำรอง) |
| `tools/`, `docs/` | เครื่องมือช่วยและเอกสารประกอบ |
| `*.md` | เอกสารออกแบบ/แผนงาน — `SYSTEM_DESIGN_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `AI_COLLAB_BRIEF.md` (changelog หลัก), `CLAUDE_HANDOFF.md` |

---

## ฟีเจอร์หลัก (Features)

**พนักงาน (Mobile)**
- ล็อกอินด้วย User + Password (ระบบจำรหัสถาวร), ผูกอุปกรณ์ (device session)
- Check in / out แบบ GPS (ตรวจระยะจากพิกัดร้าน) หรือปิด GPS รายคนได้
- ดูประวัติเวลา, ยื่นคำขอลา / OT / แก้เวลา
- ขอเบิกเงินล่วงหน้า, เปลี่ยนรหัสผ่าน (รู้รหัสเก่า), ขอรีเซ็ตรหัส

**แอดมิน (Back-office)**
- จัดการพนักงาน (สร้าง/แก้ไข/ปิดใช้งาน), ดู/ตั้งรหัสผ่านได้
- คิวอนุมัติรวม (ลา / OT / แก้เวลา / เบิกเงินล่วงหน้า)
- หน้าเจ้าของธุรกิจ: สรุปว่าสิ้นเดือนต้องจ่ายใคร เท่าไร, ตั้งวันจ่าย/รอบจ่าย/วันทำงาน
- ตั้งพิกัด GPS ของร้านสำหรับ check-in
- Check in/out แทนพนักงานได้ (บันทึก audit `admin_manual`)
- Log เวลาเข้า-ออก สรุปวันละ 1 บรรทัด
- ออกใบแจ้งหนี้ (หัวบิล บจก. พนมพร พาณิชย์, คำนวณ VAT 7% ฝั่งเซิร์ฟเวอร์)

---

## วิธีใช้งาน (Getting started)

### 1) Backend — Google Apps Script
1. เปิด Google Sheet ปลายทาง → **Extensions → Apps Script** (ต้องเป็นโปรเจกต์ที่ผูกกับ Sheet)
2. วางเนื้อหา `apps_script/Code.gs` ให้ครบ แล้ว Save
3. ตั้ง Script Properties: `ADMIN_API_KEY`, `MOBILE_TOKEN_PEPPER` (เจ้าของเป็นผู้กรอกเอง)
4. รัน initializer ครั้งแรก (เช่น `seedDemoData` หรือ `initialize*Sheet`) เพื่อสร้างชีต
5. **Deploy → Manage deployments → ✏️ Edit → New version → Deploy**
   (อย่าใช้ *New deployment* เพราะ URL `/exec` จะเปลี่ยนทุกครั้ง)

### 2) Admin Console (เว็บ)
```bash
cd admin_console
run.bat
```
เปิด http://127.0.0.1:8777/index.html แล้วกรอก Endpoint `/exec` + Admin API key

### 3) Employee Mobile (Flutter)
```bash
cd employee_mobile
flutter pub get
flutter build apk --split-per-abi --dart-define=BVN_API_URL=<ENDPOINT/exec>
```
> Windows: ถ้า Kotlin cache ล็อก ให้ตั้ง `kotlin.incremental=false` ใน `android/app/gradle.properties`

---

## ความปลอดภัย (Security notes)

- **รหัสผ่านเก็บแบบ plaintext โดยเจตนา** — เป็นทางเลือกสำหรับใช้งานภายในกันเอง ไม่ใช่มาตรฐานสากล
- `ADMIN_API_KEY` / `MOBILE_TOKEN_PEPPER` อยู่ใน Script Properties เท่านั้น ไม่เก็บใน source
- ไม่ควร commit endpoint ที่มี key หรือ token ลง repo — repo นี้ตั้งเป็น **private**

---

## การพัฒนา (Development)

- Changelog หลักและการตัดสินใจทั้งหมดบันทึกไว้ใน [`AI_COLLAB_BRIEF.md`](AI_COLLAB_BRIEF.md)
- แผนสถาปัตยกรรม: [`SYSTEM_DESIGN_PLAN.md`](SYSTEM_DESIGN_PLAN.md), [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
- Flutter SDK ภายใน (`mobile_toolchain/`) ถูก gitignore ไว้ ไม่รวมใน repo
