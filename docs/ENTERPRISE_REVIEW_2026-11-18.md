# Enterprise Product Review — BVN Workforce Operations Hub
วันที่ 18 พ.ย. 2569 · มุมมอง Software House ระดับ Enterprise (รีวิวตรงไปตรงมา ไม่เกรงใจ)
ขอบเขตที่รีวิว: Admin Console (`admin_codex/index.html`), Edge Function (`bvn-api`/`swift-handler`), Employee APK (บริบทจากโค้ด/บรีฟ)

---

## 0. บทสรุปผู้บริหาร (The Brutal Truth)

ระบบนี้ **ใช้งานได้จริงและทำงานครบวงจร** (ลงเวลา → timesheet → payroll → สลิป → invoice) ซึ่งน่าชื่นชมสำหรับทีมเล็ก แต่ในมุม Enterprise มีปัญหาเชิงโครงสร้าง 5 ข้อที่อันตรายกว่าปัญหา UI ทั้งหมดรวมกัน:

1. **สถาปัตยกรรม deploy เปราะมาก** — ไฟล์ source (`bvn-api/index.ts`) กับไฟล์ที่ deploy จริง (`swift-handler/index.ts`) ต้องก๊อปปี้ให้ "byte-identical" ด้วยมือ ไม่มี build/CI. ในเซสชันนี้เองผมเจอว่าสองไฟล์ **หลุด sync** (mirror มี logic ที่ source ไม่มี) — นี่คือ bug การเงินที่รอวันเกิด.
2. **Deploy แบบแมนนวล 100%** — ทุก feature ลงท้ายว่า "source-only until the owner redeploys swift-handler". คนคนเดียวถือ deploy, ไม่มี staging อัตโนมัติ, ไม่มี rollback plan ที่ทดสอบแล้ว. โปรแกรมการเงินห้ามเป็นแบบนี้.
3. **Single-file 4,000+ บรรทัด** — HTML+CSS+JS กองรวมกันไฟล์เดียว, CSS หลายเลเยอร์ทับกันด้วย cascade order ("ตัวหลังชนะ"), มี dead code ค้าง (openPayslipDraftEditor, pmRenderRows, .tcd-state). แก้อะไรทีเสี่ยงพังที่อื่น.
4. **เทสต์ไม่คุ้มครองพฤติกรรมจริง** — contract test เช็กแค่ว่า "string นี้มีอยู่ในไฟล์ไหม" ไม่ได้เช็กว่า flow ทำงานถูก. ไม่มี integration/E2E. QA อาศัยการเปิดดูด้วยตา.
5. **ความผันผวนของดีไซน์** — แค่ 3 วัน (16–18 พ.ย.) Dashboard ถูก "rebuild / restore / reorganize" กว่า 12 ครั้งตามสกรีนช็อต. นี่ไม่ใช่การพัฒนา แต่คือการ **ไม่มี design system และไม่มีเจ้าของการตัดสินใจ** — เผาเวลาและสร้าง regression.

> ถ้าเป็นลูกค้า Enterprise จริง: ผมจะบอกว่า "ของใช้ได้ แต่ยังไม่พร้อมขายเป็นผลิตภัณฑ์" จนกว่าจะแก้ 5 ข้อบน. UI สวยแค่ไหนก็ไม่ช่วย ถ้า deploy แล้วตัวเลขเงินเดือนผิดเพราะ mirror หลุด sync.

---

## 1. ประเด็นข้ามระบบ (Cross-cutting)

### Senior Software Architect
- **ลบ dual-file mirror ทิ้ง** — ให้มี source เดียว + build step ที่ copy ตอน deploy (แม้แต่ `npm run deploy` ธรรมดาก็ยังดีกว่าใช้มือ). mirror ด้วยมือ = หนี้ทางเทคนิคที่จ่ายด้วยเงินเดือนพนักงานผิด.
- **แยกไฟล์ Admin Console** — อย่างน้อยแตกเป็น `index.html` + `app.js` + `styles.css` + โมดูลต่อหน้า (dashboard/payroll/timesheet/people/settings). ตอนนี้ cascade order เป็น "สัญญาที่มองไม่เห็น".
- **ไม่มีภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1) / ประกันสังคมแบบรายคน** — payroll คิด SSO เป็น policy แบนทั้งบริษัท, ไม่มี withholding tax แบบขั้นบันได. สำหรับผลิตภัณฑ์ payroll ไทย นี่คือ dealbreaker เชิงกฎหมาย/บัญชี.
- **RLS / สิทธิ์** — ควร audit Supabase RLS ให้ชัด (เคยมี advisor warnings). role model (owner/manager/finance/ops) ยังตื้น.

