# BVN Admin Total Redesign — Design

## Intent

Redesign the full BVN Workforce Operations Admin console so a manager can see the next operational decision, complete it, and return to the worklist without navigating through competing panels. The console remains an attendance and payroll system; no business rule, calculation, API action, or employee GPS behavior changes in this redesign.

## Scope

- In scope: all Admin Console routes in `admin_codex/index.html`: วันนี้, เวลาทำงาน, บุคคลและอนุมัติ, พนักงาน, งานรออนุมัติ, เงินเดือน, เงินล่วงหน้า, ค่าจ้างและ OT, ใบแจ้งหนี้, ตั้งค่า
- Out of scope: employee APK navigation and visual system, Supabase schema/API behavior, payroll calculations, and existing approval rules

## Design direction

- **Product:** a Thai back-office tool for attendance, approval, and payroll operations
- **Character:** exact, calm, accountable
- **World:** an operational ledger and signed financial document, not a consumer dashboard
- **Primary moment:** the active work queue and the selected employee record
- **Signature:** a small live-status dot, used only for actual attendance/presence state
- **Palette:** BVN ink/navy remains the single brand accent. Amber, green, and red are semantic status only. Neutral surfaces stay white/slate.
- **Type:** retain Sarabun/Tahoma for Thai readability; tabular figures for time and money. Do not adopt a Latin-first technical face from a generic dashboard recommendation.
- **Density and motion:** dense operational layout, 8px rhythm, 44px touch targets for actions, no decorative animation; only short focus/hover feedback and reduced-motion-safe transitions.

## Applied skill decisions

- **Taste 2.5.1:** use product-led hierarchy, equal content edges, one primary decision per visual state, quiet chrome, and no decorative filler. Its landing-page hero, stock-photo, and marketing conversion rules are intentionally excluded because this is an authenticated operational tool.
- **UI/UX Pro Max 2.15.0:** apply accessible contrast, keyboard focus, visible async feedback, mobile-safe table handling, bounded status labels, and dashboard density.
- **Superpowers 7.0.2:** preserve behavior through small reviewable tasks, explicit verification, and a design/plan gate before implementation.

## Page architecture

| Route | Primary question | New primary structure | Main action |
|---|---|---|---|
| วันนี้ | What must be handled now? | Status strip, priority queue, team register | ลงเวลาแทน / open queue |
| เวลาทำงาน | Whose record needs review? | Staff roster, selected-month detail, check-in policy | select employee / record time |
| บุคคลและอนุมัติ | Which person or request needs a decision? | Employee directory plus compact decision rail | add employee / review item |
| พนักงาน | Is employee master data ready? | Searchable register, readiness fields, profile drawer | add/edit employee |
| งานรออนุมัติ | What is the cost or consequence of approval? | Filtered queue, operational impact, decision controls | approve/reject |
| เงินเดือน | Is this payroll period ready to pay? | Period workbench, blockers, employee ledger, issue action | review period / prepare statement |
| เงินล่วงหน้า | What is owed and what will be deducted? | Advance ledger, payable state, employee history | record payment |
| ค่าจ้างและ OT | Which rule applies to whom? | Individual pay rates, company policy, exception calendar | set rate / save policy |
| ใบแจ้งหนี้ | What has been issued, is due, or is overdue? | Receivables register, totals, invoice detail | create invoice |
| ตั้งค่า | Which company policy drives the system? | Grouped configuration modules with consequence text | save policy |

## Interaction rules

1. A page begins with its context and one primary action, never a generic hero.
2. Lists are the default operational interface. Cards are reserved for totals, blockers, or selected-record summaries.
3. Destructive actions stay separated, require confirmation, and state their effect before submission.
4. A row selection changes a detail panel in place; it must not force a page transition.
5. Financial status is never inferred. Pending OT remains excluded until approval; estimated payroll remains labelled as estimated until payment data exists.
6. On narrow screens, tables scroll inside their own region or collapse deliberately; no page-wide horizontal overflow.

## Acceptance criteria

- Every route has one obvious page purpose and one primary action
- No page uses a decorative graph where a worklist or status count drives the next action better
- All time and currency figures use tabular numerals and consistent Thai labels
- Every interactive control is keyboard reachable with a visible focus state
- No label or badge wraps unpredictably; long content truncates safely without hiding a required action
- Desktop and narrow-width visual checks cover every Admin route
- Existing action names, backend calls, permission gates, and calculation behavior remain unchanged unless separately approved
