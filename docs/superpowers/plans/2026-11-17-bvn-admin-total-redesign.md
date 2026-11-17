# BVN Admin Total Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every Admin Console route around an operational decision and a consistent BVN ledger visual system without changing business rules.

**Architecture:** Keep `admin_codex/index.html` as the existing single-file application. Add route-scoped CSS and replace route render markup only; retain established helpers, API calls, permission gates, modal actions, and backend payloads. Use the existing Sarabun/Tahoma typography and BVN print-safe brand mark.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Supabase Edge Functions, existing Admin static server

**Spec:** `docs/superpowers/specs/2026-11-17-bvn-admin-total-redesign-design.md`

## Global Constraints

- No Supabase schema/API/calculation change in this redesign
- Maintain keyboard and permission behavior for existing actions
- Use one navy brand accent and semantic status colors only
- Keep all operational tables safe at 390px and desktop widths
- Validate JavaScript parsing and diff whitespace after each task

## Review Focus

- Long Thai names, reasons, and site labels must not cover row actions
- A finance-restricted user must not receive a visual affordance to restricted data
- Pending OT must not be styled or worded as payroll-ready
- Narrow-screen tables must scroll locally rather than expanding the page
- A selected employee must remain selected after a safe data refresh

### Task 1: Establish Admin visual primitives

**Files:**
- Modify: `admin_codex/index.html`
- Test: Admin inline JavaScript parse and browser-width checks

**Interfaces:**
- Consumes: existing CSS variables, `lineIcon`, button and panel classes
- Produces: route-scoped layout, focus, overflow, and mobile utility classes used by all route renderers

- [x] Add a documented BVN surface, spacing, status, list-row, and focus treatment without changing global action semantics
- [x] Add `prefers-reduced-motion` and visible keyboard focus coverage for new custom rows/buttons
- [ ] Run the inline JavaScript parse and visual checks at 1440px and 390px

### Task 2: Redesign operations routes

**Files:**
- Modify: `admin_codex/index.html` — `renderDashboard`, `renderOwner`, `loadPersonMonth`, `pmRenderRows`, `pmRenderDetail`
- Test: dashboard and work-time route render with active/inactive and empty data states

**Interfaces:**
- Consumes: `dashboard`, `admin_attendance_days`, `admin_get_settings`, `admin_preview_payroll`, `admin_list_holidays`
- Produces: priority-first dashboard and selected-person work-time ledger

- [x] Keep live attendance classification and manual clock actions unchanged while simplifying the dashboard hierarchy
- [x] Keep employee-month calculations unchanged while presenting roster/detail/site policy as one ledger workspace
- [ ] Verify empty team, late employee, selected employee, and narrow-width states

### Task 3: Redesign people and approvals routes

**Files:**
- Modify: `admin_codex/index.html` — `renderPeople`, `renderEmployees`, `employeeDialog`, `renderApprovals`
- Test: employee search, employee profile edit, pending leave, pending OT, and decided request states

**Interfaces:**
- Consumes: employee, leave, time request, identity request, and approval helpers
- Produces: master-data-first employee view and impact-aware approval queue

- [x] Make employee profile completeness, employment status, and primary edit path understandable without adding required fields
- [x] Keep request approve/reject behavior unchanged and expose payroll impact only from known status/date facts
- [ ] Verify role restrictions and long-name row handling

### Task 4: Redesign financial workflow routes

**Files:**
- Modify: `admin_codex/index.html` — `renderPayroll`, `renderAdvances`, `renderPayrules`, `renderInvoices`, statement/editor dialogs
- Test: payroll preview with blockers, approved/pending OT, advance deduction, pay rule absence, invoice overdue state

**Interfaces:**
- Consumes: existing financial preview, lock, payment, invoice, advance, and rule APIs
- Produces: period-led financial workbench with clear preconditions and status

- [x] Preserve all payroll controls; make blockers, employee review, and next action visually ordered
- [x] Present advances as a deduction ledger, pay rules as personal/company layers, and invoices as receivables workflow
- [ ] Verify finance-restricted, no-data, incomplete-time, and paid-period states

### Task 5: Redesign configuration and validate the complete console

**Files:**
- Modify: `admin_codex/index.html` — `renderSettings` and configuration dialogs
- Modify: `admin_codex/UX_AUDIT.md`
- Modify: `AI_COLLAB_BRIEF.md`
- Test: route-by-route authenticated visual UAT checklist

**Interfaces:**
- Consumes: existing settings payloads and dialogs
- Produces: grouped configuration experience and auditable release evidence

- [x] Group settings by operational purpose, consequence, and destructive risk without changing saved keys
- [ ] Run static syntax/diff checks and browser checks for all ten Admin routes at desktop and narrow widths
- [x] Record passing evidence and remaining authenticated-UAT gaps in the brief/audit
