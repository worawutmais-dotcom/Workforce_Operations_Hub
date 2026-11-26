# Enterprise Software Audit — BVN Workforce Operations Hub
วันที่ 26 พ.ย. 2569 · บทบาท: Enterprise Software House (PM · Product/UX/UI · Architect · App/Backend/DB Eng · Security · QA Lead · Performance · End User)

> ขอบเขตหลักฐาน: ตรวจจาก source จริง — `admin_codex/src/{app.js,app.css,index.template.html}`, backend Edge Function `supabase/functions/{bvn-api,swift-handler}/index.ts`, guard/policy tests ใน `tools/`, และการใช้งานจริงทุกหน้าจอผ่าน live preview + backend ที่ deploy แล้ว. ส่วนที่ไม่ได้ทดสอบจะระบุ **N/A** หรือ "ไม่ทราบ" ไม่เดา.

---

## 3. Software Discovery (ข้อเท็จจริง)

| หัวข้อ | ข้อมูล |
|---|---|
| ชื่อ | BVN Package Operations Console (repo: Workforce Operations Hub) |
| ประเภท | Internal Enterprise Software — ระบบ HR/ลงเวลา/เงินเดือน **single-company** (web admin) + แอปพนักงาน (mobile) |
| Stack (admin) | Vanilla JS SPA ไฟล์เดียว — build จาก `src/app.{css,js}` + template → `admin_codex/index.html` (~684KB). ไม่มี framework/bundler/component system |
| Stack (backend) | Supabase Edge Function (Deno/TypeScript) `swift-handler` (mirror ของ `bvn-api`) + **legacy Google Apps Script** gateway |
| Database | Supabase Postgres, ~22 ตาราง, **RLS เปิดทุกตาราง** (deny-all ต่อ anon; เข้าถึงผ่าน service_role ใน Edge Function เท่านั้น) |
| Mobile | Flutter (`employee_mobile`), อัปเดตผ่าน APK (version action + Drive) |
| Realtime | Supabase broadcast — ส่งสัญญาณ "refresh" เท่านั้น (ไม่ส่ง row/ข้อมูลจริง) |
| ผู้ใช้ | พนักงานร้าน/โรงงาน (ตัวอย่าง 11 คน) · admin roles: owner/manager/operations/finance |
| วัตถุประสงค์ | ลงเวลา GPS → ตรวจ Timesheet → คำนวณเงินเดือน + ออกสลิป; OT/ลา; ทะเบียนพนักงาน; ตั้งค่า/วันหยุด |
| Deploy | admin: GitHub Pages จาก `main` (live artifact ตรวจตรง source เมื่อ 26 พ.ย. 2569) · backend: Supabase CLI/MCP · CI: GitHub Actions รัน guard tests |
| จำนวนผู้ใช้คาด | ไม่ทราบ (ออกแบบระดับร้านเดียว หลักสิบคน) |

**หมายเหตุสำคัญ:** โปรเจกต์ยอมรับเองว่า **ยังไม่ใช่ระบบ payroll/บัญชีที่ครบตามกฎหมาย**

---

## 4. Comprehensive Audit (10 ด้าน)

### A. Product
แก้ปัญหาจริง: ลงเวลา GPS + คำนวณเงินเดือนไทย (OT/วันหยุด/ปกส./หักเบิก/มาสายสะสม) + ออกสลิป — เข้าใจโดเมน HR ร้านค้าไทยลึก. จุดเด่น: นโยบายคำนวณฝั่ง server เป็น authoritative (APK/Admin คิดต่างไม่ได้). ฟีเจอร์ไม่จำเป็นถูกตัดแล้ว (invoice, เบิกเงิน). คุ้มพัฒนาต่อ **เฉพาะถ้าแก้ชั้น frontend + commercial layer**.

### B. UX
- โฟลว์หลักออกแบบดี (stepper เลือกงวด→ตรวจ→ปรับ→ออกสลิป). หลัง retheme อ่านง่าย มืออาชีพ.
- จุดอ่อน: Dashboard แน่นมาก (hero + 4 tiles + คิวงาน + คิวอนุมัติ + ทีมวันนี้ + กราฟ + เงินเดือน + จุดเช็กอิน + ความพร้อม) — scroll ยาว แย่งโฟกัส. Settings ยัดหลายเรื่องหน้าเดียว. หน้า audit ซ่อนเข้าไม่ถึง.

