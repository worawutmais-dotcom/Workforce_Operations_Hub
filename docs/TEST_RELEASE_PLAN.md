# BVN Package — Test and release plan

สถานะเอกสาร: 16 พฤศจิกายน 2569

หลักการ: ห้ามเรียกงานว่า "Production-ready" เพียงเพราะ build ผ่าน ต้องผ่านแต่ละด่านตามลำดับ และเก็บผลลัพธ์จริงไว้

| ด่าน | เป้าหมาย | ผู้รับผิดชอบ | สภาพแวดล้อม | ผ่านเมื่อ |
|---|---|---|---|---|
| Unit Test | พิสูจน์กฎย่อยในโค้ด | Developer | Local | ทุก test ผ่าน, static check ผ่าน |
| SIT | พิสูจน์ว่า APK, Admin, Edge Function และ DB คุยกันได้ | Developer + Admin | Supabase test project | API และ DB เปลี่ยนข้อมูลถูกต้องตาม flow |
| UAT | พิสูจน์ว่าผู้ใช้งานทำงานจริงได้ | Owner/Admin + พนักงานทดสอบ | UAT data เท่านั้น | ผู้ใช้ลงนามรับรองตาม checklist |
| Production | เปิดใช้กับข้อมูลจริง | Owner | Live | มี backup, rollback และผู้รับผิดชอบชัดเจน |

## 1. Unit Test — ผ่านแล้วบางส่วน

### หลักฐานที่มี

- Flutter: `C:\flutter\bin\flutter.bat analyze` ผ่าน
- Flutter: `C:\flutter\bin\flutter.bat test` ผ่าน 3 tests
- Admin: inline JavaScript syntax check ผ่าน
- OT multiplier: `node tools/ot_multiplier_test.mjs` ผ่าน รวม regression วันจันทร์/UTC
- Source diff: `git diff --check` ผ่าน

### Unit Test ที่ควรเพิ่มก่อน SIT

- BVN ID allocator: สร้างใหม่ต้องเป็น `BVN-0001`, `BVN-0002` และไม่ชนกันเมื่อส่งพร้อมกัน
- National ID/phone validation: ปฏิเสธเลขบัตรไม่ครบ, เลขซ้ำ, และเบอร์ไม่ถูกต้อง
- Identity request: submit → pending → approve/reject ต้องเปลี่ยนสถานะถูกคน
- Payroll: เวลาไม่ครบหรือคำขอค้างต้องทำให้ lock payroll ไม่ได้
- Invoice logo: ปฏิเสธไฟล์เกินขนาด/ชนิดไม่รองรับ และเก็บ URL สำเร็จ

## 2. SIT — ต้องทำบน Supabase ทดสอบ

ห้ามเริ่มด้วยข้อมูลพนักงานหรือเงินเดือนจริง

### Deploy ก่อนทดสอบ

1. รัน `supabase/patch_employee_identity.sql`, `supabase/patch_attendance_corrections.sql` และ patch ที่ค้างอยู่ในฐาน UAT
2. Deploy `supabase/functions/bvn-api/index.ts` เป็น Edge Function ชื่อ `swift-handler`
3. Publish `admin_codex/index.html` ไปยัง URL UAT แล้ว hard-refresh หนึ่งครั้ง
4. ติดตั้ง APK release ล่าสุดบนอุปกรณ์ทดสอบ

### SIT cases สำคัญ