### QA Lead
- **ไม่มี E2E** — flow เงิน (preview → lock → pay → issue) ต้องมี integration test รันบน test tenant ทุก deploy. ตอนนี้ "UAT = เปิดดูเอง" ซึ่งไม่ scale และไม่กันการถดถอย.
- **Contract test เปราะ** — ย้ายเป็น assertion เชิงพฤติกรรม (เช่น Playwright: login → ออกสลิป → เช็กยอด) ไม่ใช่เช็ก substring.
- **ไม่มี observability** — error ฝั่ง client เงียบ (toast แล้วหาย), ไม่มี log รวม, ไม่มี Sentry.

### Senior Back-end
- Edge Function handler ก้อนใหญ่ไฟล์เดียว, การ validate อินพุตกระจัดกระจาย, audit เป็น best-effort (try/catch กลืน). สำหรับระบบการเงินควรมี audit ที่ **การันตีเขียนสำเร็จ** หรือ reject transaction.
- `admin_save_settings` รับ key อิสระ (no whitelist) — เสี่ยง settings เพี้ยน/ถูกยัด key ขยะ.

### Senior Front-end
- State เป็น global object + re-render ทั้งหน้า (`node.innerHTML=`) ทุกครั้ง — ใช้ได้ที่ data น้อย แต่จะช้าตอนพนักงานเยอะ. event handler ผูกใหม่ทุก render.
- Auto-refresh dashboard ทุก 6 วิ — เปลืองและทำ focus/scroll เด้ง.

---

## 2. รีวิวรายหน้าจอ + คะแนน

> เกณฑ์: 10 = ระดับ production enterprise, 7 = ดีพอใช้, 5 = ใช้ได้แต่มีปัญหาชัด, ≤4 = ต้องแก้ด่วน

### 2.1 Login
- **ดี:** เรียบ สะอาด เข้าใจง่าย
- **แย่/ยาก:** ไม่มี 2FA, ไม่มี rate-limit ที่ผู้ใช้มองเห็น, ลิงก์ "ตั้งค่าการเชื่อมต่อ" โผล่หน้า login ชวนงง
- **ควรเพิ่ม:** จำ session, แจ้งเตือนล็อกอินผิดหลายครั้ง
- UX **7** · UI **8** · Perf **9** · Workflow **7** · Maintainability **6**

### 2.2 Dashboard ("วันนี้")
- **ดี:** หลัง rework ล่าสุดอ่านง่ายขึ้นมาก — hero สถานะทีม + donut, KPI การ์ด, decision queue, ปฏิทินทีมมินิมอล (แถบ progress) ถือว่าสวยระดับใช้ได้จริง
- **แย่:** ประวัติการ rebuild 12+ ครั้งใน 3 วันสะท้อนว่าไม่มี design system — สี/ระยะ/การ์ดถูกนิยามซ้ำหลายเลเยอร์. auto-refresh 6 วิรบกวน. บาง label ยังซ้ำคำ (เคยเจอ "ลงเวลาครบครบ")
- **ควรลบ:** CSS/markup เก่าที่ไม่ใช้ (hr-*, ins-*, .tcd-state)
- **ควรรวม:** KPI การ์ด + hero chips ข้อมูลซ้ำกัน
- UX **7** · UI **7** · Perf **6** · Workflow **7** · Maintainability **4**

### 2.3 Timesheet ("บันทึกเวลา")
- **ดี:** มุมมองตารางทั้งเดือน (พนักงาน×วัน) + สลับหน้ารายวัน เพิ่งทำใหม่ — ตรงความต้องการ HR, พิมพ์ทั้งเดือนได้
- **แย่:** โหลด 4 API ต่อเดือน (attendance+payroll+settings+holidays) ทุกครั้งที่เปลี่ยนเดือน, ไม่ cache. data layer (loadPersonMonth/pmModel) ผูกกับ DOM id เฉพาะ เปราะ
- **ควรเพิ่ม:** กรองตามไซต์/แผนก, export ทั้งเดือนเป็น Excel, แก้เวลาย้อนหลังแบบมี audit (ตอนนี้แก้ได้แค่วันนี้)
- UX **7** · UI **7** · Perf **5** · Workflow **7** · Maintainability **5**