### C. UI
Navy+Teal + ตัวเลข mono + สถานะสีสด (เขียว/ส้ม/แดง/น้ำเงิน) — professional. **ปัญหาเชิงระบบ:** สไตล์มาจาก CSS หลายชั้นทับกันด้วย `!important` (component เดียวนิยามซ้ำ 5+ ครั้ง) → แก้ UI ครั้งถัดไปต้อง "append ชั้นใหม่" แทนการแก้ของเดิม = หนี้. Accessibility: ตัวอักษร 10px + พึ่งสีล้วนบางจุด เสี่ยง WCAG.

### D. Architecture
- **Frontend = monolith 1 ไฟล์** สร้าง DOM ด้วย `innerHTML`+template string, ไม่มี component/state management, XSS surface พึ่ง `esc()`. **Maintainability ต่ำสุด**.
- Backend: dispatch ผ่าน object `H{}` + `verify(role)` ต่อ action, service_role DB — โครงเรียบง่ายอ่านได้. แต่ **backend คู่** (Supabase + Apps Script) = two sources of truth.
- Build pipeline มี guard test (freshness + mirror byte-identical) — ดี.

### E. Performance
- Dashboard ยิง API 8+ ครั้ง/โหลด; เห็น spinner; หน้าเงินล่วงหน้าเคยช้า. ไม่มี caching/pagination (นอกจาก `_dashSig`). `previewPayroll` โหลดช่วงเต็ม. index.html 684KB ไฟล์เดียว ไม่ code-split. Edge Function มี cold start. **ไม่ได้วัดเป็นตัวเลขจริง (N/A เชิง metric)** — ประเมินจากโครงสร้าง/การสังเกต.

### F. Security (ตรวจจาก source)
**ดี:** PBKDF2-SHA256 (`verifyPw`), อัปเกรด plaintext seed อัตโนมัติหลัง login สำเร็จ, session 12 ชม., throttle login 5 ครั้ง/ล็อก 15 นาที, **RBAC ฝั่ง server** (`verify(OPS/FIN)`), **RLS เปิดทุกตาราง**, ลบพนักงานถาวรต้อง re-auth รหัส owner.
**ช่องโหว่/ข้อสังเกต:**
- `Access-Control-Allow-Origin: *` + `Allow-Headers: *` — กว้างเกิน (auth เป็น token ไม่ใช่ cookie จึง CSRF ต่ำ แต่เป็น smell)
- `verify_jwt:false` → ฟังก์ชันเรียกได้สาธารณะ, **ไม่มี rate-limit** นอกจาก login → DoS surface
- session token เก็บใน `localStorage` + DOM สร้างด้วย `innerHTML` → XSS surface
- **Audit ไม่ครบ:** `audit()` บันทึกเฉพาะ `FINANCIAL_AUDIT_ACTIONS` → การ **แก้/ลบเวลา (attendance_set/clear) ไม่ถูกบันทึกใน `audit_log`** (เก็บแค่ data trail ผ่าน void rows ไม่มี log ว่าใครแก้) — **ควรแก้**
- ยังไม่ได้ทำ penetration test → **ไม่สรุปว่า "ปลอดภัย"**

### G. Workflow
โฟลว์เดียว (ลงเวลา→ตรวจ→อนุมัติ→เงินเดือน→สลิป) กระจายหลายเมนูแต่มี bridge. จุดเสียเวลาเดิม: แก้เวลาต้องหลายคลิก (แก้แล้วด้วย dialog + ตาราง inline). Settings/Dashboard overload. กรอกซ้ำไม่มาก.

### H. Database
- Event-sourced `attendance_log` (check_in/check_out + validity accepted/voided) — ออกแบบดี, แก้/ลบ = void+insert คง trail.
- RLS เปิด, ความสัมพันธ์ชัด. **ไม่มี `company_id`/tenant isolation → single-tenant**. ไม่มี data retention policy (มี archive-before + purge >6 เดือน). Query ส่วนใหญ่ indexed โดย employee_id/date (สันนิษฐาน — ไม่ได้ตรวจ index จริง → N/A).

### I. QA & Reliability
มี guard tests + policy tests (payroll period/shortfall/late-absence/OT multiplier/draft-review) + build-fresh + mirror-sync + realtime contract, รันผ่าน CI ทุก push — **ดีกว่าค่าเฉลี่ย internal tool**. แต่ **ไม่มี e2e/UI test (Playwright), ไม่มี visual regression, ไม่มี integration test ครอบ backend**. app.js มีแค่ parse check.

