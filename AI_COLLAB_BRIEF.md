# AI Collaboration Brief — Workforce Operations Hub

## Product scope

Private, browser-based operational prototype for employee attendance, payroll preparation, invoice tracking, and management decision-making. It uses browser-local demo data only; it is not a production payroll or accounting engine.

## Decisions

- Buildless static HTML/CSS/JavaScript for fast validation and private deployment.
- Thai-first UI; sample financial values are illustrative.
- Time, payroll, and invoice data remain separate modules with dashboard rollups.
- Recommended production datastore: PostgreSQL, initially managed through Supabase with Row Level Security and an audit trail. Browser-local demo data remains temporary.

## Changelog

| Date | Scope / decision | Files changed | Validation | Limitations | Next open item |
|---|---|---|---|---|---|
| 2026-11-02 | Project initialized | `AI_COLLAB_BRIEF.md` | File created | No UI yet | Build interactive prototype |
| 2026-11-02 | Built and privately deployed Thai-first workforce operations prototype: executive dashboard, time check-in/out, employee directory, payroll preview, and invoice control. | `dist/index.html`, `.openai/hosting.json`, `AI_COLLAB_BRIEF.md` | Local HTTP 200; browser-verified Dashboard, Attendance page, and Check in state transition; private Site deployment succeeded. | Demo/browser-local data only; no authentication, database, Thai tax/SSO rules, payment file, or accounting integration. | Confirm payroll policy, approval roles, data sources, statutory rules, and integration requirements before production build. |
| 2026-11-02 | Renamed product branding to BVN Package and selected a PostgreSQL/Supabase production database direction. | `dist/index.html`, `AI_COLLAB_BRIEF.md` | Static title/brand check | No database has been provisioned or connected. | Confirm owner, hosting region, user roles, and payroll/accounting integration. |
