# BVN Package Admin Codex — UAT Checklist

## สิ่งที่ตรวจแล้วในเครื่อง (ไม่ใช่ production proof)
- ✅ หน้า login render ผ่าน localhost และไม่มีช่องให้กรอก master API key
- [ ] Mobile: กรอกรหัสผิด 5 ครั้ง → การ login ที่ถูกต้องยังถูกปฏิเสธชั่วคราวโดยไม่เปิดเผยว่ารหัสพนักงานมีอยู่จริง; รอ 15 นาทีแล้วลองใหม่สำเร็จ
- ✅ `Code.gs` และ JavaScript syntax ผ่าน
- ✅ `apps_script/contract_smoke_test.js` ผ่าน: session login, HMAC migration,
  Dashboard header handling และ logout/revoke

**ยังไม่ได้ตรวจ:** deployment จริง, Google Sheet จริง, บัญชี Admin จริง,
การเขียนข้อมูล, GPS มือถือ และธุรกรรมเงินจริง

## วิธีเปิด
ดับเบิลคลิก `admin_codex/run.bat` หรือสั่งใน PowerShell ที่โฟลเดอร์
`admin_codex`:
```bash
py -m http.server 18777 --bind 127.0.0.1 --directory .
```
แล้วเปิด `http://127.0.0.1:18777/` แล้ว login ด้วยบัญชี Admin ที่สร้างใน
ระบบ ใช้ endpoint override เฉพาะเมื่อผู้ดูแลแจ้ง deployment ใหม่

> ใช้ **พนักงานทดสอบใหม่** (เช่น “UAT Test”) อย่าแตะพนักงานจริง และอย่าล็อกงวด payroll จริงระหว่างทดสอบ

## รายการทดสอบ

### A. เข้าสู่ระบบ + ภาพรวม
- [ ] Login ด้วยบัญชี Admin จริง → เข้าหน้าภาพรวมได้
- [ ] Dashboard แสดงเฉพาะการ์ดตามสิทธิ์: Owner/Manager เห็นงานและการเงิน,
      Operations เห็นงานปฏิบัติการ, Finance เห็นเงินเดือน/Invoice; “ข้อมูลล่าสุด” แสดงเวลา
- [ ] badge จำนวนงานค้างขึ้นที่เมนู “คิวอนุมัติ” ถ้ามี pending
- [ ] ปิดแท็บแล้วเปิดใหม่ → ต้อง login ใหม่ (token ไม่ค้างข้ามแท็บ)
- [ ] Finance เรียก employee/approval action โดยตรงไม่ได้ และ Operations อ่านหรือแก้วันหยุดไม่ได้ แม้ replay request

### B. พนักงาน
- [ ] “+ เพิ่มพนักงาน” (UAT Test) → ได้ Employee ID + รหัสชั่วคราว โชว์ครั้งเดียว, ปุ่มคัดลอกใช้ได้
- [ ] ตรวจ Network response ของรายการ/แก้ไขพนักงาน → มีแผนกและข้อมูลปฏิบัติงานครบ แต่ไม่มี `passwordHash` หรือรหัสผ่านเก่า
- [ ] ค้นหาด้วยชื่อ/รหัส กรองถูกต้อง
- [ ] “แก้ไข” เปลี่ยนตำแหน่ง/แผนก/บังคับ GPS → บันทึกแล้วแถวอัปเดต
- [ ] หน้าเพิ่มและแก้ไขพนักงานต้องไม่มี field site; จุดเช็กอินอยู่ที่ “เวลาทำงาน” และใช้เป็นนโยบายส่วนกลาง
- [ ] “รีเซ็ตรหัส” → ได้รหัสใหม่ (โทเค็นมือถือเดิมถูกเพิกถอน)
- [ ] “ปิดใช้งาน” → สถานะเป็น ปิดใช้งาน แต่แถวยังอยู่ (ประวัติไม่หาย)

