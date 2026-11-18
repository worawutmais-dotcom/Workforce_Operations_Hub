# BVN Compact Admin Design System

Applied to `admin_codex/index.html` on 18 November 2026 for the high-density workforce and payroll console.

## Product direction

- **Character:** precise, calm and premium operational software.
- **Pattern:** data-first Swiss-style administration. The Dashboard may use one dark navy workforce hero; all other work surfaces remain flat and light.
- **Priority:** people, time evidence and payroll decisions must appear before decorative analysis.

## Tokens and rhythm

| Area | Rule |
| --- | --- |
| Spacing | 4 / 8 / 12 / 16 / 24px only; 8px is the normal dense gap. |
| Radius | 7px controls, 10px panels, 14px only for the Dashboard hero. |
| Type | 12px data/body, 10px metadata, 22–23px route headings. Tabular figures for time and money. |
| Surface | Flat white panels on a light neutral page; one full border or no border, never decorative side-only card borders. |
| Colour | Navy is brand and primary action; green is complete; amber is review required; red is destructive/error. State always includes text, not colour alone. |
| Motion | No decorative animation. Existing focus and async loading feedback remain; reduced-motion continues to disable transitions. |

## Components

- **Dashboard:** dark workforce summary, five compact numeric cards, then decision queue + team register, calendar, and secondary analysis.
- **Attendance:** one employee-day per row. Date, employee, in/out, hours, status and action remain in fixed columns.
- **Employee review:** central Review sheet with identity, today, recent history and monthly timesheet; the modal is a review surface, not a new navigation route.
- **Mobile:** preserve readable input and touch targets; dense reductions apply only from 761px upward.

## Sources used

- `ai-design-skills` Figma designer rules: semantic tokens, 4/8 spacing rhythm, nested-radius discipline and accessible state design.
- `ui-ux-pro-max`: high-density enterprise dashboard search, Swiss/minimal style, accessible contrast/focus, data-table and responsive rules.
- `caveman safe-refactor`: keep API/event behavior intact and run the same verification before/after visual restructuring.
