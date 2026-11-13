#!/usr/bin/env node
// ============================================================================
//  BVN Package — one-shot migration: Google Sheets CSV -> Supabase (Postgres)
//  Reads one CSV per sheet tab (first row = header, skipped) and upserts into
//  the matching table created by supabase/schema.sql. Idempotent (upsert on PK).
//  This does NOT change the live app — it only fills the new database.
//
//  SETUP
//    1. In Google Sheets: File -> Download -> CSV for EACH tab, save into one
//       folder named exactly as the tab (e.g. Employees.csv, Attendance_Log.csv).
//    2. Create the Supabase project and run supabase/schema.sql in its SQL editor.
//    3. npm i @supabase/supabase-js   (run once, anywhere Node can see it)
//    4. Run:
//         SUPABASE_URL="https://xxxx.supabase.co" \
//         SUPABASE_SERVICE_KEY="<service_role key>" \
//         node tools/migrate_sheets_to_supabase.mjs ./csv_export
//       (service_role key bypasses RLS for the import; keep it secret, never ship it)
//
//  Columns are mapped BY POSITION to match the sheet column order, so it works
//  regardless of the (Thai/English) header labels.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DIR = process.argv[2] || './csv_export';
if (!URL || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.'); process.exit(1); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// --- tiny RFC-4180-ish CSV parser (handles quotes, commas, newlines in quotes) ---
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''));
}

