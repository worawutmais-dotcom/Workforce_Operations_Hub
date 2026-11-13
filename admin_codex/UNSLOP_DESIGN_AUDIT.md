# BVN Package Admin Codex — Unslop design pass

## Direction

- **Product:** ศูนย์ปฏิบัติการสำหรับเจ้าของร้านและหัวหน้างาน ใช้ติดตามเวลา คน งานอนุมัติ และเงินในจุดเดียว
- **Character:** นิ่ง แม่นยำ และช่วยตัดสินใจได้เร็ว
- **World:** กระดานส่งมอบกะงาน — เวลา สถานะ และสิ่งที่ต้องทำถัดไปต้องอ่านได้ทันที
- **Moments:** แผงสถานะกะงานบน Dashboard และคู่เวลาเข้า/ออกในข้อมูลการลงเวลา
- **Signature:** จุดสถานะสดขนาดเล็กและเวลาที่จัดรูปแบบสม่ำเสมอ

## Audit ก่อนปรับ

หน้าจอเดิมมีลักษณะ UI ที่ดูเป็น template มากกว่าระบบใช้งานจริง: มี gradient หลายชั้น, radial colour wash, coloured shadow, แถบ navigation ที่เด่นเกินข้อมูล, card hover ที่ลอยขึ้น, ตัวอักษรหัวข้อหนักเกินไป และ emoji หลายจุดในเมนูคำสั่ง. ผลคือทุกส่วนแย่งความสนใจเท่า ๆ กัน ทั้งที่ผู้ดูแลร้านต้องเห็นเพียง “อะไรผิดปกติ และต้องทำอะไรต่อ”

## สิ่งที่ปรับ

1. **Spacing** — ใช้ระยะ 4px grid, ทำ sidebar และ action row ให้กระชับ, ลด padding ของ chrome แต่คงพื้นที่อ่านตารางและ modal
2. **Colour** — ใช้ neutral ramp ที่ติดเขียวเล็กน้อย; เขียวใช้กับสถานะและ selected state, ส้มใช้เฉพาะ primary action; ตัด gradient, radial wash และ coloured glow จาก chrome
3. **Icons and copy** — ตัด emoji จากคำสั่ง, ลดคำที่เป็นการตกแต่ง, ใช้คำกริยาสั้นที่บอกผลลัพธ์ เช่น `ลงเวลาแทน`, `ออกใบแจ้งหนี้`, `ลบบัญชี`
4. **Type** — ลดน้ำหนักที่ไม่จำเป็น, เปลี่ยน label ที่เป็น uppercase/tracking สูงเป็น sentence case, คงตัวเลขแบบ tabular ในบริเวณที่แสดงเวลาและจำนวนเงิน
5. **Layout** — คงลำดับความสามารถเดิมเพื่อไม่ทำลาย workflow แต่ใช้ dashboard เป็นกระดานสถานะงานแทน hero เชิงการตลาด
6. **Details** — กำหนด radius เป็นระบบเดียว, ใช้ hairline border, focus ring และ state ที่อ่านได้โดยไม่ต้องใช้เงา
7. **Visuals and motion** — ไม่มีภาพตกแต่งหรือ animation วนซ้ำ; hover เปลี่ยนเฉพาะ surface/border และปุ่ม press ลงเล็กน้อย

## Acceptance checks

- Login shell ถูก render ผ่าน browser จาก `http://127.0.0.1:18777/index.html`
- JavaScript inline จะถูกตรวจ syntax ก่อนส่งมอบ
- UI ของ dashboard หลัง login ยังต้องทำ authenticated business-flow UAT กับ Apps Script จริงก่อนถือว่าพร้อมใช้งานจริง

## Dashboard clock-in workbench (2026-11-09)

### Problem found

`ลงเวลาแทน` เคยอยู่ใน hero ของ “งานที่ต้องจัดการ” และซ้ำทั้งปุ่มบน top bar กับทางลัดด้านล่าง จึงไม่มีลำดับชัดเจนว่าเป็นงานหลักของ Admin หรือเป็น action รอง อีกทั้ง hero เดิมใช้ข้อความงานค้างเป็นหัวเรื่อง ทั้งที่ผู้ดูแลมักเปิดหน้านี้เพื่อจัดการเวลาให้พนักงานทันที

### Direction

- **Product:** หน้าเริ่มงานของผู้ดูแลร้านสำหรับดูสถานะวันนี้และลงเวลาแทนเมื่อจำเป็น
- **Character:** เป็นระเบียบ ชัดเจน รับผิดชอบได้
- **World:** เคาน์เตอร์ควบคุมเวลาในช่วงเริ่มกะ
- **Moment:** workbench สีเข้มหนึ่งชิ้นที่มีปุ่มลงเวลาแทนสีส้มเป็น action เดียวที่เด่น
- **Signature:** แถบความคืบหน้าจำนวนพนักงานเช็กอินแล้ว

### Change made

1. เปลี่ยน hero เป็น `clock-dock` ที่บอกขอบเขตของการลงเวลาแทนและ audit trail อย่างตรงไปตรงมา
2. ใช้ปุ่มส้มขนาด 72px พร้อม line icon นาฬิกา เป็น primary action เดียว
3. ย้ายจำนวนคนเข้างานและ progress bar เข้าใน workbench เพื่อให้ Admin ประเมินก่อนลงเวลา
4. ตัดปุ่มซ้ำจาก top bar และส่วน `งานอื่น`; คงปุ่ม `ดูบันทึกเวลา` เป็น action รอง
5. ลด metric cards เหลือ 3 รายการที่สนับสนุนการตัดสินใจ และจัดงานอนุมัติ/เวลาผิดปกติเป็นบริบทถัดลงมา

### Verification

- Render และ login ผ่าน browser กับ endpoint ที่ตั้งค่าไว้
- เปิด modal `ลงเวลาแทนพนักงาน` สำเร็จ และพบรายชื่อพนักงาน active กับปุ่มเช็กอิน/เช็กเอาต์
- JavaScript inline ผ่าน `node --check`

## Attribution

แนวทางการ audit และ pass นี้ดัดแปลงจาก **Unslop** โดย Damir Sokolovsky (`@heydamir`) ภายใต้สัญญาอนุญาต CC BY 4.0.

## Light-only policy (2026-11-09)

The console now clears the old persisted dark-mode preference and has no theme
toggle. BVN uses one light operational surface so printed reports, shared
screens, screenshots and day-to-day admin work have the same contrast and
semantic colour meaning.
