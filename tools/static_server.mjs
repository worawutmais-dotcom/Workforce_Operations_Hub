import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal static file server for previewing the admin console live (so its JS
// runs and can reach Supabase). Dev-only helper; not used in production.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/admin_codex/index.html';
  // The generated console is served as the root document during local preview,
  // while its bundled logo keeps the production-relative /assets path.
  if (p.startsWith('/assets/')) p = '/admin_codex' + p;
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(18799, () => console.log('admin console preview on http://localhost:18799'));