### C. คิวอนุมัติ (ส่งคำขอจากแอปมือถือก่อน)
- [ ] คำขอลาที่ส่งมาโผล่ในตาราง “คำขอลา” สถานะ รออนุมัติ
- [ ] กดอนุมัติ/ปฏิเสธ → สถานะเปลี่ยน + badge ลดลง + พนักงานเห็นผลในแอป
- [ ] ตรวจ Audit Log หลังอนุมัติ/แก้ไข → ชื่อผู้ทำรายการตรงกับบัญชีที่ login ไม่ใช่ชื่อที่กรอกในฟอร์ม
- [ ] คำขอ OT/แก้เวลา: อนุมัติ/ปฏิเสธ (ปฏิเสธใส่หมายเหตุได้)
- [ ] ติ๊ก “แสดงทั้งหมด” เห็นรายการที่ตัดสินใจไปแล้ว

### D. เรตค่าจ้าง + เงินเดือน (ของอ่อนไหว — ทำกับข้อมูลคุมได้)
- [ ] ตั้งเรตให้ UAT Test (ลอง daily และ hourly) → บันทึกได้
- [ ] เลือกช่วงวันที่มีวันทำงานเช็กอิน/ออกครบ → “พรีวิวเงินเดือน”
- [ ] **ตัวเลข gross ตรงกับที่คำนวณมือ** (ฐาน + OT) — ถ้าไม่ตรง **อย่าล็อก**
- [ ] กรณีมี SSO/หักอื่น/เงินล่วงหน้าหลายรายการ → เงินล่วงหน้าหักได้เฉพาะยอดหลังหัก SSO/หักอื่น และตัดตามรายการเก่าก่อนโดยไม่ข้ามรายการเก่า
- [ ] แถวที่มี warning (เช่น OT ไม่มีวันครบ) ขึ้น badge เตือน
- [ ] Export CSV (พรีวิว) เปิดใน Excel ภาษาไทยไม่เพี้ยน
- [ ] ล็อกงวด 1 ครั้ง → ขึ้นในประวัติ, เปิด snapshot ดู, Export CSV ของ snapshot = ตรงกับตอนล็อก
- [ ] ลองล็อกงวดเดิมซ้ำ → ถูกปฏิเสธ (immutable)
- [ ] ใช้ Admin สองบัญชีลองล็อกงวดทดสอบ/บันทึกจ่ายเงินล่วงหน้ารายการเดียวกันพร้อมกัน → สำเร็จได้เพียงครั้งเดียว

### E. ใบแจ้งหนี้
- [ ] สร้างใบใหม่ → เห็น VAT 7% สดตอนพิมพ์ยอด, สร้างแล้วสถานะ “ร่าง”
- [ ] ร่าง → ออกบิล → บันทึกชำระ (ต้องใส่เลขอ้างอิง ไม่งั้นถูกปฏิเสธ)
- [ ] ลองข้ามสถานะผิด (เช่น ร่าง → ชำระ) → ถูกปฏิเสธ
- [ ] ใบที่ issued และเลยกำหนด → ขึ้น “เกินกำหนด” ที่การ์ดและตาราง

## ถ้าอะไรพัง
จดข้อความ error (ไทย) ที่เด้ง + action ที่กด แล้วส่งให้ Claude ช่วยไล่ — ส่วนใหญ่จะเป็น (ก) สคีมาชีตยังไม่ initialize, (ข) contract field ไม่ตรง, หรือ (ค) การ deploy Apps Script ยังไม่อัปเดตเวอร์ชันล่าสุด

## Addendum — session and Codex theme (2026-11-06)
- [ ] After deployment, run `apps_script/live_session_probe.js` with a dedicated non-production Admin and record pass/fail. It checks login, Dashboard, logout and revoked-session rejection only.
- [ ] Sign in with an Admin username/password created in the system (not a master API key).
- [ ] Confirm the browser network response does not return the owner API key.
- [ ] Click logout, refresh, then confirm the old session is rejected.
- [ ] Confirm light mode remains white/neon-green/orange and dark mode remains black/neon-green/orange on Dashboard, Employees, Payroll and Settings.
- [ ] Run the above only after deploying the local `apps_script/Code.gs`; static checks are not live proof.