### J. Deployment & Maintenance
- Admin console ใช้ GitHub Pages จาก `main`; วันที่ตรวจ live `index.html` ตรงกับ artifact ใน repo หลัง normalize line ending. ความเสี่ยง deploy ด้วยมือถูกปิดแล้ว แต่ยังควรเฝ้าดูสถานะ Pages deployment และ cache หลัง release.
- Backend deploy = CLI (ไฟล์ byte-perfect) — ดี แต่ต้องมี token/ติด PowerShell policy
- monitoring/logging นอกระบบ: minimal. documentation: README สั้น + AI_COLLAB_BRIEF (ภายใน)

---

## 5. Screen-by-Screen (สรุปคะแนน)

| หน้าจอ | UX | UI | Perf | Workflow | Maintain |
|---|:--:|:--:|:--:|:--:|:--:|
| Login | 8 | 8 | 9 | 7 | 6 |
| Dashboard | 7 | 8 | 5 | 7 | 3 |
| Timesheet (รายคน + ปฏิทิน/ตารางแก้ไข) | 8 | 8 | 6 | 8 | 4 |
| Payroll run | 7 | 8 | 6 | 8 | 4 |
| ค่าจ้าง · OT | 7 | 7 | 6 | 7 | 4 |
| Employee | 7 | 8 | 6 | 7 | 4 |
| ตั้งค่า | 6 | 7 | 7 | 6 | 4 |
| Modals (ปฏิทิน/แก้เวลา/อนุมัติ) | 7 | 7 | 7 | 7 | 4 |

**ตัวอย่าง Problem Report (รูปแบบเต็ม):**
- **Problem:** CSS override layering ด้วย `!important` หลายชั้น · **Evidence:** summary tile นิยามซ้ำที่ ~บรรทัด 1541/1685/2080 + vivid layer ที่ต้อง append · **Root Cause:** ไม่มี design-token/component system, แก้โดยทับชั้นใหม่ · **Impact:** ทุกฟีเจอร์ UI ใหม่ช้าลง เสี่ยง regression · **Solution:** ยุบเหลือ token เดียว + rebuild เป็น component · **Priority:** HIGH
- **Problem:** แก้/ลบเวลาไม่ลง `audit_log` · **Evidence:** `audit()` return early ถ้าไม่ใช่ `FINANCIAL_AUDIT_ACTIONS`; `attendance_set/clear` ไม่อยู่ในชุด · **Root Cause:** รายการ action ใหม่ไม่ถูกเพิ่มในชุด audit · **Impact:** ตรวจสอบย้อนหลังไม่ได้ว่าใครแก้เวลา (กระทบความน่าเชื่อถือเงินเดือน) · **Solution:** เพิ่ม `attendance_set`/`attendance_clear` ในชุด audit หรือแยกตาราง attendance audit · **Priority:** HIGH
- **Problem:** ยังไม่มี automated browser UAT หลัง Pages deploy · **Evidence:** build/source sync ผ่าน แต่ยังไม่มี Playwright flow ที่ล็อกอินและตรวจ workflow จริง · **Impact:** หน้า live อาจ render ได้แต่ flow สำคัญพังโดย guard test ไม่จับ · **Solution:** เพิ่ม browser smoke test กับบัญชี UAT/tenant ทดสอบ · **Priority:** HIGH

---

## 6. Feature Audit

| ฟีเจอร์ | ตัดสิน | เหตุผล |
|---|---|---|
| ลงเวลา GPS (mobile) | KEEP | core |
| Timesheet review + แก้/ลบเวลา (dialog+ตาราง) | KEEP | เพิ่งทำ, จำเป็น |
| Payroll calc (OT/ปกส./มาสายสะสม/ไม่ครบกะ) | KEEP | จุดแข็ง, server-authoritative |
| ออกสลิป | KEEP | core |
| OT/ลา อนุมัติ | IMPROVE | รวมเป็น Action Inbox เดียว |
| Dashboard | IMPROVE | ลดของบนหน้า, รวมคิวงาน+คิวอนุมัติ |
| Settings | MERGE/IMPROVE | ทำเป็นแท็บ (Company/Policy/Holidays/App/System) |
| Timesheet + Payroll + OT | MERGE | เป็น Payroll Workspace เดียว |
| เบิกเงิน / Invoice | REMOVE (ทำแล้ว) | ตัดตาม APK; เก็บ backend dormant |
| Audit log page | ADD (surface) | มีแต่ซ่อน — ต้องเปิดใช้ + บันทึกให้ครบ |
| Export (PDF/Excel) payroll/employee/audit | ADD | จำเป็นเชิงพาณิชย์ |
| Multi-company + RBAC UI + License | ADD | สำหรับขายหลายลูกค้า |
| Browser smoke test หลัง deploy | ADD | ยืนยัน login และ workflow บน Pages จริง |

