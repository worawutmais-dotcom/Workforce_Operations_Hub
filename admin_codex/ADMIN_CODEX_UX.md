# BVN Package Admin Codex — UX/UI Standard

## Product promise

An Admin must be able to open the system, know what requires a decision, act
without navigating through technical concepts, and leave an auditable record.
The interface is Thai-first and uses operational language, not database/module
language.

## Navigation

| Menu | User question it answers | Primary action |
|---|---|---|
| วันนี้ | วันนี้ต้องทำอะไร | ลงเวลาแทนพนักงาน |
| เวลาทำงาน | เวลาใครผิดหรือไม่ครบ | ตรวจ/แก้บันทึกอย่างมี audit |
| พนักงาน | ต้องเพิ่มหรือจัดการใคร | เพิ่มพนักงาน |
| งานรออนุมัติ | อะไรรอการตัดสินใจ | อนุมัติ/ไม่อนุมัติพร้อมเหตุผล |
| เงินเดือน | งวดนี้ตรวจถึงไหนแล้ว | พรีวิวก่อนล็อกงวด |
| ค่าจ้างและ OT | ใครใช้อัตราใด | แก้ไขค่าจ้างอย่างมีผลเฉพาะอนาคต |
| เงินล่วงหน้า | มีรายการค้างจ่ายหรือไม่ | อนุมัติ/บันทึกจ่าย |
| ใบแจ้งหนี้ลูกค้า | ลูกค้ารายใดยังต้องติดตาม | ออกใบแจ้งหนี้ |
| ตั้งค่าระบบ | กติกาหรือสิทธิ์ใดต้องแก้ | บันทึกการตั้งค่า |

## Non-negotiable UX rules

1. One page has one obvious primary action.
2. Never label missing attendance as absence without an approved schedule rule.
3. Any irreversible action shows scope, amount/date, actor and consequence.
4. Passwords, access tokens and stored hashes are never displayed in tables.
5. Empty, loading and error states must tell the Admin what to do next.
6. Financial values use Thai baht, date ranges are explicit, and preview is never
   presented as paid or final.
7. Colour supports status but never carries its meaning alone.

## Screen behaviour

### Today

Shows only operational status: attendance, pending decisions, exceptions and
overdue invoices. The employee attendance board opens a calendar; a payslip is
enabled only when a real payroll-preview line exists.

### Employees

Shows identity, role, location policy and active state. Password recovery is a
reset workflow; existing passwords/hashes are not readable.

### Work time and approvals

Raw attendance is immutable. Corrections, manual Admin attendance and approvals
always create an audit trail and must show their source.

### Payroll and invoices

Use a clear state progression: Preview → Review exceptions → Lock snapshot →
Export/print. Invoice follows Draft → Issued → Paid/Void. The UI must reject
unsupported transitions rather than allow Admins to guess.

Payroll must present this progression as a compact three-step guide above the
date selector, not as a large promotional banner. The warning for incomplete
attendance must link the Admin to `เวลาทำงาน`; it must never imply that the
employee is absent or silently exclude a day without explaining why.

### Colour and density

- Light mode: white surfaces, neon-green for product identity and positive
  states, orange for the most visible action/warning, and near-black
  typography. Do not paint every control neon green.
- Dark mode: near-black surfaces with the same neon-green/orange hierarchy.
  Do not mix in legacy blue panels, blue table rows, or unrelated green
  document headers.
- Keep task guides to one line, cards compact, and reserve large visual areas
  for data that drives a decision. Empty state is a useful instruction, not
  decorative whitespace.

The normal application shell uses a compact 13px reading scale, narrower
navigation, tighter table rows and reduced card/modal padding. Financial print
documents are deliberately excluded: a payslip or customer invoice must remain
legible on paper and cannot inherit compact-screen typography blindly.

### Keyboard and focus behaviour

- A keyboard user can skip the fixed navigation and land on the main content.
- Page changes update the current navigation state and move focus to the page
  landmark instead of leaving it on an obsolete menu item.
- A dialog takes focus when it opens, keeps Tab inside the dialog, closes with
  Escape, and restores focus to the trigger. Toasts announce status without
  stealing focus.

## Acceptance checklist before replacing the baseline

- Test every primary action with a non-production employee.
- Test desktop width and a narrow browser width.
- Confirm all destructive actions have a readable confirmation.
- Confirm an empty record, API failure and slow load are distinguishable.
- Confirm employee/admin password values cannot be viewed after creation.
- Confirm each flow returns to a useful next action after completion.
- Confirm keyboard-only navigation, modal Tab/Escape behaviour and the visible
  focus ring on the login, Dashboard and a destructive confirmation.
