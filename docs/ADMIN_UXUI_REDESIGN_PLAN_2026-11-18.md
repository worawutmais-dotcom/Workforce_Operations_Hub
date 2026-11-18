# แผนปรับปรุง UX/UI หลังบ้าน BVN

## เป้าหมาย

ทำให้หลังบ้านเป็นศูนย์ปฏิบัติการที่ HR, Operations และ Finance เห็นสิ่งที่ต้องตัดสินใจทันที โดยไม่ต้องไล่เปิดหลายหน้า และไม่ใช้สีเป็นของตกแต่ง

## ทิศทางการออกแบบ

- **ผลิตภัณฑ์:** ระบบจัดการเวลา พนักงาน และเงินเดือนสำหรับผู้ดูแล BVN
- **บุคลิก:** สุขุม แม่นยำ และตอบสนองไว
- **โลกของผลิตภัณฑ์:** ห้องควบคุมงานที่อ่านสถานะกะงานและยอดจ่ายจากเอกสารปฏิบัติการ
- **ช่วงเวลาที่เด่น:** Live Shift Instrument บน Dashboard และยอดจ่ายสุทธิใน Payroll
- **ลายเซ็น:** จุดสถานะเล็กแบบเดียวกัน ใช้แสดง live, ต้องตรวจ, และเสร็จสิ้นในทุกหน้า

## ปัญหาที่พบ

1. CSS เดิมมีหลายชั้นและใช้โทนสี/เงาหลายแบบ ทำให้ surface, panel และ field แยกกันไม่ชัด
2. Dashboard มีข้อมูลดี แต่สีและรูปแบบ card หลายชุดทำให้ความสำคัญของ “งานที่ต้องจัดการ” ลดลง
3. หน้า Timesheet และ Payroll เป็นงานสำคัญ แต่ระบบสีตารางและ action ยังไม่สม่ำเสมอ
4. การตั้งค่าเป็นรายการยาว ต้องใช้ color grouping และสถานะผลกระทบก่อนบันทึกให้ชัดขึ้น

## หลักการใช้งาน

| สถานะ | สี | ใช้กับ |
| --- | --- | --- |
| ปกติ / ออนไลน์ / พร้อมจ่าย | Teal | live status, complete, ready |
| ต้องตัดสินใจ | Amber | สาย, เวลาไม่ครบ, รออนุมัติ |
| ข้อยกเว้น | Coral | error, void, คำสั่งย้อนกลับไม่ได้ |
| การนำทางและข้อมูลหลัก | Navy | primary action, selected page, money |

## ลำดับทำงาน

### รอบ 1 — ทำแล้วในชุดนี้

- สร้าง token สีและ surface hierarchy กลางให้หน้า Dashboard, Timesheet, Payroll, People และ Settings
- ปรับ sidebar/topbar/panel/table/form ให้มี contrast ชัดขึ้น โดยไม่เพิ่ม card ที่ไม่จำเป็น
- ยกระดับ Dashboard ให้ Live Shift Instrument เป็น visual หลักเพียงจุดเดียว และใช้สี semantic กับ KPI/card อื่น
- ลด gradient, glow และ hover ที่เกินจำเป็นเพื่อให้ข้อมูลอ่านง่ายบนจอทำงานนาน ๆ

### รอบ 2 — หน้าปฏิบัติการหลัก

- Timesheet: เพิ่ม row emphasis สำหรับ `ต้องตรวจ`, filter state ที่เห็นชัด และ sticky action bar เมื่อมีรายการค้าง
- Payroll: แยก `พร้อมออกสลิป`, `รอ OT`, `เวลาไม่ครบ`, `ต้องตั้งเรต` ด้วย status rail เดียวก่อนตาราง
- People: เพิ่ม profile readiness และ quick edit สำหรับเลขบัตร/โทรศัพท์โดยไม่ต้องผ่านหลาย modal

### รอบ 3 — ตรวจรับ

- ทดสอบ desktop 1366px และ mobile 390px
- ทดสอบ Owner, Operations และ Finance ว่าเห็นเฉพาะ action ที่มีสิทธิ์
- ทดสอบ keyboard focus, hover, ตารางยาว และ print payslip

## เกณฑ์รับงาน

- ทุก action หลักอยู่ห่างไม่เกิน 1 click จาก Dashboard
- สีแดงใช้เฉพาะ error/destructive action เท่านั้น
- ตารางอ่านแถวปกติ/ต้องตรวจ/เลือกอยู่ได้ภายใน 1 วินาที
- primary action ต่อส่วนมีไม่เกิน 1 ปุ่ม
- พื้นผิวปกติไม่ใช้ gradient หรือ colored shadow

## ความคืบหน้ารอบ 2

- เพิ่ม Payroll status rail ก่อนตาราง: พร้อมออกสลิป, เวลาไม่ครบ, OT รออนุมัติ และต้องตั้งเรต พร้อมทางลัดไปยังหน้าที่แก้ไขได้
- เพิ่ม Timesheet scan strip: จำนวนครบแล้ว, ต้องตรวจ, รายการวันนี้ และจำนวนที่ถูกกรองอยู่
- แถว Timesheet ใช้เส้นสถานะด้านซ้ายแทนการระบายสีทั้งแถว: Coral สำหรับไม่มีเวลาเข้า, Amber สำหรับรอเช็กเอาต์ และ Teal-tint สำหรับวันนี้
- ปุ่มเช็กเอาต์เปลี่ยนเป็น neutral action เพราะไม่ใช่คำสั่งทำลายข้อมูล

## หลักฐานรอบ 1

- `node tools/admin_redesign_contract_test.mjs` ผ่าน
- parse JavaScript ใน `admin_codex/index.html` ผ่าน
- `git diff --check` ผ่าน
- static preview หน้า Login ถูก render ด้วย Playwright แล้ว