---

## 7. Workflow Redesign (Payroll)
**Current:** ลงเวลา(APK) → [Dashboard เห็นสถานะ] → Timesheet ตรวจ/แก้เวลา → Approvals อนุมัติ OT/ลา → Payroll run คำนวณ/ปรับ → ออกสลิป — กระจาย 3–4 เมนู ผู้ใช้กระโดดไปมา.
**Problems:** หั่นเป็นหลายเมนู, สถานะซ้ำหลายที่, ต้องจำว่าอนุมัติ OT ก่อนถึงจะเข้าเงินเดือน.
**Proposed:** รวมเป็น **"Payroll Workspace"** หน้าเดียว 4 step ภายใน (เลือกงวด → ตรวจ/แก้เวลา (คิวค้าง + ตาราง) → อนุมัติในที่เดียว → ออกสลิป) + **Action Inbox** เดียวบน Dashboard รวมทุกงานค้าง.
**Expected:** คลิกน้อยลง, ไม่ต้องสลับเมนู, สถานะแหล่งเดียว, พลาดน้อยลง. (Flowchart แนบในแชต)

---

## 9. Commercial Readiness

| เกณฑ์ | สถานะ |
|---|---|
| Multi-Company / Tenant isolation | ❌ single-tenant (ไม่มี company_id) |
| Multi-User / RBAC (server) | ✅ RBAC ดี / ⚠️ UI จัดการ role ยังไม่เต็ม |
| Subscription / License | ❌ |
| Customer config | ⚠️ settings ระดับร้านเดียว |
| DB scalability | ⚠️ single-tenant, ยังไม่วัด index |
| Backup & recovery | ⚠️ archive/purge มี, DR policy ไม่ชัด |
| Audit logs | ⚠️ เฉพาะการเงิน (ขาด attendance) |
| Auto-update (APK) | ✅ |
| Error monitoring | ❌ minimal |
| Deployment (admin) | ✅ GitHub Pages จาก `main`; ⚠️ ยังไม่มี browser smoke test หลัง deploy |
| Documentation | ⚠️ ภายใน |

**สถาปัตยกรรมแนะนำ:** เริ่ม **Hybrid** — multi-tenant ด้วย `company_id` + RLS per-tenant (schema เดียว หลายบริษัท) สำหรับลูกค้าเล็ก/กลาง; แยก DB ให้ลูกค้าใหญ่ที่ต้องการ isolation. ไม่จำเป็นต้อง full isolate ทุกราย.

---

## 11. Final Scorecard

| ด้าน | คะแนน |
|---|:--:|
| Product Quality | 7 |
| UX | 7 |
| UI | 8 |
| Performance | 5 |
| Architecture | 4 |
| Security | 6.5 |
| Workflow | 7 |
| Database | 6 |
| Maintainability | 3 |
| QA & Reliability | 5 |
| Commercial Readiness | 3 |
| **Overall** | **≈ 5.5 / 10** |

- **Strengths:** โดเมน payroll ไทยแม่น (server-authoritative), RLS + RBAC + PBKDF2 + throttle, guard/policy tests + CI, UI หลัง retheme ดูโปร, attendance event-sourced.
- **Critical Issues:** (1) frontend monolith + CSS !important = maintainability 3 (2) ไม่มี browser UAT หลัง deploy (3) attendance edit ต้อง UAT ยืนยัน audit_log จริง (4) single-tenant/no license = ขายหลายรายไม่ได้.
- **Major Weaknesses:** performance (API เยอะ/ไม่ caching), dual backend, ไม่มี e2e test, monitoring ต่ำ.
- **Technical Risks:** หนี้ CSS/monolith ทำให้ทุกฟีเจอร์ใหม่ช้า+เสี่ยง regression. **Commercial Risks:** ต้องทำ multi-tenant+billing ก่อนขาย.
- **Release Readiness:** ✅ ใช้งานภายในร้านเดียวได้เลย · ❌ ยังไม่พร้อมขายเชิงพาณิชย์.

---

## 12. Development Roadmap