// --- value coercers ---
const B = v => /^(true|1|yes|y|ใช่)$/i.test(String(v || '').trim());
const N = v => { const n = Number(String(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; };
const I = v => Math.round(N(v));
const T = v => { const s = String(v || '').trim(); if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString(); };
const D = v => { const s = String(v || '').trim(); const m = s.match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; };
const S = v => String(v == null ? '' : v).trim();

// table <- csv column order (index-based). Each col: [name, coercer].
const TABLES = [
  { csv: 'Employees', table: 'employees', pk: 'employee_id', cols: [
    ['employee_id', S], ['name', S], ['role', S], ['department', S], ['work_site_id', S], ['status', S], ['location_required', B], ['password', S] ] },
  { csv: 'Work_Sites', table: 'work_sites', pk: 'site_id', cols: [
    ['site_id', S], ['name', S], ['latitude', N], ['longitude', N], ['radius_m', I], ['active', B] ] },
  { csv: 'Attendance_Log', table: 'attendance_log', pk: 'id', cols: [
    ['id', S], ['employee_id', S], ['site_id', S], ['event_type', S], ['event_time', T], ['latitude', N], ['longitude', N], ['accuracy', N], ['distance_m', N], ['validity', S], ['device_timezone', S], ['source', S], ['review_status', S], ['created_at', T] ] },
  { csv: 'Payroll_Rules', table: 'payroll_rules', pk: 'employee_id', cols: [
    ['employee_id', S], ['pay_basis', S], ['base_rate', N], ['standard_hours', N], ['ot_enabled', B], ['ot_multiplier', N], ['premium_date', S], ['premium_multiplier', N], ['updated_at', T], ['updated_by', S], ['other_deduction', N], ['days_per_month', N] ] },
  { csv: 'Payroll_Periods', table: 'payroll_periods', pk: 'payroll_id', cols: [
    ['payroll_id', S], ['start_date', D], ['end_date', D], ['status', S], ['locked_at', T], ['locked_by', S] ] },
  { csv: 'Payroll_Lines', table: 'payroll_lines', pk: 'payroll_id,employee_id', cols: [
    ['payroll_id', S], ['employee_id', S], ['regular_minutes', I], ['ot_minutes', I], ['base_gross', N], ['ot_gross', N], ['gross_pay', N], ['created_at', T], ['advance_deduction', N], ['net_pay', N], ['sso', N], ['other_deduction', N] ] },
  { csv: 'Leave_Requests', table: 'leave_requests', pk: 'request_id', cols: [
    ['request_id', S], ['employee_id', S], ['leave_type', S], ['start_date', D], ['end_date', D], ['reason', S], ['status', S], ['submitted_at', T], ['reviewed_by', S], ['reviewed_at', T] ] },
  { csv: 'Time_Requests', table: 'time_requests', pk: 'request_id', cols: [
    ['request_id', S], ['employee_id', S], ['request_type', S], ['work_date', D], ['requested_minutes', I], ['reason', S], ['status', S], ['submitted_at', T], ['reviewed_by', S], ['reviewed_at', T], ['reviewer_note', S] ] },
  { csv: 'Advances', table: 'advances', pk: 'advance_id', cols: [
    ['advance_id', S], ['employee_id', S], ['amount', N], ['reason', S], ['request_date', D], ['status', S], ['reviewer', S], ['decided_at', T], ['paid_at', T], ['created_at', T], ['settled_payroll', S] ] },
  { csv: 'Password_Requests', table: 'password_requests', pk: 'request_id', cols: [
    ['request_id', S], ['employee_id', S], ['requested_at', T], ['status', S], ['handled_by', S], ['handled_at', T] ] },
  { csv: 'Invoices', table: 'invoices', pk: 'invoice_no', cols: [
    ['invoice_no', S], ['customer', S], ['description', S], ['subtotal', N], ['vat', N], ['due_date', D], ['total', N], ['status', S], ['created_at', T], ['updated_at', T], ['payment_reference', S], ['paid_at', T] ] },
  { csv: 'Settings', table: 'settings', pk: 'key', cols: [ ['key', S], ['value', S] ] },
  { csv: 'Holidays', table: 'holidays', pk: 'date', cols: [ ['date', D], ['name', S] ] },
  { csv: 'Admin_Users', table: 'admin_users', pk: 'username', cols: [
    ['username', S], ['password', S], ['display_name', S], ['active', B], ['created_at', T], ['role', S] ] },
  { csv: 'Admin_Sessions', table: 'admin_sessions', pk: 'token_hash', cols: [
    ['token_hash', S], ['username', S], ['display_name', S], ['expires_at', T], ['last_used_at', T], ['status', S], ['role', S] ] },
  { csv: 'Mobile_Access', table: 'mobile_access', pk: 'token_hash', cols: [
    ['token_hash', S], ['employee_id', S], ['status', S], ['issued_at', T], ['last_used_at', T], ['device_label', S] ] },
  { csv: 'Audit_Log', table: 'audit_log', pk: null, cols: [   // id is auto; map ts/actor/action/target/detail
    ['ts', T], ['actor', S], ['action', S], ['target', S], ['detail', S] ] },
];

function findCsv(name) {
  const want = name.toLowerCase() + '.csv';
  const hit = readdirSync(DIR).find(f => f.toLowerCase() === want);
  return hit ? join(DIR, hit) : null;
}

async function run() {
  let okTables = 0, total = 0;
  for (const t of TABLES) {
    const path = findCsv(t.csv);
    if (!path) { console.log(`skip ${t.table}: ${t.csv}.csv not found`); continue; }
    const rows = parseCsv(readFileSync(path, 'utf8'));
    if (rows.length <= 1) { console.log(`skip ${t.table}: empty`); continue; }
    const body = rows.slice(1).map(r => {
      const o = {};
      t.cols.forEach(([name, fn], i) => { o[name] = fn(r[i]); });
      return o;
    });
    const opts = t.pk ? { onConflict: t.pk } : undefined;
    // insert in chunks of 500 to stay under payload limits
    for (let i = 0; i < body.length; i += 500) {
      const chunk = body.slice(i, i + 500);
      const q = t.pk ? sb.from(t.table).upsert(chunk, opts) : sb.from(t.table).insert(chunk);
      const { error } = await q;
      if (error) { console.error(`ERROR ${t.table} rows ${i}-${i + chunk.length}: ${error.message}`); process.exitCode = 1; break; }
    }
    console.log(`ok   ${t.table}: ${body.length} rows`);
    okTables++; total += body.length;
  }
  console.log(`\nDone. ${okTables} tables, ${total} rows.`);
}
run().catch(e => { console.error(e); process.exit(1); });