### 2.4 People & approvals ("ทีมและอนุมัติ")
- **ดี:** รวมพนักงาน+คิวอนุมัติไว้ที่เดียว, มี profile completeness
- **แย่:** ตาราง + row menu (⋯) + ปุ่ม inline ปนกัน, การลบ/ปิดใช้งานเคยสับสน (ผู้ใช้คาดว่า "ปิดใช้งาน" = ลบ). เพิ่งย้าย password ไปที่ลบ — ดีขึ้น
- **ควรรวม:** flow onboarding หลายสเตปให้ลื่นขึ้น (ชื่อ→จ่าย→บัญชี)
- UX **6** · UI **7** · Perf **7** · Workflow **6** · Maintainability **5**

### 2.5 Payroll run
- **ดี:** หลัง compact ล่าสุดกระชับขึ้น, period selector (1–วันนี้/เดือนก่อน) ฉลาด, ออกสลิปเหลือ 2 สเตป
- **แย่:** ตาราง 12 คอลัมน์กว้างมาก (ฐาน/OT เงิน/รวม/หัก/สุทธิ...) — บนจอเล็กล้น. flow lock/pay/issue ยังมี concept ซ้อน (lock snapshot vs live issue) ที่ผู้ใช้ทั่วไปงง
- **ควรลบ:** lock flow ที่ไม่ได้ surface แล้ว (dead) ถ้าไม่ใช้จริง
- **ควรเพิ่ม:** ภาษีหัก ณ ที่จ่าย, bank file export (จ่ายผ่านธนาคาร), ประวัติการจ่ายที่ค้นหาได้
- UX **6** · UI **6** · Perf **6** · Workflow **6** · Maintainability **5**

### 2.6 Advances / Invoices (เงินล่วงหน้า / ใบแจ้งหนี้)
- **ดี:** advances เป็น ledger มี state (รออนุมัติ→จ่าย→หัก), invoice มี VAT/โลโก้
- **แย่:** สอง feature นี้คนละโลกกับ payroll แต่อยู่เมนูเดียวกัน (การเงิน) — invoice ลูกค้าไม่เกี่ยวกับ workforce เลย, ควรแยกผลิตภัณฑ์
- **ควรเพิ่ม:** invoice — สถานะชำระ/ครบกำหนด/ติดตามหนี้ที่ชัดกว่านี้
- UX **6** · UI **6** · Perf **7** · Workflow **6** · Maintainability **5**

### 2.7 Settings ("ตั้งค่า")
- **แย่:** รวมทุกอย่าง (รอบจ่าย, SSO, OT policy, shortfall, late-absence, โลโก้บิล, เวอร์ชัน APK, factory reset) ในหน้าเดียว — หนักและอันตราย (ปุ่มทำลายล้างอยู่ปนกับตั้งค่าทั่วไป)
- **ควรแยก:** นโยบายบริษัท / ระบบ-เผยแพร่ / การกระทำที่กู้คืนไม่ได้ (destructive) เป็นโซนชัดเจน
- UX **5** · UI **6** · Perf **8** · Workflow **5** · Maintainability **5**

### 2.8 เอกสารพิมพ์ (สลิป / Timesheet)
- **ดี:** เพิ่งทำใหม่ — A4 มืออาชีพ, หัวจดหมาย, สรุป, ตารางเต็มเดือนแบ่งหน้าได้, ช่องเซ็น
- **แย่:** เปิดด้วย `window.open`+popup (โดน block ง่าย), ยังไม่ได้ทดสอบ print A4 จริง/ฟอนต์ไทย fallback
- **ควรเพิ่ม:** export PDF ฝั่ง server (ไม่ง้อ popup), ส่งสลิปเข้า APK พนักงานโดยตรง
- UX **7** · UI **8** · Perf **7** · Workflow **6** · Maintainability **6**

### 2.9 Employee APK (มือถือพนักงาน)
- **ดี:** check-in/out + GPS radius, แก้ timezone Bangkok แล้ว, flow เรียบ
- **แย่:** release แบบแมนนวล (อัป APK + แก้ version ใน Settings เอง), ยังไม่มี UAT บนเครื่องจริงหลายรอบ, note เวอร์ชันเคยค้างคำเก่า
- UX **7** · UI **7** · Perf **7** · Workflow **6** · Maintainability **5**