**PHASE 1 — Critical Fixes** (HIGH)
- Browser smoke test หลัง Pages deploy · M · ปิดช่อง "หน้า live เปิดได้แต่ workflow ใช้ไม่ได้" · AC: login + Dashboard + Timesheet UAT ผ่านบน Pages ทุก release
- บันทึก audit การแก้/ลบเวลา · S · เพิ่ม attendance_set/clear ใน audit (หรือตารางแยก) · AC: ทุกการแก้เวลามี actor+time
- Rate-limit Edge Function + ทบทวน CORS · M · ลด DoS/smell
- Secret/session hardening (พิจารณา httpOnly/refresh, ลด XSS surface)

**PHASE 2 — UX/UI** (MEDIUM)
- ยุบ CSS เหลือ **design-token เดียว** (ลบ !important layering) · L · ปลด maintainability blocker
- รวม **Payroll Workspace** + **Action Inbox** · L
- Settings แบบแท็บ · M · Accessibility audit (ขนาด/contrast) · S

**PHASE 3 — Architecture & Performance** (MEDIUM/HIGH)
- Rebuild frontend เป็น **component SPA (React/Svelte + Vite)** บน token เดียว · XL
- ลด API call Dashboard + caching + pagination · L
- เลิก Apps Script เหลือ backend เดียว · M

**PHASE 4 — QA & Security** (MEDIUM)
- e2e (Playwright) + visual regression + integration test backend · L
- Pen-test + error monitoring (Sentry) · M

**PHASE 5 — Commercial** (สำหรับขาย)
- Multi-tenant (`company_id` + RLS per-tenant) · XL
- License/subscription + customer onboarding + RBAC UI · XL
- Export (PDF/Excel), documentation, payroll compliance (ภงด./e-slip/bank file) · XL

---

## 13. Final Recommendation (ตรงไปตรงมา)

1. **ลงทุนต่อไหม:** ใช่ — โดเมน/ตรรกะเงินเดือน + security ฐานดีพอจะต่อยอด
2. **พร้อมขายไหม:** ยัง — single-tenant + หนี้ frontend
3. **เขียนใหม่ทั้งหมด:** เฉพาะ **frontend (app.js/app.css)** → component SPA + token เดียว
4. **เก็บไว้:** **Backend Edge Function + DB schema + business logic + guard/policy tests** — ดีและเทสต์แล้ว
5. **ไม่คุ้มพัฒนาต่อ:** Apps Script เดิม, invoice/เบิกเงิน dormant (ลบทิ้งได้)
6. **แก้เร่งด่วน:** browser UAT หลัง deploy, ยืนยัน attendance audit ในฐานข้อมูล, monitoring error
7. **ถ้าทำ commercial:** เพิ่ม multi-tenant + license + RBAC UI + export + compliance
8. **สั่ง Developer สิ่งแรก:** เพิ่ม **browser smoke test หลัง deploy** แล้วตามด้วย **ยุบ CSS เป็น token เดียว**

### แนวทาง: **REFACTOR**
- **เทคนิค:** backend/DB/logic ดีอยู่แล้ว (ไม่ต้อง rebuild); หนี้อยู่ที่ frontend architecture + commercial layer → refactor frontend + เพิ่ม multi-tenant พอ ไม่ต้อง rebuild ทั้งระบบ
- **ธุรกิจ:** เก็บ IP โดเมนเงินเดือนไทยที่แม่นไว้, ลงทุนเฉพาะชั้นที่เป็นหนี้
- **ต้นทุน:** REBUILD แพง/เสี่ยงทิ้งตรรกะที่เทสต์แล้ว; REFACTOR คุ้มกว่า
- **ความเสี่ยง:** ถ้า CONTINUE (ต่อ monolith เดิม) หนี้จะโตเร็วกว่ารายได้

---

## 14. Evidence & Limitations
- สรุป code/backend/security อ้างจาก source ที่อ่านจริง (ระบุไฟล์/บรรทัด).
- **Performance เป็นเชิงโครงสร้าง ไม่ใช่ metric วัดจริง (N/A เชิงตัวเลข).**
- **ยังไม่ได้ pen-test** → ไม่สรุปว่า "ปลอดภัย".
- **ไม่ได้ตรวจ DB index จริง / ไม่ได้ทดสอบ concurrent-user load.**
- business logic สำคัญถูกรักษาไว้ (ไม่เสนอเปลี่ยนโดยไม่ประเมินผลกระทบ).
