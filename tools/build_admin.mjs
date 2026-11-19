// Build the single deployed admin console file from its split sources.
//
//   admin_codex/src/index.template.html  (shell with CSS/JS markers)
//   admin_codex/src/app.css              (the <style> contents)
//   admin_codex/src/app.js               (the <script> contents)
//        -> admin_codex/index.html        (self-contained, byte-for-byte)
//
// admin_codex/index.html is a BUILD ARTIFACT. Edit the src/ files, then run
// `node tools/build_admin.mjs`. Never hand-edit index.html — the freshness
// guard (tools/admin_build_fresh_test.mjs) fails if it drifts from src.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../admin_codex/', import.meta.url);
const CSS_MARKER = '/*__BVN_APP_CSS__*/';
const JS_MARKER = '/*__BVN_APP_JS__*/';

export function buildAdminHtml() {
  const template = fs.readFileSync(new URL('src/index.template.html', root), 'utf8');
  const css = fs.readFileSync(new URL('src/app.css', root), 'utf8');
  const js = fs.readFileSync(new URL('src/app.js', root), 'utf8');
  if (!template.includes(CSS_MARKER) || !template.includes(JS_MARKER)) {
    throw new Error('template is missing a CSS/JS marker');
  }
  // Function replacers so `$` sequences in css/js are inserted literally.
  return template.replace(CSS_MARKER, () => css).replace(JS_MARKER, () => js);
}

// Run directly (not when imported by the freshness test).
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const out = buildAdminHtml();
  fs.writeFileSync(new URL('index.html', root), out);
  console.log(`built admin_codex/index.html (${out.length} bytes)`);
}
