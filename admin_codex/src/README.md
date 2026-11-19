# admin_codex/src — console build sources

`admin_codex/index.html` is **generated** from these files. Do not hand-edit `index.html`.

| File | What it is |
|---|---|
| `app.css` | the console `<style>` contents (one stylesheet; note: it has layered `:root` blocks — see `docs/DESIGN_SYSTEM.md`) |
| `app.js` | the console `<script>` contents (all app JS, incl. the inline print-document templates) |
| `index.template.html` | the HTML shell; the build injects `app.css` into the `/*__BVN_APP_CSS__*/` marker and `app.js` into `/*__BVN_APP_JS__*/` |

## Build
```
node tools/build_admin.mjs
```
Writes a self-contained `admin_codex/index.html` (single file — hosting/publish is unchanged).

## Guard
```
node tools/admin_build_fresh_test.mjs
```
Fails if `index.html` is not a fresh build from `src/` (e.g. someone hand-edited `index.html`, or edited `src/` without rebuilding). Run it before every commit.

## Notes
- The split is byte-exact: building from the initial extraction reproduces the previous `index.html` identically.
- Next cleanup (was blocked by the single-file layout): consolidate the multiple `:root` token layers in `app.css` into one, then the hex→token migration becomes safe. See `docs/ENTERPRISE_REVIEW_2026-11-18.md`.
