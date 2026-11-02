# AI Collaboration Brief — Workforce Operations Hub

## Product scope

Private, browser-based operational prototype for employee attendance, payroll preparation, invoice tracking, and management decision-making. It uses browser-local demo data only; it is not a production payroll or accounting engine.

## Decisions

- Buildless static HTML/CSS/JavaScript for fast validation and private deployment.
- Thai-first UI; sample financial values are illustrative.
- Time, payroll, and invoice data remain separate modules with dashboard rollups.
- Initial datastore is a Google Sheet in the owner's Google Drive, accessed only through a server-side Google Apps Script endpoint. Browser-local demo data remains temporary.
- Mobile attendance baseline: employee PWA requests GPS only after an explicit tap; the endpoint must recompute distance against the assigned work site, reject accuracy worse than 100 m, and append an immutable attendance record.

## Changelog

| Date | Scope / decision | Files changed | Validation | Limitations | Next open item |
|---|---|---|---|---|---|
| 2026-11-02 | Project initialized | `AI_COLLAB_BRIEF.md` | File created | No UI yet | Build interactive prototype |
| 2026-11-02 | Built and privately deployed Thai-first workforce operations prototype: executive dashboard, time check-in/out, employee directory, payroll preview, and invoice control. | `dist/index.html`, `.openai/hosting.json`, `AI_COLLAB_BRIEF.md` | Local HTTP 200; browser-verified Dashboard, Attendance page, and Check in state transition; private Site deployment succeeded. | Demo/browser-local data only; no authentication, database, Thai tax/SSO rules, payment file, or accounting integration. | Confirm payroll policy, approval roles, data sources, statutory rules, and integration requirements before production build. |
| 2026-11-02 | Renamed product branding to BVN Package and selected a PostgreSQL/Supabase production database direction. | `dist/index.html`, `AI_COLLAB_BRIEF.md` | Static title/brand check | No database has been provisioned or connected. | Confirm owner, hosting region, user roles, and payroll/accounting integration. |
| 2026-11-02 | Added installable mobile PWA experience for radius-based check-in and a Supabase attendance schema/RLS baseline. Default radius is 150 m; current site coordinates are intentionally sample-only. | `dist/index.html`, `dist/manifest.webmanifest`, `dist/sw.js`, `dist/icon.svg`, `docs/SUPABASE_SCHEMA.sql`, `AI_COLLAB_BRIEF.md` | Local HTTP 200 for app, manifest, service worker, and icon; browser inspected the Mobile check-in page and its disabled-before-GPS state. | No real work-site coordinates, login, Supabase project, Edge Function, anti-spoofing controls, or durable attendance records yet. | Provision Supabase, enter real BVN Package site coordinates, implement authenticated Edge Function, and run field-device GPS acceptance tests. |
| 2026-11-02 | Configured BVN Package’s supplied location (13.762962071350593, 100.5582875856417), created native Google Sheet database in Drive, set its timezone to Asia/Bangkok, and added a Google Apps Script endpoint template. | `dist/index.html`, `apps_script/Code.gs`, `tools/create_bvn_database.mjs`, generated/imported Google Sheet, `AI_COLLAB_BRIEF.md` | Local workbook created and rendered; native Google Sheet conversion verified; `Work_Sites!A1:H2` read back and timezone update verified. | No employee authentication or deployed Apps Script URL; app intentionally prevents database write while endpoint is blank. Google Sheets is suitable for an early-stage operational store, not a high-assurance payroll ledger. | Implement employee authentication and deploy Apps Script as a restricted web app, then add endpoint URL to the PWA and field-test on employee phones. |