| ID | Flow | Expected result |
|---|---|---|
| SIT-01 | Admin สร้างพนักงานใหม่ | ได้ ID `BVN-XXXX`, เลขบัตร/โทรศัพท์ถูกบันทึก, ไม่แสดง password hash |
| SIT-02 | APK login ด้วยพนักงานทดสอบ | แสดงชื่อ, เวลาเริ่ม/เลิกจาก backend และเช็กสถานะได้ |
| SIT-03 | APK ส่งเลขบัตร/โทรศัพท์ | DB ได้ pending request เท่านั้น; employee record ยังไม่เปลี่ยน |
| SIT-04 | Admin อนุมัติข้อมูล | Employee record อัปเดต, request เป็น approved, audit มีผู้อนุมัติ |
| SIT-05 | เช็กอินใน/นอกพื้นที่ | ในรัศมีบันทึกได้; นอกรัศมีถูกปฏิเสธพร้อมข้อความระยะห่าง |
| SIT-06 | วันหยุด/×N | APK calendar และ payroll Timesheet แสดงตัวคูณเดียวกัน |
| SIT-07 | Timesheet → payroll lock | เวลาไม่ครบ/คำขอค้าง lock ไม่ได้; เมื่อพร้อม lock ได้ครั้งเดียว |
| SIT-08 | Upload logo → Payslip/Invoice preview | เอกสาร preview และ PDF แสดงโลโก้จริง |
| SIT-09 | Admin แก้ไข Check in/out ย้อนหลัง | ต้องมีเหตุผล, ห้ามเวลาอนาคต/ชนิดซ้ำ, เหตุผลถูกเก็บกับ log และปฏิทินแสดงผลถูกต้อง |
| SIT-10 | Console ต่อกับ backend รุ่นเก่า | ปุ่มลบถาวร/แก้เวลา/คิวข้อมูล APK ต้องแสดงสถานะรออัปเดต ไม่เกิด raw `Unsupported action` |

## 3. UAT — เจ้าของระบบรับรองการใช้งาน

ผู้ทดสอบ: Admin 1 คน, Finance 1 คน, พนักงาน 1 คน

### Scenario รับรอง

1. Admin สร้างพนักงานใหม่และแจ้งรหัสชั่วคราวอย่างปลอดภัย
2. พนักงาน login, ตรวจเวลางาน `08:30–17:30`, เช็กอิน/เช็กเอาต์จากพื้นที่จริง
3. พนักงานส่งคำขอแก้เวลาและข้อมูลส่วนตัว
4. Admin ตรวจรายการใน บุคคล & อนุมัติ แล้วอนุมัติ/ปฏิเสธ
5. Finance ตรวจ Timesheet, ตรวจวัน ×N, preview และล็อกงวดทดสอบ
6. Preview สลิป/ใบแจ้งหนี้ต้องมีโลโก้และข้อมูลบริษัทถูกต้อง
7. Admin logout/login แล้วสิทธิ์แต่ละ role เห็นเฉพาะเมนูที่อนุญาต

UAT ผ่านเมื่อทุก scenario ได้ผลตรงตามที่ระบุ, ไม่มีข้อมูลจริงปนกับข้อมูลทดสอบ, และเจ้าของระบบยืนยันผลเป็นลายลักษณ์อักษร

## 4. Production — เปิดใช้จริง

### Go / No-Go

- Go: Unit + SIT + UAT ผ่านครบ, backup DB สำเร็จ, มี APK version ที่ระบุชัด, มีผู้ดูแลระบบอย่างน้อย 2 คน
- No-Go: มี flow เงินเดือน/สิทธิ์/ข้อมูลบัตรที่ยังไม่ผ่าน UAT, API ชี้ไป test endpoint, หรือ logo/เอกสารยังไม่ผ่าน print review

### ขั้นตอนเปิดใช้

1. สำรอง DB และ export การตั้งค่าปัจจุบัน
2. Deploy Edge Function และหน้า Admin ในช่วงเวลาที่กำหนด
3. ตั้ง App version `10 / 1.0.10` และเผยแพร่ APK ที่ตรวจ hash แล้ว
4. สร้างพนักงาน pilot 1 คนและทำ smoke test login → check-in → Admin review
5. เฝ้าระวัง error log ใน 24 ชั่วโมงแรก

### Rollback

- เกิด error ด้านเวลา/เงินเดือน: หยุด lock งวดทันที และกลับ Edge Function/Admin เป็น revision ก่อนหน้า
- เกิด error ด้านข้อมูล: restore จาก backup ที่ทำก่อน deploy โดยผู้ดูแล DB เท่านั้น
- ห้ามแก้ยอดเงินเดือนจริงด้วยการแก้ DB ตรงโดยไม่มี audit record
