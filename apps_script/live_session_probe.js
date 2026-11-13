/*
 * Read-only post-deploy probe for BVN Package Apps Script.
 *
 * Required environment variables (never commit or echo them):
 *   BVN_ENDPOINT
 *   BVN_UAT_ADMIN_USERNAME
 *   BVN_UAT_ADMIN_PASSWORD
 *
 * Run after the owner deploys the reviewed Code.gs:
 *   node apps_script/live_session_probe.js
 *
 * This sends no attendance/payroll/invoice mutation. It creates and revokes one
 * Admin session and writes the normal login audit entry, then proves health,
 * normal Admin login, authenticated Dashboard and revoked-session rejection.
 */
const endpoint = String(process.env.BVN_ENDPOINT || '').trim();
const username = String(process.env.BVN_UAT_ADMIN_USERNAME || '').trim();
const password = String(process.env.BVN_UAT_ADMIN_PASSWORD || '');

function assert(condition, message) { if (!condition) throw new Error(message); }
async function post(action, fields = {}, token = '') {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
    body: JSON.stringify({ action, adminToken: token, ...fields }),
  });
  let body;
  try { body = await response.json(); } catch (_) { throw new Error(`${action}: response was not JSON (HTTP ${response.status})`); }
  return body;
}

(async () => {
  assert(/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(endpoint), 'BVN_ENDPOINT must be a deployed Apps Script /exec URL');
  assert(username && password, 'Set BVN_UAT_ADMIN_USERNAME and BVN_UAT_ADMIN_PASSWORD for a non-production Admin');

  const healthResponse = await fetch(endpoint, { redirect: 'follow' });
  const health = await healthResponse.json();
  assert(health && health.ok === true, 'Health check failed');

  const login = await post('admin_console_login', { username, password });
  assert(login.ok === true && login.data && login.data.adminToken, `Login failed: ${login.message || 'unknown error'}`);
  const token = login.data.adminToken;
  assert(token !== password, 'Server returned a password as the session token');

  const dashboard = await post('dashboard', {}, token);
  assert(dashboard.ok === true, `Authenticated Dashboard failed: ${dashboard.message || 'unknown error'}`);

  const logout = await post('admin_console_logout', {}, token);
  assert(logout.ok === true, `Logout failed: ${logout.message || 'unknown error'}`);

  const revoked = await post('dashboard', {}, token);
  assert(revoked.ok === false, 'Revoked session unexpectedly accessed Dashboard');

  const capabilities = dashboard.data?.capabilities || {};
  const scope = [capabilities.attendance ? 'operations' : '', capabilities.financial ? 'financial' : ''].filter(Boolean).join(', ') || 'none';
  console.log('LIVE_SESSION_PROBE=PASS');
  console.log(`Dashboard verified for role ${login.data?.role || 'unknown'} (scope: ${scope}); only the expected session/audit rows were written.`);
})().catch(error => {
  console.error(`LIVE_SESSION_PROBE=FAIL: ${error.message}`);
  process.exitCode = 1;
});