### คะแนนเฉลี่ยทั้งระบบ
UX **6.4** · UI **7.0** · Performance **6.6** · Workflow **6.3** · **Maintainability 5.1** ← จุดอ่อนที่สุด

---

## 3. ถ้าจะขายลูกค้าใหม่ จะออกแบบอย่างไร

1. **แยกเป็น 2 ผลิตภัณฑ์:** (A) Workforce/Payroll (B) Billing/Invoice — อย่ายัดรวม.
2. **Design System จริง** — token สี/ระยะ/ตัวอักษร/คอมโพเนนต์ชุดเดียว (เลิกนิยาม CSS ซ้ำ). หยุดแก้ตามสกรีนช็อตรายวัน ตั้ง design authority.
3. **สถาปัตยกรรมใหม่** — SPA แยกไฟล์/คอมโพเนนต์ (เช่น Vite + โมดูลต่อหน้า), source เดียว, build+deploy อัตโนมัติ (CI), staging + rollback.
4. **Payroll ถูกกฎหมายไทย** — ภาษีหัก ณ ที่จ่าย ขั้นบันได, ประกันสังคมรายคน, ภ.ง.ด., bank file, สลิปส่งเข้า APK.
5. **Role & Audit ระดับ Enterprise** — RBAC ชัด, dual-control สำหรับ action เงิน, audit ที่การันตีเขียน.
6. **คุณภาพ** — E2E flow เงินทุก deploy, observability (Sentry/log), test tenant.
7. **Onboarding ลูกค้า** — wizard ตั้งบริษัท/นโยบาย/นำเข้าพนักงาน (CSV) + ข้อมูลตัวอย่าง.

---

## 4. ลำดับความสำคัญในการแก้ไข

### 🔴 HIGH (ความเสี่ยงเงิน/ความถูกต้อง — ทำก่อน)
1. ลบ mirror ด้วยมือ → build step / ตรวจ sync อัตโนมัติใน CI (กัน mirror หลุด)
2. Deploy pipeline + staging + rollback ที่ทดสอบแล้ว (เลิก deploy ด้วยคนเดียวแบบแมนนวล)
3. E2E/integration test flow เงิน (preview→lock→pay→issue→สลิป) บน test tenant
4. ภาษีหัก ณ ที่จ่าย + ประกันสังคมรายคน (ถ้าจะเป็นผลิตภัณฑ์ payroll จริง)
5. Audit การเงินที่การันตีเขียน + RLS review

### 🟡 MEDIUM (คุณภาพ/บำรุงรักษา)
6. แตกไฟล์ Admin Console + ตั้ง Design System token ชุดเดียว, ลบ dead code (openPayslipDraftEditor, pmRenderRows, .tcd-state, hr-*/ins-*)
7. Settings แยกโซน destructive ออกจากตั้งค่าทั่วไป
8. Payroll table ลดคอลัมน์/responsive, เคลียร์ concept lock vs issue
9. Timesheet cache ข้อมูลเดือน + export Excel ทั้งเดือน
10. เปลี่ยน contract test (substring) → Playwright เชิงพฤติกรรม

### 🟢 LOW (ขัดเกลา)
11. ปิด/ปรับ auto-refresh dashboard 6 วิ ให้ฉลาดขึ้น
12. Export PDF ฝั่ง server แทน popup, ส่งสลิปเข้า APK
13. 2FA / แจ้งเตือนล็อกอินผิด
14. แยก Invoice เป็นผลิตภัณฑ์/โมดูลต่างหาก

---

## 5. สรุปสั้นสำหรับเจ้าของ
ของ "ใช้ได้จริง" และ UI รอบล่าสุดสวยขึ้นเยอะ — ปัญหาตัวจริงไม่ใช่หน้าตา แต่คือ **วิธี deploy, การไม่มี test พฤติกรรม, ไฟล์เดียว 4,000 บรรทัด, และการแก้ดีไซน์วนไม่จบ**. ถ้าจะขาย Enterprise ให้ลงทุนกับ 5 ข้อ HIGH ก่อน แล้วค่อยขัด UI — เพราะ UI สวยบนฐานที่เปราะ คือความเสี่ยงที่แพงที่สุด.
