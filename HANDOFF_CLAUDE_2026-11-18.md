# Handoff → Codex (Claude, 2026-11-18)

สรุปงานที่ Claude ทำต่อจาก WIP ของ Codex ในรอบนี้ และจุดที่ต้องระวังตอนทำต่อ.
ที่มาแบบละเอียด (scope/files/validation/limitation/next) อยู่ใน `AI_COLLAB_BRIEF.md` 4 แถวล่าสุด.

## Commits รอบนี้ (branch `main`)
- `d94e5e7` — **ออกสลิป + ยืนยันรหัสผ่านผู้ดูแล + เลือกงวด** (back-port mirror → source)
- `90b41e1` — **Payroll run กระชับ + Timesheet ตารางทั้งเดือน + ออกบิลอย่างเดียว**
- `92871da` — **ปฏิทินทีม Dashboard แบบมินิมอล**

## สิ่งที่เปลี่ยน (console เท่านั้น — ไม่แตะ APK)

### 1. Backend — `admin_issue_payslip` (สำคัญสุดเรื่อง mirror)
- `supabase/functions/bvn-api/index.ts` (source) กับ `supabase/functions/swift-handler/index.ts` (deploy mirror) **ต้อง byte-identical เสมอ** — เช็กด้วย `diff` ก่อน commit.
- Codex เคยอัปเดต handler ในฝั่ง `swift-handler` (มี live-preview branch สำหรับงวดปัจจุบันที่ยังไม่ล็อก) แต่ `bvn-api` ยังมีแค่สาขางวดที่ล็อก → ผม back-port ให้ตรงกันแล้ว.
- `admin_issue_payslip` รับได้ 2 แบบ: มี `payrollId` (งวดล็อกแล้ว ใช้ snapshot) หรือส่ง `startDate`/`endDate` + `payrollId=""` (คำนวณสดจาก `previewPayroll`, บล็อกคนที่เวลาไม่ครบ). Re-auth = รหัสผ่านของ admin ที่ล็อกอินอยู่ (role FIN) เท่านั้น เขียน audit `payslip_issued`.
- **ยังไม่ deploy** — Owner ต้อง redeploy `swift-handler` ถึงจะใช้งานจริงได้.

### 2. Payroll run (`renderPayroll` / `doPreview`)
- ตัด flow 3 ขั้น + notice ยาวออก, header กระชับ, selector เป็นแถว inline (preset 1–วันนี้ / เดือนก่อนเต็มเดือนคงเดิม — ดู `payrollRange()`).
- **ลดขั้นตอนออกสลิปเหลือ 2**: `payrollTimesheetDialog` และ `readyPayslipReviewDialog` เรียก `issuePayslipWithAdminPassword(...)` ตรง ๆ (ส่ง period + employeeId).
- ⚠️ `openPayslipDraftEditor` **ยังอยู่ในซอร์สแต่ไม่ถูกเรียกแล้ว** (dead code ปลอดภัย) — ถ้าจะลบให้เช็กว่าไม่มีที่อื่นเรียก.

### 3. Timesheet (`renderOwner`) — ตารางทั้งเดือน
- เลิก strip pane; หน้าเป็น 2 มุมมองสลับด้วยปุ่ม `[data-tsview="month"|"day"]`:
  - **month** (ค่าเริ่มต้น): `pmRenderMatrix()` ตารางพนักงาน × วัน (ใช้ data layer เดิม `loadPersonMonth`/`pmModel`/`pmRange`), เลือกคน → `pmRenderDetail()`, คลิกช่องวัน → `openAttendanceRecordDialog`.
  - **day**: ledger รายวันเดิม (ลงเวลาแทน / filter / CSV) — IDs เดิมครบ (`ownEmp`, `ownIn/ownOut`, `attStart/attEnd`, `data-att-period`, `data-att-filter`, `attLedgerStatus`, `ownAtt`).
- `loadPersonMonth` เปลี่ยน host จาก `#pmRows` → `#pmMatrix` และเรียก `pmRenderMatrix()` แทน `pmRenderRows()/pmRenderBest()`.
- ⚠️ `pmRenderRows` / `pmStripHtml` / `pmRenderBest` **ยังอยู่แต่ไม่ถูกเรียก** (dead code).
- class `owner-time-workspace` ย้ายไปอยู่บน day-view (contract test ต้องการ token นี้).

### 4. ปฏิทินทีม Dashboard (`dashboardTeamCalendarHtml`)
- แต่ละช่อง = เลขวัน + แถบ progress บาง (complete/expected) + คำสั้น (`ครบ/ทำงาน/ตรวจ/หยุด/ลา`). รายละเอียดเต็มอยู่ใน `title` (hover).
- ⚠️ CSS `.tcd-state` / `.tcd-meta` เดิมยังอยู่แต่ markup ไม่ emit แล้ว (ใช้ `.tcd-foot/.tcd-bar/.tcd-fig/.tcd-n/.tcd-today` แทน).
- `data-team-day` + `openTeamDayDialog` คงเดิม.

## กฎที่ต้องรักษา
- แก้ `previewPayroll`/handler ใด ๆ → sync `bvn-api` ↔ `swift-handler` ให้ byte-identical.
- รัน `node tools/admin_redesign_contract_test.mjs`, `node tools/payroll_period_policy_test.mjs`, `node tools/shortfall_policy_test.mjs` ให้ผ่านก่อน commit.
- `payroll_shortfall_policy` default = `none` (ไม่เปลี่ยนพฤติกรรม) — มี server-side validation แล้ว.
- commit message ลงท้าย `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## ค้างให้ Owner (ไม่ใช่งานโค้ด)
1. Redeploy `swift-handler` เพื่อเปิดใช้ `admin_issue_payslip`.
2. Publish `admin_codex/index.html` + hard-refresh console.
3. UAT: Payroll run → ตรวจสลิป → ออกสลิป → ใส่รหัสผ่าน (ยังไม่เคยรันจริง เพราะต้องใช้รหัส Owner + เขียน audit จริง); Timesheet สลับเดือน/มุมมอง; ปฏิทินทีมหลายเดือน.

## 2026-11-19 — console split into build sources
`admin_codex/index.html` is now generated. Edit `admin_codex/src/{app.css,app.js,index.template.html}` then run `node tools/build_admin.mjs`. `tools/admin_build_fresh_test.mjs` guards against drift. Do NOT hand-edit index.html. Hosting is unchanged (still one file).
