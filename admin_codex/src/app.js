
/* =================================================================
   BVN Package Admin Codex — isolated UX pilot, single-file vanilla JS.
   Talks to the Apps Script Operations API (see apps_script/Code.gs).
   ================================================================= */
"use strict";

// Primary backend is now Supabase. Apps Script is retired as the default (kept
// only as a manual fallback an admin can still type into the connection fields).
const DEFAULT_ENDPOINT = "https://vqualksnbctfukcbxqdd.supabase.co/functions/v1/swift-handler";
const DEFAULT_APIKEY = "sb_publishable_E302-Dm85ztBPl-3o5xL_w_0UkW2fG4";
const LEGACY_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbzIlBl0KxAI2ibRDiODZDu-m4WYYUHloSvGkm37rMAsc_be0jUikQP0ytPRho-62wN2/exec";
const isSupabaseEndpoint = (u)=>/\.supabase\.co\/functions\//.test(String(u||""));
const SS = sessionStorage, LS = localStorage;

/* ---------- ผู้ออกใบแจ้งหนี้ (หัวบิล) ---------- */
// A print-safe embedded BVN mark. Documents must never lose their identity
// merely because a Drive-hosted logo has not yet been authorised or loaded.
const BUILTIN_PPP_LOGO = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="white"/><g fill="none" stroke="#1e3a5f"><circle cx="120" cy="120" r="112" stroke-width="4"/><circle cx="120" cy="120" r="103" stroke-width="2"/></g><text x="120" y="132" text-anchor="middle" font-family="Arial,sans-serif" font-size="66" font-weight="800" letter-spacing="-6" fill="#1e3a5f">PPP</text><path d="M58 150 Q120 196 182 150" fill="none" stroke="#1e3a5f" stroke-width="3"/><text x="120" y="178" text-anchor="middle" font-family="Tahoma,sans-serif" font-size="14" font-weight="700" fill="#1e3a5f">บริษัท พนมพร พาณิชย์ จำกัด</text></svg>`);
const ISSUER = {
  name: "บริษัท พนมพร พาณิชย์ จำกัด",
  nameEn: "Phanomporn Phanich Co., Ltd.",
  address: "479/162 ซอยสุทธิพร แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400",
  phone: "096-797-9923",
  taxId: "0105569191266",
  vatRate: "7",
  prefix: "INV",
  footer: "ขอบคุณที่ใช้บริการ",
  logoUrl: BUILTIN_PPP_LOGO,
};

function invoiceIssuer(settings={}){
  return {
    name: settings.invoice_company_name || ISSUER.name,
    nameEn: settings.invoice_company_name_en || ISSUER.nameEn,
    address: settings.invoice_address || ISSUER.address,
    phone: settings.invoice_phone || ISSUER.phone,
    taxId: settings.invoice_tax_id || ISSUER.taxId,
    vatRate: settings.invoice_vat_rate == null || settings.invoice_vat_rate === "" ? ISSUER.vatRate : settings.invoice_vat_rate,
    prefix: settings.invoice_prefix || ISSUER.prefix,
    footer: settings.invoice_footer || ISSUER.footer,
    logoUrl: settings.invoice_logo_url || BUILTIN_PPP_LOGO,
  };
}

// Print windows are isolated documents.  A Storage URL can be unavailable
// because an old file was removed or a browser had not loaded it yet.  Every
// printable document therefore gets the configured company logo first and a
// self-contained, print-safe company mark only if that image fails.  This
// avoids the broken-image glyph that previously appeared in PDFs.
function printLogoMarkup(issuer, className="issuer-logo"){
  const src=String(issuer?.logoUrl||BUILTIN_PPP_LOGO);
  const fallback=esc(BUILTIN_PPP_LOGO);
  return `<img class="${esc(className)}" src="${esc(src)}" alt="โลโก้บริษัท" onerror="this.onerror=null;this.src='${fallback}'">`;
}

const state = {
  endpoint: "",
  token: "",
  username: "",
  reviewer: "",
  role: "owner",
  employees: [],         // cached admin_list_employees
  empById: {},
  invoiceSettings: {},
  backendCapabilities: {},
  backendRevision: "",
  page: "dashboard",
};

/* ---------- small DOM helpers ---------- */
const $ = (sel, root=document) => root.querySelector(sel);
const el = (html) => { const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s==null?"":s).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
let fieldSequence=0;
const fmtBaht = (n) => "฿" + Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:0,maximumFractionDigits:2});
const fmtInt = (n) => Number(n||0).toLocaleString("th-TH");
const fmtHours = (minutes) => { const n=Math.round(Number(minutes||0)); return n>0&&n<60 ? `${n} นาที` : (n/60).toLocaleString("th-TH",{maximumFractionDigits:1}) + " ชม."; };
const todayISO = () => new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});
function normaliseTime(value, fallback="09:00"){
  // Google Sheets may serialise a time-only cell as 30 Dec 1899. Never expose
  // that implementation detail in an operational screen or feed it to a time input.
  const matched=String(value||"").match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?::\d\d)?(?:\s|$)/);
  return matched ? `${matched[1].padStart(2,"0")}:${matched[2]}` : fallback;
}
function fmtDateTime(iso){ if(!iso) return "—"; const d=new Date(iso); return isNaN(d)?esc(iso):d.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"}); }
function fmtDate(iso){ if(!iso) return "—"; const d=new Date(iso+"T00:00:00+07:00"); return isNaN(d)?esc(iso):d.toLocaleDateString("th-TH",{dateStyle:"medium"}); }

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, kind=""){
  const t=$("#toast"); t.className="toast show "+kind; t.textContent=msg;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),3200);
}

/* ---------- API ---------- */
// Google Apps Script starts a fresh execution for every request.  Repeating the
// same read while the operator moves between screens is therefore expensive.
// Keep short-lived, per-session snapshots in the console and merge requests
// already in flight.  Writes clear the snapshot so an approval or edit is
// always reflected immediately.
const READ_CACHE_TTL = Object.freeze({
  dashboard: 8000,
  admin_list_employees: 15000,
  admin_list_leave_requests: 8000,
  admin_list_time_requests: 8000,
  admin_attendance_days: 8000,
  admin_get_settings: 120000,
  admin_list_sites: 30000,
  admin_list_pay_rules: 15000,
  admin_list_advances: 8000,
  admin_list_invoices: 8000,
  admin_list_payrolls: 10000,
  admin_list_audit_log: 10000,
  admin_get_invoice_settings: 30000,
  admin_list_holidays: 120000,
  admin_leave_usage: 10000,
  admin_list_password_requests: 10000,
  // Heavy payroll computations — cache briefly so navigation and the per-tick
  // auto-refresh don't recompute them every time (they are "ประมาณการ" anyway).
  admin_preview_payroll: 20000,
  admin_owner_overview: 20000,
});
// Data that changes often enough to re-fetch on every auto-refresh tick; the
// rest (settings, holidays, employees, pay rules, sites, payroll preview) stays
// cached across ticks so a silent refresh only pulls what actually moves.
const VOLATILE_ACTIONS = new Set([
  "dashboard","admin_attendance_days","admin_list_leave_requests",
  "admin_list_time_requests","admin_list_advances","admin_list_invoices",
  "admin_list_payrolls","admin_list_audit_log","admin_list_password_requests",
]);
function invalidateVolatile(){
  for(const key of apiReadCache.keys()){ const act=key.split("|")[2]; if(VOLATILE_ACTIONS.has(act)) apiReadCache.delete(key); }
}
const apiReadCache = new Map();
const apiInFlight = new Map();
function cloneApiData(value){ return JSON.parse(JSON.stringify(value)); }
function stableRequestFields(fields){
  const sorted={};
  Object.keys(fields||{}).sort().forEach(key=>{ sorted[key]=fields[key]; });
  return JSON.stringify(sorted);
}
function clearApiReadCache(){ apiReadCache.clear(); }

async function api(action, fields={}, timeoutMs=15000){
  const ttl=READ_CACHE_TTL[action]||0;
  const cacheKey=ttl ? [state.endpoint,state.token,action,stableRequestFields(fields)].join("|") : "";
  const cached=ttl ? apiReadCache.get(cacheKey) : null;
  if(cached && Date.now()-cached.at < ttl) return cloneApiData(cached.data);
  if(ttl && apiInFlight.has(cacheKey)) return cloneApiData(await apiInFlight.get(cacheKey));

  const request=(async()=>{
  // text/plain avoids a CORS preflight; Apps Script parses the body as JSON regardless.
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(), timeoutMs);
  let res;
  try{
    // Supabase Edge Functions need the project's public apikey to be routed.
    // Pass it in the query string (not a header) so the request stays a simple
    // CORS request (text/plain, no preflight) exactly like the Apps Script call.
    let url=state.endpoint;
    if(/\.supabase\.co\/functions\//.test(url) && state.apikey){
      url += (url.indexOf("?")<0?"?":"&") + "apikey=" + encodeURIComponent(state.apikey);
    }
    res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify({ action, adminToken: state.token, ...fields }),
      redirect:"follow",
      signal:controller.signal,
    });
  }catch(err){
    if(err?.name==="AbortError") throw new Error("การเชื่อมต่อใช้เวลานานเกิน 15 วินาที กรุณาลองใหม่");
    throw err;
  }finally{ clearTimeout(timer); }
  let body;
  try { body = await res.json(); }
  catch(e){ throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (ตรวจสอบ endpoint และการ deploy)"); }
  if(!body || typeof body!=="object") throw new Error("รูปแบบคำตอบไม่ถูกต้อง");
  if(!body.ok) throw new Error(body.message || "คำขอไม่สำเร็จ");
  const data=body.data || {};
  if(ttl) apiReadCache.set(cacheKey,{at:Date.now(),data:cloneApiData(data)});
  else clearApiReadCache();
  return data;
  })();
  if(!ttl) return request;
  apiInFlight.set(cacheKey,request);
  try{ return cloneApiData(await request); }
  finally{ apiInFlight.delete(cacheKey); }
}
function hasBackendCapability(name){ return state.backendCapabilities?.[name]===true; }
async function refreshBackendCapabilities(){
  try{
    const version=await api("version");
    state.backendCapabilities=version.capabilities||{};
    state.backendRevision=String(version.sourceRevision||"");
  }catch(_){ state.backendCapabilities={}; state.backendRevision=""; }
}
// run a button into a loading state while awaiting
async function withBtn(btn, fn){
  if(!btn) return fn();
  const html=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span> กำลังทำงาน…';
  try{ return await fn(); } finally{ btn.disabled=false; btn.innerHTML=html; }
}

/* ---------- modal ---------- */
let lastModalFocus=null, modalSequence=0;
function openModal(title, bodyNode, footNodes){
  lastModalFocus=document.activeElement;
  const m=$("#modal");
  m.classList.remove("employee-review-modal");
  m.innerHTML="";
  const titleId=`modalTitle${++modalSequence}`;
  const head=el(`<div class="m-head"><h3 id="${titleId}">${esc(title)}</h3><button class="x" aria-label="ปิดหน้าต่าง">×</button></div>`);
  m.setAttribute("aria-labelledby",titleId);
  head.querySelector(".x").onclick=closeModal;
  const body=el(`<div class="m-body"></div>`); body.appendChild(bodyNode);
  const foot=el(`<div class="m-foot"></div>`); (footNodes||[]).forEach(n=>foot.appendChild(n));
  m.append(head, body, foot);
  $("#scrim").classList.add("show");
  setTimeout(()=> (m.querySelector("input,select,textarea,button:not(.x),[tabindex]:not([tabindex='-1'])") || head.querySelector(".x"))?.focus(),0);
}
function closeModal(){
  $("#scrim").classList.remove("show"); $("#modal").classList.remove("employee-review-modal"); $("#modal").innerHTML="";
  const previous=lastModalFocus; lastModalFocus=null;
  if(previous && document.contains(previous)) setTimeout(()=>previous.focus(),0);
}
$("#scrim").addEventListener("click", e=>{ if(e.target.id==="scrim") closeModal(); });
document.addEventListener("keydown", e=>{
  if(!$("#scrim").classList.contains("show")) return;
  if(e.key==="Escape"){ e.preventDefault(); closeModal(); return; }
  if(e.key!=="Tab") return;
  const focusable=[...$("#modal").querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")];
  if(!focusable.length) return;
  const first=focusable[0], last=focusable.at(-1);
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
});

function confirmDialog(title, message, {danger=false, okText="ยืนยัน"}={}){
  return new Promise(resolve=>{
    const body=el(`<div><p style="margin:0;line-height:1.6">${message}</p></div>`);
    const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=()=>{closeModal();resolve(false);};
    const ok=el(`<button class="btn ${danger?"danger":""}">${esc(okText)}</button>`);
    ok.onclick=()=>{closeModal();resolve(true);};
    openModal(title, body, [cancel, ok]);
  });
}

/* field factory for forms */
function field(label, inputHTML, hint){
  const node=el(`<div class="field"><label>${esc(label)}</label>${inputHTML}${hint?`<div class="hint">${hint}</div>`:""}</div>`);
  const control=node.querySelector("input,select,textarea"), caption=node.querySelector("label");
  if(control && caption){ const id=control.id || `bvnField${++fieldSequence}`; control.id=id; caption.htmlFor=id; }
  return node;
}

/* =================================================================
   AUTH
   ================================================================= */
async function doLogin(e){
  e.preventDefault();
  const username=$("#inUser").value.trim();
  const password=$("#inPass").value;
  const endpoint=($("#inEndpoint").value||"").trim() || DEFAULT_ENDPOINT;
  const apikey=(($("#inApikey")&&$("#inApikey").value)||"").trim();
  const errBox=$("#loginErr"); errBox.textContent="";
  state.endpoint=endpoint; state.apikey=apikey;
  LS.setItem("bvn_endpoint", endpoint);
  LS.setItem("bvn_apikey", apikey);
  await withBtn($("#loginBtn"), async ()=>{
    try{
      // This Codex console never accepts a master API key. The backend issues
      // only a revocable session after it verifies username/password.
      if(!username||!password){ errBox.textContent="กรอกชื่อผู้ใช้และรหัสผ่าน"; return; }
      clearApiReadCache();
      state.token="";
      const login=await api("admin_console_login",{username, password});
      const token=login.adminToken, reviewer=login.displayName||username;
      state.token=token; state.username=login.username||username; state.reviewer=reviewer; state.role=login.role||"owner";
      state.employees=[]; state.empById={};
      // Start independent Sheet reads now, rather than making the operator wait
      // for Dashboard and then wait for these three calls in a second round.
      const canOperate=["owner","manager","operations"].includes(state.role);
      const preloaded={ employees: loadEmployees().catch(()=>[]) };
      if(canOperate){
        preloaded.leaveD=api("admin_list_leave_requests").catch(error=>({requests:[],_loadError:error.message}));
        preloaded.timeD=api("admin_list_time_requests").catch(error=>({requests:[],_loadError:error.message}));
        preloaded.attendanceD=api("admin_attendance_days").catch(error=>({days:[],_loadError:error.message}));
      }
      const data=await api("dashboard");          // verifies the token works
      SS.setItem("bvn_token", token);
      SS.setItem("bvn_username", state.username);
      LS.setItem("bvn_reviewer", reviewer);
      SS.setItem("bvn_role", state.role);
      enterApp(data, preloaded);
    }catch(err){
      const m=err.message||"";
      errBox.textContent = /Unsupported action/i.test(m) ? "ระบบหลังบ้านยังไม่รองรับการเข้าสู่ระบบแบบบัญชีผู้ใช้ — ให้ผู้ดูแล deploy Apps Script เวอร์ชันล่าสุด"
        : /authentication/i.test(m) ? "ยืนยันตัวตนไม่ผ่าน" : m;
    }
  });
}
function enterApp(dashboardData, preloaded={}){
  $("#login").style.display="none";
  $("#app").style.display="grid";
  $(".skip-link").hidden=false;
  applyRoleNavigation();
  renderDashboard(dashboardData, preloaded);
  // A newer Console can be served before its Edge Function. Feature gates turn
  // that release mismatch into a clear notice instead of a raw API error.
  refreshBackendCapabilities().then(()=>{
    if(["people","employees"].includes(state.page)) PAGES[state.page].load();
  });
  // warm the employee cache (used by many pages)
  if(!preloaded.employees) loadEmployees().catch(()=>{});
  // Restore the deep-linked page on refresh / shared link; otherwise anchor at dashboard.
  const requestedStart=(location.hash||"").replace(/^#/,"");
  // Old bookmarks remain useful after consolidating employee work into one
  // workspace. Do not strand a manager on an obsolete, duplicate page.
  const start=LEGACY_ROUTE_REDIRECT[requestedStart]||requestedStart;
  if(start && start!=="dashboard" && PAGES[start] && allowedPages().includes(start)) go(start);
  else { try{ history.replaceState(null,"","#dashboard"); }catch(_){} }
}
async function logout(){
  const activeToken=state.token;
  SS.removeItem("bvn_token");
  SS.removeItem("bvn_username");
  SS.removeItem("bvn_role");
  clearApiReadCache();
  state.token="";
  if(activeToken){ try{ await api("admin_console_logout",{adminToken:activeToken}); }catch(_){ /* local logout still succeeds */ } }
  location.reload();
}

/* =================================================================
   NAVIGATION
   ================================================================= */
// Employee master data and approval decisions used to be exposed as three
// separate screens. They are one operational workflow, so old URLs now lead
// to the combined workspace instead of creating competing sources of truth.
const LEGACY_ROUTE_REDIRECT={employees:"people",approvals:"people",invoices:"dashboard"};
const PAGES = {
  dashboard:{title:"Dashboard", sub:"ภาพรวมทีมและงานที่ต้องตัดสินใจ", load:()=>renderDashboard()},
  owner:{title:"Timesheet", sub:"ตรวจเวลาเข้า–ออกและแก้ไขเฉพาะรายการที่ได้รับอนุญาต", load:()=>renderOwner()},
  people:{title:"ทีมและอนุมัติ", sub:"ทะเบียนพนักงาน ข้อมูลเอกสาร และคิวอนุมัติ", load:()=>renderPeople()},
  employees:{title:"พนักงาน", sub:"สร้าง แก้ไข ปิดใช้งาน และตั้งรหัสผ่าน", load:()=>renderEmployees()},
  approvals:{title:"งานรออนุมัติ", sub:"คำขอลา OT และรายการที่ต้องตัดสินใจ", load:()=>renderApprovals()},
  payroll:{title:"Payroll run", sub:"ตรวจ Timesheet ปรับรายการ และออกสลิป", load:()=>renderPayroll()},
  advances:{title:"เงินล่วงหน้า", sub:"รายการค้างอนุมัติ จ่าย และหักคืน", load:()=>renderAdvances()},
  payrules:{title:"ค่าจ้างและ OT", sub:"นโยบายบริษัทและอัตราค่าจ้างรายบุคคล", load:()=>renderPayrules()},
  settings:{title:"ตั้งค่าระบบ", sub:"บริษัท เอกสาร นโยบาย ความปลอดภัย และข้อมูล", load:()=>renderSettings()},
  audit:{title:"บันทึกการใช้งาน", sub:"ใครทำอะไรเมื่อไหร่ (audit trail)", load:()=>renderAudit()},
};
const ROLE_LABEL={owner:"เจ้าของระบบ",manager:"ผู้จัดการ",operations:"ฝ่ายปฏิบัติการ",finance:"ฝ่ายการเงิน"};
const ROLE_PAGES={
  owner:["dashboard","owner","people","payroll","advances","payrules","settings"],
  manager:["dashboard","owner","people","payroll","advances","payrules"],
  operations:["dashboard","people","advances"],
  finance:["dashboard","payroll","payrules"],
};
function allowedPages(){ return ROLE_PAGES[state.role]||ROLE_PAGES.owner; }
function applyRoleNavigation(){
  const allowed=allowedPages();
  $("#nav").querySelectorAll("button[data-page]").forEach(b=>{
    const p=b.dataset.page, parent=NAV_GROUP[p];
    // Grouped children live inside their parent page as subtabs; show them in the
    // sidebar only for roles whose parent page is hidden, so they stay reachable.
    const show = allowed.includes(p) && (!b.hasAttribute("data-grp-child") || !allowed.includes(parent));
    b.style.display = show ? "" : "none";
  });
  // Hide a sidebar section header when every item under it is hidden for this role.
  const navKids=[...$("#nav").children];
  navKids.forEach((el,i)=>{
    if(!el.classList.contains("nav-section")) return;
    let anyVisible=false;
    for(let j=i+1;j<navKids.length;j++){ const c=navKids[j]; if(c.classList.contains("nav-section")) break; if(c.tagName==="BUTTON" && c.style.display!=="none"){ anyVisible=true; break; } }
    el.style.display=anyVisible?"":"none";
  });
  if(!allowed.includes(state.page)) state.page="dashboard";
  const foot=$("#footReviewer"); if(foot) foot.textContent=(state.reviewer||"ผู้ดูแลระบบ")+" · "+(ROLE_LABEL[state.role]||ROLE_LABEL.owner);
}
const NAV_GROUP={advances:"payroll",payrules:"payroll",audit:"settings"};
const GROUP_TABS={
  payroll:[["payroll","ตรวจ Timesheet · ออกสลิป"],["advances","เงินล่วงหน้า"],["payrules","ตั้งเรตค่าจ้าง · OT"]],
  settings:[["settings","ตั้งค่าระบบ"]]
};
function groupTabsHtml(active){
  const grp=NAV_GROUP[active]||active, all=GROUP_TABS[grp]; if(!all) return "";
  const allow=allowedPages(), tabs=all.filter(([p])=>allow.includes(p));
  if(tabs.length<2) return "";
  return `<div class="subtabs grp-tabs" style="margin-bottom:14px">`+tabs.map(([p,label])=>
    `<button type="button" class="${p===active?"active":""}" data-grp="${p}">${label}</button>`).join("")+`</div>`;
}
function wireGroupTabs(node){ node.querySelectorAll("[data-grp]").forEach(b=>b.onclick=()=>go(b.dataset.grp)); }
let _navFromPop=false;
function go(page){
  page=LEGACY_ROUTE_REDIRECT[page]||page;
  if(!PAGES[page]||!allowedPages().includes(page)){ toast("บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้","bad"); return; }
  state.page=page;
  // Keep the URL hash in sync so Back/Forward, refresh and shared deep-links work.
  if(!_navFromPop){ const h="#"+page; try{ if(location.hash!==h) history.pushState(null,"",h); }catch(_){ try{ location.hash=page; }catch(_e){} } }
  const navHi=NAV_GROUP[page]||page;
  $("#nav").querySelectorAll("button").forEach(b=>{
    const active=b.dataset.page===navHi; b.classList.toggle("active",active);
    if(b.dataset.page) b.toggleAttribute("aria-current",active);
  });
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active", p.id==="page-"+page));
  $("#pageTitle").textContent=PAGES[page].title;
  $("#pageSub").textContent=PAGES[page].sub;
  syncQuickAction();
  $("#side").classList.remove("open");
  $("#menuBtn").setAttribute("aria-expanded","false");
  $("#mainContent").focus({preventScroll:true});
  PAGES[page].load();
  scheduleAutoRefresh();
  syncBackendBadge();
}
$("#nav").querySelectorAll("button[data-page]").forEach(b=>b.setAttribute("aria-controls","page-"+b.dataset.page));
$("#nav").addEventListener("click", e=>{ const b=e.target.closest("button[data-page]"); if(b) go(b.dataset.page); });
document.addEventListener("click", e=>{ const b=e.target.closest("[data-grp]"); if(b){ e.preventDefault(); go(b.dataset.grp); } });
window.addEventListener("popstate", ()=>{ if(!state.token) return; const requested=(location.hash||"").replace(/^#/,""); const p=LEGACY_ROUTE_REDIRECT[requested]||requested; if(p && PAGES[p] && allowedPages().includes(p) && p!==state.page){ _navFromPop=true; try{ go(p); } finally { _navFromPop=false; } } });
$("#refreshBtn").addEventListener("click", ()=>{ clearApiReadCache(); withBtn($("#refreshBtn"), async()=>{ await PAGES[state.page].load(); refreshApprovalBadge(); }); });
$("#menuBtn").addEventListener("click", ()=>{
  const opened=$("#side").classList.toggle("open");
  $("#menuBtn").setAttribute("aria-expanded",String(opened));
});
$("#logoutLink").addEventListener("click", e=>{e.preventDefault();logout();});

/* ===== Live auto-refresh: the console keeps itself current so a check-in shows
   up without a manual refresh. Silent (no skeleton/flash), paused while a dialog
   is open or the tab is hidden, and it refreshes immediately when the tab is
   refocused. Apps Script has no push, so this is a gentle poll of the active
   page only; the per-read cache is cleared each tick so data is fresh. ===== */
// Only the dashboard is a live monitoring surface. Manual entry must stay
// stable while an administrator is selecting an employee or typing a time.
const AUTO_REFRESH_MS={dashboard:6000};
var silentRefresh=false, _arTimer=null;
function modalOpen(){ const s=$("#scrim"); return !!(s && s.classList.contains("show")); }
function syncLiveBadge(){ const b=$("#liveBadge"); if(b) b.style.display=(state.token && AUTO_REFRESH_MS[state.page])?"":"none"; }
function syncBackendBadge(){ const b=$("#beBadge"); if(!b) return; const sup=isSupabaseEndpoint(state.endpoint||LS.getItem("bvn_endpoint")||""); b.textContent=sup?"Supabase":"Apps Script"; b.className="be-badge "+(sup?"be-sup":"be-legacy"); }
function scheduleAutoRefresh(){
  clearTimeout(_arTimer);
  syncLiveBadge();
  if(!state.token || !AUTO_REFRESH_MS[state.page]) return;
  _arTimer=setTimeout(runAutoRefresh, AUTO_REFRESH_MS[state.page]);
}
var _dashSig=null;
async function runAutoRefresh(){
  const page=state.page;
  if(!state.token || !AUTO_REFRESH_MS[page]) return;
  if(document.hidden || modalOpen()){ scheduleAutoRefresh(); return; }
  silentRefresh=true; document.body.classList.add("ar-busy");
  try{
    invalidateVolatile();
    if(page==="dashboard"){
      // Cheap heartbeat: pull only the light `dashboard` summary each tick and
      // re-render the full screen (team grid + queues) ONLY when a headline
      // number actually changed. Keeps 6s polling near-realtime without burning
      // the Apps Script daily quota on every tick.
      const d=await api("dashboard");
      const sig=[d.present,d.totalEmployees,d.pendingApprovals,d.exceptions,d.overdueInvoices].join("|");
      if(sig!==_dashSig){ _dashSig=sig; await renderDashboard(d); }
    }
  }catch(_){ /* keep current view; next tick retries */ }
  finally{ silentRefresh=false; document.body.classList.remove("ar-busy"); }
  scheduleAutoRefresh();
}
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden && state.token && AUTO_REFRESH_MS[state.page]) runAutoRefresh();
});

function skeleton(node){ if(silentRefresh) return; node.innerHTML=`<div class="loading"><span class="spin" style="border-color:var(--line);border-top-color:var(--blue)"></span><div style="margin-top:10px">กำลังโหลดข้อมูล…</div></div>`; }
function errorBox(node, err, retry){
  if(silentRefresh) return; // keep the current view; the next auto-refresh retries
  node.innerHTML="";
  const box=el(`<div class="panel"><div class="body"><div class="notice">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</div></div></div>`);
  const btn=el(`<button class="btn sub sm">ลองใหม่</button>`); btn.onclick=retry;
  box.querySelector(".body").appendChild(btn);
  node.appendChild(box);
}
function setRouteShell(node, kind){ node.classList.add("bvn-route",`bvn-route--${kind}`); }

/* shared employee cache */
async function loadEmployees(force){
  if(state.employees.length && !force) return state.employees;
  const data=await api("admin_list_employees");
  state.employees=data.employees||[];
  state.empById={}; state.employees.forEach(e=>state.empById[e.id]=e);
  return state.employees;
}
function empName(id){ const e=state.empById[id]; return e?e.name:id; }

/* =================================================================
   DASHBOARD
   ================================================================= */
function ring(pct,label){
  pct=Math.max(0,Math.min(100,Math.round(pct)));
  return `<div class="ring" style="--p:${pct}"><div class="ring-in">${label}</div></div>`;
}
function lineIcon(kind){
  const paths={
    pulse:'<path d="M3 12h4l2.2-5 4 10 2.1-5H21"/><path d="M3 19h18"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    approve:'<path d="m4 12 4.2 4.2L20 5"/><path d="M20 12v7H4V5h11"/>',
    alert:'<path d="M12 3 21 20H3L12 3Z"/><path d="M12 9v4"/><path d="M12 16h.01"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-3.4 2.4-5.2 5.5-5.2s5 1.8 5.5 5.2"/><path d="M16 5.5a3 3 0 0 1 0 5"/><path d="M17 14.7c2.2.2 3.4 2 3.8 4.3"/>',
    exit:'<path d="M10 4H5v16h5"/><path d="M13 8l4 4-4 4"/><path d="M8 12h9"/>',
    bill:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind]||paths.pulse}</svg>`;
}
let _dashCalendarMonth=null;
const DASH_CAL_DOW=["จ","อ","พ","พฤ","ศ","ส","อา"];
function dashboardTeamCalendarHtml(month, team, attendanceDays, workdays, leaves=[]){
  const y=month.getFullYear(), m=month.getMonth(), last=new Date(y,m+1,0).getDate();
  const pad=n=>String(n).padStart(2,"0"), today=todayISO();
  const allowedDays=new Set(String(workdays||"1,2,3,4,5").split(",").filter(v=>v!==""));
  const byDate={};
  (attendanceDays||[]).forEach(row=>{ if(!row.date) return; (byDate[row.date]||(byDate[row.date]=[])).push(row); });
  let grid=DASH_CAL_DOW.map((name,i)=>`<div class="team-cal-dow" style="color:${i===5?"#2b5a86":i===6?"#8f322d":"var(--muted)"}">${name}</div>`).join("");
  const lead=(new Date(y,m,1).getDay()+6)%7;
  for(let i=0;i<lead;i++) grid+=`<div class="team-cal-day blank" aria-hidden="true"></div>`;
  let mWorkdays=0,mComplete=0,mRunning=0,mReview=0;
  for(let day=1;day<=last;day++){
    const iso=`${y}-${pad(m+1)}-${pad(day)}`, date=new Date(y,m,day), dow=date.getDay(), rows=byDate[iso]||[];
    const complete=rows.filter(r=>r.status==="complete"||!!(r.checkIn&&r.checkOut)).length;
    const open=rows.filter(r=>!!r.checkIn&&!r.checkOut).length;
    const leaveCount=new Set((leaves||[]).filter(leave=>leave.status==="approved"&&leave.startDate<=iso&&leave.endDate>=iso).map(leave=>leave.employeeId)).size;
    const scheduled=allowedDays.has(String(dow)), expected=Math.max(0,team.length-leaveCount), missing=Math.max(0, scheduled?expected-complete-open:0);
    const future=iso>today, isToday=iso===today;
    const expectedN=Math.max(expected,complete+open);
    const ratio=expectedN>0?Math.round((complete/expectedN)*100):0;
    let cls="", fig="", bar="";
    if(!scheduled){ cls="off weekend"; fig=`<span class="tcd-chip s-off"><i></i>หยุด</span>`; }
    else if(future){ cls="off future"; fig=`<span class="tcd-chip s-wait"><i></i>ล่วงหน้า</span>`; }
    else if(missing>0){ cls="warn"; bar=`<span class="tcd-bar"><i style="width:${ratio}%"></i></span>`; fig=`<span class="tcd-chip s-warn"><i></i>ตรวจ ${fmtInt(missing)}</span>`; }
    else if(open>0){ cls="ok run"; bar=`<span class="tcd-bar"><i style="width:${ratio}%"></i></span>`; fig=`<span class="tcd-chip s-run"><i></i>ทำงาน ${fmtInt(open)}</span>`; }
    else if(expectedN>0){ cls="ok"; bar=`<span class="tcd-bar"><i style="width:100%"></i></span>`; fig=`<span class="tcd-chip s-ok"><i></i>ครบ ${fmtInt(complete)}</span>`; }
    else { cls="off"; fig=leaveCount?`<span class="tcd-chip s-off"><i></i>ลา ${fmtInt(leaveCount)}</span>`:`<span class="tcd-chip s-off"><i></i>—</span>`; }
    if(scheduled && !future){ mWorkdays++; if(missing>0) mReview++; else if(open>0) mRunning++; else mComplete++; }
    const title=`${fmtDate(iso)}${scheduled&&!future?` · ครบ ${fmtInt(complete)} · กำลังทำงาน ${fmtInt(open)} · ต้องตรวจ ${fmtInt(missing)} · ทีม ${fmtInt(expectedN)}`:""}${leaveCount?` · ลา ${fmtInt(leaveCount)}`:""}`;
    grid+=`<button type="button" class="team-cal-day ${cls}${isToday?" today":""}" data-team-day="${iso}"${future?" disabled":""} title="${esc(title)}" aria-label="เปิดข้อมูลทีมวันที่ ${fmtDate(iso)}"><span class="tcd-date"><span class="tcd-n">${day}</span>${isToday?'<span class="tcd-today">วันนี้</span>':""}</span><span class="tcd-foot">${bar}${fig}</span></button>`;
  }
  return `<section class="panel dashboard-team-calendar" aria-label="ปฏิทินทีม"><div class="head"><div><b>ปฏิทินทีม</b><span class="sub" style="margin-left:8px">เลือกวันที่เพื่อดูสถานะทีมและจัดการเวลา</span></div><div class="spacer"></div><div class="team-cal-head"><button class="btn sub sm" data-team-cal-nav="prev" aria-label="เดือนก่อน">‹</button><b class="team-cal-label">${CAL_TH_MON[m]} ${y+543}</b><button class="btn sub sm" data-team-cal-nav="next" aria-label="เดือนถัดไป">›</button></div></div><div class="body"><div class="team-cal-sum"><span>วันทำงาน <b>${fmtInt(mWorkdays)}</b></span><span class="s-ok">ครบ <b>${fmtInt(mComplete)}</b></span>${mRunning?`<span class="s-run">ทำงาน <b>${fmtInt(mRunning)}</b></span>`:""}<span class="s-warn">ตรวจ <b>${fmtInt(mReview)}</b></span></div><div class="team-cal-legend"><span><i style="background:#1f9d61"></i>ครบ</span><span><i style="background:#2f7fd6"></i>ทำงาน</span><span><i style="background:#d9892a"></i>ตรวจ</span><span><i style="background:#9aa7b6"></i>หยุด/ล่วงหน้า</span></div><div class="team-cal-grid">${grid}</div></div></section>`;
}
async function renderDashboard(data, preloaded={}){
  const node=$("#page-dashboard");
  setRouteShell(node,"dashboard");
  try{
    skeleton(node);
    // Pull the headline stats plus richer context in parallel (frontend-only).
    const dash = data ? data : await api("dashboard");
    data=dash;
    const caps=data.capabilities||{attendance:true,approvals:true,financial:true};
    const canOperations=!!caps.attendance;
    const canFinance=!!caps.financial;
    // Do not request hidden data and then silently turn a 403/error into zero.
    // A role-specific dashboard must be honest about what this account can see.
    const optional=(allowed, action, empty)=>allowed ? api(action).catch(error=>({...empty,_loadError:error.message})) : Promise.resolve({...empty,_restricted:true});
    const calendarMonth=_dashCalendarMonth||new Date();
    const calendarStart=`${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-01`;
    const calendarEnd=`${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-${String(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0).getDate()).padStart(2,"0")}`;
    const [leaveD, timeD, attendanceD, setD, calendarD] = await Promise.all([
      preloaded.leaveD || optional(canOperations,"admin_list_leave_requests",{requests:[]}),
      preloaded.timeD || optional(canOperations,"admin_list_time_requests",{requests:[]}),
      preloaded.attendanceD || optional(canOperations,"admin_attendance_days",{days:[]}),
      optional(canOperations,"admin_get_settings",{settings:{}}),
      canOperations ? api("admin_attendance_days",{startDate:calendarStart,endDate:calendarEnd}).catch(error=>({days:[],_loadError:error.message})) : Promise.resolve({days:[],_restricted:true}),
    ]);
    const dashSettings=setD.settings||{};
    const dashShiftStart=dashSettings.shift_start||"09:00", dashGrace=Number(dashSettings.shift_grace_min||5);
    const dashShiftMin=pmHM(dashShiftStart)+dashGrace;
    // HR needs to know whether attendance is ready for payroll before leaving
    // the dashboard. This is a summary read only; the payroll page remains the
    // sole place that can calculate, lock, pay, or issue a statement.
    const owner=canFinance ? await optional(true,"admin_owner_overview",{}) : {};
    $("#asof").innerHTML = "ข้อมูลล่าสุด<br>"+fmtDateTime(data.asOf);
    const present=Number(data.present||0), total=Number(data.totalEmployees||0);
    const absent=Math.max(0,total-present);
    const presentPct = total? present/total*100 : 0;
    const leaves=(leaveD.requests||[]), times=(timeD.requests||[]);
    if(canOperations) await (preloaded.employees || loadEmployees()).catch(()=>{});
    const attendanceDays=attendanceD.days||[];
    const calendarDays=calendarD.days||attendanceDays;
    const dashboardTeam=(state.employees||[]).filter(e=>String(e.status||"").toLowerCase()==="active");
    const attendanceByEmployee={};
    attendanceDays.forEach(d=>{ const x=attendanceByEmployee[d.employeeId]||{complete:0,incomplete:0}; x[d.status==="complete"?"complete":"incomplete"]++; attendanceByEmployee[d.employeeId]=x; });
    const todayAtt=todayISO(), todayByEmp={};
    attendanceDays.filter(d=>d.date===todayAtt).forEach(d=>{ todayByEmp[d.employeeId]=d; });
    const attendancePeople=(state.employees||[]).filter(e=>String(e.status||"").toLowerCase()==="active").slice(0,12);
    const attendanceRows=attendancePeople.length?attendancePeople.map(e=>{
      const a=attendanceByEmployee[e.id]||{complete:0,incomplete:0}; const needsReview=a.incomplete>0;
      const t=todayByEmp[e.id]; const inDone=!!(t&&t.checkIn), outDone=!!(t&&t.checkOut);
      const chip=outDone?`<span class="att-chip att-chip-done">ครบแล้ว</span>`
        : inDone?`<span class="att-chip att-chip-in">เข้าแล้ว ${esc(t.checkIn)}</span>`
        : `<span class="att-chip att-chip-out">ยังไม่เข้า</span>`;
      return `<div class="attendance-row">
        <button class="att-name" data-calendar="${esc(e.id)}" aria-label="เปิดปฏิทินการทำงานของ ${esc(e.name)}"><b>${esc(e.name)}${chip}</b><small>${esc(e.role||"พนักงาน")} · ${esc(e.id)}</small></button>
        <span class="att-total"><b>${fmtInt(a.complete)}</b><small>ครบ</small></span>
        <span class="att-review ${needsReview?"is-warning":""}"><b>${fmtInt(a.incomplete)}</b><small>ต้องตรวจ</small></span>
        <span class="att-state ${needsReview?"is-warning":""}"><i></i>${needsReview?"ต้องตรวจ":"ปกติ"}</span>
        <span class="att-clock-cell">
          <button class="att-clock in" data-checkin="${esc(e.id)}"${inDone?" disabled":""} title="ลงเวลาเข้างานให้ ${esc(e.name)}">เข้า</button>
          <button class="att-clock out" data-checkout="${esc(e.id)}"${(!inDone||outDone)?" disabled":""} title="ลงเวลาออกงานให้ ${esc(e.name)}">ออก</button>
        </span></div>`;
    }).join(""):`<div class="empty">ยังไม่มีรายชื่อพนักงานที่ใช้งานอยู่</div>`;
    const pendL=leaves.filter(r=>r.status==="pending"), pendT=times.filter(r=>r.status==="pending");
    setApprovalBadge(pendL.length+pendT.length);
    // Pending approvals scoped to the current month (for the "วันนี้" notification).
    const _ymNow=todayISO().slice(0,7), _inMonth=(d)=>String(d||"").slice(0,7)===_ymNow;
    const mLeave=pendL.filter(r=>_inMonth(r.startDate)).length;
    const mOt=pendT.filter(r=>r.requestType==="overtime"&&_inMonth(r.workDate)).length;
    const mEdit=pendT.filter(r=>r.requestType!=="overtime"&&_inMonth(r.workDate)).length;
    const mPend=mLeave+mOt+mEdit, _thMon=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][new Date().getMonth()];
    const totalNet = owner.totalNet!=null?owner.totalNet:(owner.totalGross||0);
    const payrollPeriod=owner.period||{};
    const payrollPeriodLabel=payrollPeriod.start?`${fmtDate(payrollPeriod.start)} – ${fmtDate(payrollPeriod.end)}`:"ยังไม่มีงวดที่กำลังตรวจ";
    const payrollIncomplete=(owner.incompleteDays||[]).length;
    const payrollEligible=Number(owner.paidCount||0);
    const payrollGross=Number(owner.totalGross||0);
    const payrollDed=Number(owner.totalAdvance||0)+Number(owner.totalSso||0)+Number(owner.totalOther||0);
    const latestPayrollPaid=String(data.latestPayrollStatus||"").toLowerCase()==="paid";
    const payrollActionLabel="ตรวจ Timesheet · ออกสลิป";
    const pendingList=[
      ...pendL.map(r=>({type:"ลา",name:empName(r.employeeId),detail:`${r.leaveType} · ${fmtDate(r.startDate)}`,nav:"approvals"})),
      ...pendT.map(r=>({type:r.requestType==="overtime"?"OT":"แก้เวลา",name:empName(r.employeeId),detail:`${fmtDate(r.workDate)} · ${fmtHours(r.requestedMinutes)}`,nav:"approvals"})),
    ].slice(0,6);
    if(canOperations){
      // "วันนี้" v2: a team-at-a-glance donut, a clickable team grid that reopens
      // the per-person calendar, and the decisions queue. Deep per-person history
      // lives on เวลาทำงาน → รายคน; this stays a fast operational home.
      const team=dashboardTeam;
      const tstat=(e)=>{ const t=todayByEmp[e.id]; if(!t||!t.checkIn) return "out"; if(t.checkOut) return "done"; return pmHM(t.checkIn)>dashShiftMin?"late":"in"; };
      let cOn=0,cLate=0,cDone=0;
      team.forEach(e=>{ const s=tstat(e); if(s==="in") cOn++; else if(s==="late") cLate++; else if(s==="done") cDone++; });
      const cOut=team.length-cOn-cLate-cDone, tot=team.length||1;
      const pOn=Math.round(cOn/tot*100), pLate=Math.round(cLate/tot*100);
      const arrivalHours=[6,7,8,9,10,11,12];
      const arrivals=arrivalHours.map(hour=>team.filter(e=>{
        const v=todayByEmp[e.id]?.checkIn; return v&&Math.floor(pmHM(v)/60)===hour;
      }).length);
      const arrivalPeak=Math.max(1,...arrivals);
      const arrivalBars=arrivals.map((count,i)=>{
        const height=Math.max(4,Math.round(count/arrivalPeak*100));
        return `<span class="arrival-bar" style="--bar:${height}%">${count?`<em>${fmtInt(count)}</em>`:""}<i class="${count===arrivalPeak&&count?"is-peak":""}" style="height:${height}%"></i></span>`;
      }).join("");
      const arrivalLabels=arrivalHours.map(h=>`<span>${String(h).padStart(2,"0")}:00</span>`).join("");
      const SMETA={
        in:{soft:"#e8f6ee",ink:"#167348",ring:"#22a06b",label:"กำลังทำงาน"},
        late:{soft:"#fff1df",ink:"#9a5d11",ring:"#e58b24",label:"เข้างานสาย"},
        done:{soft:"#edf2f7",ink:"#52677d",ring:"#7e93a8",label:"ออกงานแล้ว"},
        out:{soft:"#fff8e8",ink:"#9a5d11",ring:"#e6a23b",label:"ยังไม่เข้างาน"}
      };
      const nowMin=(()=>{ const n=new Date(); return n.getHours()*60+n.getMinutes(); })();
      // Surface who needs attention: late first, then not-in, then on-time; by check-in time.
      const sOrder={late:0,out:1,in:2};
      team.sort((a,b)=>{ const sa=tstat(a),sb=tstat(b); if(sOrder[sa]!==sOrder[sb]) return sOrder[sa]-sOrder[sb];
        const ta=todayByEmp[a.id],tb=todayByEmp[b.id]; return pmHM(ta&&ta.checkIn)-pmHM(tb&&tb.checkIn); });
      const teamHtml=team.length?team.map(e=>{
        const s=tstat(e), t=todayByEmp[e.id], m=SMETA[s];
        let meta;
        if(s==="out") meta="ยังไม่มีเวลาเข้า";
        else if(s==="done") meta=`เข้า ${esc(t.checkIn)} · ออก ${esc(t.checkOut)}`;
        else { const w=Math.max(0,nowMin-pmHM(t.checkIn)); meta=`เข้า ${esc(t.checkIn)} · ${w>=30?fmtHours(w):"เพิ่งเข้า"}`; }
        const checkIn=t&&t.checkIn?esc(t.checkIn):"—";
        const checkOut=t&&t.checkOut?esc(t.checkOut):"—";
        const canCheckIn=s==="out", canCheckOut=s==="in"||s==="late";
        const rowClass=s==="in"?"is-online":s==="late"?"is-late":s==="done"?"is-done":"is-offline";
        return `<div class="team-row tc-${s} ${rowClass}" data-calendar="${esc(e.id)}" role="button" tabindex="0" title="ดูปฏิทินของ ${esc(e.name)}">
          <span class="pm-av" style="background:${m.soft};color:${m.ink}">${esc((e.name||e.id).trim().slice(0,2))}<i class="presence-dot"></i></span>
          <span><span class="tc-name">${esc(e.name)}</span><span class="tc-role">${esc(e.role||e.id)}</span></span>
          <span class="tc-time-flow" aria-label="เวลาเข้างาน ${checkIn} ออกงาน ${checkOut}">
            <span class="tc-clock-cell tc-clock-in"><i></i><b>${checkIn}</b></span><span class="tc-flow-line"></span><span class="tc-clock-cell tc-clock-out"><i></i><b>${checkOut}</b></span>
          </span>
          <span class="tc-pill"><i></i>${m.label}</span>
          <span class="tc-actions" aria-label="บันทึกเวลาแทน"><button type="button" class="btn ok sm" data-checkin="${esc(e.id)}" ${canCheckIn?"":"disabled"}>Check-In</button><button type="button" class="btn sub sm" data-checkout="${esc(e.id)}" ${canCheckOut?"":"disabled"}>Check-Out</button></span>
        </div>`;
      }).join(""):`<div class="empty">ยังไม่มีพนักงานที่ใช้งานอยู่</div>`;
      // One queue, ordered by payroll risk.  A generic count made operators
      // hunt for the affected employee before they could act.
      const incompleteRows=attendanceDays.filter(d=>d.date<=todayAtt&&d.status!=="complete");
      const actionQueue=[];
      incompleteRows.forEach(d=>actionQueue.push({kind:"time",name:d.name||empName(d.employeeId)||d.employeeId,detail:`${fmtDate(d.date)} · ${d.checkIn?"ยังไม่ได้เช็กเอาต์":"เวลาเข้า–ออกไม่ครบ"}`,cta:"ตรวจเวลา",target:"owner",filter:"review",priority:0}));
      pendT.filter(r=>String(r.requestType||"").toLowerCase()==="overtime").forEach(r=>actionQueue.push({kind:"ot",name:empName(r.employeeId),detail:`${fmtDate(r.workDate)} · ${fmtHours(r.requestedMinutes)} · รออนุมัติก่อนนำไปคำนวณเงินเดือน`,cta:"อนุมัติ OT",target:"approvals",priority:1}));
      dashboardTeam.filter(e=>!e.nationalId||!e.phone).forEach(e=>actionQueue.push({kind:"profile",name:e.name||e.id,detail:`ข้อมูลเอกสารยังไม่ครบ · ${!e.nationalId?"ยังไม่มีเลขบัตรประชาชน":"ยังไม่มีเบอร์โทรศัพท์"}`,cta:"จัดการข้อมูล",target:"people",priority:2}));
      pendL.forEach(r=>actionQueue.push({kind:"leave",name:empName(r.employeeId),detail:`${fmtDate(r.startDate||r.leaveDate||r.workDate)} · คำขอลารออนุมัติ`,cta:"พิจารณา",target:"approvals",priority:2}));
      if(canFinance&&actionQueue.length===0&&payrollEligible>0) actionQueue.push({kind:"payroll",name:"งวดเงินเดือนปัจจุบัน",detail:`คำนวณได้ ${fmtInt(payrollEligible)} คน · พร้อมตรวจและออกสลิป`,cta:"ออกสลิป",target:"payroll",priority:3});
      actionQueue.sort((a,b)=>a.priority-b.priority);
      const queueStyle={time:"red",ot:"amber",profile:"blue",leave:"blue",payroll:"green"};
      const decideHtml=(leaveD._loadError||timeD._loadError)?`<div class="empty">โหลดรายการคิวงานไม่สำเร็จ</div>`
        :actionQueue.length?actionQueue.slice(0,5).map(item=>`<div class="dash-row action-queue-row" data-action-target="${esc(item.target)}" data-owner-filter="${esc(item.filter||"")}" style="cursor:pointer"><span class="badge ${queueStyle[item.kind]||"grey"}">${item.kind==="time"?"เวลา":item.kind==="ot"?"OT":item.kind==="leave"?"ลา":item.kind==="profile"?"ข้อมูล":"เงินเดือน"}</span><div style="flex:1;min-width:0"><div class="aq-name">${esc(item.name)}</div><div class="sub">${esc(item.detail)}</div></div><button class="btn sub sm aq-action" type="button" data-action-target="${esc(item.target)}" data-owner-filter="${esc(item.filter||"")}">${esc(item.cta)}</button></div>`).join("")
        :`<div class="empty">วันนี้ไม่มีรายการค้างตรวจ</div>`;
      // Payday reminder: when the pay cycle is near/at/overdue, nudge the owner to
      // review timesheets and issue payslips. Window = 3 days before → 2 days after.
      const payInfo = canFinance ? nextPaydayInfo(dashSettings) : null;
      const payDue = !!payInfo && payInfo.diffDays<=3 && !latestPayrollPaid;
      const payOk = payDue && !payrollIncomplete;
      const paydayAlertHtml = payDue ? `<section class="payday-alert ${payOk?"ok":"warn"}" aria-label="แจ้งเตือนรอบจ่ายเงินเดือน">
          <div class="pa-ico">${lineIcon("clock")}</div>
          <div class="pa-body"><b>${payInfo.diffDays<=0?"ถึงกำหนดรอบจ่ายเงินเดือนแล้ว":`อีก ${fmtInt(payInfo.diffDays)} วันถึงรอบจ่ายเงินเดือน`} · วันจ่าย ${fmtDate(payInfo.nextISO)}</b><span>${payrollIncomplete?`ยังมีเวลาไม่ครบ ${fmtInt(payrollIncomplete)} รายการ — ตรวจ timesheet ให้ครบก่อนออกสลิป`:"เวลาครบแล้ว — ตรวจยอดและออกสลิปเงินเดือนได้เลย"}</span></div>
          <div class="pa-actions"><button class="btn sub sm" data-nav="owner">ตรวจ timesheet</button><button class="btn sm" data-nav="payroll">ออกสลิปเงินเดือน</button></div>
        </section>` : "";
      // ---- Live staffing instrument: the dashboard's first reading, not a decorative chart. ----
      const ringTotal=team.length||1;
      const staffingStates=[
        {key:"on",label:"ตรงเวลา",value:cOn,icon:"approve"},
        {key:"late",label:"มาสาย",value:cLate,icon:"alert"},
        {key:"done",label:"ออกแล้ว",value:cDone,icon:"exit"},
        {key:"out",label:"ยังไม่เข้า",value:cOut,icon:"clock"}
      ];
      const staffingBar=staffingStates.map(state=>`<i class="is-${state.key}" style="width:${(state.value/ringTotal*100).toFixed(2)}%"></i>`).join("");
      const staffingRows=staffingStates.map(state=>`<div class="cc-staff-row ${state.key}"><span class="cc-staff-icon">${lineIcon(state.icon)}</span><span>${state.label}</span><b>${fmtInt(state.value)}</b></div>`).join("");
      const shiftEnd=dashSettings.shift_end||"18:00";
      const workdaysCount=String(dashSettings.workdays||"1,2,3,4,5").split(",").filter(x=>x!=="").length;
      const heroHeadline = team.length ? (cOut===0?"ทีมเข้างานครบทุกคนแล้ว":`เข้างานแล้ว ${fmtInt(cOn+cLate+cDone)} จาก ${fmtInt(team.length)} คน`) : "ยังไม่มีพนักงานที่ใช้งาน";
      const heroSub = [cLate?`เข้าสาย ${fmtInt(cLate)} คน`:"", cOut?`ยังไม่เข้า ${fmtInt(cOut)} คน`:"", Number(data.exceptions)?`เวลาต้องตรวจ ${fmtInt(data.exceptions)} รายการ`:""].filter(Boolean).join(" · ")||"สถานะทีมเป็นปกติทุกอย่าง";
      const SVG={clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',late:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/></svg>',inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M4 7h16v12H4z"/></svg>',search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><circle cx="17" cy="13" r="1.3"/></svg>'};
      node.innerHTML=`
        <div class="cc">
          ${paydayAlertHtml}
          <header class="cc-head">
            <div class="cc-head-l"><div class="cc-eyebrow"><i></i>ศูนย์ปฏิบัติการกำลังคน · ${fmtDate(todayISO())}</div><h2>ภาพรวมวันนี้</h2></div>
            <div class="cc-head-r"><div class="cc-clock" id="ccClock" aria-label="เวลาปัจจุบัน">--:--</div><button class="btn hr-primary" data-act="clock">${SVG.clock} บันทึกเวลาแทน</button></div>
          </header>
          <section class="cc-hero" aria-label="สถานะทีมวันนี้">
            <div class="cc-ring-panel">
              <div class="cc-shift-live"><i></i>สถานะกะงานแบบเรียลไทม์</div>
              <div class="cc-staffing-core">
                <div class="cc-staffing-figure"><span class="cc-staffing-icon">${lineIcon("users")}</span><div><span>กำลังทำงาน</span><b>${fmtInt(cOn+cLate)} <small>/ ${fmtInt(team.length)} คน</small></b></div></div>
                <div class="cc-staffing-rows">${staffingRows}</div>
              </div>
              <div class="cc-staffing-bar" aria-label="สัดส่วนสถานะทีม">${staffingBar}</div>
              <div class="cc-shift-stats"><div><span>เริ่มกะ</span><b>${esc(dashShiftStart)} น.</b></div><div><span>ติดตามเวลา</span><b>${fmtInt(data.exceptions)} รายการ</b></div></div>
            </div>
            <div class="cc-hero-main">
              <div class="cc-kicker">สถานะทีม ณ ปัจจุบัน</div>
              <h3>${heroHeadline}</h3>
              <p>${heroSub}</p>
              <div class="cc-chips"><span class="cc-chip ok"><i></i>ออนไลน์ ${fmtInt(cOn+cLate)}</span><span class="cc-chip amber"><i></i>สาย ${fmtInt(cLate)}</span><span class="cc-chip rose"><i></i>ต้องตรวจ ${fmtInt(data.exceptions)}</span></div>
              <div class="cc-hero-foot"><div><span>กะงาน</span><b>${esc(dashShiftStart)}–${esc(shiftEnd)} น.</b></div><div><span>ผ่อนผันสาย</span><b>${fmtInt(dashGrace)} นาที</b></div><div><span>วันทำงาน</span><b>${fmtInt(workdaysCount)} วัน/สัปดาห์</b></div></div>
            </div>
            <div class="cc-hero-rail" aria-label="สรุปงานและเงินเดือน">
              <button class="cc-hero-metric live" data-nav="owner"><span>ลงเวลาแล้ววันนี้</span><b>${fmtInt(cOn+cLate+cDone)} คน</b><small>ออนไลน์ ${fmtInt(cOn+cLate)} · ออกแล้ว ${fmtInt(cDone)}</small></button>
              ${canFinance?`<button class="cc-hero-metric money" data-nav="payroll"><span>ยอดจ่ายสุทธิประมาณการ</span><b>${fmtBaht(totalNet)}</b><small>พร้อมตรวจสลิป ${fmtInt(payrollEligible)} คน</small></button>`:""}
            </div>
          </section>
          <section class="cc-metrics cc-summary-tiles" aria-label="สรุปงานประจำวัน">
            <div class="cc-summary-label"><span>สรุปงานวันนี้</span><small>กดดูรายละเอียด</small></div>
            <button class="cc-stat s-blue" data-nav="owner"><span class="cc-stat-ic">${SVG.clock}</span><span class="cc-stat-l">ลงเวลาแล้ว</span><b>${fmtInt(cOn+cLate+cDone)}</b><small>จาก ${fmtInt(team.length)} คนในทีม</small></button>
            <button class="cc-stat s-amber" data-nav="owner"><span class="cc-stat-ic">${SVG.late}</span><span class="cc-stat-l">ยังไม่เข้างาน</span><b>${fmtInt(cOut)}</b><small>${cLate?`มาสาย ${fmtInt(cLate)} คน`:"ติดตามก่อนเริ่มกะ"}</small></button>
            <button class="cc-stat s-rose" data-nav="owner"><span class="cc-stat-ic">${SVG.search}</span><span class="cc-stat-l">ต้องตรวจเวลา</span><b>${fmtInt(data.exceptions)}</b><small>${Number(data.exceptions)?"ตรวจให้ครบก่อนปิดรอบ":"ไม่มีรายการค้างตรวจ"}</small></button>
            ${canFinance?`<button class="cc-stat s-green" data-nav="payroll"><span class="cc-stat-ic">${SVG.wallet}</span><span class="cc-stat-l">พร้อมตรวจสลิป</span><b>${fmtInt(payrollEligible)}</b><small>${payrollIncomplete?`ค้างตรวจเวลา ${fmtInt(payrollIncomplete)} รายการ`:"Timesheet พร้อมคำนวณ"}</small></button>`:`<button class="cc-stat s-indigo" data-nav="approvals"><span class="cc-stat-ic">${SVG.inbox}</span><span class="cc-stat-l">รออนุมัติ</span><b>${fmtInt(mPend)}</b><small>ลา ${fmtInt(mLeave)} · OT ${fmtInt(mOt)} · ${_thMon}</small></button>`}
          </section>
          <section class="cc-split">
            <div class="panel cc-arrival"><div class="head"><div><b>ช่วงเวลาเข้างานของทีม</b><span class="sub" style="margin-left:8px">วันนี้ · พีคสุด ${fmtInt(arrivalPeak)} คน</span></div></div><div class="body"><div class="cc-arrival-chart"><div class="cc-bars">${arrivalBars}</div><div class="cc-axis">${arrivalLabels}</div></div></div></div>
            ${canFinance?`<div class="panel cc-payroll"><div class="head"><div><b>เงินเดือนงวดปัจจุบัน</b><span class="sub" style="margin-left:8px">${esc(payrollPeriodLabel)}</span></div><div class="spacer"></div><span class="cc-pay-badge ${payrollIncomplete?"wait":"ok"}">${payrollIncomplete?"ต้องตรวจ":"พร้อมออกสลิป"}</span></div><div class="body"><div class="cc-pay-metrics"><div><span>ยอดสุทธิตาม Timesheet</span><b class="money">${fmtBaht(totalNet)}</b><em>ก่อนหัก ${fmtBaht(payrollGross)} · หัก ${fmtBaht(payrollDed)}</em></div><div><span>คำนวณได้</span><b>${fmtInt(payrollEligible)} คน</b><em>มีเวลาและเรตครบ</em></div><div><span>เวลาค้างตรวจ</span><b class="${payrollIncomplete?"warn":""}">${fmtInt(payrollIncomplete)} รายการ</b><em>${payrollIncomplete?"ต้องตรวจให้ครบก่อนออกสลิป":"ไม่มีรายการค้าง"}</em></div></div><div class="cc-pay-actions"><button class="btn sub sm" data-nav="owner">ตรวจเวลาเข้า–ออก</button><button class="btn sm" data-nav="payroll">${payrollActionLabel}</button></div></div></div>`:""}
          </section>
          <section class="cc-work">
            <div class="panel cc-decide"><div class="head"><b>งานที่ต้องจัดการ</b><span class="sub" style="margin-left:8px">เรียงตามผลกระทบต่อเงินเดือน</span><div class="spacer"></div><button class="btn sub sm" data-nav="approvals">เปิดคำขอทั้งหมด</button></div><div class="body flush dash-list">${decideHtml}</div></div>
            <div class="panel team-register hr-team"><div class="head"><div><b>ทีมวันนี้</b><span class="sub" style="margin-left:8px">เลือกชื่อเพื่อดูเวลาเข้า–ออกและประวัติ</span></div><div class="spacer"></div><div class="team-status-summary" aria-label="สรุปสถานะทีม"><span class="not-in">ยังไม่เข้า <b>${fmtInt(cOut)}</b></span><span class="working">ทำงาน <b>${fmtInt(cOn+cLate)}</b></span><span class="finished">ออกแล้ว <b>${fmtInt(cDone)}</b></span></div><button class="btn sub sm" data-nav="owner">บันทึกเวลาแทน</button></div><div class="body"><div class="team-register-head"><span></span><span>พนักงาน</span><span>เข้างาน</span><span>ออกงาน</span><span>สถานะ</span><span>การทำงาน</span></div><div class="team-grid">${teamHtml}</div></div></div>
          </section>
          <section class="cc-lower"><section class="panel dashboard-personal-time" aria-label="เวลาทำงานรายบุคคล"><div class="head"><div><b>แนวโน้มเวลาทำงานรายบุคคล</b><span class="sub" style="margin-left:8px">สรุปเดือนนี้ · เลือกพนักงานเพื่อดูรายละเอียด</span></div></div><div class="body"><div id="peoplePulse"><div class="empty">กำลังโหลดสรุปรายบุคคล…</div></div></div></section><section class="panel site-policy dashboard-checkin-sites" aria-label="จุดเช็กอินที่อนุญาต"><div class="head"><div><b>จุดเช็กอินที่อนุญาต</b><span class="sub" style="margin-left:8px">นโยบายพื้นที่สำหรับการเช็กอิน</span></div><div class="spacer"></div><button class="btn sm" id="siteAddBtn">เพิ่มจุด</button></div><div class="site-policy-note">พนักงานเช็กอินได้เมื่ออยู่ในรัศมีของจุดที่เปิดใช้งาน · เช็กเอาต์ได้ทุกพื้นที่</div><div class="body flush"><table id="siteTable"><thead><tr><th>พื้นที่</th><th class="num">รัศมี</th><th>สถานะ</th><th data-nosort></th></tr></thead><tbody id="siteRows"><tr><td colspan="4"><div class="empty">กำลังโหลดจุดเช็กอิน…</div></td></tr></tbody></table></div></section></section>
          ${dashboardTeamCalendarHtml(calendarMonth, team, calendarDays, dashSettings.workdays, leaves)}
          <div class="toolbar dash-short"><button class="btn ghost" data-act="emp">เพิ่มพนักงาน</button><button class="btn ghost" data-act="ot">บันทึก OT</button>${canFinance?`<button class="btn ghost" data-nav="payroll">ตรวจเงินเดือน</button>`:""}</div>
        </div>`;
    } else {
      // Finance-only account: focused financial summary (unchanged layout).
      node.innerHTML=`
        <div class="dashboard-pulse"><div class="cards">
          <div class="card"><div class="label">ยอดสุทธิต้องจ่ายงวดนี้</div>
            ${owner._loadError?`<div class="value">—</div><div class="note bad">โหลดข้อมูลการเงินไม่สำเร็จ</div>`:`<div class="value">${fmtBaht(totalNet)}</div>
            <div class="note">gross ${fmtBaht(owner.totalGross||0)} · ${fmtInt(owner.paidCount||0)} คน</div>`}</div>
          <div class="card"><div class="label">เวลาค้างตรวจ</div>
            <div class="value">${fmtInt(payrollIncomplete)}</div>
            <div class="note ${payrollIncomplete?"bad":""}">${payrollIncomplete?"ตรวจให้ครบก่อนออกสลิป":"ไม่มีรายการค้าง"}</div></div>
        </div></div>
        <div style="display:grid;grid-template-columns:1fr;gap:18px;margin-top:18px" class="dash-grid"></div>
        <div class="panel dashboard-shortcuts"><div class="head"><b>งานอื่น</b></div>
          <div class="body toolbar">
            <button class="btn ghost" data-nav="payroll">พรีวิวเงินเดือน</button>
            <div class="spacer"></div>
            <span class="sub">งวดล่าสุด: ${data.latestPayrollId?`<b>${esc(data.latestPayrollId)}</b> <span class="badge ${data.latestPayrollStatus==="locked"?"blue":"grey"}">${esc(data.latestPayrollStatus||"—")}</span>`:"ยังไม่มีงวดที่ล็อก"}</span>
          </div>
        </div>`;
      const financialGrid=node.querySelector(".dash-grid");
      if(financialGrid) financialGrid.innerHTML=`<div class="panel" style="margin:0;grid-column:1/-1"><div class="head"><b>สรุปงวดเงินเดือนปัจจุบัน</b><span class="sub" style="margin-left:8px">${owner.period?`${fmtDate(owner.period.start)} – ${fmtDate(owner.period.end)}`:"กำลังโหลดงวดปัจจุบัน"}</span><div class="spacer"></div><button class="btn sub sm" data-nav="payroll">ตรวจ Timesheet</button></div><div class="body"><div class="dash-main-grid"><div class="finance-box"><span>ยอดก่อนหัก</span><b class="f-value">${owner._loadError?"—":fmtBaht(owner.totalGross)}</b><small>พนักงาน ${owner._loadError?"—":fmtInt(owner.paidCount||0)} คน</small></div><div class="finance-box"><span>รายการหักทั้งหมด</span><b class="f-value">${owner._loadError?"—":fmtBaht(Number(owner.totalAdvance||0)+Number(owner.totalSso||0)+Number(owner.totalOther||0))}</b><small>ล่วงหน้า · SSO · หักอื่น</small></div><div class="finance-box"><span>ยอดสุทธิตาม Timesheet</span><b class="f-value">${owner._loadError?"—":fmtBaht(totalNet)}</b><small>${owner._loadError?"โหลดข้อมูลการเงินไม่สำเร็จ":"ตรวจ Timesheet ก่อนออกสลิป"}</small></div><div class="finance-box"><span>เวลาค้างตรวจ</span><b class="f-value">${owner._loadError?"—":fmtInt(payrollIncomplete)}</b><small>${payrollIncomplete?"ตรวจให้ครบก่อนออกสลิป":"ไม่มีรายการค้าง"}</small></div></div></div></div>`;
      const hero=el(`<section class="ops-hero"><div><div class="hero-kicker"><i class="live"></i> BVN FINANCE · ${fmtDate(todayISO())}</div><h2>${payrollIncomplete?"มีรายการเวลาที่ต้องตรวจก่อนออกสลิป":"ภาพรวมเงินเดือนพร้อมตรวจสอบ"}</h2><p>ดูยอดค่าแรง ตรวจ Timesheet และออกสลิปเงินเดือนได้จากหน้าเดียว</p><div class="hero-actions"><button class="btn" data-nav="payroll">พรีวิวเงินเดือน</button></div></div><div class="hero-attendance"><div class="ring-in" style="width:46px;height:46px">฿</div><div><b>ยอดสุทธิงวดนี้</b><span>${owner._loadError?"โหลดข้อมูลไม่สำเร็จ":fmtBaht(totalNet)}</span></div></div></section>`);
      const priority=el(`<section class="action-grid" aria-label="งานสำคัญ"><button class="action-card ${payrollIncomplete?"warn":""}" data-nav="payroll"><span class="a-icon">฿</span><span><b>${payrollIncomplete?`ตรวจเวลา ${fmtInt(payrollIncomplete)} รายการ`:`ตรวจและออกสลิป ${fmtInt(payrollEligible)} คน`}</b><span>${payrollIncomplete?"ตรวจ Timesheet ให้ครบก่อนออกสลิป":"เปิดงวดเงินเดือนเพื่อดูยอดและออกสลิป"}</span></span></button></section>`);
      node.prepend(hero); hero.after(priority);
    }
    node.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
    node.querySelectorAll("[data-action-target]").forEach(b=>b.onclick=(ev)=>{
      ev.stopPropagation();
      if(b.dataset.ownerFilter) ownerState.filter=b.dataset.ownerFilter;
      go(b.dataset.actionTarget);
    });
    node.querySelectorAll("[data-calendar]").forEach(b=>{ b.onclick=()=>openAttendanceCalendar(b.dataset.calendar, attendanceDays, attendanceD, owner); b.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openAttendanceCalendar(b.dataset.calendar, attendanceDays, attendanceD, owner); } }; });
    node.querySelectorAll('[data-checkin]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); quickClock(b.dataset.checkin,"check_in",b); });
    node.querySelectorAll('[data-checkout]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); quickClock(b.dataset.checkout,"check_out",b); });
    node.querySelectorAll('[data-act="clock"]').forEach(b=>b.onclick=()=>adminAttendanceDialog());
    node.querySelectorAll('[data-act="emp"]').forEach(b=>b.onclick=()=>employeeDialog(null));
    node.querySelectorAll('[data-act="ot"]').forEach(b=>b.onclick=()=>addOvertimeDialog());
    node.querySelectorAll("[data-team-cal-nav]").forEach(b=>b.onclick=()=>{
      const base=_dashCalendarMonth||new Date();
      const offset=b.dataset.teamCalNav==="prev"?-1:1;
      _dashCalendarMonth=new Date(base.getFullYear(),base.getMonth()+offset,1);
      renderDashboard();
    });
    node.querySelectorAll("[data-team-day]").forEach(b=>b.onclick=()=>openTeamDayDialog(b.dataset.teamDay));
    if(canOperations && node.querySelector("#peoplePulse")) renderPeoplePulse(dashboardTeam, dashShiftMin, dashSettings.workdays);
    // Live wall clock in the command-center header (premium touch; cheap).
    const _ccTick=()=>{ const c=document.querySelector("#ccClock"); if(!c) return; const n=new Date(); c.textContent=String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0"); };
    if(window._ccClockTimer) clearInterval(window._ccClockTimer);
    if(node.querySelector("#ccClock")){ _ccTick(); window._ccClockTimer=setInterval(_ccTick,20000); }
    if(canOperations && node.querySelector("#siteRows")){
      $("#siteAddBtn").onclick=()=>siteDialog(null);
      loadSites();
    }
  }catch(err){ dashboardFallback(node, err); }
}
function dashboardFallback(node, err){
  node.innerHTML=`<section class="panel dashboard-recovery" aria-live="polite">
    <div class="head"><b>ภาพรวมวันนี้ยังโหลดไม่เสร็จ</b><span class="badge amber">ต้องตรวจ</span></div>
    <div class="body">
      <p class="sub" style="margin:0 0 16px">${esc(err.message||"ไม่สามารถโหลดข้อมูลสรุปได้")}</p>
      <p style="margin:0 0 18px">คุณยังทำงานหลักต่อได้โดยไม่ต้องรอหน้า Dashboard</p>
      <div class="toolbar"><button class="btn" data-retry-dashboard>ลองโหลดภาพรวมอีกครั้ง</button><button class="btn ghost" data-nav="owner">ตรวจและลงเวลา</button><button class="btn ghost" data-nav="payroll">เปิดเงินเดือน</button></div>
    </div>
  </section>`;
  node.querySelector("[data-retry-dashboard]").onclick=()=>renderDashboard();
  node.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
}
async function openTeamDayDialog(date){
  const body=el(`<div><div class="sub" style="margin-bottom:14px">${fmtDate(date)} · เลือกพนักงานเพื่อเปิดปฏิทินและตรวจรายละเอียดเวลา</div><div id="teamDayRows"><div class="empty">กำลังโหลดข้อมูลทีม…</div></div></div>`);
  const manual=el(`<button class="btn">บันทึกเวลาแทน</button>`); manual.onclick=()=>adminAttendanceDialog();
  const close=el(`<button class="btn sub">ปิด</button>`); close.onclick=closeModal;
  openModal(`สถานะทีม · ${fmtDate(date)}`,body,[manual,close]);
  try{
    const response=await api("admin_attendance_days",{startDate:date,endDate:date});
    const byEmployee={}; (response.days||[]).forEach(day=>{ byEmployee[day.employeeId]=day; });
    const active=(state.employees||[]).filter(emp=>String(emp.status||"").toLowerCase()==="active");
    const html=active.length?`<div class="dash-list">${active.map(emp=>{
      const row=byEmployee[emp.id], complete=!!(row?.checkIn&&row?.checkOut), started=!!row?.checkIn;
      const status=complete?"ครบ":started?"รอเช็กเอาต์":"ยังไม่มีบันทึก";
      const tone=complete?"":" amber";
      return `<button type="button" class="dash-row" data-team-employee="${esc(emp.id)}" style="width:100%;cursor:pointer;text-align:left"><span class="pm-av">${esc((emp.name||emp.id).trim().slice(0,2))}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${esc(emp.name)}</div><div class="sub">${esc(row?.checkIn||"—")} → ${esc(row?.checkOut||"—")}${row?.workedMinutes?` · ${fmtHours(row.workedMinutes)}`:""}</div></div><span class="badge${tone}">${status}</span><span class="sub">›</span></button>`;
    }).join("")}</div>`:`<div class="empty">ยังไม่มีพนักงานที่ใช้งานอยู่</div>`;
    const host=body.querySelector("#teamDayRows"); if(host) host.innerHTML=html;
    body.querySelectorAll("[data-team-employee]").forEach(button=>button.onclick=()=>openAttendanceCalendar(button.dataset.teamEmployee));
    if(date!==todayISO()){ manual.disabled=true; manual.title="ลงเวลาแทนได้เฉพาะเวลาปัจจุบัน"; }
  }catch(err){ const host=body.querySelector("#teamDayRows"); if(host) host.innerHTML=`<div class="empty">${esc(err.message||"โหลดข้อมูลทีมไม่สำเร็จ")}</div>`; }
}
// Per-person attendance pulse for the dashboard: a mini donut (on-time vs late)
// + counts for the current month. Clicking opens that person's calendar.
async function renderPeoplePulse(team, shiftMin, workdays){
  const box=document.getElementById("peoplePulse"); if(!box) return;
  try{
    const now=new Date(), start=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`, end=todayISO();
    const [attD, holD]=await Promise.all([
      api("admin_attendance_days",{startDate:start,endDate:end}),
      api("admin_list_holidays").catch(()=>({holidays:[]})),
    ]);
    const by={}; (attD.days||[]).forEach(r=>{ if(!r.checkIn) return; const x=by[r.employeeId]||{present:0,late:0}; x.present++; if(pmHM(r.checkIn)>shiftMin) x.late++; by[r.employeeId]=x; });
    // Expected workdays elapsed this month (per the schedule, excluding holidays) → used for "ขาด".
    const wd=String(workdays||"1,2,3,4,5").split(",").map(x=>x.trim()).filter(x=>x!=="");
    const holSet=new Set((holD.holidays||[]).map(h=>h.date));
    let expected=0;
    for(let dt=new Date(now.getFullYear(),now.getMonth(),1); dt<=now; dt.setDate(dt.getDate()+1)){
      const iso=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
      if(wd.includes(String(dt.getDay())) && !holSet.has(iso)) expected++;
    }
    const people=(team||[]).filter(e=>String(e.status||"").toLowerCase()==="active");
    if(!people.length){ box.innerHTML=`<div class="empty">ยังไม่มีพนักงานที่ใช้งานอยู่</div>`; return; }
    box.className="people-pulse-grid"; box.style.display=""; box.style.gridTemplateColumns=""; box.style.gap="";
    const stats=people.map(e=>{ const s=by[e.id]||{present:0,late:0}; const onTime=Math.max(0,s.present-s.late), late=s.late, absent=Math.max(0,expected-s.present); return {e,present:s.present,onTime,late,absent}; });
    const agg=(k)=>stats.reduce((a,x)=>a+x[k],0);
    const tPresent=agg("present"), tOn=agg("onTime"), tLate=agg("late"), tAbs=agg("absent");
    const monthLabel=`${CAL_TH_MON[now.getMonth()]} ${now.getFullYear()+543}`;
    const teamRate=tPresent?Math.round(tOn/tPresent*100):0;
    const sumTot=(tOn+tLate+tAbs)||1;
    const barOn=Math.round(tOn/sumTot*100), barLate=Math.round(tLate/sumTot*100), barAbs=Math.max(0,100-barOn-barLate);
    box.innerHTML=`<div class="pulse-summary premium">
        <div class="ps-ring">
          <svg viewBox="0 0 42 42" width="60" height="60" aria-hidden="true">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="4"></circle>
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#34e4a8" stroke-width="4" pathLength="100" stroke-dasharray="${teamRate} ${100-teamRate}" stroke-dashoffset="25" stroke-linecap="round"></circle>
            <text x="21" y="24" text-anchor="middle" style="font-size:11px;font-weight:700;fill:#fff">${teamRate}%</text>
          </svg>
          <span>ตรงเวลาเฉลี่ย</span>
        </div>
        <div class="ps-body">
          <div class="ps-title">สรุปเดือน ${monthLabel}</div>
          <div class="ps-sub">${fmtInt(people.length)} คน · วันทำงานผ่านมา ${fmtInt(expected)} วัน</div>
          <div class="ps-bar" title="มาตรงเวลา ${fmtInt(tOn)} · สาย ${fmtInt(tLate)} · ขาด ${fmtInt(tAbs)}">${barOn?`<i style="width:${barOn}%;background:#10b981"></i>`:""}${barLate?`<i style="width:${barLate}%;background:#f59e0b"></i>`:""}${barAbs?`<i style="width:${barAbs}%;background:#f43f5e"></i>`:""}</div>
          <div class="pulse-sum-figs">
            <div class="psf"><span>มาทำงาน</span><b>${fmtInt(tPresent)}</b></div>
            <div class="psf ok"><span>ตรงเวลา</span><b>${fmtInt(tOn)}</b></div>
            <div class="psf warn"><span>สาย</span><b>${fmtInt(tLate)}</b></div>
            <div class="psf bad"><span>ขาด</span><b>${fmtInt(tAbs)}</b></div>
          </div>
        </div>
      </div>
      <div class="pulse-legend">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#10b981;vertical-align:-1px"></span> มาตรงเวลา</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f59e0b;vertical-align:-1px"></span> สาย</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f43f5e;vertical-align:-1px"></span> ขาด</span>
      </div>`+stats.map(({e,present,onTime,late,absent})=>{
      const tot=(onTime+late+absent)||1;
      const pOn=Math.round(onTime/tot*100), pLate=Math.round(late/tot*100), pAbs=Math.max(0,100-pOn-pLate);
      const rate=present?Math.round(onTime/present*100):0;
      return `<button class="pulse-card" data-calendar="${esc(e.id)}" aria-label="เปิดปฏิทิน ${esc(e.name)}">
        <svg viewBox="0 0 42 42" width="44" height="44" style="flex:none">
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--line-soft)" stroke-width="5"></circle>
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#10b981" stroke-width="5" pathLength="100" stroke-dasharray="${pOn} ${100-pOn}" stroke-dashoffset="25"></circle>
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f59e0b" stroke-width="5" pathLength="100" stroke-dasharray="${pLate} ${100-pLate}" stroke-dashoffset="${25-pOn}"></circle>
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f43f5e" stroke-width="5" pathLength="100" stroke-dasharray="${pAbs} ${100-pAbs}" stroke-dashoffset="${25-pOn-pLate}"></circle>
          <text x="21" y="24" text-anchor="middle" style="font-size:10px;font-weight:700;fill:var(--ink)">${fmtInt(present)}</text>
        </svg>
        <span style="flex:1;min-width:0"><span style="font-size:12px;font-weight:700;display:flex;justify-content:space-between;gap:6px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name)}</span><span class="pulse-rate ${rate>=90?"ok":rate>=70?"warn":"bad"}">${rate}%</span></span>
          <span class="sub" style="font-size:10px;display:block;margin-top:2px"><span style="color:#047857">มา ${fmtInt(onTime)}</span> · <span style="color:#b45309">สาย ${fmtInt(late)}</span> · <span style="color:#be123c">ขาด ${fmtInt(absent)}</span></span></span>
      </button>`;
    }).join("");
    box.querySelectorAll("[data-calendar]").forEach(b=>b.onclick=()=>openAttendanceCalendar(b.dataset.calendar));
  }catch(_){ box.innerHTML=`<div class="empty">โหลดภาพรวมรายคนไม่สำเร็จ</div>`; }
}
function bar(label,val,total,color){
  const pct=total?Math.round(val/total*100):0;
  return `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span>${esc(label)}</span><b>${fmtInt(val)}</b></div>
    <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div></div>`;
}

// Per-person attendance calendar modal: shows a full month (in–out + hours per
// day) and lets the admin page to other months — fetches that month on demand.
let _calEmp=null, _calMonth=null;
const CAL_TH_MON=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function openAttendanceCalendar(employeeId){
  _calEmp=employeeId; _calMonth=new Date();
  const emp=state.empById[employeeId]||{id:employeeId,name:employeeId,role:""};
  const body=el(`<div>
    <section class="employee-review-summary">
      <div class="employee-review-identity"><div class="profile-line"><div class="pm-av">${esc((emp.name||emp.id).trim().slice(0,2))}</div><div><h4>${esc(emp.name)}</h4><p>${esc(emp.id)}${emp.role?` · ${esc(emp.role)}`:""}</p></div></div>
        <div id="calToday" class="employee-review-today"><div><span>สถานะวันนี้</span><b>กำลังโหลด…</b></div></div>
      </div>
      <div class="employee-review-history"><h4>7 วันล่าสุด</h4><div id="employeeReviewHistory"><span>กำลังโหลดข้อมูล…</span></div></div>
    </section>
    <section class="employee-review-calendar"><div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><b style="font-size:12px">Timesheet รายเดือน</b><div class="spacer"></div><button class="btn sub sm" id="calPrev" type="button" aria-label="เดือนก่อน">‹</button><b id="calLabel" style="min-width:98px;text-align:center;font-size:11px">—</b><button class="btn sub sm" id="calNext" type="button" aria-label="เดือนถัดไป">›</button></div>
    <div id="calBody"><div class="empty">กำลังโหลด…</div></div>
    <div class="calendar-legend" style="display:flex;gap:14px;font-size:11px;color:var(--muted);flex-wrap:wrap">
      <span><span class="lgd" style="background:#047857"></span>ลงเวลาครบ</span>
      <span><span class="lgd" style="background:#ef8b1f"></span>ไม่ครบ</span>
      <span><span class="lgd" style="background:repeating-linear-gradient(45deg,#eef0f3,#eef0f3 2px,#dfe3e9 2px,#dfe3e9 4px);border:1px solid var(--line)"></span>หยุด/ไม่มีบันทึก</span>
    </div></section>
  </div>`);
  const checkIn=el(`<button class="btn ok" id="calCheckIn">บันทึกเข้างาน</button>`);
  const checkOut=el(`<button class="btn ghost" id="calCheckOut">บันทึกออกงาน</button>`);
  const close=el(`<button class="btn sub">ปิด</button>`); close.onclick=closeModal;
  checkIn.onclick=()=>calendarQuickClock(employeeId,"check_in",checkIn);
  checkOut.onclick=()=>calendarQuickClock(employeeId,"check_out",checkOut);
  openModal("ตรวจสอบเวลาทำงาน", body, [checkIn,checkOut,close]);
  $("#modal").classList.add("employee-review-modal");
  body.querySelector("#calPrev").onclick=()=>{ _calMonth=new Date(_calMonth.getFullYear(),_calMonth.getMonth()-1,1); calRender(); };
  body.querySelector("#calNext").onclick=()=>{ _calMonth=new Date(_calMonth.getFullYear(),_calMonth.getMonth()+1,1); calRender(); };
  calRender();
}
async function calRender(){
  const y=_calMonth.getFullYear(), m=_calMonth.getMonth();
  const lbl=$("#calLabel"); if(lbl) lbl.textContent=`${CAL_TH_MON[m]} ${y+543}`;
  const host=$("#calBody"); if(!host) return;
  const pad=n=>String(n).padStart(2,"0");
  const start=`${y}-${pad(m+1)}-01`, end=`${y}-${pad(m+1)}-${pad(new Date(y,m+1,0).getDate())}`;
  let days=[];
  try{ const d=await api("admin_attendance_days",{employeeId:_calEmp,startDate:start,endDate:end}); days=d.days||[]; }
  catch(e){ host.innerHTML=`<div class="empty">${esc(e.message)}</div>`; return; }
  const byDate={}; days.forEach(x=>byDate[x.date]=x);
  const today=todayISO(), head=["จ","อ","พ","พฤ","ศ","ส","อา"];
  const todayRec=byDate[today], inToday=!!todayRec?.checkIn, outToday=!!todayRec?.checkOut, currentMonth=y===new Date().getFullYear()&&m===new Date().getMonth();
  const statusHost=$("#calToday");
  if(statusHost) statusHost.innerHTML=`<div><span>สถานะวันนี้</span><b>${currentMonth?(outToday?"ลงเวลาครบ":inToday?"กำลังทำงาน":"ยังไม่เข้า"):"ดูย้อนหลัง"}</b></div><div><span>เวลาเข้า</span><b>${inToday?esc(todayRec.checkIn):"—"}</b></div><div><span>เวลาออก</span><b>${outToday?esc(todayRec.checkOut):"—"}</b></div>`;
  const historyHost=$("#employeeReviewHistory");
  if(historyHost){
    const recent=[...days].filter(d=>d.date<=today).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7);
    historyHost.innerHTML=recent.length?recent.map(d=>{ const complete=d.status==="complete"||!!(d.checkIn&&d.checkOut); const label=complete?"ครบ":d.checkIn?"รอออก":"ไม่มีบันทึก"; return `<div><span>${esc(fmtDate(d.date))}</span><b class="${complete?"":"review-warn"}">${label}</b></div>`; }).join(""):`<div><span>ยังไม่มีประวัติ</span></div>`;
  }
  const inBtn=$("#calCheckIn"), outBtn=$("#calCheckOut");
  if(inBtn){ inBtn.disabled=!currentMonth||inToday; inBtn.title=!currentMonth?"ลงเวลาได้เฉพาะเดือนปัจจุบัน":inToday?"ลงเวลาเข้าแล้ว":""; }
  if(outBtn){ outBtn.disabled=!currentMonth||!inToday||outToday; outBtn.title=!currentMonth?"ลงเวลาได้เฉพาะเดือนปัจจุบัน":!inToday?"ต้อง Check in ก่อน":outToday?"ลงเวลาออกแล้ว":""; }
  let cal=`<div class="calm calendar-rich">`+head.map((d,i)=>`<div class="dh" style="color:${i===5?"#2b5a86":i===6?"#8f322d":"var(--muted)"}">${d}</div>`).join("");
  const lead=(new Date(y,m,1).getDay()+6)%7; for(let b=0;b<lead;b++) cal+=`<div></div>`;
  const lastD=new Date(y,m+1,0).getDate();
  for(let dn=1;dn<=lastD;dn++){
    const ds=`${y}-${pad(m+1)}-${pad(dn)}`, rec=byDate[ds], isToday=ds===today, dow=new Date(ds+"T00:00:00+07:00").getDay();
    const todayClass=isToday?" today":"";
    if(rec){
      const complete=rec.status==="complete", anomaly=rec.status==="anomaly", ink=complete?"#047857":"#b45309", label=complete?"ครบ":anomaly?"ผิดปกติ":"รอออก";
      cal+=`<div class="cd ${complete?"complete":"incomplete"}${todayClass}" style="border-left:3px solid ${ink}"><div class="cal-date"><span class="d">${dn}</span><span class="cal-kind">${label}</span></div><div class="io">${esc(rec.checkIn||"—")} <span style="color:var(--muted)">→</span> ${esc(rec.checkOut||"—")}</div><div class="hp"><span class="sub">${rec.workedMinutes?fmtHours(rec.workedMinutes):"ยังไม่ครบ"}</span></div></div>`;
    } else {
      const future=ds>today, off=(dow===0||dow===6);
      cal+=`<div class="cd off ${off?"weekend":""}${todayClass}"><div class="cal-date"><span class="d" style="color:${dow===0?"#8f322d":dow===6?"#2b5a86":"var(--muted)"};font-weight:500">${dn}</span>${isToday?'<span class="cal-kind" style="color:var(--blue)">วันนี้</span>':""}</div><span class="cal-off">${future?"รอวันมาถึง":off?"วันหยุด":"ไม่มีบันทึก"}</span></div>`;
    }
  }
  host.innerHTML=cal+`</div>`;
}

async function calendarQuickClock(employeeId,eventType,button){
  const emp=state.empById[employeeId]||(state.employees||[]).find(e=>e.id===employeeId);
  const label=eventType==="check_in"?"Check in":"Check out";
  if(!await confirmDialog(`ยืนยัน ${label}`, `${label} ให้ <b>${esc(emp?.name||employeeId)}</b> ณ เวลาปัจจุบัน?<br><span class="sub">บันทึกโดย ${esc(state.reviewer||"Admin")} เป็น admin_manual และตรวจสอบย้อนหลังได้</span>`, {okText:label})) { openAttendanceCalendar(employeeId); return; }
  await withBtn(button,async()=>{
    try{ const data=await api("admin_record_attendance",{employeeId,eventType,reviewer:state.reviewer||"Admin"}); toast(data.message||"บันทึกเวลาสำเร็จ","good"); renderDashboard(); }
    catch(err){ toast(err.message,"bad"); }
    finally{ openAttendanceCalendar(employeeId); }
  });
}

function attendanceCorrectionDialog(employeeId){
  if(!hasBackendCapability("attendanceCorrection")){ toast("การแก้ไขเวลาอดีตรอ deploy Backend รุ่นปัจจุบัน", "bad"); return; }
  const emp=state.empById[employeeId]||{id:employeeId,name:employeeId};
  const body=el(`<div><div class="notice blue"><b>แก้ไขเวลาย้อนหลัง</b> เพิ่มบันทึกที่ระบุผู้ดำเนินการและเหตุผล ระบบไม่เขียนทับประวัติเดิม</div></div>`);
  body.append(field("วันที่", `<input id="corDate" type="date" value="${todayISO()}" max="${todayISO()}">`));
  body.append(field("รายการ", `<select id="corType"><option value="check_in">Check in</option><option value="check_out">Check out</option></select>`));
  body.append(field("เวลา", `<input id="corTime" type="time" value="09:00">`));
  body.append(field("เหตุผล", `<textarea id="corReason" rows="3" maxlength="400" placeholder="เช่น เครื่องสแกนไม่ทำงาน หรือได้รับหลักฐานเวลาเข้า"></textarea>`, "ต้องระบุอย่างน้อย 5 ตัวอักษร · ใช้สำหรับตรวจสอบย้อนหลัง"));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=()=>openAttendanceCalendar(employeeId);
  const save=el(`<button class="btn">บันทึกการแก้ไข</button>`);
  save.onclick=()=>withBtn(save,async()=>{
    const date=body.querySelector("#corDate").value, time=body.querySelector("#corTime").value;
    const eventType=body.querySelector("#corType").value, reason=body.querySelector("#corReason").value.trim();
    if(!date||!time||reason.length<5){ toast("กรอกวันที่ เวลา และเหตุผลอย่างน้อย 5 ตัวอักษร", "bad"); return; }
    if(!await confirmDialog("ยืนยันแก้ไขเวลา", `บันทึก <b>${eventType==="check_in"?"Check in":"Check out"}</b> ให้ <b>${esc(emp.name)}</b><br>${esc(date)} ${esc(time)} · ${esc(reason)}`, {okText:"ยืนยันบันทึก"})) return;
    try{
      const data=await api("admin_record_attendance_correction",{employeeId,eventType,eventAt:`${date}T${time}`,reason});
      toast(data.message||"บันทึกการแก้ไขแล้ว", "good"); openAttendanceCalendar(employeeId); renderDashboard();
    }catch(err){ toast(err.message||"บันทึกไม่สำเร็จ", "bad"); }
  });
  openModal(`แก้ไขเวลา · ${emp.name}`,body,[cancel,save]);
}

function setApprovalBadge(n){
  const pill=$("#navApprovals");
  if(!pill) return;
  pill.style.display = n>0 ? "" : "none";
  pill.textContent=n;
}
async function refreshApprovalBadge(){
  try{
    const [l,t]=await Promise.all([api("admin_list_leave_requests"), api("admin_list_time_requests")]);
    const n=(l.requests||[]).filter(r=>r.status==="pending").length
           +(t.requests||[]).filter(r=>r.status==="pending").length;
    setApprovalBadge(n);
  }catch(e){/* silent */}
}

/* =================================================================
   PEOPLE & APPROVALS (merged, minimal)
   ================================================================= */
let _peopleSel=null, _peopleMode="ot", _peopleProfileFilter="all";
function peopleRow(i,idx,kind){
  const tag=i.tag||(kind==="adv"?"เบิก":"");
  const tagCls=i.mode==="leave"?"blue":i.mode==="advance"?"amber":i.tag==="OT"?"":"grey";
  let acts="";
  if(kind==="adv"){
    if(i._adv.status==="pending") acts=`<button class="btn ok sm" data-ap="${esc(i._adv.advanceId)}">อนุมัติ</button><button class="btn danger sm" data-rj="${esc(i._adv.advanceId)}">ปฏิเสธ</button>`;
    else if(i._adv.status==="approved") acts=`<button class="btn sm" data-paid="${esc(i._adv.advanceId)}">บันทึกจ่ายแล้ว</button>`;
    else acts=`<span class="badge grey">${esc(ADV_LABEL[i._adv.status]||i._adv.status)}</span>`;
  } else {
    acts=`<button class="btn ok sm" data-ap="${idx}">อนุมัติ</button><button class="btn danger sm" data-rj="${idx}">ปฏิเสธ</button>`;
  }
  return `<div style="display:flex;align-items:center;gap:11px;padding:10px 12px;border-bottom:1px solid var(--line-soft)">
    ${tag?`<span class="badge ${tagCls}" style="flex:none;min-width:44px;justify-content:center">${esc(tag)}</span>`:""}
    <div style="flex:1;min-width:0"><b style="font-weight:600">${esc(i.name)}</b> <span class="sub">${esc(i.eid)}</span><div class="sub" style="margin-top:1px">${i.detail}</div></div>
    <div class="row-actions" style="flex:none">${acts}</div>
  </div>`;
}
async function renderPeople(){
  const node=$("#page-people"); skeleton(node);
  setRouteShell(node,"people");
  try{
    await loadEmployees(true).catch(()=>{});
    const [leaveD,timeD,advD,usageD]=await Promise.all([
      api("admin_list_leave_requests").catch(()=>({requests:[]})),
      api("admin_list_time_requests").catch(()=>({requests:[]})),
      api("admin_list_advances").catch(()=>({advances:[]})),
      api("admin_leave_usage").catch(()=>({quota:{},rows:[]})),
    ]);
    const leaves=leaveD.requests||[], times=timeD.requests||[], advs=advD.advances||[];
    const leaveItems=leaves.map(r=>({mode:"leave",status:r.status,eid:r.employeeId,name:empName(r.employeeId),tag:"ลา",
      detail:`${esc(r.leaveType||"ลา")} · ${fmtDate(r.startDate)}${r.endDate&&r.endDate!==r.startDate?" – "+fmtDate(r.endDate):""}${r.reason?" · "+esc(r.reason):""}`,
      review:(b,d)=>reviewLeave(b,r.requestId,d)}));
    const timeItems=times.filter(r=>r.requestType==="overtime").map(r=>({mode:"ot",status:r.status,eid:r.employeeId,name:empName(r.employeeId),tag:"OT",
      detail:`${fmtDate(r.workDate)} · ${fmtHours(r.requestedMinutes)}${r.reason?" · "+esc(r.reason):""}`,
      review:(b,d)=>reviewTime(b,r.requestId,d)}));
    const advItems=advs.map(a=>({mode:"advance",status:a.status,eid:a.employeeId,name:esc(a.name),tag:"เบิก",
      detail:`${fmtBaht(a.amount)}${a.reason?" · "+esc(a.reason):""} · ${fmtDate(a.requestDate)}`,_adv:a}));
    const all=[...leaveItems,...timeItems,...advItems];
    const pendBy={}; all.filter(i=>i.status==="pending").forEach(i=>pendBy[i.eid]=(pendBy[i.eid]||0)+1);
    const modeCount=(m)=>all.filter(i=>i.mode===m&&i.status==="pending").length;
    const emps=(state.employees||[]).slice().sort((a,b)=>(pendBy[b.id]||0)-(pendBy[a.id]||0)||String(a.id).localeCompare(String(b.id)));
    const activeCount=emps.filter(e=>String(e.status||"").toLowerCase()==="active").length;
    const inactiveCount=Math.max(0,emps.length-activeCount);
    const pendingCount=Object.values(pendBy).reduce((sum,n)=>sum+Number(n||0),0);
    const profileReadyCount=emps.filter(e=>e.nationalId&&e.phone).length;
    const profileMissingCount=Math.max(0,emps.length-profileReadyCount);
    node.innerHTML=`
      <div id="pwReqPanel"></div>
      <div id="identityReqPanel"></div>
      <div class="people-workspace employee-workspace">
        <section class="panel people-directory" style="margin:0">
          <div class="head">
            <div class="people-directory-title"><h2>ทะเบียนพนักงาน</h2><span class="sub">จัดการข้อมูลและสิทธิการใช้งาน</span></div>
            <div class="spacer"></div>
            <button class="btn sub sm" id="pDemo">ดูตัวอย่าง 3 เดือน</button><button class="btn" id="pAdd">เพิ่มพนักงาน</button>
          </div>
          <div class="people-tools">
            <input class="people-search" type="search" id="pSearch" placeholder="ค้นหาชื่อ รหัส หรือ ตำแหน่ง">
            <div class="people-profile-filter" role="group" aria-label="กรองความพร้อมข้อมูลพนักงาน"><button class="active" data-profile-filter="all">ทั้งหมด <b>${fmtInt(emps.length)}</b></button><button data-profile-filter="ready">ข้อมูลครบ <b>${fmtInt(profileReadyCount)}</b></button><button data-profile-filter="missing">ต้องติดตาม <b>${fmtInt(profileMissingCount)}</b></button></div>
            <div class="people-summary"><span><b>${fmtInt(activeCount)}</b> ใช้งาน</span><span><b>${fmtInt(inactiveCount)}</b> ปิดใช้งาน</span><span><b>${fmtInt(pendingCount)}</b> งานค้าง</span></div>
            <button class="btn sub sm" id="pExport">ส่งออก CSV</button>
          </div>
          <div class="employee-table-wrap"><div id="pList"></div></div>
        </section>
        <aside class="panel people-queue" style="margin:0">
          <div class="head"><h2>คิวอนุมัติ</h2><span class="badge ${pendingCount?"amber":"grey"}" style="margin-left:8px">${fmtInt(pendingCount)}</span></div>
          <div class="body">
            <p class="people-queue-note">ตรวจคำขอที่รอการตัดสินใจ โดยข้อมูลพนักงานอยู่ในตารางด้านซ้าย</p>
            <div class="subtabs" id="pModes">
              <button data-mode="ot">OT${modeCount("ot")?` ${modeCount("ot")}`:""}</button>
              <button data-mode="leave">การลา${modeCount("leave")?` ${modeCount("leave")}`:""}</button>
              <button data-mode="advance">เบิกเงิน${modeCount("advance")?` ${modeCount("advance")}`:""}</button>
            </div>
            <div id="pModeBody"></div>
          </div>
        </aside>
      </div>`;
    const drawList=(q="")=>{
      q=q.trim().toLowerCase();
      const list=emps.filter(e=>{
        const matched=!q||(e.id+e.name+(e.role||"")).toLowerCase().includes(q);
        const ready=!!(e.nationalId&&e.phone);
        const profileMatched=_peopleProfileFilter==="all"||(_peopleProfileFilter==="ready"&&ready)||(_peopleProfileFilter==="missing"&&!ready);
        return matched&&profileMatched;
      });
      $("#pList").innerHTML=list.length?`<table class="employee-table"><thead><tr><th>พนักงาน</th><th>ตำแหน่ง</th><th>ติดต่อ / เอกสาร</th><th>นโยบายลงเวลา</th><th class="num">งานค้าง</th><th style="text-align:right">จัดการ</th></tr></thead><tbody>${list.map(e=>{
        const pc=pendBy[e.id]||0, ini=(e.name||e.id).trim().slice(0,2), sel=_peopleSel===e.id;
        const active=String(e.status||"").toLowerCase()==="active";
        return `<tr class="p-emp ${sel?"is-selected":""}" data-emp="${esc(e.id)}">
          <td><button class="p-open employee-name" data-emp="${esc(e.id)}" style="border:0;background:none;cursor:pointer;text-align:left;color:var(--ink);padding:0;width:100%"><span class="employee-avatar">${esc(ini)}</span><span><strong>${esc(e.name||e.id)}</strong><span class="employee-meta">${esc(e.id)} · ${active?"ใช้งาน":"ปิดใช้งาน"}</span></span></button></td>
          <td>${esc(e.role||"—")}<span class="employee-meta">${esc(e.department||"ไม่ระบุแผนก")}</span></td>
          <td>${esc(e.phone||"—")}<span class="employee-meta ${e.nationalId&&e.phone?"is-ready":"is-missing"}">บัตรประชาชน ${e.nationalId?"•••••••••"+esc(String(e.nationalId).slice(-4)):"ยังไม่ระบุ"}</span></td>
          <td><span class="employee-policy"><i class="dot ${e.locationRequired?"gps":""}"></i>${e.locationRequired?"เช็กอินตามพื้นที่":"ไม่บังคับตำแหน่ง"}</span></td>
          <td class="num">${pc?`<span class="badge amber">${fmtInt(pc)}</span>`:`<span class="sub">—</span>`}</td>
          <td><div class="employee-actions"><button class="employee-icon-btn p-cal" data-emp="${esc(e.id)}" title="ปฏิทินเวลางาน" aria-label="ปฏิทิน ${esc(e.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg></button><button class="employee-icon-btn p-menu" data-emp="${esc(e.id)}" aria-label="จัดการ ${esc(e.name)}" title="จัดการ">⋯</button></div></td>
        </tr>`;
      }).join("")}</tbody></table>`:`<div class="empty">ไม่พบพนักงานตามคำค้นหา</div>`;
      const menuFor=(id)=>{ const emp=state.empById[id]; if(!emp) return []; return [
        {label:"ดูปฏิทินรายคน", fn:()=>openAttendanceCalendar(id)},
        {label:"แก้ไขข้อมูล", fn:()=>employeeDialog(emp)},
        {label:"รีเซ็ตรหัสผ่าน", fn:()=>resetPassword(emp)},
        ...(emp.status==="active"?[{label:"ปิดใช้งาน", danger:true, fn:()=>deactivate(emp)}]:[]),
        ...(state.role==="owner"&&hasBackendCapability("employeeDelete")?[{label:"ลบถาวร…", danger:true, fn:()=>deleteEmployee(emp)}]:[]),
      ]; };
      $("#pList").querySelectorAll(".p-open").forEach(b=>b.onclick=()=>{ _peopleSel=b.dataset.emp; drawList($("#pSearch").value); openAttendanceCalendar(b.dataset.emp); });
      $("#pList").querySelectorAll(".p-cal").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); openAttendanceCalendar(b.dataset.emp); });
      $("#pList").querySelectorAll(".p-menu").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); openRowMenu(e.clientX, e.clientY, menuFor(b.dataset.emp)); });
      $("#pList").querySelectorAll(".p-emp").forEach(row=>attachRowMenu(row, menuFor(row.dataset.emp)));
    };
    const drawMode=()=>{
      $("#pModes").querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===_peopleMode));
      const box=$("#pModeBody");
      if(_peopleMode==="advance"){
        box.innerHTML=advItems.length?advItems.map((i,idx)=>peopleRow(i,idx,"adv")).join(""):`<div class="empty">ยังไม่มีคำขอเบิกเงิน</div>`;
        box.querySelectorAll("[data-ap]").forEach(b=>b.onclick=()=>decideAdvance(b.dataset.ap,"approved"));
        box.querySelectorAll("[data-rj]").forEach(b=>b.onclick=()=>decideAdvance(b.dataset.rj,"rejected"));
        box.querySelectorAll("[data-paid]").forEach(b=>b.onclick=()=>markAdvancePaid(b.dataset.paid));
        return;
      }
      const items=(_peopleMode==="leave"?leaveItems:timeItems).filter(i=>i.status==="pending");
      const extra=_peopleMode==="ot"?`<div class="toolbar" style="margin-bottom:10px"><button class="btn sub sm" id="pGoRules">ตั้งค่า OT / วันหยุด / ตัวคูณ ›</button><button class="btn ok sm" id="pAddOt">บันทึก OT</button></div>`:"";
      let after="";
      if(_peopleMode==="leave"){
        const q=usageD.quota||{}, rows=usageD.rows||[];
        const cell=(u,qt)=>qt?`${fmtInt(u||0)}<span class="sub"> /${fmtInt(qt)}</span>`:fmtInt(u||0);
        after=`<div style="margin-top:14px"><div class="sub" style="margin:0 0 6px;font-weight:600">โควตาวันลา (ปีนี้)</div>
          <table><thead><tr><th>พนักงาน</th><th class="num">ป่วย</th><th class="num">กิจ</th><th class="num">พักร้อน</th><th class="num">อื่นๆ</th></tr></thead>
          <tbody>${rows.length?rows.map(r=>`<tr><td class="person">${esc(r.name)}<span class="sub">${esc(r.employeeId)}</span></td>
            <td class="num">${cell(r.usedSick,q.sick)}</td><td class="num">${cell(r.usedPersonal,q.personal)}</td>
            <td class="num">${cell(r.usedVacation,q.vacation)}</td><td class="num">${fmtInt(r.usedOther||0)}</td></tr>`).join(""):`<tr><td colspan="5"><div class="empty">ไม่มีข้อมูลโควตา</div></td></tr>`}</tbody></table></div>`;
      }
      box.innerHTML=extra+(items.length?items.map((i,idx)=>peopleRow(i,idx)).join(""):`<div class="empty">ไม่มีคำขอรออนุมัติ</div>`)+after;
      box.querySelectorAll("[data-ap]").forEach(b=>b.onclick=(e)=>items[+b.dataset.ap].review(e.target,"approved"));
      box.querySelectorAll("[data-rj]").forEach(b=>b.onclick=(e)=>items[+b.dataset.rj].review(e.target,"rejected"));
      if($("#pGoRules")) $("#pGoRules").onclick=()=>go("payrules");
      if($("#pAddOt")) $("#pAddOt").onclick=()=>addOvertimeDialog();
    };
    drawList(); drawMode(); loadPwRequests(); loadIdentityRequests();
    $("#pSearch").oninput=e=>drawList(e.target.value);
    node.querySelectorAll("[data-profile-filter]").forEach(button=>button.onclick=()=>{ _peopleProfileFilter=button.dataset.profileFilter; node.querySelectorAll("[data-profile-filter]").forEach(x=>x.classList.toggle("active",x===button)); drawList($("#pSearch").value); });
    $("#pAdd").onclick=()=>employeeDialog(null);
    $("#pDemo").onclick=()=>openThreeMonthPayrollDemo();
    $("#pExport").onclick=()=>exportEmployeesCSV();
    $("#pModes").querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{ _peopleMode=b.dataset.mode; drawMode(); });
  }catch(err){ errorBox(node, err, renderPeople); }
}

/* =================================================================
   EMPLOYEES
   ================================================================= */
async function renderEmployees(){
  const node=$("#page-employees");
  setRouteShell(node,"employees");
  skeleton(node);
  try{
    await loadEmployees(true);
    node.innerHTML=`
      <div id="pwReqPanel"></div>
      <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">ทะเบียนบุคลากร</div><h2>รายชื่อพนักงาน</h2><p>ค้นหา แก้ไขข้อมูล และจัดการสิทธิ์จากรายการเดียว</p></div><div class="directory-count"><b>${fmtInt(state.employees.length)}</b> รายการ</div></div>
      <div class="panel">
        <div class="head">
          <div class="toolbar"><input type="search" id="empSearch" placeholder="ค้นหา ชื่อ / รหัส / แผนก" style="width:260px"></div>
          <div class="spacer"></div>
          <button class="btn sub" id="expEmpBtn">ส่งออก CSV</button>
          <button class="btn" id="addEmpBtn">+ เพิ่มพนักงาน</button>
        </div>
        <div class="body flush"><table id="empTable">
          <thead><tr><th>พนักงาน</th><th>รหัสผ่าน</th><th>ตำแหน่ง / แผนก</th><th>นโยบายลงเวลา</th><th>สถานะ</th><th data-nosort>จัดการ</th></tr></thead>
          <tbody id="empRows"></tbody></table>
          <div class="pager" id="empPager" style="display:none"></div>
        </div>
      </div>`;
    const PAGE=15; let page=1;
    const draw=(q="")=>{
      q=q.trim().toLowerCase();
      const all=state.employees
        .filter(e=>!q || (e.id+e.name+(e.role||"")+(e.department||"")).toLowerCase().includes(q))
        .sort((a,b)=> (a.status===b.status)? a.id.localeCompare(b.id) : (a.status==="active"?-1:1));
      const tb=$("#empRows"), pager=$("#empPager");
      if(!all.length){ tb.innerHTML=`<tr><td colspan="6"><div class="empty">ไม่พบพนักงาน</div></td></tr>`; pager.style.display="none"; return; }
      const pages=Math.ceil(all.length/PAGE); if(page>pages)page=pages; if(page<1)page=1;
      const rows=all.slice((page-1)*PAGE, page*PAGE);
      if(pages>1){ pager.style.display="flex";
        pager.innerHTML=`<span>แสดง ${(page-1)*PAGE+1}–${Math.min(page*PAGE,all.length)} จาก ${all.length} คน</span>
          <button id="empPrev" ${page<=1?"disabled":""}>‹ ก่อนหน้า</button><span>หน้า ${page}/${pages}</span><button id="empNext" ${page>=pages?"disabled":""}>ถัดไป ›</button>`;
        pager.querySelector("#empPrev").onclick=()=>{page--;draw(q);};
        pager.querySelector("#empNext").onclick=()=>{page++;draw(q);};
      } else pager.style.display="none";
      tb.innerHTML=rows.map(e=>`
        <tr data-id="${esc(e.id)}">
          <td class="person">${esc(e.name)}<span class="sub">${esc(e.id)} · ${e.nationalId&&e.phone?"ข้อมูลติดต่อครบ":"รอยืนยันข้อมูลติดต่อ"}</span></td>
          <td>${(()=>{const pw=e.password;
            if(!pw) return '<span class="sub">•••• ซ่อนไว้</span>';
            if(/^(pbkdf2|scrypt|argon2|\$2[aby]\$)/i.test(pw)) return '<span class="badge"><span class="dot"></span>ตั้งรหัสแล้ว</span>';
            return `<code style="font-size:11px">${esc(pw)}</code>`;})()}</td>
          <td>${esc(e.role||"—")}<span class="sub">${esc(e.department||"")}</span></td>
          <td>${e.locationRequired?'<span class="badge blue">บังคับ GPS</span>':'<span class="badge grey">ไม่บังคับ</span>'}</td>
          <td>${e.status==="active"?'<span class="badge"><span class="dot"></span>ใช้งาน</span>':'<span class="badge grey">ปิดใช้งาน</span>'}</td>
          <td><div class="row-actions">
            <button class="btn sub sm" data-edit="${esc(e.id)}">แก้ไข</button>
            <button class="btn ghost sm" data-reset="${esc(e.id)}">รีเซ็ตรหัส</button>
            ${e.status==="active"?`<button class="btn danger sm" data-off="${esc(e.id)}">ปิดใช้งาน</button>`:""}
            ${state.role==="owner"&&hasBackendCapability("employeeDelete")?`<button class="btn ghost sm" data-delete="${esc(e.id)}" title="ลบถาวรเฉพาะพนักงานที่ยังไม่มีประวัติ">ลบถาวร</button>`:""}
          </div></td>
        </tr>`).join("");
      tb.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>employeeDialog(state.empById[b.dataset.edit]));
      tb.querySelectorAll("[data-reset]").forEach(b=>b.onclick=()=>resetPassword(state.empById[b.dataset.reset]));
      tb.querySelectorAll("[data-off]").forEach(b=>b.onclick=()=>deactivate(state.empById[b.dataset.off]));
      tb.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteEmployee(state.empById[b.dataset.delete]));
      tb.querySelectorAll("tr[data-id]").forEach(tr=>{ const e=state.empById[tr.dataset.id]; if(!e) return;
        attachRowMenu(tr, [
          {label:"แก้ไขข้อมูล", fn:()=>employeeDialog(e)},
          {label:"รีเซ็ตรหัสผ่าน", fn:()=>resetPassword(e)},
          ...(e.status==="active"?[{label:"⛔ ปิดใช้งาน", danger:true, fn:()=>deactivate(e)}]:[]),
          ...(state.role==="owner"&&hasBackendCapability("employeeDelete")?[{label:"ลบถาวร…", danger:true, fn:()=>deleteEmployee(e)}]:[]),
        ]);
      });
      attachSort($("#empTable"));
    };
    draw();
    $("#empSearch").oninput=e=>{ page=1; draw(e.target.value); };
    $("#addEmpBtn").onclick=()=>employeeDialog(null);
    $("#expEmpBtn").onclick=()=>exportEmployeesCSV();
    loadPwRequests();
  }catch(err){ errorBox(node, err, renderEmployees); }
}

async function loadPwRequests(){
  const panel=$("#pwReqPanel"); if(!panel) return;
  try{
    const data=await api("admin_list_password_requests");
    const reqs=data.requests||[];
    if(!reqs.length){ panel.innerHTML=""; return; }
    panel.innerHTML=`<div class="panel" style="border-left:3px solid #e0a800">
      <div class="head"><b>คำขอรีเซ็ตรหัสผ่าน</b> <span class="badge blue">${fmtInt(reqs.length)}</span></div>
      <div class="body flush"><table><thead><tr><th>พนักงาน</th><th>ขอเมื่อ</th><th></th></tr></thead>
      <tbody>${reqs.map(r=>`<tr><td class="person">${esc(r.name)}<span class="sub">${esc(r.employeeId)}</span></td>
        <td>${fmtDateTime(r.requestedAt)}</td>
        <td><div class="row-actions"><button class="btn ok sm" data-pwr="${esc(r.requestId)}" data-emp="${esc(r.employeeId)}">ออกรหัสใหม่</button></div></td></tr>`).join("")}</tbody></table></div></div>`;
    panel.querySelectorAll("[data-pwr]").forEach(b=>b.onclick=()=>issueResetForRequest(b.dataset.emp, b.dataset.pwr));
  }catch(_){ panel.innerHTML=""; }
}
async function loadIdentityRequests(){
  const panel=$("#identityReqPanel"); if(!panel) return;
  if(!hasBackendCapability("employeeIdentity")){
    panel.innerHTML=`<div class="notice blue"><b>การยืนยันข้อมูลจาก APK พร้อมใช้งานหลังอัปเดต Backend</b><br><span class="sub">ระบบหลังบ้านที่เชื่อมต่ออยู่ยังเป็นรุ่นเก่า จึงไม่แสดงคิวที่อาจทำงานไม่ครบ</span></div>`;
    return;
  }
  try{
    const data=await api("admin_list_identity_requests"); const rows=data.requests||[];
    if(!rows.length){ panel.innerHTML=""; return; }
    panel.innerHTML=`<section class="panel" style="border-left:3px solid var(--amber)"><div class="head"><div><h2>ยืนยันข้อมูลพนักงาน</h2><span class="sub">ข้อมูลจาก APK ต้องอนุมัติก่อนบันทึกทะเบียนจริง</span></div><div class="spacer"></div><span class="badge amber">${fmtInt(rows.length)} รอตรวจ</span></div><div class="body flush"><table><thead><tr><th>พนักงาน</th><th>เลขบัตรประชาชน</th><th>เบอร์โทรศัพท์</th><th>ส่งเมื่อ</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td class="person">${esc(r.name)}<span class="sub">${esc(r.employeeId)}</span></td><td style="font-variant-numeric:tabular-nums">${esc(r.nationalId)}</td><td>${esc(r.phone||"—")}</td><td>${fmtDateTime(r.submittedAt)}</td><td><div class="row-actions"><button class="btn ok sm" data-id-ok="${esc(r.requestId)}">อนุมัติ</button><button class="btn danger sm" data-id-no="${esc(r.requestId)}">ปฏิเสธ</button></div></td></tr>`).join("")}</tbody></table></div></section>`;
    panel.querySelectorAll("[data-id-ok]").forEach(b=>b.onclick=()=>reviewIdentityRequest(b,"approved"));
    panel.querySelectorAll("[data-id-no]").forEach(b=>b.onclick=()=>reviewIdentityRequest(b,"rejected"));
  }catch(err){ panel.innerHTML=`<div class="notice">โหลดคำขอยืนยันข้อมูลไม่ได้: ${esc(err.message||"")}</div>`; }
}
async function reviewIdentityRequest(btn, decision){
  if(decision==="rejected"&&!await confirmDialog("ปฏิเสธข้อมูลพนักงาน","ปฏิเสธคำขอนี้? พนักงานจะสามารถส่งข้อมูลใหม่ได้",{danger:true,okText:"ปฏิเสธ"})) return;
  await withBtn(btn,async()=>{
    try{ await api("admin_review_identity_request",{requestId:btn.dataset[decision==="approved"?"idOk":"idNo"],decision}); toast(decision==="approved"?"อนุมัติและบันทึกข้อมูลแล้ว":"ปฏิเสธคำขอแล้ว","good"); await loadEmployees(true); renderPeople(); }
    catch(err){ toast(err.message,"bad"); }
  });
}
async function issueResetForRequest(employeeId, requestId){
  const emp=state.empById[employeeId];
  if(!await confirmDialog("ออกรหัสผ่านใหม่", `สุ่มรหัสผ่านใหม่ให้ <b>${esc(emp?emp.name:employeeId)}</b> (${esc(employeeId)})?`, {okText:"ออกรหัสใหม่"})) return;
  try{ const data=await api("admin_reset_employee_password",{employeeId, requestId, reviewer:state.reviewer||"Admin"});
    showSecret("ออกรหัสผ่านใหม่แล้ว", [["Employee ID", employeeId],["รหัสผ่าน", data.temporaryPassword]], "แจ้งรหัสนี้ให้พนักงาน · ระบบจำไว้ถาวร");
    PAGES[state.page].load();
  }catch(err){ toast(err.message,"bad"); }
}

async function employeeOnboardingDialog(){
  const draft={name:"",role:"Employee",department:"",nationalId:"",phone:"",password:"",locationRequired:true,payBasis:"monthly",baseRate:"",standardHours:"8",otEnabled:true,otMultiplier:"1.5",daysPerMonth:"30"};
  const readIdentity=()=>{
    draft.name=$("#obName").value.trim(); draft.role=$("#obRole").value.trim()||"Employee";
    draft.department=$("#obDept").value.trim();
    draft.nationalId=$("#obNationalId").value.replace(/[^0-9]/g,""); draft.phone=$("#obPhone").value.trim();
    draft.password=$("#obPass").value.trim(); draft.locationRequired=$("#obLoc").checked;
    return draft.name;
  };
  const showIdentity=()=>{
    const body=el(`<div><div class="flow-steps"><span class="step"><span class="n">1</span>ข้อมูลบัญชี</span><span class="line"></span><span class="step"><span class="n">2</span>เงินเดือนและ OT</span></div><div class="notice blue">ระบบจะออกรหัสพนักงาน BVN ให้อัตโนมัติ · เลขบัตรประชาชนและเบอร์โทรเว้นไว้ก่อนให้พนักงานอัปเดตเองใน APK ได้</div></div>`);
    body.append(field("ชื่อ-นามสกุล",`<input id="obName" type="text" value="${esc(draft.name)}" autocomplete="name" required>`));
    const identity=el(`<div class="grid2"></div>`); identity.append(field("เลขบัตรประชาชน (ถ้ามี)",`<input id="obNationalId" type="text" inputmode="numeric" maxlength="17" value="${esc(draft.nationalId)}" placeholder="13 หลัก">`,"เว้นไว้ก่อนได้ แล้วค่อยให้พนักงานยืนยันใน APK"),field("เบอร์โทรศัพท์ (ถ้ามี)",`<input id="obPhone" type="tel" maxlength="20" value="${esc(draft.phone)}" placeholder="เช่น 0812345678">`)); body.append(identity);
    const grid=el(`<div class="grid2"></div>`); grid.append(field("ตำแหน่ง",`<input id="obRole" type="text" value="${esc(draft.role)}">`),field("แผนก",`<input id="obDept" type="text" value="${esc(draft.department)}">`)); body.append(grid);
    body.append(el(`<div class="notice blue">จุดเช็กอินเป็นนโยบายของบริษัท จัดการได้ในเมนู “เวลาทำงาน” และใช้กับพนักงานทุกคนที่เปิดบังคับ GPS</div>`));
    body.append(field("รหัสผ่านเริ่มต้น",`<input id="obPass" type="text" value="${esc(draft.password)}" autocomplete="new-password" placeholder="เว้นว่างให้ระบบสุ่ม">`,`แจ้ง Employee ID และรหัสนี้ให้พนักงานเพื่อเข้า APK`));
    body.append(el(`<label class="check"><input type="checkbox" id="obLoc" ${draft.locationRequired?"checked":""}> บังคับ GPS ตอนเช็กอิน</label>`));
    const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
    const next=el(`<button class="btn">ต่อไป: ตั้งค่าค่าจ้าง</button>`); next.onclick=()=>{ if(!readIdentity()){toast("กรอกชื่อพนักงานก่อน","bad");return;} if(draft.nationalId&&!/^\d{13}$/.test(draft.nationalId)){toast("เลขบัตรประชาชนต้องมี 13 หลัก หรือเว้นไว้ก่อน","bad");return;} closeModal(); showPay(); };
    openModal("เพิ่มพนักงาน · ขั้นที่ 1 จาก 2",body,[cancel,next]);
  };
  const showPay=()=>{
    const body=el(`<div><div class="flow-steps"><span class="step"><span class="n">1</span>ข้อมูลบัญชี</span><span class="line"></span><span class="step"><span class="n">2</span>กำหนดค่าจ้าง</span></div><div class="notice blue"><b>${esc(draft.name)}</b><br><span class="sub">เลือกวิธีจ่ายเพียงแบบเดียว แล้วกรอกยอดตามที่ตกลง</span></div></div>`);
    body.append(field("วิธีจ่ายค่าจ้าง",`<select id="obBasis"><option value="monthly">เงินเดือนรายเดือน</option><option value="daily">ค่าจ้างรายวัน</option><option value="hourly">ค่าจ้างรายชั่วโมง</option></select>`));
    const grid=el(`<div class="grid2"></div>`); grid.append(field(`<span id="obRateLabel">เงินเดือนต่อเดือน</span>`,`<input id="obRate" type="number" min="0.01" step="0.01" value="${esc(draft.baseRate)}" placeholder="เช่น 18000">`,`<span id="obRateHelp">ยอดก่อนหักต่อเดือน</span>`),field("ชั่วโมงทำงานมาตรฐาน/วัน",`<input id="obHours" type="number" min="1" max="24" step="0.5" value="${esc(draft.standardHours)}">`),field("ตัวคูณ OT",`<input id="obOtMul" type="number" min="1" step="0.25" value="${esc(draft.otMultiplier)}">`),field("วันทำงานต่อเดือน",`<input id="obDays" type="number" min="1" max="31" step="1" value="${esc(draft.daysPerMonth)}">`)); body.append(grid);
    body.append(el(`<div class="notice" id="obPayPreview">กำหนดเงินเดือนรายเดือนก่อนสร้างพนักงาน</div>`));
    body.append(el(`<label class="check"><input type="checkbox" id="obOt" ${draft.otEnabled?"checked":""}> เปิด OT ให้พนักงานคนนี้</label>`));
    const back=el(`<button class="btn sub">ย้อนกลับ</button>`); back.onclick=()=>{ draft.payBasis=$("#obBasis").value; draft.baseRate=$("#obRate").value; draft.standardHours=$("#obHours").value; draft.otMultiplier=$("#obOtMul").value; draft.daysPerMonth=$("#obDays").value; draft.otEnabled=$("#obOt").checked; closeModal(); showIdentity(); };
    const save=el(`<button class="btn">สร้างพนักงาน</button>`);
    save.onclick=()=>withBtn(save,async()=>{
      const baseRate=Number($("#obRate").value), standardHours=Number($("#obHours").value), otMultiplier=Number($("#obOtMul").value), daysPerMonth=Number($("#obDays").value);
      if(!Number.isFinite(baseRate)||baseRate<=0||!Number.isFinite(standardHours)||standardHours<=0){toast("กรอกอัตราค่าจ้างและชั่วโมงทำงานให้ถูกต้อง","bad");return;}
      try{
        const created=await api("admin_upsert_employee",{name:draft.name,role:draft.role,department:draft.department,nationalId:draft.nationalId,phone:draft.phone,locationRequired:draft.locationRequired,password:draft.password,updatedBy:state.reviewer||"Admin"});
        const employeeId=created.employee?.id;
        let payWarning="";
        try{ await api("admin_upsert_pay_rule",{employeeId,payBasis:$("#obBasis").value,baseRate,standardHours,otEnabled:$("#obOt").checked,otMultiplier,daysPerMonth,updatedBy:state.reviewer||"Admin"}); }
        catch(err){ payWarning="สร้างบัญชีแล้ว แต่บันทึกเรตค่าจ้างไม่สำเร็จ: "+err.message; }
        closeModal(); await loadEmployees(true); PAGES[state.page].load();
        showSecret("สร้างพนักงานพร้อมใช้งาน",[["Employee ID",employeeId||"—"],["รหัสผ่าน",created.initialPassword||draft.password||"—"]],payWarning||"สร้างบัญชีและเรตค่าจ้างแล้ว · แจ้งข้อมูลนี้ให้พนักงานใช้เข้า APK");
        if(payWarning) toast(payWarning,"bad");
      }catch(err){ toast(err.message,"bad"); }
    });
    openModal("เพิ่มพนักงาน · ขั้นที่ 2 จาก 2",body,[back,save]);
    $("#obBasis").value=draft.payBasis;
    const syncPayCopy=()=>{
      const basis=$("#obBasis").value, rate=Number($("#obRate").value||0);
      const copy={monthly:["เงินเดือนต่อเดือน","ยอดก่อนหักต่อเดือน","เงินเดือน"],daily:["ค่าจ้างต่อวัน","จ่ายตามวันทำงานที่บันทึก","ค่าจ้าง"],hourly:["ค่าจ้างต่อชั่วโมง","จ่ายตามชั่วโมงทำงานที่บันทึก","ค่าจ้าง"]}[basis]||[];
      $("#obRateLabel").textContent=copy[0]; $("#obRateHelp").textContent=copy[1];
      $("#obPayPreview").innerHTML=rate>0?`<b>${copy[2]}ที่ตั้งไว้ ${fmtBaht(rate)}</b><br><span class="sub">${basis==='monthly'?'ต่อเดือน':'ต่อ'+(basis==='daily'?'วัน':'ชั่วโมง')} · แก้ไขภายหลังได้ที่เมนูค่าจ้างและ OT</span>`:'<span class="sub">กรอกยอดค่าจ้างก่อนสร้างพนักงาน</span>';
    };
    $("#obBasis").onchange=syncPayCopy; $("#obRate").oninput=syncPayCopy; syncPayCopy();
  };
  showIdentity();
}

// Local-only reference data for explaining the pay setup.  It is intentionally
// never sent to the API or database.
function openThreeMonthPayrollDemo(){
  const people=[
    ["BVN-0001","สมชาย ใจดี","รายเดือน",18000,"ก.ย. 18,000 · ต.ค. 18,000 · พ.ย. 18,000","฿54,000"],
    ["BVN-0002","วิภา แสงทอง","รายวัน",650,"ก.ย. 21 วัน · ต.ค. 22 วัน · พ.ย. 20 วัน","฿40,950"],
    ["BVN-0003","อนันต์ พูนผล","รายชั่วโมง",75,"ก.ย. 160 ชม. · ต.ค. 168 ชม. · พ.ย. 152 ชม.","฿36,000"],
    ["BVN-0004","สุภาวดี แก้วดี","รายเดือน",22000,"ลาอนุมัติ 2 วัน · OT อนุมัติ 6 ชม.","฿67,320"],
    ["BVN-0005","ธนา บุญมี","รายวัน",550,"ก.ย. 20 วัน · ต.ค. 21 วัน · พ.ย. 19 วัน","฿33,000"],
  ];
  const body=el(`<div><div class="notice blue"><b>ตัวอย่างการคำนวณ 3 เดือน</b><br><span class="sub">ข้อมูลจำลองสำหรับอธิบายรูปแบบการจ่ายเงินเท่านั้น ไม่บันทึกลงฐานข้อมูล</span></div><div class="panel" style="margin:14px 0 0"><div class="head"><h2>กันยายน – พฤศจิกายน 2569</h2><span class="sub">OT รวมเฉพาะรายการที่ผู้ดูแลอนุมัติแล้ว</span></div><div class="body flush"><table><thead><tr><th>พนักงาน</th><th>วิธีจ่าย</th><th class="num">อัตรา</th><th>ข้อมูลลงเวลา 3 เดือน</th><th class="num">รายได้ก่อนหัก</th></tr></thead><tbody>${people.map(r=>`<tr><td class="person">${esc(r[1])}<span class="sub">${esc(r[0])}</span></td><td>${esc(r[2])}</td><td class="num">${fmtBaht(r[3])}</td><td>${esc(r[4])}</td><td class="num"><b>${esc(r[5])}</b></td></tr>`).join("")}</tbody></table></div></div><p class="sub" style="margin:12px 0 0">หลักการ: รายเดือน = เงินเดือน × จำนวนเดือน, รายวัน = อัตรา × วันที่ทำงาน, รายชั่วโมง = อัตรา × ชั่วโมงที่บันทึกจริง; OT จะถูกคิดเฉพาะเมื่อสถานะเป็น “อนุมัติ” เท่านั้น</p></div>`);
  const close=el(`<button class="btn">เข้าใจแล้ว</button>`); close.onclick=closeModal;
  openModal("ตัวอย่างพนักงาน 5 คน · 3 เดือน",body,[close]);
}

function employeeDialog(emp){
  if(!emp){ void employeeOnboardingDialog(); return; }
  const isEdit=!!emp;
  const body=el(`<div></div>`);
  body.append(
    field("ชื่อ-นามสกุล", `<input id="fName" type="text" value="${esc(emp?.name||"")}" required>`),
    el(`<div class="grid2"></div>`),
  );
  const g=body.querySelector(".grid2");
  g.append(
    field("ตำแหน่ง", `<input id="fRole" type="text" value="${esc(emp?.role||"")}" placeholder="Employee">`),
    field("แผนก", `<input id="fDept" type="text" value="${esc(emp?.department||"")}">`),
  );
  const identity=el(`<div class="grid2"></div>`);
  identity.append(
    field("เลขบัตรประชาชน", `<input id="fNationalId" type="text" inputmode="numeric" maxlength="17" value="${esc(emp?.nationalId||"")}" placeholder="13 หลัก">`, "เก็บในหลังบ้าน ไม่แสดงใน APK"),
    field("เบอร์โทรศัพท์", `<input id="fPhone" type="tel" maxlength="20" value="${esc(emp?.phone||"")}" placeholder="เช่น 0812345678">`),
  );
  body.append(identity);
  body.append(el(`<div class="notice blue">จุดเช็กอินจัดการรวมที่เมนู “เวลาทำงาน” ไม่ต้องกำหนดรายพนักงาน</div>`));
  body.append(field(isEdit?"รหัสผ่าน":"รหัสผ่านเริ่มต้น (ถ้าต้องการ)", `<input id="fPw" type="text" value="${esc(emp?.password||"")}" autocomplete="new-password" placeholder="${isEdit?"เว้นว่าง = ไม่เปลี่ยนรหัส":"เว้นว่าง = ระบบสุ่มให้"}">`,
    isEdit?"โหมดใช้งานง่าย: รหัสผ่านที่เก็บใน Google Sheet แสดงได้และแก้ไขได้ที่นี่":"ระบบจะแสดงรหัสที่สุ่มให้และบันทึกเป็นข้อความปกติใน Google Sheet"));
  const chk=el(`<label class="check"><input type="checkbox" id="fLoc" ${(!emp||emp.locationRequired)?"checked":""}> บังคับ GPS ตอนเช็กอิน</label>`);
  body.append(chk);
  if(isEdit){
    const st=el(`<label class="check"><input type="checkbox" id="fActive" ${emp.status==="active"?"checked":""}> พนักงานใช้งานอยู่ (active)</label>`);
    body.append(st);
  }

  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">${isEdit?"บันทึก":"สร้างพนักงาน"}</button>`);
  save.onclick=()=>withBtn(save, async ()=>{
    const name=$("#fName").value.trim();
    if(!name){ toast("ต้องกรอกชื่อพนักงาน","bad"); return; }
    const fields={
      name, role:$("#fRole").value.trim(), department:$("#fDept").value.trim(), nationalId:$("#fNationalId").value.replace(/[^0-9]/g,""), phone:$("#fPhone").value.trim(),
      locationRequired:$("#fLoc").checked, password:$("#fPw").value.trim(), updatedBy:state.reviewer||"Admin",
    };
    if(isEdit){ fields.employeeId=emp.id; fields.status=$("#fActive").checked?"active":"inactive"; }
    try{
      const data=await api("admin_upsert_employee", fields);
      closeModal();
      await loadEmployees(true); PAGES[state.page].load();
      if(!isEdit && data.initialPassword) showSecret("สร้างพนักงานสำเร็จ",
        [["Employee ID", data.employee?.id||""],["รหัสผ่าน", data.initialPassword]],
        "แสดงรหัสครั้งนี้เท่านั้น หากลืม ให้ผู้ดูแลรีเซ็ตรหัสใหม่");
      else toast("บันทึกพนักงานแล้ว","good");
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal(isEdit?`แก้ไข ${emp.name}`:"เพิ่มพนักงานใหม่", body, [cancel, save]);
}

async function resetPassword(emp){
  if(!await confirmDialog("ตั้งรหัสผ่านใหม่", `สุ่มรหัสผ่านใหม่ให้ <b>${esc(emp.name)}</b> (${esc(emp.id)})?<br>พนักงานต้องใช้รหัสใหม่นี้ในการเข้าสู่ระบบครั้งถัดไป<br><span class="sub">หรือกด “แก้ไข” เพื่อตั้งรหัสที่ต้องการเองก็ได้</span>`, {okText:"สุ่มรหัสใหม่"})) return;
  try{
    const data=await api("admin_reset_employee_password",{employeeId:emp.id});
    showSecret("ตั้งรหัสผ่านใหม่แล้ว", [["Employee ID", emp.id],["รหัสผ่าน", data.temporaryPassword]],
      "แสดงรหัสครั้งนี้เท่านั้น หากลืม ให้ผู้ดูแลรีเซ็ตรหัสใหม่");
  }catch(err){ toast(err.message,"bad"); }
}

async function deactivate(emp){
  if(!await confirmDialog("ปิดใช้งานพนักงาน", `ปิดใช้งาน <b>${esc(emp.name)}</b>?<br>ประวัติเวลางาน เงินเดือน และ audit จะยังอยู่ครบ`, {danger:true, okText:"ปิดใช้งาน"})) return;
  try{
    await api("admin_upsert_employee",{employeeId:emp.id, name:emp.name, role:emp.role||"Employee",
      department:emp.department||"", status:"inactive", locationRequired:emp.locationRequired, updatedBy:state.reviewer||"Admin"});
    await loadEmployees(true); PAGES[state.page].load(); toast("ปิดใช้งานแล้ว","good");
  }catch(err){ toast(err.message,"bad"); }
}

async function deleteEmployee(emp){
  if(state.role!=="owner"){ toast("เฉพาะ Owner เท่านั้นที่ลบพนักงานถาวรได้", "bad"); return; }
  if(!hasBackendCapability("employeeDelete")){ toast("ลบถาวรรอ deploy Backend รุ่นปัจจุบัน — ตอนนี้ใช้ “ปิดใช้งาน” ได้ตามปกติ", "bad"); return; }
  const range=payrollRange("current");
  const body=el(`<div><div class="notice bad"><b>ลบถาวร</b> จะลบพนักงาน<b>พร้อม log เข้า-ออกงานทั้งหมด</b>ของคนนี้<br>ใช้ได้เฉพาะคนที่ยังไม่มีประวัติ<b>เงินเดือน การลา OT หรือเบิกเงิน</b> — ถ้ามี ระบบจะปฏิเสธ ให้ใช้ “ปิดใช้งาน” แทน</div>
    <label style="display:flex;gap:9px;align-items:flex-start;margin:14px 0 6px;font-size:13px;line-height:1.5;cursor:pointer"><input type="checkbox" id="delFinalSlip" checked style="margin-top:2px"><span>ออกสลิปสุดท้ายให้ก่อนลบ — คิดค่าจ้างถึงวันนี้ (<b>${fmtDate(range.start)} – ${fmtDate(range.end)}</b>)</span></label>
    <p style="line-height:1.6;margin:12px 0 8px">พิมพ์รหัส <b>${esc(emp.id)}</b> และ<b>รหัสผ่านผู้ดูแล</b>เพื่อยืนยันการลบ <b>${esc(emp.name)}</b></p></div>`);
  body.append(field("ยืนยันรหัสพนักงาน", `<input id="deleteEmployeeId" type="text" autocomplete="off" placeholder="${esc(emp.id)}">`));
  body.append(field("รหัสผ่านผู้ดูแล", `<input id="deleteAdminPw" type="password" autocomplete="current-password" placeholder="รหัสผ่านของคุณ">`));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const confirm=el(`<button class="btn danger" disabled>ลบถาวร</button>`);
  const idInput=body.querySelector("#deleteEmployeeId"), pwInput=body.querySelector("#deleteAdminPw");
  const recheck=()=>{ confirm.disabled=!(idInput.value.trim().toUpperCase()===emp.id && pwInput.value.length>0); };
  idInput.oninput=recheck; pwInput.oninput=recheck;
  confirm.onclick=()=>withBtn(confirm,async()=>{
    const password=pwInput.value;
    if(body.querySelector("#delFinalSlip").checked){
      try{ const r=await api("admin_issue_payslip",{payrollId:"",startDate:range.start,endDate:range.end,employeeId:emp.id});
        await printPayslip(r.line,{start:r.startDate,end:r.endDate,lockedAt:r.lockedAt},false,r.issuerSettings||{});
        toast("ออกสลิปสุดท้ายแล้ว","good");
      }catch(slipErr){ toast("ออกสลิปสุดท้ายไม่ได้: "+(slipErr.message||"ไม่มีข้อมูลค่าจ้าง")+" — จะดำเนินการลบต่อ","bad"); }
    }
    try{
      await api("admin_delete_employee",{employeeId:emp.id,password});
      closeModal(); await loadEmployees(true); PAGES[state.page].load(); toast("ลบพนักงานแล้ว", "good");
    }catch(err){
      const message=String(err?.message||err);
      toast(/ยังไม่รองรับ action นี้บน Supabase: admin_delete_employee/.test(message)?"ปุ่มลบถาวรรอ deploy Backend รุ่นใหม่ — ตอนนี้ใช้ “ปิดใช้งาน” ได้ตามปกติ":message,"bad");
    }
  });
  openModal(`ลบ ${emp.name} ถาวร`, body, [cancel,confirm]);
}

function showSecret(title, rows, hint){
  const body=el(`<div></div>`);
  rows.forEach(([k,v])=>body.append(el(`<div class="secretbox"><b>${esc(k)}</b><div class="v">${esc(v)}</div></div>`)));
  if(hint) body.append(el(`<div class="notice" style="margin-top:14px">${esc(hint)}</div>`));
  const copy=el(`<button class="btn sub">คัดลอกรหัส</button>`);
  copy.onclick=()=>{ navigator.clipboard?.writeText(rows.map(r=>r[1]).join(" ")); toast("คัดลอกแล้ว"); };
  const ok=el(`<button class="btn">เรียบร้อย</button>`); ok.onclick=closeModal;
  openModal(title, body, [copy, ok]);
}

/* =================================================================
   APPROVALS (leave + time requests)
   ================================================================= */
async function renderApprovals(){
  const node=$("#page-approvals");
  setRouteShell(node,"approvals");
  skeleton(node);
  try{
    await loadEmployees().catch(()=>{});
    const [leaveData, timeData]=await Promise.all([api("admin_list_leave_requests"), api("admin_list_time_requests")]);
    const leaves=(leaveData.requests||[]), times=(timeData.requests||[]).filter(r=>r.requestType==="overtime");
    const pendL=leaves.filter(r=>r.status==="pending"), pendT=times.filter(r=>r.status==="pending");
    const leaveDays=(a,b)=>{ const d1=new Date(a+"T00:00:00+07:00"), d2=new Date(b+"T00:00:00+07:00"); if(isNaN(d1)||isNaN(d2)) return "—"; return Math.round((d2-d1)/86400000)+1; };
    const statusBadge=(s)=> s==="approved"?'<span class="badge">อนุมัติ</span>':s==="rejected"?'<span class="badge red">ปฏิเสธ</span>':'<span class="badge amber">รออนุมัติ</span>';
    const kindBadge={leave:'blue',ot:'amber'}, typeShort={leave:'ลา',ot:'OT'};
    const items=[
      ...leaves.map(r=>({kind:'leave',status:r.status,name:empName(r.employeeId),eid:r.employeeId,
        detail:`${esc(r.leaveType)} · ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)} (${leaveDays(r.startDate,r.endDate)} วัน)${r.reason?' · '+esc(r.reason):''}`,
        impact:'ตรวจสิทธิ์ลาคงเหลือก่อนอนุมัติ',
        review:(b,d)=>reviewLeave(b,r.requestId,d)})),
      ...times.map(r=>({kind:'ot',status:r.status,name:empName(r.employeeId),eid:r.employeeId,
        detail:`${fmtDate(r.workDate)} · ${fmtHours(r.requestedMinutes)}${r.reason?' · '+esc(r.reason):''}${r.reviewerNote?' · หมายเหตุ: '+esc(r.reviewerNote):''}`,
        impact:`เมื่ออนุมัติ จะรวมในค่าแรง OT ของงวดที่มีวันที่ ${fmtDate(r.workDate)}`,
        review:(b,d)=>reviewTime(b,r.requestId,d)})),
    ];
    items.sort((a,b)=>{
      const rank=i=>i.status!=="pending"?3:i.kind==="ot"?0:1;
      return rank(a)-rank(b)||String(a.name).localeCompare(String(b.name),"th");
    });
    const cnt=k=>items.filter(i=>i.status==='pending'&&(k==='all'||i.kind===k)).length;
    node.innerHTML=`
      <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">ศูนย์ตัดสินใจ</div><h2>คำขอที่รอการพิจารณา</h2><p>อนุมัติ OT ก่อนจึงนำยอดเข้ารอบเงินเดือนได้</p></div><div class="directory-count"><b>${fmtInt(pendL.length+pendT.length)}</b> รายการ</div></div>
      <div class="notice blue">อนุมัติที่นี่เพื่อเก็บผลการตัดสินใจแยกจากเวลาเข้า–ออก · ผู้อนุมัติ: <b>${esc(state.reviewer||"Admin")}</b></div>
      ${pendT.length?`<div class="approval-queue-note"><i></i><span><b>มี OT รออนุมัติ ${fmtInt(pendT.length)} รายการ</b> — ยอดเหล่านี้จะยังไม่ถูกรวมใน Payroll จนกว่าจะอนุมัติ</span></div>`:""}
      <div class="appr-stats">
        <div class="appr-stat${pendL.length?" warn":""}"><span class="n">${fmtInt(pendL.length)}</span><span class="l">คำขอลารออนุมัติ</span></div>
        <div class="appr-stat${pendT.length?" warn":""}"><span class="n">${fmtInt(pendT.length)}</span><span class="l">OT รออนุมัติ · ยังไม่คิดเงินเดือน</span></div>
        <div class="appr-stat${(pendL.length+pendT.length)?" accent":""}"><span class="n">${fmtInt(pendL.length+pendT.length)}</span><span class="l">รวมรอตัดสินใจ</span></div>
      </div>
      <div class="panel"><div class="head"><h2>คำขอรออนุมัติ</h2><div class="spacer"></div>
        <div class="toolbar" id="apFilters" style="gap:4px">
          <button class="btn sm" data-filter="all">ทั้งหมด ${cnt('all')}</button>
          <button class="btn sub sm" data-filter="leave">ลา ${cnt('leave')}</button>
          <button class="btn sub sm" data-filter="ot">OT ${cnt('ot')}</button>
        </div>
        <label class="check" style="margin:0 0 0 8px"><input type="checkbox" id="apDecided"> แสดงที่ตัดสินใจแล้ว</label>
        <button class="btn ok sm" id="addOtBtn" style="margin-left:8px">บันทึก OT</button></div>
        <div class="body flush" id="apList"></div>
      </div>
      <div class="approval-support-grid">
        <div class="panel" style="margin-top:0"><div class="head"><h2>ใครลาวันไหน</h2><div class="spacer"></div>
          <button class="btn sub sm" id="calPrev">‹</button><span id="calLabel" style="min-width:110px;text-align:center;font-weight:600"></span><button class="btn sub sm" id="calNext">›</button></div>
          <div class="body" id="leaveCalWrap"></div>
        </div>
        <div class="panel" style="margin-top:0"><div class="head"><h2>โควตาวันลา (ปีนี้)</h2></div>
          <div class="body flush"><table id="quotaTable"><thead><tr><th>พนักงาน</th><th class="num">ป่วย</th><th class="num">กิจ</th><th class="num">พักร้อน</th><th class="num">อื่นๆ</th></tr></thead>
          <tbody id="quotaRows"><tr><td colspan="5"><div class="empty">กำลังโหลด…</div></td></tr></tbody></table></div>
        </div>
      </div>`;

    let filter='all';
    const drawList=()=>{
      const decided=$("#apDecided").checked;
      const list=items.filter(i=>(filter==='all'||i.kind===filter)&&(decided||i.status==='pending'));
      const box=$("#apList");
      box.innerHTML=list.length? list.map((i,idx)=>`
        <div class="approval-row ${i.status==='pending'?`pending-${i.kind}`:""}">
          <span class="badge ${kindBadge[i.kind]}" style="flex:none;min-width:50px;justify-content:center">${typeShort[i.kind]}</span>
          <div style="flex:1;min-width:0"><b style="font-weight:600">${esc(i.name)}</b> <span class="sub" style="font-weight:400">${esc(i.eid)}</span><div class="sub" style="margin-top:1px">${i.detail}</div>${i.status==='pending'?`<div class="approval-impact ${i.kind==='ot'?'ot':''}">${esc(i.impact)}</div>`:''}</div>
          ${i.status==='pending'?`<div class="approval-actions"><button class="btn ok sm" data-ap="${idx}">อนุมัติ</button><button class="btn danger sm" data-rj="${idx}">ปฏิเสธ</button></div>`:statusBadge(i.status)}
        </div>`).join("")
        : `<div class="empty">ไม่มีคำขอ${decided?'':'ที่รอตัดสินใจ'}</div>`;
      box.querySelectorAll("[data-ap]").forEach(b=>b.onclick=()=>list[+b.dataset.ap].review(b,"approved"));
      box.querySelectorAll("[data-rj]").forEach(b=>b.onclick=()=>list[+b.dataset.rj].review(b,"rejected"));
    };
    $("#apFilters").querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{
      filter=b.dataset.filter;
      $("#apFilters").querySelectorAll("[data-filter]").forEach(x=>x.className="btn sub sm");
      b.className="btn sm"; drawList();
    });
    $("#apDecided").onchange=drawList;
    drawList();
    let calBase=new Date();
    // Holidays/OT-days so the approvals calendar can also set a day's OT rate.
    try{ _otHolidays=(await api("admin_list_holidays")).holidays||[]; }catch(_){ _otHolidays=[]; }
    const drawCal=()=>{
      const y=calBase.getFullYear(), m=calBase.getMonth();
      $("#calLabel").textContent=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"][m]+" "+(y+543);
      // map day -> [{name,type}] from approved leaves overlapping this month
      const byDay={};
      leaves.filter(r=>r.status==="approved").forEach(r=>{
        let d=new Date(r.startDate+"T00:00:00+07:00"); const end=new Date((r.endDate||r.startDate)+"T00:00:00+07:00");
        if(isNaN(d)||isNaN(end)) return;
        for(;d<=end;d.setDate(d.getDate()+1)){ if(d.getFullYear()===y&&d.getMonth()===m){ const k=d.getDate(); (byDay[k]=byDay[k]||[]).push(empName(r.employeeId)+" ("+r.leaveType+")"); } }
      });
      const holBy={}; _otHolidays.forEach(h=>holBy[h.date]=h);
      const first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate(), todayISOv=todayISO();
      let cells=""; for(let i=0;i<first;i++) cells+=`<div class="cal-cell empty-cell"></div>`;
      for(let dn=1;dn<=days;dn++){ const iso=`${y}-${String(m+1).padStart(2,"0")}-${String(dn).padStart(2,"0")}`; const list=byDay[dn]||[];
        const h=holBy[iso], mul=h?Number(h.multiplier||0):0, col=otMulColor(mul);
        const tip=[list.length?list.join(", "):"", h?("วันพิเศษ: "+(h.name||"")+(mul>1?" ×"+mul:"")):""].filter(Boolean).join(" · ")||"คลิกเพื่อตั้งค่า OT วันนี้";
        cells+=`<div class="cal-cell otcell${iso===todayISOv?" today":""}${list.length?" has":""}" data-otdate="${iso}" tabindex="0" role="button" style="position:relative;cursor:pointer${col?`;background:${col[0]}`:""}" title="${esc(tip)}">
          <span class="cal-d"${col?` style="color:${col[1]}"`:""}>${dn}</span>${list.length?`<span class="cal-n">${list.length}</span>`:""}${mul>1?`<span class="cal-ot" style="position:absolute;right:3px;bottom:2px;font-size:10px;font-weight:700;color:${col[1]}">×${mul}</span>`:""}</div>`; }
      $("#leaveCalWrap").innerHTML=`<div class="cal-grid">${["อา","จ","อ","พ","พฤ","ศ","ส"].map(d=>`<div class="cal-head">${d}</div>`).join("")}${cells}</div>`;
      $("#leaveCalWrap").querySelectorAll("[data-otdate]").forEach(c=>{
        const iso=c.dataset.otdate;
        c.onclick=()=>otDayDialog(iso, holBy[iso]);
        c.oncontextmenu=(e)=>{ e.preventDefault(); otDayQuickMenu(e, iso, holBy[iso]); };
      });
    };
    $("#calPrev").onclick=()=>{calBase.setMonth(calBase.getMonth()-1);drawCal();};
    $("#calNext").onclick=()=>{calBase.setMonth(calBase.getMonth()+1);drawCal();};
    drawCal();
    api("admin_leave_usage").then(u=>{
      const q=u.quota||{}, tb=$("#quotaRows"); if(!tb) return;
      const cell=(used,quota)=>{ const rem=quota-used; return `${fmtInt(used)}<span class="sub">เหลือ ${fmtInt(rem)}/${fmtInt(quota)}</span>`; };
      tb.innerHTML=(u.rows||[]).length? u.rows.map(r=>`<tr>
        <td class="person">${esc(r.name)}<span class="sub">${esc(r.employeeId)}</span></td>
        <td class="num">${cell(r.usedSick,q.sick)}</td><td class="num">${cell(r.usedPersonal,q.personal)}</td>
        <td class="num">${cell(r.usedVacation,q.vacation)}</td><td class="num">${fmtInt(r.usedOther)}</td></tr>`).join("")
        : `<tr><td colspan="5"><div class="empty">ไม่มีข้อมูล</div></td></tr>`;
      attachSort($("#quotaTable"));
    }).catch(()=>{ const tb=$("#quotaRows"); if(tb) tb.innerHTML=`<tr><td colspan="5"><div class="empty">โหลดโควตาไม่ได้ (ต้อง deploy backend ใหม่)</div></td></tr>`; });
    $("#addOtBtn").onclick=()=>addOvertimeDialog();
  }catch(err){ errorBox(node, err, renderApprovals); }
}

async function addOvertimeDialog(){
  await loadEmployees().catch(()=>{});
  const opts=(state.employees||[]).filter(e=>e.status==="active")
    .map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.id)})</option>`).join("");
  const body=el(`<div></div>`);
  body.append(el(`<div class="notice blue">บันทึก OT แล้วรายการจะอยู่ในสถานะ “รออนุมัติ” และจะนำไปคิดเงินเดือนต่อเมื่อผู้ดูแลกดอนุมัติเท่านั้น</div>`));
  body.append(field("พนักงาน", `<select id="otEmp">${opts||'<option value="">— ไม่มีพนักงาน active —</option>'}</select>`));
  const g=el(`<div class="grid2"></div>`);
  g.append(
    field("วันที่ทำ OT", `<input id="otDate" type="date" value="${todayISO()}">`),
    field("จำนวนนาที", `<input id="otMin" type="number" min="1" max="1440" step="1" placeholder="เช่น 120 = 2 ชม.">`),
  );
  body.append(g);
  body.append(field("เหตุผล / หมายเหตุ", `<input id="otReason" type="text" placeholder="เช่น ปิดร้านช่วยสต๊อก">`));
  const ok=el(`<button class="btn ok">ส่งรออนุมัติ</button>`);
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  ok.onclick=()=>withBtn(ok, async ()=>{
    const employeeId=$("#otEmp").value, workDate=$("#otDate").value, requestedMinutes=Number($("#otMin").value), reason=$("#otReason").value.trim();
    if(!employeeId){ toast("เลือกพนักงานก่อน","bad"); return; }
    if(!workDate){ toast("เลือกวันที่","bad"); return; }
    if(!(requestedMinutes>0&&requestedMinutes<=1440)){ toast("จำนวนนาทีต้องอยู่ระหว่าง 1–1440","bad"); return; }
    try{
      await api("admin_add_overtime",{employeeId, workDate, requestedMinutes, reason, reviewer:state.reviewer||"Admin"});
      closeModal(); toast("ส่ง OT รออนุมัติแล้ว","good"); renderApprovals();
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal("บันทึก OT เพื่อรออนุมัติ", body, [cancel, ok]);
}

async function reviewLeave(btn, requestId, decision){
  if(decision==="rejected" && !await confirmDialog("ปฏิเสธคำขอลา","ยืนยันการปฏิเสธคำขอนี้?",{danger:true,okText:"ปฏิเสธ"})) return;
  await withBtn(btn, async ()=>{
    try{ await api("admin_review_leave",{requestId, decision, reviewer:state.reviewer||"Admin"});
      toast("บันทึกการ"+(decision==="approved"?"อนุมัติ":"ปฏิเสธ")+"แล้ว","good"); PAGES[state.page].load(); refreshApprovalBadge();
    }catch(err){ toast(err.message,"bad"); }
  });
}
async function reviewTime(btn, requestId, decision){
  let note="";
  if(decision==="rejected"){
    note=prompt("หมายเหตุถึงพนักงาน (ไม่บังคับ):")||"";
  }
  await withBtn(btn, async ()=>{
    try{ await api("admin_review_time_request",{requestId, decision, reviewer:state.reviewer||"Admin", reviewerNote:note});
      toast("บันทึกการ"+(decision==="approved"?"อนุมัติ":"ปฏิเสธ")+"แล้ว","good"); PAGES[state.page].load(); refreshApprovalBadge();
    }catch(err){ toast(err.message,"bad"); }
  });
}

/* =================================================================
   PAYROLL
   ================================================================= */
let lastPreview=null;
function payrollRange(kind="current", reference=todayISO()){
  const y=Number(reference.slice(0,4)), m=Number(reference.slice(5,7));
  const iso=(yy,mm,dd)=>`${yy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
  if(kind==="previous"){
    const previous=new Date(Date.UTC(y,m-2,1));
    const py=previous.getUTCFullYear(), pm=previous.getUTCMonth()+1;
    const last=new Date(Date.UTC(py,pm,0)).getUTCDate();
    return {start:iso(py,pm,1),end:iso(py,pm,last),label:"เดือนก่อน (เต็มเดือน)"};
  }
  return {start:reference.slice(0,8)+"01",end:reference,label:"เดือนนี้ถึงวันนี้"};
}
function applyPayrollPeriod(kind){
  const range=payrollRange(kind);
  const start=$("#pStart"),end=$("#pEnd"); if(!start||!end)return;
  start.value=range.start; end.value=range.end;
  document.querySelectorAll("[data-payroll-period]").forEach(b=>b.classList.toggle("active",b.dataset.payrollPeriod===kind));
  void doPreview($("#previewBtn"));
}
async function renderPayroll(){
  const node=$("#page-payroll");
  setRouteShell(node,"payroll");
  const current=payrollRange("current"), t=current.end, first=current.start;
  node.innerHTML=`
    ${groupTabsHtml("payroll")}
    <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">ศูนย์เงินเดือน</div><h2>ออกสลิปเงินเดือน</h2><p>เลือกงวด → ตรวจ Timesheet รายคน → ออกสลิป</p></div><div class="directory-count">งวด<br><b>${fmtDate(first)} – ${fmtDate(t)}</b></div></div>
    <section class="payroll-workbench finance-workbench compact" aria-label="กำหนดงวดเงินเดือน">
      <div><div class="payroll-kicker"><i></i>งวดเงินเดือน</div><p style="margin:3px 0 0;font-size:12px;color:var(--muted)">เริ่มวันที่ 1 ถึงวันนี้ · เลือก “เดือนก่อน” ตัดเต็มเดือนให้อัตโนมัติ</p></div>
      <div class="payroll-period"><div class="period-presets" role="group" aria-label="เลือกงวด"><button class="active" data-payroll-period="current">1–วันนี้</button><button data-payroll-period="previous">เดือนก่อนเต็มเดือน</button></div><label>เริ่ม<input type="date" id="pStart" value="${first}"></label><label>สิ้นสุด<input type="date" id="pEnd" value="${t}"></label><button class="btn sm" id="previewBtn">คำนวณงวด</button></div>
    </section>
    <section class="payroll-summary" id="payrollSummary"><div class="payroll-loading">กำลังคำนวณงวดปัจจุบัน…</div></section>
    <div class="notice">ขั้นตอนที่ 3 เป็น <b>ประมาณการ</b> — สุทธิ = gross − เบิกล่วงหน้า − ประกันสังคม − หักอื่นๆ ยังไม่รวมภาษี ณ ที่จ่ายแบบขั้นบันได</div>
    <div class="panel"><div class="head"><h2>รายละเอียดงวดและสลิป</h2><span class="sub" style="margin-left:8px">ตรวจความครบถ้วนก่อนออกสลิป</span></div>
      <div class="body flush" id="previewResult"></div>
    </div>`;
  $("#previewBtn").onclick=e=>doPreview(e.target);
  node.querySelectorAll("[data-payroll-period]").forEach(b=>b.onclick=()=>applyPayrollPeriod(b.dataset.payrollPeriod));
  [$("#pStart"),$("#pEnd")].forEach(input=>input.onchange=()=>node.querySelectorAll("[data-payroll-period]").forEach(b=>b.classList.remove("active")));
  void doPreview($("#previewBtn"));
}

// #8 Monthly summary report (print → PDF): payroll net + leave days + OT per employee.
async function printMonthlySummary(data){
  const money=(n)=>Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const dateTh=(iso)=>{ if(!iso)return"—"; const d=new Date(iso+"T00:00:00+07:00"); return isNaN(d)?iso:d.toLocaleDateString("th-TH",{dateStyle:"long"}); };
  let leaves=[],times=[];
  let invoiceSettings={};
  try{ invoiceSettings=(await api("admin_get_invoice_settings")).settings||{}; }catch(_){}
  const issuer=invoiceIssuer(invoiceSettings);
  try{ const [l,t]=await Promise.all([api("admin_list_leave_requests"),api("admin_list_time_requests")]); leaves=l.requests||[]; times=t.requests||[]; }catch(_){}
  const inRange=(d)=> d>=data.startDate && d<=data.endDate;
  const leaveDaysByEmp={}, otMinByEmp={};
  leaves.filter(r=>r.status==="approved").forEach(r=>{ if(!inRange(r.startDate))return; let a=new Date(r.startDate+"T00:00:00+07:00"),b=new Date((r.endDate||r.startDate)+"T00:00:00+07:00"); const n=isNaN(a)||isNaN(b)?1:Math.round((b-a)/86400000)+1; leaveDaysByEmp[r.employeeId]=(leaveDaysByEmp[r.employeeId]||0)+n; });
  times.filter(r=>r.requestType==="overtime"&&r.status==="approved").forEach(r=>{ if(!inRange(r.workDate))return; otMinByEmp[r.employeeId]=(otMinByEmp[r.employeeId]||0)+Number(r.requestedMinutes||0); });
  const rows=(data.lines||[]).map(l=>`<tr>
    <td>${esc(l.name||empName(l.employeeId))}<br><span style="color:#6b7280;font-size:11px">${esc(l.employeeId)}</span></td>
    <td class="num">${l.workDays||0}</td><td class="num">${Math.round((otMinByEmp[l.employeeId]||l.otMinutes||0)/60*10)/10}</td>
    <td class="num">${leaveDaysByEmp[l.employeeId]||0}</td>
    <td class="num">${money(l.grossPay)}</td><td class="num">${money(l.advanceDeduction)}</td>
    <td class="num">${money((l.sso||0)+(l.otherDeduction||0))}</td><td class="num"><b>${money(l.netPay!=null?l.netPay:l.grossPay)}</b></td></tr>`).join("");
  const html=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>สรุปเงินเดือน ${esc(data.startDate)}</title>
    <style>*{box-sizing:border-box}body{font-family:"Sarabun","Tahoma",sans-serif;color:#111;margin:0;padding:24px;background:#f3f4f6}
    .sheet{max-width:900px;margin:0 auto;background:#fff;padding:36px 40px;box-shadow:0 1px 6px rgba(0,0,0,.12)}
    .top{display:flex;justify-content:space-between;gap:22px;border-bottom:3px solid #152c47;padding-bottom:14px}.issuer-brand{display:flex;gap:12px;align-items:flex-start}.issuer-logo{width:58px;height:58px;object-fit:contain;flex:none}
    .co{font-size:18px;font-weight:700;color:#152c47;margin:0}.co-l{font-size:12px;color:#374151}
    h1{font-size:20px;margin:0}.sub{font-size:12px;color:#6b7280}
    table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}
    th{background:#152c47;color:#fff;text-align:left;padding:8px 10px}th.num,td.num{text-align:right}
    td{padding:8px 10px;border-bottom:1px solid #e5e7eb}tfoot td{border-top:2px solid #152c47;font-weight:700}
    .pbtn{font:inherit;padding:8px 18px;border:0;border-radius:8px;background:#152c47;color:#fff;cursor:pointer}
    .tb{max-width:900px;margin:0 auto 12px;text-align:right}@media print{body{background:#fff;padding:0}.sheet{box-shadow:none}.tb{display:none}}</style></head><body>
    <div class="tb"><button class="pbtn" onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
    <div class="sheet">
      <div class="top"><div class="issuer-brand">${printLogoMarkup(issuer)}<div><p class="co">${esc(issuer.name)}</p><div class="co-l">เลขประจำตัวผู้เสียภาษี ${esc(issuer.taxId)}</div></div></div>
        <div style="text-align:right"><h1>สรุปเงินเดือน</h1><div class="sub">งวด ${dateTh(data.startDate)} – ${dateTh(data.endDate)}</div></div></div>
      <table><thead><tr><th>พนักงาน</th><th class="num">วันทำงาน</th><th class="num">OT (ชม.)</th><th class="num">ลา (วัน)</th><th class="num">รวม gross</th><th class="num">หักเบิก</th><th class="num">ปกส./อื่นๆ</th><th class="num">สุทธิ</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">รวม ${fmtInt((data.lines||[]).length)} คน</td><td class="num">${money(data.totalGross)}</td><td class="num">${money(data.totalAdvance)}</td><td class="num">${money((data.totalSso||0)+(data.totalOther||0))}</td><td class="num">${money(data.totalNet)}</td></tr></tfoot></table>
      <div class="sub" style="margin-top:16px">* ประมาณการ ยังไม่รวมภาษีหัก ณ ที่จ่ายแบบขั้นบันได · ออกเมื่อ ${new Date().toLocaleDateString("th-TH",{dateStyle:"long"})}</div>
    </div></body></html>`;
  const w=window.open("","_blank"); if(!w){ toast("เบราว์เซอร์บล็อก popup","bad"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// Build a "forgot to check out" warning from preview/overview incompleteDays.
function incompleteWarningHtml(incompleteDays){
  const inc=incompleteDays||[];
  if(!inc.length) return "";
  const issueLabel=i=> i==="no_checkout"?"ลืมเช็กเอาต์" : i==="no_checkin"?"ไม่มีเช็กอิน" : "เวลาไม่ถูกต้อง";
  const rows=inc.slice(0,40).map(d=>`<li><b>${esc(d.name)}</b> <span class="sub">(${esc(d.employeeId)})</span> · ${fmtDate(d.date)} · <span style="color:#b45309">${issueLabel(d.issue)}</span>${d.checkIn?` · เข้า ${esc(d.checkIn)}`:""}${d.checkOut?` · ออก ${esc(d.checkOut)}`:""}</li>`).join("");
  return `<div class="notice" style="flex-direction:column;align-items:stretch">
    <div><b>มี ${fmtInt(inc.length)} วันที่เวลาไม่ครบ — ไม่ถูกนำไปคิดเงินเดือน</b> (ส่วนใหญ่คือลืมกดเช็กเอาต์)</div>
    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7">${rows}${inc.length>40?`<li class="sub">… และอีก ${fmtInt(inc.length-40)} วัน</li>`:""}</ul>
    <div class="sub" style="margin-top:6px">แก้ได้โดยให้พนักงานกดเช็กเอาต์ หรือแอดมินลงเวลาแทนในหน้า “เวลาทำงาน”</div>
  </div>`;
}

async function doPreview(btn){
  const startDate=$("#pStart").value, endDate=$("#pEnd").value;
  if(!startDate||!endDate){ toast("เลือกช่วงวันที่ก่อน","bad"); return; }
  const summary=$("#payrollSummary");
  if(summary) summary.innerHTML=`<div class="payroll-loading">กำลังคำนวณ ${fmtDate(startDate)} – ${fmtDate(endDate)}…</div>`;
  await loadEmployees().catch(()=>{});
  await withBtn(btn, async ()=>{
    try{
      const [data, rulesData, timeData]=await Promise.all([
        api("admin_preview_payroll",{startDate, endDate}),
        api("admin_list_pay_rules").catch(()=>({rules:[]})),
        api("admin_list_time_requests").catch(()=>({requests:[]})),
      ]);
      lastPreview={startDate:data.startDate, endDate:data.endDate, lines:data.lines, totalGross:data.totalGross, totalAdvance:data.totalAdvance, totalNet:data.totalNet, period:{start:data.startDate, end:data.endDate, label:""}};
      const box=$("#previewResult");
      const incWarn=incompleteWarningHtml(data.incompleteDays);
      const incompleteCount=(data.incompleteDays||[]).length;
      const eligibleCount=(data.lines||[]).length;
      const incompleteByEmp=new Set((data.incompleteDays||[]).map(d=>d.employeeId));
      const pendingOtByEmp=new Set((timeData.requests||[]).filter(r=>r.requestType==="overtime"&&r.status==="pending"&&r.workDate>=startDate&&r.workDate<=endDate).map(r=>r.employeeId));
      const ruleByEmp={}; (rulesData.rules||[]).forEach(r=>ruleByEmp[r.employeeId]=r);
      const activeEmployees=(state.employees||[]).filter(e=>String(e.status||"active").toLowerCase()==="active");
      const lineByEmp={}; (data.lines||[]).forEach(l=>lineByEmp[l.employeeId]=l);
      const payrollRows=(activeEmployees.length?activeEmployees:(data.lines||[]).map(l=>({id:l.employeeId,name:empName(l.employeeId)}))).map(emp=>{
        const line=lineByEmp[emp.id];
        let state="ready", label="พร้อมออกสลิป", action="ออกสลิป", target="slip";
        if(incompleteByEmp.has(emp.id)){ state="blocked"; label="เวลาไม่ครบ"; action="ตรวจเวลา"; target="owner"; }
        else if(pendingOtByEmp.has(emp.id)){ state="waiting"; label="OT รออนุมัติ"; action="อนุมัติ OT"; target="approvals"; }
        else if(!ruleByEmp[emp.id]?.hasRule){ state="blocked"; label="ยังไม่ตั้งเรต"; action="ตั้งเรต"; target="payrules"; }
        else if(line?.lateAbsenceDays){ label=`สาย ${fmtInt(line.lateDays)} วัน = ขาด ${fmtInt(line.lateAbsenceDays)} วัน`; }
        else if(!line){ state="waiting"; label="ไม่มีเวลาครบในงวด"; action="ตรวจเวลา"; target="owner"; }
        return {emp,line,state,label,action,target};
      }).sort((a,b)=>Number(a.state==="ready")-Number(b.state==="ready") || String(a.emp.name||a.emp.id).localeCompare(String(b.emp.name||b.emp.id),"th"));
      const payrollReady=payrollRows.some(r=>r.state==="ready") && payrollRows.every(r=>r.state!=="blocked"&&r.state!=="waiting");
      const pendingOtCount=pendingOtByEmp.size;
      const readyPayrollRows=payrollRows.filter(r=>r.target==="slip"&&r.line);
      const readyCount=payrollRows.filter(r=>r.state==="ready").length;
      const missingRateCount=payrollRows.filter(r=>r.target==="payrules").length;
      const lateAbsenceNotice=Number(data.lateAbsenceDays||0)>0?`<div class="notice" style="margin:0 0 12px;border-color:#f0d49a;background:#fff7ea"><div><b>นโยบายมาสายสะสม:</b> สาย ${fmtInt(data.lateDaysCount||0)} วัน · ทุก ${fmtInt(data.lateAbsenceThreshold||4)} วันเท่ากับขาด 1 วัน · คิดขาดงานเทียบเท่า ${fmtInt(data.lateAbsenceDays)} วัน${Number(data.totalLateAbsenceDeduction||0)>0?` · หักค่าแรงรวม −${fmtBaht(data.totalLateAbsenceDeduction)}`:""}</div></div>`:"";
      if(summary) summary.innerHTML=`
        <div class="payroll-metric"><span>พนักงานที่คำนวณได้</span><b>${fmtInt((data.lines||[]).length)} คน</b><em>มีเรตค่าจ้างและเวลาเข้าครบ</em></div>
        <div class="payroll-metric"><span>รายได้รวม</span><b>${fmtBaht(data.totalGross)}</b><em>ก่อนหักรายการ</em></div>
        <div class="payroll-metric"><span>ยอดหักรวม</span><b>${fmtBaht((data.totalAdvance||0)+(data.totalSso||0)+(data.totalOther||0))}</b><em>เบิกล่วงหน้า / ปกส. / อื่นๆ</em></div>
        <div class="payroll-metric"><span>ยอดจ่ายสุทธิ</span><b>${fmtBaht(data.totalNet!=null?data.totalNet:data.totalGross)}</b><em>${incompleteCount?`ต้องตรวจเวลา ${fmtInt(incompleteCount)} รายการ`:pendingOtCount?`OT รออนุมัติ ${fmtInt(pendingOtCount)} คน`:`ไม่มีเวลาค้างตรวจ`}</em></div>`;
      box.innerHTML=`<div class="payroll-readiness ${payrollReady?"":"is-blocked"}"><div><span class="ready-dot"></span><b>${payrollReady?"พร้อมออกสลิป":"ยังมีรายการที่ต้องจัดการก่อนออกสลิป"}</b><span class="sub"> · ${incompleteCount?`เวลาไม่ครบ ${fmtInt(incompleteCount)} รายการ`:pendingOtCount?`OT รออนุมัติ ${fmtInt(pendingOtCount)} คน`:"ตรวจสถานะรายบุคคลด้านล่าง"}</span></div>${payrollReady?"":`<div class="toolbar"><button class="btn ghost sm" data-nav="owner">ตรวจเวลา</button><button class="btn ghost sm" data-nav="payrules">ตั้งเรต</button></div>`}</div><section class="payroll-status-rail" aria-label="ความพร้อมของงวด"><div class="payroll-state ready"><span>พร้อมออกสลิป</span><b>${fmtInt(readyCount)}</b><small>ตรวจ Timesheet แล้ว</small></div><button class="payroll-state review" data-payroll-nav="owner"><span>เวลาไม่ครบ</span><b>${fmtInt(incompleteCount)}</b><small>เปิดรายการเพื่อตรวจ</small></button><button class="payroll-state waiting" data-payroll-nav="approvals"><span>OT รออนุมัติ</span><b>${fmtInt(pendingOtCount)}</b><small>ยังไม่นำไปคิดเงิน</small></button><button class="payroll-state blocked" data-payroll-nav="payrules"><span>ต้องตั้งเรต</span><b>${fmtInt(missingRateCount)}</b><small>แก้ก่อนออกสลิป</small></button></section>`+lateAbsenceNotice+((data.shortfallPolicy&&data.shortfallPolicy!=="none"&&(data.shortDaysCount||0)>0)?`<div class="notice" style="margin:0 0 12px;border-color:#f0d49a;background:#fff7ea"><div><b>นโยบายไม่ครบกะ:</b> ${data.shortfallPolicy==="deduct_wage"?"ตัดค่าแรงตามสัดส่วน":"หัก OT เท่าชั่วโมงที่ขาด"} · มี ${fmtInt(data.shortDaysCount)} วันที่ไม่ครบกะในงวดนี้${(data.totalShortfallDeduction||0)>0?` · ตัดค่าแรงรวม −${fmtBaht(data.totalShortfallDeduction)}`:""}</div></div>`:"")+incWarn+`
        <div class="payroll-table-tools"><span class="table-caption">รายการในงวด <b>${fmtInt(payrollRows.length)}</b> คน · เรียงตามผู้ที่ต้องดำเนินการ</span><div class="payroll-filter-set" role="group" aria-label="กรองรายการเงินเดือน"><button class="active" data-payroll-filter="all">ทั้งหมด ${fmtInt(payrollRows.length)}</button><button data-payroll-filter="action">ต้องจัดการ ${fmtInt(Math.max(0,payrollRows.length-readyCount))}</button><button data-payroll-filter="ready">พร้อมออกสลิป ${fmtInt(readyCount)}</button></div></div>
        <table><thead><tr><th>พนักงาน</th><th>ความพร้อม</th><th class="num">วันทำงาน</th><th class="num">ชม.ปกติ</th><th class="num">OT</th>
          <th class="num">ฐาน</th><th class="num">OT (เงิน)</th><th class="num">รวม gross</th><th class="num">หักเบิก</th><th class="num">ปกส./อื่นๆ</th><th class="num">สุทธิ</th><th data-nosort></th></tr></thead>
        <tbody>${payrollRows.map((row,idx)=>{ const l=row.line||{}; const badge=row.state==="ready"?"green":row.state==="waiting"?"amber":"red"; return `
          <tr data-payroll-state="${esc(row.state)}"><td class="person">${esc(row.emp.name||empName(row.emp.id))}<span class="sub">${esc(row.emp.id)}</span></td>
            <td><span class="badge ${badge}">${esc(row.label)}</span></td><td class="num">${l.workDays!=null?fmtInt(l.workDays):"—"}</td><td class="num">${l.regularMinutes!=null?fmtHours(l.regularMinutes):"—"}</td>
            <td class="num">${l.otMinutes!=null?fmtHours(l.otMinutes):"—"}</td><td class="num">${l.baseGross!=null?fmtBaht(l.baseGross):"—"}</td>
            <td class="num">${l.otGross!=null?fmtBaht(l.otGross):"—"}</td><td class="num">${l.grossPay!=null?fmtBaht(l.grossPay):"—"}</td>
            <td class="num">${l.advanceDeduction?'-'+fmtBaht(l.advanceDeduction):"—"}</td><td class="num">${((l.sso||0)+(l.otherDeduction||0))?'-'+fmtBaht((l.sso||0)+(l.otherDeduction||0)):"—"}</td>
            <td class="num"><b>${l.grossPay!=null?fmtBaht(l.netPay!=null?l.netPay:l.grossPay):"—"}</b></td>
            <td class="num">${row.target==="slip"?`<button class="btn sub sm" data-timesheet="${idx}">ตรวจสลิป</button>`:`<button class="btn sub sm" data-payroll-nav="${esc(row.target)}">${esc(row.action)}</button>`}</td></tr>`; }).join("")}
        </tbody>
        <tfoot><tr><td colspan="7" style="text-align:right;font-weight:700;padding:13px 14px">รวมทั้งงวด</td>
          <td class="num" style="padding:13px 14px">${fmtBaht(data.totalGross)}</td>
          <td class="num" style="padding:13px 14px">${(data.totalAdvance||0)?"-"+fmtBaht(data.totalAdvance):"—"}</td>
          <td class="num" style="padding:13px 14px">${((data.totalSso||0)+(data.totalOther||0))?"-"+fmtBaht((data.totalSso||0)+(data.totalOther||0)):"—"}</td>
          <td class="num" style="font-weight:800;padding:13px 14px">${fmtBaht(data.totalNet!=null?data.totalNet:data.totalGross)}</td><td></td></tr></tfoot></table><div class="payroll-table-empty" id="payrollTableEmpty">ไม่มีรายการในตัวกรองนี้</div>
        <div class="body toolbar" style="border-top:1px solid var(--line)">
          <button class="btn sub sm" id="exportPrev">ส่งออก Excel (CSV)</button>
          <button class="btn sub sm" id="printSum">พิมพ์สรุป (PDF)</button>
          ${readyPayrollRows.length?`<button class="btn sm" id="reviewReadyPayslips">ตรวจสลิปที่พร้อม ${fmtInt(readyPayrollRows.length)} คน</button>`:""}
          <div class="spacer"></div>
          ${payrollReady?`<span class="sub">เปิด Timesheet เพื่อแก้รายการและออกสลิปเป็นรายพนักงาน</span>`:`<button class="btn sub" disabled>แก้ Timesheet ก่อนออกสลิป</button>`}
        </div>`;
      box.querySelectorAll("[data-timesheet]").forEach(b=>b.onclick=()=>payrollTimesheetDialog(payrollRows[+b.dataset.timesheet].line, lastPreview.period));
      box.querySelectorAll("[data-payroll-filter]").forEach(button=>button.onclick=()=>{
        const filter=button.dataset.payrollFilter;
        box.querySelectorAll("[data-payroll-filter]").forEach(x=>x.classList.toggle("active",x===button));
        let shown=0;
        box.querySelectorAll("tr[data-payroll-state]").forEach(row=>{ const visible=filter==="all"||(filter==="ready"&&row.dataset.payrollState==="ready")||(filter==="action"&&row.dataset.payrollState!=="ready"); row.hidden=!visible; if(visible)shown++; });
        $("#payrollTableEmpty",box).classList.toggle("show",shown===0);
      });
      box.querySelectorAll("[data-payroll-nav]").forEach(b=>b.onclick=()=>{
        if(b.dataset.payrollNav==="owner") ownerState.filter="review";
        go(b.dataset.payrollNav);
      });
      $("#reviewReadyPayslips") && ($("#reviewReadyPayslips").onclick=()=>readyPayslipReviewDialog(readyPayrollRows,lastPreview.period));
      $("#exportPrev").onclick=()=>exportCSV(lastPreview, "preview");
      $("#printSum").onclick=()=>printMonthlySummary(data);
      box.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
    }catch(err){ toast(err.message,"bad"); $("#previewResult").innerHTML=`<div class="empty">${esc(err.message)}</div>`; if(summary) summary.innerHTML=`<div class="payroll-loading">ยังคำนวณงวดนี้ไม่ได้: ${esc(err.message)}</div>`; }
  });
}

function readyPayslipReviewDialog(rows, period){
  const body=el(`<div><div class="notice blue"><div><b>รายการที่พร้อมออกสลิป</b><br><span class="sub">แสดงเฉพาะผู้ที่มีเวลาเข้าครบ เรตค่าจ้างครบ และไม่มี OT รออนุมัติในงวดนี้ เลือกพนักงานเพื่อตรวจรายการหักและออกสลิป</span></div></div><div class="panel" style="margin:12px 0 0"><div class="body flush"><table><thead><tr><th>พนักงาน</th><th class="num">รายได้ก่อนหัก</th><th class="num">เงินได้สุทธิ</th><th data-nosort></th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td class="person">${esc(row.emp.name||empName(row.emp.id))}<span class="sub">${esc(row.emp.id)}</span></td><td class="num">${fmtBaht(row.line.grossPay)}</td><td class="num"><b>${fmtBaht(row.line.netPay!=null?row.line.netPay:row.line.grossPay)}</b></td><td class="num"><button class="btn sub sm" data-ready-slip="${index}">ตรวจและออกสลิป</button></td></tr>`).join("")}</tbody></table></div></div></div>`);
  const close=el(`<button class="btn sub">ปิด</button>`); close.onclick=closeModal;
  openModal("ตรวจสลิปที่พร้อมออก",body,[close]);
  body.querySelectorAll("[data-ready-slip]").forEach(b=>b.onclick=()=>{ const row=rows[+b.dataset.readySlip]; closeModal(); issuePayslip({startDate:period.start,endDate:period.end},row.line.employeeId); });
}

// Payroll review is deliberately a read-only, per-person timesheet.  It makes
// the evidence behind a payroll line visible before the irreversible lock;
// corrections still flow through attendance/OT rules so the preview can be
// recalculated from one source of truth.
async function payrollTimesheetDialog(line, period){
  if(!line||!period?.start||!period?.end){ toast("ไม่พบข้อมูลงวดสำหรับ Timesheet","bad"); return; }
  const body=el(`<div><div class="empty">กำลังโหลด Timesheet…</div></div>`);
  const close=el(`<button class="btn sub">ปิด</button>`); close.onclick=closeModal;
  openModal(`ตรวจ Timesheet · ${empName(line.employeeId)}`,body,[close]);
  try{
    const [attendance, holidays, policyData]=await Promise.all([
      api("admin_attendance_days",{employeeId:line.employeeId,startDate:period.start,endDate:period.end}),
      api("admin_list_holidays").catch(()=>({holidays:[]})),
      api("admin_get_ot_policy").catch(()=>({policy:{}})),
    ]);
    const holidayByDate={}; (holidays.holidays||[]).forEach(h=>holidayByDate[h.date]=h);
    const policy=policyData.policy||{}, specialByDate={};
    // Mirror the server's documented priority for display only. Payroll itself
    // remains authoritative on the Edge Function; this explains why a date has
    // a premium instead of inventing a value in the client.
    (attendance.days||[]).forEach(d=>{
      const holiday=holidayByDate[d.date], dow=new Date(d.date+"T00:00:00Z").getUTCDay();
      let multiplier=1, label="";
      if(policy.ot_auto_apply!=="false"){
        if(holiday&&Number(holiday.multiplier)>0){ multiplier=Number(holiday.multiplier); label=holiday.name||"วันพิเศษ"; }
        else if(holiday){ multiplier=Number(policy.holiday_multiplier)||2; label=holiday.name||"วันหยุด"; }
        else if(dow===0){ multiplier=Number(policy.ot_sunday_multiplier)||2; label="วันอาทิตย์"; }
        else if(dow===6&&policy.ot_saturday_enabled==="true"){ multiplier=Number(policy.ot_saturday_multiplier)||1.5; label="วันเสาร์"; }
      }
      if(multiplier>1) specialByDate[d.date]={label,multiplier};
    });
    const STD=480; // 8h standard shift for the "ไม่ครบ 8 ชม" row marker (display only)
    const rows=(attendance.days||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(d=>{
      const special=specialByDate[d.date], premium=special?`×${special.multiplier}`:"—";
      const short=d.status==="complete"&&d.workedMinutes>0&&d.workedMinutes<STD;
      const status=d.status!=="complete"?`<span class="badge amber">เวลาไม่ครบ</span>`:short?`<span class="badge amber">ไม่ครบกะ</span>`:`<span class="badge"><span class="dot"></span>ครบ</span>`;
      const worked=d.workedMinutes?(short?`<span style="color:#c9780f;font-weight:700">${fmtHours(d.workedMinutes)}</span> <small style="color:#c9780f">−${fmtHours(STD-d.workedMinutes)}</small>`:fmtHours(d.workedMinutes)):"—";
      return `<tr><td>${fmtDate(d.date)}</td><td class="num">${esc(d.checkIn||"—")}</td><td class="num">${esc(d.checkOut||"—")}</td><td class="num">${worked}</td><td>${special?`${esc(special.label)} <b>${premium}</b>`:"—"}</td><td>${status}</td></tr>`;
    }).join("");
    const calculatedBase=Number(line.baseGross||0), calculatedOt=Number(line.otGross||0), adv=Number(line.advanceDeduction||0), sso=Number(line.sso||0);
    const startBase=line.draftBaseGrossOverride!=null?Number(line.draftBaseGrossOverride):calculatedBase;
    const startOt=line.draftOtGrossOverride!=null?Number(line.draftOtGrossOverride):calculatedOt;
    const startOther=Number(line.otherDeduction||0), draftNote0=line.draftNote||"";
    body.innerHTML=`
      <div class="notice blue"><div><b>ขั้นตอน: ตรวจเวลา → ปรับและบันทึกยอด → ออกสลิป</b><br><span class="sub">ปรับได้เฉพาะงวดนี้ก่อนออกสลิป · การแก้เวลาเข้า–ออกต้องทำจากบันทึกเวลา ไม่แก้จากใบสลิป</span></div></div>
      <div class="grid2" style="margin:12px 0">
        <div class="field"><label>พนักงาน</label><b>${esc(empName(line.employeeId))}</b><span class="sub">${esc(line.employeeId)}</span></div>
        <div class="field"><label>งวด</label><b>${fmtDate(period.start)} – ${fmtDate(period.end)}</b><span class="sub">ฐาน ${fmtBaht(line.baseGross)} · OT ${fmtBaht(line.otGross)}</span></div>
      </div>
      <div style="max-height:34vh;overflow:auto;border:1px solid var(--line);border-radius:10px"><table><thead><tr><th>วันที่</th><th class="num">เข้า</th><th class="num">ออก</th><th class="num">เวลาทำงาน</th><th>อัตราพิเศษ</th><th>สถานะ</th></tr></thead><tbody>${rows||`<tr><td colspan="6" class="empty">ยังไม่มีบันทึกเวลาในงวดนี้</td></tr>`}</tbody></table></div>
      ${(line.shortDays||0)>0?`<div class="notice" style="margin-top:12px;border-color:#f0d49a;background:#fff7ea"><div><b>ทำงานไม่ครบกะ ${fmtInt(line.shortDays)} วัน</b> · ขาดรวม ${fmtHours(line.shortfallMinutes||0)}${(line.shortfallDeduction||0)>0?` · ตัดค่าแรง <b>−${fmtBaht(line.shortfallDeduction)}</b>`:""}${(line.otTrimmedMinutes||0)>0?` · หัก OT <b>−${fmtHours(line.otTrimmedMinutes)}</b>`:""}${!(line.shortfallDeduction||0)&&!(line.otTrimmedMinutes||0)?` · <span class="sub">นโยบายปัจจุบัน: ไม่ตัด</span>`:""}<br><span class="sub">ปรับนโยบายได้ที่ ตั้งค่า → ตั้งค่าการจ่ายเงินเดือน → เมื่อทำงานไม่ครบกะ</span></div></div>`:""}
      <div class="panel" style="margin:12px 0 0"><div class="head"><b>ปรับยอดก่อนออกสลิป</b><span class="sub" style="margin-left:8px">บันทึกร่างก่อน แล้วระบบคำนวณยอดจริงจาก server อีกครั้ง</span></div>
        <div class="body">
          <div class="grid2"><div class="field"><label>ค่าแรงฐาน (บาท)</label><input id="tsBase" type="number" min="0" step="0.01" value="${startBase}"><span class="hint">คำนวณเดิม ${fmtBaht(calculatedBase)}</span></div><div class="field"><label>ค่า OT (บาท)</label><input id="tsOt" type="number" min="0" step="0.01" value="${startOt}"><span class="hint">คำนวณเดิม ${fmtBaht(calculatedOt)}</span></div><div class="field"><label>หักอื่น (บาท)</label><input id="tsOther" type="number" min="0" step="0.01" value="${startOther}"></div><div class="field"><label>เหตุผลที่ปรับ</label><input id="tsNote" type="text" maxlength="500" placeholder="ต้องระบุเมื่อปรับยอด" value="${esc(draftNote0)}"></div></div>
          <div class="notice" style="margin-top:12px;align-items:center"><div><b>เงินได้สุทธิประมาณการ</b><br><span class="sub">รายได้ − เบิก − ปกส. − หักอื่น</span></div><b id="tsNet" style="font-size:22px;color:var(--blue-ink)">—</b></div>
        </div>
      </div>`;
    const baseInput=body.querySelector("#tsBase"), otInput=body.querySelector("#tsOt"), otherInput=body.querySelector("#tsOther"), noteInput=body.querySelector("#tsNote"), netEl=body.querySelector("#tsNet");
    const values=()=>({base:Math.max(0,Number(baseInput.value)||0),ot:Math.max(0,Number(otInput.value)||0),other:Math.max(0,Number(otherInput.value)||0)});
    const reNet=()=>{ const v=values(); netEl.textContent=fmtBaht(Math.max(0,v.base+v.ot-adv-sso-v.other)); };
    [baseInput,otInput,otherInput].forEach(input=>input.oninput=reNet); reNet();
    const saveDraft=async(btn)=>{ const v=values(), note=(noteInput.value||"").trim(); const adjusted=v.base!==calculatedBase||v.ot!==calculatedOt||v.other>0;
      if(adjusted&&!note){ toast("กรุณาระบุเหตุผลสำหรับรายการที่ปรับ","bad"); noteInput.focus(); return false; }
      return await withBtn(btn,async()=>{ try{ await api("admin_save_payroll_draft",{startDate:period.start,endDate:period.end,employeeId:line.employeeId,baseGrossOverride:v.base===calculatedBase?null:v.base,otGrossOverride:v.ot===calculatedOt?null:v.ot,otherDeduction:v.other,note}); Object.assign(line,{baseGross:v.base,otGross:v.ot,grossPay:v.base+v.ot,otherDeduction:v.other,netPay:Math.max(0,v.base+v.ot-adv-sso-v.other),draftBaseGrossOverride:v.base===calculatedBase?null:v.base,draftOtGrossOverride:v.ot===calculatedOt?null:v.ot,draftNote:note}); toast("บันทึกร่างรายการเงินเดือนแล้ว","good"); return true; }catch(err){ toast(err.message||"บันทึกร่างไม่สำเร็จ","bad"); return false; } }); };
    const calendar=el(`<button class="btn sub">ดูบันทึกเวลา</button>`);
    calendar.onclick=()=>openAttendanceCalendar(line.employeeId);
    const printTimesheetBtn=el(`<button class="btn sub">พิมพ์ Timesheet</button>`);
    printTimesheetBtn.onclick=()=>printTimesheet(line,period,attendance.days||[],specialByDate);
    const saveBtn=el(`<button class="btn sub">บันทึกร่าง</button>`); saveBtn.onclick=()=>saveDraft(saveBtn);
    const issue=el(`<button class="btn">บันทึกและออกสลิป</button>`);
    issue.onclick=async()=>{ if(await saveDraft(issue)) await issuePayslip({startDate:period.start,endDate:period.end},line.employeeId); };
    const modalFooter=$("#modal .m-foot"); if(modalFooter){ modalFooter.prepend(calendar,printTimesheetBtn,saveBtn,issue); }
  }catch(err){ body.innerHTML=`<div class="empty">${esc(err.message||"โหลด Timesheet ไม่สำเร็จ")}</div>`; }
}

async function printTimesheet(line,period,days,specialByDate={}){
  let invoiceSettings={}; try{ invoiceSettings=(await api("admin_get_invoice_settings")).settings||{}; }catch(_){}
  const issuer=invoiceIssuer(invoiceSettings), dateTh=(iso)=>fmtDate(iso);
  const DOW=["อา","จ","อ","พ","พฤ","ศ","ส"];
  const hm=(m)=>{ m=Number(m||0); if(!m) return "—"; return Math.floor(m/60)+":"+String(m%60).padStart(2,"0"); };
  if(!state.empById[line.employeeId]){ try{ await loadEmployees(true); }catch(_){} }
  const empRole=state.empById[line.employeeId]?.role||line.role||"";
  const list=(days||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  let sumWorked=0, present=0, absent=0, late=0, holidayWork=0;
  const rows=list.map(d=>{
    const dt=new Date(String(d.date)+"T00:00:00+07:00"), dow=isNaN(dt)?0:dt.getDay();
    const special=specialByDate[d.date], premium=special?`×${special.multiplier}`:"";
    const worked=Number(d.workedMinutes||0); sumWorked+=worked;
    const base=d.base||(d.status==="complete"?"present":d.status||"");
    let st,cls;
    if(base==="late"){ present++; late++; st="มาสาย / ไม่ครบ"; cls="st-late"; }
    else if(base==="present"||d.status==="complete"){ present++; st="มาทำงาน"; cls="st-ok"; }
    else if(base==="absent"){ absent++; st="ขาดงาน"; cls="st-absent"; }
    else if(base==="off"){ st=d.holName?esc(d.holName):"วันหยุด"; cls="st-off"; }
    else if(base==="future"){ st="—"; cls="st-off"; }
    else if(d.checkIn||d.checkOut){ late++; st="เวลาไม่ครบ"; cls="st-late"; }
    else { st="—"; cls="st-off"; }
    if(special&&worked) holidayWork++;
    const weekend=dow===0||dow===6;
    return `<tr class="${weekend?'wk':''}"><td class="c">${isNaN(dt)?esc(d.date):dt.getDate()}</td><td class="c d-${dow}">${DOW[dow]}</td><td class="c">${esc(d.checkIn||"—")}</td><td class="c">${esc(d.checkOut||"—")}</td><td class="c num">${hm(worked)}</td><td class="prem">${special?esc(special.label)+" <b>"+premium+"</b>":"—"}</td><td class="st ${cls}">${st}</td></tr>`;
  }).join("")||`<tr><td colspan="7" class="empty">ไม่มีบันทึกเวลาในงวดนี้</td></tr>`;
  const totalNormal=Number(line.regularMinutes!=null?line.regularMinutes:sumWorked), totalOt=Number(line.otMinutes||0);
  const docNo="TS-"+esc(line.employeeId)+"-"+esc(String(period?.start||"").replaceAll("-",""));
  const html=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบลงเวลาทำงาน ${esc(empName(line.employeeId))}</title><style>
    /* Compact A4: tuned so a full 31-day month fits on ONE page. */
    *{box-sizing:border-box}body{font-family:"Sarabun","TH Sarabun New","Tahoma",sans-serif;color:#152235;margin:0;padding:16px;background:#eef1f5}
    .sheet{max-width:760px;margin:0 auto;background:#fff;padding:24px 34px;box-shadow:0 3px 14px rgba(21,44,71,.12)}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:2px solid #173a63;padding-bottom:10px}
    .brand{display:flex;gap:11px;align-items:flex-start;min-width:0}.logo{width:48px;height:48px;object-fit:contain;flex:none}
    .co{font-size:15px;font-weight:700;color:#173a63;margin:0;line-height:1.2}.muted{font-size:10px;color:#42546a;line-height:1.35}
    .doc{min-width:180px;text-align:right}.doc h1{font-size:18px;margin:0;color:#14263d;font-weight:700;line-height:1.1}.doc .en{font-size:9px;letter-spacing:.8px;color:#5c7088;margin-top:2px}.doc .no{font-size:8.5px;color:#6a7c91;margin-top:4px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0 3px;padding:6px 0;border-bottom:1px solid #dbe3ec;font-size:10px;line-height:1.35}.meta .k{color:#6a7c91;display:inline-block;min-width:48px}.meta strong{color:#14263d}
    .sum{display:grid;grid-template-columns:repeat(5,1fr);gap:0;margin:7px 0 2px;border:1px solid #dbe3ec;border-radius:7px;overflow:hidden}
    .sum>div{padding:4px 10px;border-right:1px solid #e7edf3;text-align:center}.sum>div:last-child{border-right:0}.sum span{display:block;font-size:8.5px;color:#6a7c91}.sum b{display:block;font-size:13px;margin-top:1px;color:#14263d;font-variant-numeric:tabular-nums}.sum b.a{color:#b42318}.sum b.l{color:#b45309}
    table{width:100%;border-collapse:collapse;margin-top:7px;font-size:9.5px}
    thead th{background:#173a63;color:#fff;font-weight:600;padding:4px 7px;text-align:left}thead th.c{text-align:center}
    tbody tr:nth-child(even){background:#f7f9fb}tbody tr.wk{background:#f1f4f8}
    td{padding:1.8px 7px;border-bottom:1px solid #eef1f5;line-height:1.2}td.c{text-align:center}td.num{text-align:right;font-variant-numeric:tabular-nums}td.d-0{color:#a3433c}td.d-6{color:#2b5a86}
    td.prem{font-size:8.5px;color:#42546a}td.st{font-weight:600;font-size:8.5px}.st-ok{color:#14784c}.st-late{color:#b45309}.st-absent{color:#b42318}.st-off{color:#8a98a8;font-weight:500}
    td.empty{text-align:center;color:#8a98a8;padding:12px}
    tfoot td{border-top:1.5px solid #173a63;padding:4px 7px;font-weight:700;color:#173a63;font-size:9.5px}tfoot td.num{text-align:right;font-variant-numeric:tabular-nums}
    .note{margin-top:7px;padding:5px 10px;border-left:3px solid #173a63;background:#f4f7fa;font-size:8.5px;color:#51657b;line-height:1.35}
    .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:16px;font-size:9.5px;color:#42546a;text-align:center}.sign .l{margin-top:26px;border-top:1px dotted #78899b;padding-top:4px}
    .tb{max-width:760px;margin:0 auto 10px;text-align:right}.pbtn{font:inherit;font-size:13px;padding:8px 16px;border:0;border-radius:8px;background:#173a63;color:#fff;cursor:pointer}
    @page{size:A4;margin:10mm}@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:none;padding:0}.tb{display:none}}
  </style></head><body>
    <div class="tb"><button class="pbtn" onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
    <main class="sheet">
      <div class="top"><div class="brand">${printLogoMarkup(issuer,"logo")}<div><p class="co">${esc(issuer.name)}</p><div class="muted">${esc(issuer.address)}<br>เลขประจำตัวผู้เสียภาษี ${esc(issuer.taxId)}</div></div></div>
        <div class="doc"><h1>ใบลงเวลาทำงาน</h1><div class="en">TIMESHEET</div><div class="no">เลขที่ ${docNo}</div></div></div>
      <div class="meta">
        <div><div><span class="k">พนักงาน</span> <strong>${esc(empName(line.employeeId))}</strong></div><div><span class="k">รหัส</span> ${esc(line.employeeId)}${empRole?" · "+esc(empRole):""}</div></div>
        <div style="text-align:right"><div><span class="k">งวด</span> <strong>${dateTh(period.start)} – ${dateTh(period.end)}</strong></div><div><span class="k">จัดทำ</span> ${new Date().toLocaleDateString("th-TH",{dateStyle:"long"})}</div></div>
      </div>
      <div class="sum"><div><span>วันมาทำงาน</span><b>${fmtInt(present)}</b></div><div><span>มาสาย/ไม่ครบ</span><b class="l">${fmtInt(late)}</b></div><div><span>ขาดงาน</span><b class="a">${fmtInt(absent)}</b></div><div><span>ชั่วโมงปกติ</span><b>${hm(totalNormal)}</b></div><div><span>OT</span><b>${hm(totalOt)}</b></div></div>
      <table>
        <thead><tr><th class="c">วันที่</th><th class="c">วัน</th><th class="c">เข้า</th><th class="c">ออก</th><th class="c">ชม.ทำงาน</th><th>อัตราพิเศษ</th><th>สถานะ</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right">รวมชั่วโมงทำงาน</td><td class="num">${hm(sumWorked)}</td><td>OT ${hm(totalOt)}</td><td>มา ${fmtInt(present)} · ขาด ${fmtInt(absent)}</td></tr></tfoot>
      </table>
      <div class="note">เอกสารแสดงเวลาเข้า–ออกตามข้อมูลที่บันทึกในระบบ ณ วันที่จัดทำ · ตัวคูณอัตราพิเศษ (×N) อ้างอิงปฏิทินวันหยุด/นโยบายที่ตั้งไว้หลังบ้าน</div>
      <div class="sign"><div><div class="l">ผู้จัดทำ</div></div><div><div class="l">ผู้ตรวจสอบ</div></div><div><div class="l">พนักงาน</div></div></div>
    </main></body></html>`;
  const w=window.open("","_blank"); if(!w){toast("เบราว์เซอร์บล็อก popup","bad");return;} w.document.open();w.document.write(html);w.document.close();
}

async function doLock(btn){
  if(!lastPreview) return;
  if(!await confirmDialog("ล็อกงวดเงินเดือน",
    `ล็อกงวด <b>${fmtDate(lastPreview.startDate)} – ${fmtDate(lastPreview.endDate)}</b> ยอดรวม <b>${fmtBaht(lastPreview.totalGross)}</b>?<br>
     เมื่อล็อกแล้ว snapshot จะแก้ไม่ได้อีก (immutable) ตรวจตัวเลขให้ตรงกับที่คำนวณมือก่อน`,
    {danger:true, okText:"ยืนยันล็อก"})) return;
  await withBtn(btn, async ()=>{
    try{
      const data=await api("admin_lock_payroll",{startDate:lastPreview.startDate, endDate:lastPreview.endDate, lockedBy:state.reviewer||"Admin"});
      toast("ล็อกงวด "+data.payrollId+" แล้ว","good"); loadPayrollHistory();
    }catch(err){ toast(err.message,"bad"); }
  });
}

async function loadPayrollHistory(){
  const box=$("#histResult");
  try{
    const data=await api("admin_list_payrolls");
    const periods=data.periods||[];
    box.innerHTML = periods.length? `<table><thead><tr><th>งวด</th><th>ช่วง</th><th>สถานะการจ่าย</th><th>ล็อกเมื่อ</th><th>ผู้ล็อกงวด</th><th>ดำเนินการ</th></tr></thead>
      <tbody>${periods.map(p=>`<tr><td class="person">${esc(p.payrollId)}</td>
        <td>${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</td>
        <td><span class="badge good">ล็อกยอดแล้ว · พร้อมออกสลิป</span></td>
        <td>${fmtDateTime(p.lockedAt)}</td><td>${esc(p.lockedBy||"—")}</td>
        <td><div class="row-actions"><button class="btn sub sm" data-pid="${esc(p.payrollId)}">ตรวจงวด / ออกสลิป</button></div></td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">ยังไม่มีงวดที่ล็อก</div>`;
    box.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>viewSnapshot(b.dataset.pid));
  }catch(err){ box.innerHTML=`<div class="empty">${esc(err.message)}</div>`; }
}

async function viewSnapshot(payrollId){
  try{
    const data=await api("admin_get_payroll",{payrollId});
    const body=el(`<div></div>`);
    body.append(el(`<div class="notice blue">${esc(data.payrollId)} · ${fmtDate(data.startDate)} – ${fmtDate(data.endDate)} · <b>${fmtBaht(data.totalGross)}</b><br><span class="sub">ล็อกยอดแล้วจาก Timesheet · ตรวจรายการแล้วออกสลิปได้ทันที</span></div>`));
    const tbl=el(`<div style="max-height:50vh;overflow:auto;border:1px solid var(--line);border-radius:10px">
      <table><thead><tr><th>พนักงาน</th><th class="num">ปกติ</th><th class="num">OT</th><th class="num">รวม</th><th>เอกสาร</th></tr></thead>
      <tbody>${(data.lines||[]).map(l=>`<tr><td class="person">${esc(empName(l.employeeId))}<span class="sub">${esc(l.employeeId)}</span></td>
        <td class="num">${fmtHours(l.regularMinutes)}</td><td class="num">${fmtHours(l.otMinutes)}</td>
        <td class="num"><b>${fmtBaht(l.grossPay)}</b></td><td><button class="btn sub sm" data-payslip="${esc(l.employeeId)}">ออกสลิปเงินเดือน</button></td></tr>`).join("")}</tbody></table></div>`);
    body.append(tbl);
    const exp=el(`<button class="btn sub">ส่งออก CSV</button>`); exp.onclick=()=>exportCSV(data,"locked");
    const close=el(`<button class="btn">ปิด</button>`); close.onclick=closeModal;
    tbl.querySelectorAll("[data-payslip]").forEach(b=>b.onclick=()=>issuePayslip(data,b.dataset.payslip));
    openModal("ตรวจงวดและออกสลิป "+payrollId, body, [exp, close]);
  }catch(err){ toast(err.message,"bad"); }
}

async function issuePayslip(source, employeeId){
  if(!source||!employeeId)return;
  try{
    const result=await api("admin_issue_payslip",{payrollId:source.payrollId||"",startDate:source.startDate||"",endDate:source.endDate||"",employeeId});
    await printPayslip(result.line,{start:result.startDate,end:result.endDate,lockedAt:result.lockedAt,paidAt:result.paidAt,paymentReference:result.paymentReference},false,result.issuerSettings||{});
    toast("ออกสลิปเงินเดือนแล้ว","good");
  }catch(err){ toast(err.message||"ออกสลิปไม่สำเร็จ","bad"); }
}

// Generic CSV download used by every export (payroll, employees, attendance, backup).
// Writes a UTF-8 BOM so Thai text opens correctly in Excel.
function downloadCSV(filename, rows, msg){
  const csv="﻿"+rows.map(r=>r.map(c=>`"${String(c==null?"":c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url); toast(msg||"ส่งออก CSV แล้ว","good");
}
function exportCSV(data, kind){
  const rows=[["payroll_id","employee_id","employee_name","regular_minutes","ot_minutes","base_gross","ot_gross","gross_pay","advance_deduction","sso","other_deduction","net_pay"]];
  (data.lines||[]).forEach(l=>rows.push([
    data.payrollId||("PREVIEW "+data.startDate+".."+data.endDate), l.employeeId, empName(l.employeeId),
    l.regularMinutes||0, l.otMinutes||0, l.baseGross||0, l.otGross||0, l.grossPay||0,
    l.advanceDeduction||0, l.sso||0, l.otherDeduction||0, (l.netPay!=null?l.netPay:l.grossPay)||0]));
  downloadCSV((data.payrollId||("payroll_"+kind+"_"+(data.startDate||todayISO())))+".csv", rows);
}
// Export the full employee directory (no password values — hashes stay server-only).
function exportEmployeesCSV(){
  const list=(state.employees||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(!list.length){ toast("ยังไม่มีพนักงานให้ส่งออก","bad"); return; }
  const rows=[["employee_id","name","role","department","location_required","status"]];
  list.forEach(e=>rows.push([e.id, e.name, e.role||"", e.department||"", e.locationRequired?"yes":"no", e.status||""]));
  downloadCSV("employees_"+todayISO()+".csv", rows, "ส่งออกรายชื่อพนักงานแล้ว");
}
// Export attendance days for a date range (uses the same admin_attendance_days
// feed as the calendar, so the export always matches what the console shows).
async function exportAttendanceCSV(startDate, endDate){
  const data=await api("admin_attendance_days",{startDate,endDate});
  const list=(data&&data.days)||[];
  if(!list.length){ toast("ไม่มีข้อมูลเวลาในช่วงที่เลือก","bad"); return; }
  const rows=[["date","employee_id","employee_name","check_in","check_out","worked_minutes","status"]];
  list.forEach(r=>rows.push([
    r.date||"", r.employeeId||"", r.name||empName(r.employeeId)||"",
    r.checkIn||"", r.checkOut||"", r.workedMinutes||0, r.status||""]));
  downloadCSV("attendance_"+startDate+"_"+endDate+".csv", rows, "ส่งออกเวลาเข้าออกแล้ว");
}
// Date-range picker for the attendance export; defaults to the current month.
function attendanceExportDialog(defaultStart=null,defaultEnd=null){
  const range=payrollRange("current");
  const first=defaultStart||range.start;
  const today=defaultEnd||range.end;
  const body=el(`<div>
    <p class="sub" style="margin:0 0 12px">เลือกช่วงวันที่เพื่อส่งออกเวลาเข้า-ออกเป็นไฟล์ CSV (เปิดใน Excel ได้)</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>ตั้งแต่วันที่</label><input id="attExpStart" type="date" value="${first}"></div>
      <div class="field"><label>ถึงวันที่</label><input id="attExpEnd" type="date" value="${today}"></div>
    </div></div>`);
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const run=el(`<button class="btn">ส่งออก CSV</button>`);
  run.onclick=()=>withBtn(run, async()=>{
    const s=body.querySelector("#attExpStart").value, e=body.querySelector("#attExpEnd").value;
    if(!s||!e){ toast("กรุณาเลือกช่วงวันที่","bad"); return; }
    if(s>e){ toast("วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด","bad"); return; }
    await exportAttendanceCSV(s,e); closeModal();
  });
  openModal("ส่งออกเวลาเข้า-ออก", body, [cancel, run]);
}
// Full backup: settings + directory + pay rules + sites + holidays + payroll index
// as one JSON file, so the owner always holds a portable copy of their data.
async function exportFullBackup(){
  const sections={
    settings:"admin_get_settings", employees:"admin_list_employees", payRules:"admin_list_pay_rules",
    sites:"admin_list_sites", holidays:"admin_list_holidays", payrolls:"admin_list_payrolls",
  };
  const bundle={ exportedAt:new Date().toISOString(), app:"BVN Package", kind:"admin_backup" };
  const errors=[];
  for(const [key,action] of Object.entries(sections)){
    try{ bundle[key]=await api(action); }
    catch(err){ bundle[key]=null; errors.push(key); }
  }
  const json=JSON.stringify(bundle,null,2);
  const url=URL.createObjectURL(new Blob([json],{type:"application/json;charset=utf-8"}));
  const a=document.createElement("a"); a.href=url; a.download="bvn_backup_"+todayISO()+".json"; a.click();
  URL.revokeObjectURL(url);
  toast(errors.length?("สำรองข้อมูลแล้ว (บางส่วนไม่สำเร็จ: "+errors.join(", ")+")"):"ดาวน์โหลดไฟล์สำรองแล้ว", errors.length?"bad":"good");
}

/* =================================================================
   PAY RULES
   ================================================================= */
let payRulesCache=[];
async function renderPayrules(){
  const node=$("#page-payrules");
  setRouteShell(node,"payrules");
  skeleton(node);
  try{
    const data=await api("admin_list_pay_rules");
    payRulesCache=data.rules||[];
    const withRule=payRulesCache.filter(r=>r.hasRule).length;
    const missing=payRulesCache.filter(r=>r.status==="active"&&!r.hasRule).length;
    node.innerHTML=`
      ${groupTabsHtml("payrules")}
      <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">นโยบายค่าจ้าง</div><h2>อัตราค่าจ้างและสิทธิ์ OT</h2><p>กำหนดอัตรารายบุคคลก่อน แล้วจึงใช้กติกาส่วนกลางสำหรับ OT ที่อนุมัติแล้ว</p></div><div class="directory-count"><b>${fmtInt(missing)}</b> คนยังไม่ตั้งเรต</div></div>
      <div class="notice blue"><b>ส่วนที่ 1 · อัตราค่าจ้างรายบุคคล</b> — กำหนด 1 เรต/คน เพื่อใช้คำนวณค่าแรงฐานและสิทธิ์ OT · ตั้งแล้ว <b>${fmtInt(withRule)}</b> คน${missing?` · <span style="color:#b45309">ยังไม่ตั้ง ${fmtInt(missing)} คน</span>`:""}</div>
      <div class="panel"><div class="head"><h2>อัตราค่าจ้างพนักงาน</h2><span class="sub" style="margin-left:8px">เลือกพนักงาน แล้วตั้งเรตหรือแก้ไขในหน้าต่างเดียว</span></div>
        <div class="body flush"><table id="ruleTable">
          <thead><tr><th>พนักงาน</th><th>รูปแบบ</th><th class="num">อัตราฐาน</th><th class="num">ชม./วัน</th><th>OT</th><th>วันพิเศษ</th><th>สถานะ</th><th data-nosort></th></tr></thead>
          <tbody id="ruleRows"></tbody>
        </table></div>
      </div>
      <div class="notice blue" style="margin-top:18px"><b>ส่วนที่ 2 · กติกาค่าจ้างของบริษัท</b> — ใช้ร่วมกันทุกคน และมีผลเฉพาะ OT ที่ผู้ดูแลอนุมัติแล้ว</div>
      <div class="panel" id="otRulesPanel"><div class="head"><h2>ตัวคูณ OT และวันพิเศษ</h2><span class="sub" style="margin-left:8px">เมื่ออนุมัติ OT ระบบจะเลือกตัวคูณตามกติกานี้</span></div>
        <div class="body"><div id="otRulesBody"><div class="empty">กำลังโหลด…</div></div></div>
      </div>
      <div class="panel" id="otCalPanel"><div class="head"><h2>ปฏิทินตัวคูณ OT</h2><span class="sub" style="margin-left:8px">คลิกวัน = ตั้งตัวคูณ · คลิกขวา = เมนูด่วน</span>
        <div class="spacer"></div><button class="btn sub sm" id="otBotImport">ดึงวันหยุดแบงก์ชาติ</button><button class="btn sub sm" id="otCalPrev" aria-label="เดือนก่อน" style="margin-left:8px">‹</button><b id="otCalLabel" style="min-width:120px;text-align:center">—</b><button class="btn sub sm" id="otCalNext" aria-label="เดือนถัดไป">›</button></div>
        <div class="body">
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:12px;color:var(--muted)">
            <span><span class="lgd" style="background:#eef0f3;border:.5px solid var(--line)"></span> ปกติ ×1</span>
            <span><span class="lgd" style="background:#C0DD97"></span> ×1.5</span>
            <span><span class="lgd" style="background:#FAC775"></span> ×2</span>
            <span><span class="lgd" style="background:#F09595"></span> ×3 / วันหยุด</span>
          </div>
          <div class="otcal-dow" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;font-size:11px;color:var(--muted);margin-bottom:5px">
            <div>อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div>ส</div></div>
          <div id="otCalGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px"></div>
        </div>
      </div>`;
    const tb=$("#ruleRows");
    const basisLabel=b=>b==="monthly"?"เงินเดือน":b==="daily"?"รายวัน":b==="hourly"?"รายชั่วโมง":"—";
    tb.innerHTML=payRulesCache.map(r=>`<tr data-id="${esc(r.employeeId)}">
        <td class="person">${esc(r.name)}<span class="sub">${esc(r.employeeId)}${r.role?" · "+esc(r.role):""}</span></td>
        <td>${r.hasRule?basisLabel(r.payBasis):'<span class="sub">ยังไม่ตั้ง</span>'}</td>
        <td class="num">${r.hasRule?fmtBaht(r.baseRate):"—"}</td>
        <td class="num">${r.hasRule?r.standardHours:"—"}</td>
        <td>${r.hasRule?(r.otEnabled?`<span class="badge">×${r.otMultiplier}</span>`:'<span class="badge grey">ปิด</span>'):"—"}</td>
        <td>${r.hasRule&&r.premiumDate?`${esc(r.premiumDate)} <span class="sub">×${r.premiumMultiplier}</span>`:"—"}</td>
        <td>${r.status==="active"?'<span class="badge"><span class="dot"></span>ใช้งาน</span>':'<span class="badge grey">ปิดใช้งาน</span>'}</td>
        <td><div class="row-actions"><button class="btn sub sm" data-rule="${esc(r.employeeId)}">${r.hasRule?"แก้ไข":"ตั้งเรต"}</button></div></td>
      </tr>`).join("");
    tb.querySelectorAll("[data-rule]").forEach(b=>b.onclick=()=>payRuleDialog(payRulesCache.find(x=>x.employeeId===b.dataset.rule)));
    tb.querySelectorAll("tr[data-id]").forEach(tr=>{ const r=payRulesCache.find(x=>x.employeeId===tr.dataset.id);
      attachRowMenu(tr, [{label:(r.hasRule?"แก้ไขเรต":"ตั้งเรต"), fn:()=>payRuleDialog(r)}]); });
    attachSort($("#ruleTable"));
    renderOtRules();
    _otCalMonth=new Date(); _otCalMonth.setDate(1);
    $("#otCalPrev").onclick=()=>{ _otCalMonth.setMonth(_otCalMonth.getMonth()-1); otCalLoad(); };
    $("#otCalNext").onclick=()=>{ _otCalMonth.setMonth(_otCalMonth.getMonth()+1); otCalLoad(); };
    $("#otBotImport").onclick=(e)=>otImportBotHolidays(e.target);
    otCalLoad();
  }catch(err){ errorBox(node, err, renderPayrules); }
}

/* ===== OT rules (configurable multipliers) ===== */
async function renderOtRules(){
  const box=$("#otRulesBody"); if(!box) return;
  let s={};
  try{ const d=await api("admin_get_settings"); s=d.settings||{}; }
  catch(err){ box.innerHTML=`<div class="empty">โหลดกติกาไม่สำเร็จ: ${esc(err.message)}</div>`; return; }
  const v=(k,def)=>s[k]!=null&&s[k]!==""?s[k]:def;
  const autoOn=v("ot_auto_apply","true")!=="false", satOn=v("ot_saturday_enabled","false")==="true";
  box.innerHTML=`
    <label class="check" style="display:flex;gap:10px;align-items:center;padding:10px 12px;background:var(--blue-soft);border-radius:8px;margin-bottom:14px">
      <input type="checkbox" id="otAuto" ${autoOn?"checked":""}> คิดค่าแรงให้อัตโนมัติเมื่ออนุมัติ (ปิด = ใช้ตัวคูณ OT รายคนแบบเดิม)</label>
    <div style="display:grid;grid-template-columns:1fr auto;gap:10px 14px;align-items:center;max-width:460px">
      <div><span class="lgd" style="background:#C0DD97"></span> OT วันทำงานปกติ</div>
      <div>× <input id="otMul" type="number" min="1" step="0.1" value="${esc(v("ot_multiplier","1.5"))}" style="width:80px"></div>
      <div><span class="lgd" style="background:#FAC775"></span> วันอาทิตย์</div>
      <div>× <input id="otSun" type="number" min="1" step="0.1" value="${esc(v("ot_sunday_multiplier","2"))}" style="width:80px"></div>
      <div><label class="check" style="gap:6px"><input type="checkbox" id="otSatOn" ${satOn?"checked":""}> วันเสาร์</label></div>
      <div>× <input id="otSat" type="number" min="1" step="0.1" value="${esc(v("ot_saturday_multiplier","1.5"))}" style="width:80px"></div>
      <div><span class="lgd" style="background:#F09595"></span> วันหยุดนักขัตฤกษ์</div>
      <div>× <input id="otHol" type="number" min="1" step="0.1" value="${esc(v("holiday_multiplier","2"))}" style="width:80px"></div>
    </div>
    <div class="notice blue" style="margin-top:14px">ลำดับ: ตัวคูณในปฏิทิน (รายวัน) → วันหยุดนักขัตฤกษ์ → เสาร์/อาทิตย์ → OT ปกติ</div>
    <div class="toolbar" style="margin-top:12px"><button class="btn" id="otSave">บันทึกกติกา</button></div>`;
  $("#otSave").onclick=(e)=>withBtn(e.target, async()=>{
    try{
      await api("admin_save_settings",{settings:{
        ot_auto_apply:$("#otAuto").checked?"true":"false",
        ot_multiplier:$("#otMul").value||"1.5", ot_sunday_multiplier:$("#otSun").value||"2",
        ot_saturday_enabled:$("#otSatOn").checked?"true":"false", ot_saturday_multiplier:$("#otSat").value||"1.5",
        holiday_multiplier:$("#otHol").value||"2"}});
      clearApiReadCache(); toast("บันทึกกติกา OT แล้ว","good");
    }catch(err){ toast(err.message,"bad"); }
  });
}

/* ===== OT multiplier calendar ===== */
let _otCalMonth=null, _otHolidays=[];
const OTCAL_TH_MON=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const OT_COLORS={1.5:["#C0DD97","#27500A"],2:["#FAC775","#633806"],3:["#F09595","#791F1F"]};
function otMulColor(m){ if(!m||m<=1) return null; if(m>=3) return OT_COLORS[3]; if(m>=2) return OT_COLORS[2]; return OT_COLORS[1.5]; }
let _otRules={};
async function otCalLoad(){
  try{ const d=await api("admin_list_holidays"); _otHolidays=d.holidays||[]; }
  catch(_){ _otHolidays=[]; }
  try{ _otRules=(await api("admin_get_settings")).settings||{}; }catch(_){ _otRules={}; }
  otCalRender();
}
// Effective OT multiplier shown on the calendar for a given date, applying the
// same priority as payroll: calendar override → holiday → Sunday/Saturday → normal.
// Returns {mult, derived, isHoliday} — derived=true means it comes from a rule
// (weekend/holiday default), not an explicit per-day value.
function otEffectiveMult(iso, h){
  const s=_otRules||{}, auto=s.ot_auto_apply!=="false";
  let m=h?Number(h.multiplier||0):0;
  if(m>0) return {mult:m, derived:false, isHoliday:!!h};
  if(!auto) return {mult:0, derived:false, isHoliday:!!h};
  const dow=new Date(iso+"T00:00:00Z").getUTCDay();
  if(h) return {mult:Number(s.holiday_multiplier)||2, derived:true, isHoliday:true};
  if(dow===0) return {mult:Number(s.ot_sunday_multiplier)||2, derived:true, isHoliday:false};
  if(dow===6 && s.ot_saturday_enabled==="true") return {mult:Number(s.ot_saturday_multiplier)||1.5, derived:true, isHoliday:false};
  return {mult:0, derived:false, isHoliday:false, weekend:(dow===0||dow===6)};
}
// Import the official Thai (Bank-of-Thailand) public holidays for the shown
// year and open OT on them at the configured holiday multiplier.
async function otImportBotHolidays(btn){
  const year=(_otCalMonth||new Date()).getFullYear();
  let mult=2;
  try{ const s=(await api("admin_get_settings")).settings||{}; mult=Number(s.holiday_multiplier)||2; }catch(_){}
  const yrTH=year+543;
  const ok=await confirmDialog("ดึงวันหยุดแบงก์ชาติ",
    `เติมวันหยุดทำการสถาบันการเงิน (ธปท.) ของปี <b>${yrTH}</b> ลงปฏิทิน และตั้งให้เปิด OT ที่ <b>×${mult}</b>?<br><span class="sub">วันที่ตั้งตัวคูณเองไว้แล้วจะถูกทับด้วย ×${mult}</span>`,
    {okText:"เติมเลย"});
  if(!ok) return;
  await withBtn(btn, async()=>{
    try{
      const r=await api("admin_import_holidays",{year, defaultMultiplier:mult});
      clearApiReadCache(); await otCalLoad();
      toast(r.message||`เติมวันหยุดปี ${yrTH} แล้ว`,"good");
    }catch(err){ toast(err.message,"bad"); }
  });
}
function otCalRender(){
  const grid=$("#otCalGrid"); if(!grid||!_otCalMonth) return;
  const y=_otCalMonth.getFullYear(), mo=_otCalMonth.getMonth();
  $("#otCalLabel").textContent=OTCAL_TH_MON[mo]+" "+(y+543);
  const first=new Date(y,mo,1).getDay(), days=new Date(y,mo+1,0).getDate();
  const byDate={}; _otHolidays.forEach(h=>byDate[h.date]=h);
  let html="";
  for(let i=0;i<first;i++) html+="<div></div>";
  for(let d=1;d<=days;d++){
    const iso=`${y}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow=(first+d-1)%7;
    const h=byDate[iso], eff=otEffectiveMult(iso,h), m=eff.mult, col=otMulColor(m);
    // weekends with no premium still read as a soft "day off" tint.
    const weekendTint=(!col && (dow===0||dow===6));
    const bg=col?col[0]:(weekendTint?"var(--line-soft)":"var(--card)");
    const fg=col?col[1]:"var(--muted)";
    const dayLabel=(h&&h.name)?h.name:(eff.derived?(eff.isHoliday?"วันหยุด":dow===0?"อาทิตย์":"เสาร์"):"");
    html+=`<div class="otcal-day" data-date="${iso}" tabindex="0" role="button"
      style="position:relative;min-height:46px;border-radius:8px;padding:5px 6px;cursor:pointer;background:${bg};border:.5px solid ${col?"transparent":"var(--line)"}">
      <div style="font-size:12px;color:${col?fg:(dow===0?"#c0392b":dow===6?"#2f6be0":"var(--ink)")}">${d}</div>
      ${m>1?`<div style="position:absolute;right:5px;bottom:4px;font-size:13px;font-weight:600;color:${fg};opacity:${eff.derived?.72:1}">×${m}</div>`:""}
      ${dayLabel?`<div style="font-size:9px;line-height:1.1;margin-top:1px;color:${col?fg:"var(--muted)"};overflow:hidden;max-height:20px">${esc(dayLabel)}</div>`:""}
    </div>`;
  }
  grid.innerHTML=html;
  grid.querySelectorAll(".otcal-day").forEach(c=>{
    const iso=c.dataset.date;
    c.onclick=()=>otDayDialog(iso, byDate[iso]);
    c.oncontextmenu=(e)=>{ e.preventDefault(); otDayQuickMenu(e, iso, byDate[iso]); };
    c.onkeydown=(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); otDayDialog(iso, byDate[iso]); } };
  });
}
async function otSetDay(iso, mult, name){
  try{
    if(mult<=0){
      // Normal day: remove the special-day row entirely (weekend rules may still apply).
      await api("admin_delete_holiday",{date:iso});
    }else{
      await api("admin_save_holiday",{date:iso, name:name||"วันพิเศษ", multiplier:mult});
    }
    clearApiReadCache();
    if(document.getElementById("otCalGrid")) await otCalLoad();
    if(state.page==="approvals") renderApprovals();
    toast(mult>0?`ตั้ง ${iso} เป็น ×${mult} แล้ว`:`ล้าง ${iso} เป็นวันปกติแล้ว`,"good");
  }catch(err){ toast(err.message,"bad"); }
}
function otDayQuickMenu(e, iso, h){
  closeOtMenu();
  const menu=el(`<div class="otcal-menu" style="position:fixed;z-index:9999;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden;font-size:13px;min-width:180px">
    <div style="padding:7px 12px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--line)">${esc(iso)}${h&&h.name?" · "+esc(h.name):""}</div>
    <button class="otm" data-m="0" style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:none;cursor:pointer;color:var(--ink)">ปกติ ×1 (ล้าง)</button>
    <button class="otm" data-m="1.5" style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:var(--blue-soft);cursor:pointer;color:var(--ink)">OT ×1.5</button>
    <button class="otm" data-m="2" style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:none;cursor:pointer;color:var(--ink)">OT ×2</button>
    <button class="otm" data-m="3" style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:none;cursor:pointer;color:var(--ink)">วันหยุด ×3</button>
    <button class="otm" data-dlg="1" style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;border-top:1px solid var(--line);background:none;cursor:pointer;color:var(--ink)">ตั้งค่าเอง + ตั้งชื่อ…</button>
  </div>`);
  document.body.appendChild(menu);
  const vw=innerWidth, vh=innerHeight, r=menu.getBoundingClientRect();
  menu.style.left=Math.min(e.clientX,vw-r.width-8)+"px";
  menu.style.top=Math.min(e.clientY,vh-r.height-8)+"px";
  menu.querySelectorAll(".otm").forEach(b=>b.onclick=()=>{
    closeOtMenu();
    if(b.dataset.dlg) return otDayDialog(iso, h);
    otSetDay(iso, Number(b.dataset.m), h&&h.name);
  });
  setTimeout(()=>document.addEventListener("click", closeOtMenu, {once:true}),0);
}
function closeOtMenu(){ document.querySelectorAll(".otcal-menu").forEach(m=>m.remove()); }
function otDayDialog(iso, h){
  const cur=h?Number(h.multiplier||0):0;
  const body=el(`<div>
    <p class="sub" style="margin:0 0 12px">วันที่ <b>${esc(iso)}</b> — ตั้งตัวคูณค่าแรง OT สำหรับวันนี้</p>
    <div class="field"><label>ชื่อวัน (ไม่บังคับ)</label><input id="otdName" type="text" value="${esc(h&&h.name?h.name:"")}" placeholder="เช่น วันสงกรานต์"></div>
    <div class="field"><label>ตัวคูณ</label>
      <div class="toolbar" style="gap:6px;flex-wrap:wrap" id="otdPresets">
        ${[["0","ปกติ ×1"],["1.5","×1.5"],["2","×2"],["3","×3"]].map(([m,l])=>`<button type="button" class="btn sub sm otd-p" data-m="${m}" ${String(cur)===m?'style="border-color:#10b981;color:#10b981"':""}>${l}</button>`).join("")}
      </div>
      <input id="otdMul" type="number" min="0" step="0.1" value="${cur}" style="margin-top:8px;width:120px">
    </div></div>`);
  body.querySelectorAll(".otd-p").forEach(b=>b.onclick=()=>{ body.querySelector("#otdMul").value=b.dataset.m; });
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">บันทึก</button>`);
  save.onclick=()=>withBtn(save, async()=>{
    const m=Number(body.querySelector("#otdMul").value||0), nm=body.querySelector("#otdName").value.trim();
    await otSetDay(iso, m, nm); closeModal();
  });
  openModal("ตั้งตัวคูณ OT · "+iso, body, [cancel, save]);
}

function payRuleDialog(r){
  if(!r){ toast("ไม่พบพนักงาน","bad"); return; }
  const body=el(`<div></div>`);
  body.append(el(`<div class="notice blue">เรตค่าจ้างของ <b>${esc(r.name)}</b> <span class="sub">(${esc(r.employeeId)})</span></div>`));
  body.append(field("รูปแบบค่าจ้าง",`<select id="rBasis"><option value="monthly">เงินเดือน (รายเดือน)</option><option value="daily">รายวัน</option><option value="hourly">รายชั่วโมง</option></select>`));
  const g=el(`<div class="grid2"></div>`);
  g.append(
    field("อัตราฐาน (บาท)",`<input id="rRate" type="number" min="0" step="0.01" placeholder="เช่น 15000">`),
    field("ชม.มาตรฐาน/วัน",`<input id="rHours" type="number" min="1" step="0.5" value="8">`),
    field("วันทำงาน/เดือน (ฐาน OT)",`<input id="rDays" type="number" min="1" max="31" step="1" value="30">`),
    field("ตัวคูณ OT",`<input id="rOtMul" type="number" min="1" step="0.1" value="1.5">`),
    field("วันพิเศษ (ทางเลือก)",`<input id="rPremDate" type="date">`),
    field("ตัวคูณวันพิเศษ",`<input id="rPremMul" type="number" min="1" step="0.1" value="1">`),
    field("หักอื่นๆ ต่องวด (บาท)",`<input id="rOther" type="number" min="0" step="1" value="0">`),
  );
  body.append(g);
  body.append(el(`<label class="check" style="margin-top:6px"><input type="checkbox" id="rOt" checked> เปิดใช้ OT</label>`));
  const otBox=el(`<div class="notice blue" id="rOtBox" style="margin-top:8px"></div>`); body.append(otBox);
  const ok=el(`<button class="btn ok">บันทึกเรต</button>`);
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const rateLabelEl=()=>body.querySelector("#rRate").closest(".field").querySelector("label");
  const updOt=()=>{
    const basis=body.querySelector("#rBasis").value, rate=parseFloat(body.querySelector("#rRate").value)||0,
      hours=parseFloat(body.querySelector("#rHours").value)||8, days=parseFloat(body.querySelector("#rDays").value)||30,
      mul=parseFloat(body.querySelector("#rOtMul").value)||1.5;
    if(rateLabelEl()) rateLabelEl().textContent = basis==="monthly"?"เงินเดือน (บาท/เดือน)":basis==="daily"?"ค่าแรง (บาท/วัน)":"ค่าแรง (บาท/ชม.)";
    body.querySelector("#rDays").closest(".field").style.display = basis==="monthly"?"":"none";
    const baseHr = basis==="monthly"? rate/days/hours : basis==="daily"? rate/hours : rate;
    otBox.innerHTML = `ค่าแรง/ชม. (ฐาน) ≈ <b>${fmtBaht(baseHr)}</b> · อัตรา OT/ชม. ≈ <b>${fmtBaht(baseHr*mul)}</b>${basis==="monthly"?` <span class="sub">(${rate} ÷ ${days} ÷ ${hours})</span>`:""}`;
  };
  ["#rBasis","#rRate","#rHours","#rDays","#rOtMul"].forEach(s=>body.querySelector(s).oninput=updOt);
  body.querySelector("#rBasis").onchange=updOt;
  body.querySelector("#rBasis").value = r.hasRule?r.payBasis:"monthly";
  if(r.hasRule){
    body.querySelector("#rRate").value=r.baseRate;
    body.querySelector("#rHours").value=r.standardHours;
    body.querySelector("#rDays").value=r.daysPerMonth||30;
    body.querySelector("#rOtMul").value=r.otMultiplier;
    body.querySelector("#rPremDate").value=r.premiumDate||"";
    body.querySelector("#rPremMul").value=r.premiumMultiplier;
    body.querySelector("#rOther").value=r.otherDeduction||0;
    body.querySelector("#rOt").checked=r.otEnabled;
  }
  updOt();
  ok.onclick=()=>withBtn(ok, async ()=>{
    const baseRate=parseFloat(body.querySelector("#rRate").value);
    if(!(baseRate>=0)){ toast("กรอกอัตราฐานให้ถูกต้อง","bad"); return; }
    try{
      await api("admin_upsert_pay_rule",{
        employeeId:r.employeeId, payBasis:body.querySelector("#rBasis").value, baseRate,
        standardHours:parseFloat(body.querySelector("#rHours").value)||8,
        otEnabled:body.querySelector("#rOt").checked, otMultiplier:parseFloat(body.querySelector("#rOtMul").value)||1.5,
        premiumDate:body.querySelector("#rPremDate").value||"", premiumMultiplier:parseFloat(body.querySelector("#rPremMul").value)||1,
        otherDeduction:parseFloat(body.querySelector("#rOther").value)||0,
        daysPerMonth:parseFloat(body.querySelector("#rDays").value)||30,
        updatedBy:state.reviewer||"Admin",
      });
      closeModal(); toast("บันทึกเรตค่าจ้างแล้ว","good"); renderPayrules();
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal("ตั้ง / แก้ไขเรตค่าจ้าง", body, [cancel, ok]);
}

/* =================================================================
   INVOICES
   ================================================================= */
/* ======================= หน้าเจ้าของธุรกิจ (owner) ======================= */
const ownerState={emp:"",filter:"",attRange:"current",attStart:"",attEnd:"",pmMonth:null,pmSel:null,pmLoaded:false};
const FREQ_LABEL={monthly:"รายเดือน",semimonthly:"เดือนละ 2 ครั้ง",weekly:"รายสัปดาห์"};
const DOW_SHORT=["อา","จ","อ","พ","พฤ","ศ","ส"];
const payDayLabel=(v)=>String(v)==="end"?"สิ้นเดือน":("วันที่ "+v);
// Compute the next payday Date from pay settings (monthly / เดือนละ 2 ครั้ง /
// รายสัปดาห์). Used by the dashboard payday reminder. Pure date math, no I/O.
function nextPaydayInfo(s){
  const freq=(s&&s.pay_frequency)||"monthly";
  const today=new Date(); today.setHours(0,0,0,0);
  const isoOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const dayFor=(v,yy,mm)=>{ const last=new Date(yy,mm+1,0).getDate(); return String(v)==="end"?last:Math.min(Math.max(1,parseInt(v,10)||last),last); };
  let cands=[];
  if(freq==="weekly"){
    const d=new Date(today); const add=(5-d.getDay()+7)%7; d.setDate(d.getDate()+add); cands=[d];
    const prev=new Date(d); prev.setDate(prev.getDate()-7); cands.push(prev);
  } else {
    const vals=freq==="semimonthly"?[s.pay_day_1||"end",s.pay_day_2||"15"]:[s.pay_day_1||"end"];
    const y=today.getFullYear(), m=today.getMonth();
    [-1,0,1].forEach(off=>vals.forEach(v=>{ const dt=new Date(y,m+off,dayFor(v,y,m+off)); dt.setHours(0,0,0,0); cands.push(dt); }));
  }
  cands=cands.filter(Boolean).sort((a,b)=>a-b);
  const next=cands.find(d=>d>=today)||cands[cands.length-1]||today;
  const prevDue=[...cands].reverse().find(d=>d<=today)||null;
  return { next, nextISO:isoOf(next), diffDays:Math.round((next-today)/86400000), prevISO:prevDue?isoOf(prevDue):"" };
}

async function renderOwner(){
  const node=$("#page-owner"); skeleton(node);
  setRouteShell(node,"owner");
  try{
    // Attendance must remain usable even while a payroll calculation is slow.
    // Do not make this operational page wait for admin_owner_overview.
    const settingsResponse=await api("admin_get_settings");
    const data={settings:settingsResponse.settings||{},period:{},lines:[],incompleteDays:[],totalNet:0,totalGross:0,totalAdvance:0,totalSso:0,totalOther:0,paidCount:0,activeEmployees:0,nextPayday:"",advancesPending:{},advancesApprovedUnpaid:{},advancesPaidUnsettled:{}};
    const s=data.settings, p=data.period;
    const freqLabel=FREQ_LABEL[s.pay_frequency]||s.pay_frequency;
    const wdLabel=(s.workdays||"").split(",").filter(x=>x!=="").map(d=>DOW_SHORT[+d]).join(" ")||"—";
    const paydayText=s.pay_frequency==="semimonthly"?(payDayLabel(s.pay_day_2)+" และ "+payDayLabel(s.pay_day_1)):(s.pay_frequency==="weekly"?"ทุกวันศุกร์":payDayLabel(s.pay_day_1));
    node.innerHTML=`
      <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">ทะเบียนเวลาทำงาน</div><h2>Timesheet</h2><p>ดูเวลาทั้งเดือนของทุกคนในตารางเดียว · สลับไปหน้ารายวันเพื่อลงเวลาหรือแก้ไข</p></div>
        <div class="time-month-nav" id="pmNav"><button class="btn sub sm" id="pmPrev" aria-label="เดือนก่อน">‹</button><b id="pmLabel" style="min-width:120px;text-align:center">—</b><button class="btn sub sm" id="pmNext" aria-label="เดือนถัดไป">›</button></div>
      </div>
      <div class="ts-viewtabs" role="group" aria-label="มุมมอง Timesheet"><button class="active" data-tsview="month">ทั้งเดือน (ตาราง)</button><button data-tsview="day">รายวัน (ลงเวลา/แก้ไข)</button></div>

      <div class="ts-view" data-tsview="month">
        <div class="time-key"><span><i class="k-present"></i>มาทำงาน</span><span><i class="k-late"></i>สายหรือเวลาไม่ครบ</span><span><i class="k-absent"></i>ขาดงาน</span><span><i class="k-off"></i>วันหยุด/ยังไม่ถึงวันทำงาน</span><span><i class="k-ot"></i>ทำเกินเวลา</span></div>
        <div id="pmShiftNote" class="sub" style="margin:0 2px 8px"></div>
        <div class="panel pm-matrix-panel" style="margin:0"><div class="body flush"><div id="pmMatrix" class="pm-matrix-host"><div class="empty">กำลังโหลด…</div></div></div></div>
        <div id="pmDetail"></div>
      </div>

      <div class="ts-view owner-time-workspace" data-tsview="day" style="display:none">
        <section class="time-ledger-head"><div><div class="route-eyebrow">ทะเบียนเวลาเข้า–ออก</div><h2>ลงเวลา / แก้ไขรายวัน</h2><p>เลือกช่วงวันที่ · ลงเวลาเข้า–ออกแทน หรือยกเลิกรายการที่ผิด</p></div>
          <div class="time-ledger-actions"><select id="ownEmp" aria-label="กรองพนักงาน"></select><button class="btn ok sm" id="ownIn">ลงเวลาเข้า</button><button class="btn sub sm" id="ownOut">ลงเวลาออก</button></div>
        </section>
        ${incompleteWarningHtml(data.incompleteDays)}
        <section class="panel time-ledger"><div class="head ledger-head-wrap"><div><b>รายการลงเวลา</b><span class="sub" style="margin-left:7px">ตารางข้อมูลรายวัน · เลือกพนักงานด้านบนเพื่อกรอง</span></div><div class="spacer"></div><div class="time-range" role="group" aria-label="ช่วงวันที่ Timesheet"><button class="active" data-att-period="current">1–วันนี้</button><button data-att-period="previous">เดือนก่อนเต็มเดือน</button><label>เริ่ม<input id="attStart" type="date"></label><label>สิ้นสุด<input id="attEnd" type="date"></label></div><div class="ledger-filter" role="group" aria-label="กรองรายการลงเวลา"><button class="btn sub sm" data-att-filter="review">ต้องตรวจ</button><button class="btn sub sm" data-att-filter="today">วันนี้</button><button class="btn sub sm" data-att-filter="complete">ครบแล้ว</button><button class="btn sub sm" data-att-filter="all">ทั้งหมด</button></div><button class="btn sub sm" id="expAttBtn">ส่งออก CSV</button></div>
          <div class="time-ledger-status" id="attLedgerStatus" aria-live="polite"></div><div class="body flush"><table>
            <thead><tr><th>วันที่</th><th>พนักงาน</th><th class="num">เข้า</th><th class="num">ออก</th><th class="num">ชั่วโมงทำงาน</th><th>สถานะ</th><th data-nosort></th></tr></thead>
            <tbody id="ownAtt"><tr><td colspan="7"><div class="empty">กำลังโหลด…</div></td></tr></tbody>
          </table></div>
        </section>
      </div>`;
    // Timesheet route: full-month team matrix (default) + a day-level ledger for
    // manual attendance. Payroll has its own route; this stays focused on time.
    if(!ownerState.pmMonth) ownerState.pmMonth=new Date();
    $("#pmPrev").onclick=()=>shiftPersonMonth(-1);
    $("#pmNext").onclick=()=>shiftPersonMonth(1);
    const sel=$("#ownEmp");
    const fillSel=()=>{ sel.innerHTML=`<option value="">ทุกคน</option>`+(state.employees||[]).map(e=>`<option value="${esc(e.id)}"${e.id===ownerState.emp?" selected":""}>${esc(e.name)} (${esc(e.id)})</option>`).join(""); };
    if(!state.employees||!state.employees.length){ try{ await loadEmployees(true); }catch(_){} }
    fillSel();
    const setAttRange=(kind="current")=>{ const range=payrollRange(kind); ownerState.attRange=kind; ownerState.attStart=range.start; ownerState.attEnd=range.end; $("#attStart").value=range.start; $("#attEnd").value=range.end; node.querySelectorAll("[data-att-period]").forEach(b=>b.classList.toggle("active",b.dataset.attPeriod===kind)); };
    if(!ownerState.attStart||!ownerState.attEnd) setAttRange("current"); else { $("#attStart").value=ownerState.attStart; $("#attEnd").value=ownerState.attEnd; }
    const loadAtt=async()=>{ const tb=$("#ownAtt");
      try{ const payload={startDate:ownerState.attStart,endDate:ownerState.attEnd}; if(ownerState.emp)payload.employeeId=ownerState.emp; const a=await api("admin_attendance_days",payload);
        const days=a.days||[];
        const today=todayISO();
        const needsReview=d=>d.status!=="complete";
        const reviewCount=days.filter(needsReview).length;
        if(!ownerState.filter) ownerState.filter=reviewCount?"review":"all";
        const shown=days.filter(d=>ownerState.filter==="review"?needsReview(d):ownerState.filter==="today"?d.date===today:ownerState.filter==="complete"?d.status==="complete":true);
        node.querySelectorAll("[data-att-filter]").forEach(b=>b.classList.toggle("active",b.dataset.attFilter===ownerState.filter));
        const todayCount=days.filter(d=>d.date===today).length;
        const statusHost=$("#attLedgerStatus");
        if(statusHost) statusHost.innerHTML=`<span><i class="ops-dot ready"></i>ครบแล้ว <b>${fmtInt(days.filter(d=>d.status==="complete").length)}</b></span><span><i class="ops-dot review"></i>ต้องตรวจ <b>${fmtInt(reviewCount)}</b></span><span><i class="ops-dot today"></i>วันนี้ <b>${fmtInt(todayCount)}</b></span><small>กำลังแสดง ${fmtInt(shown.length)} จาก ${fmtInt(days.length)} รายการ</small>`;
        tb.innerHTML=shown.length? shown.map((d,i)=>{
          const isToday=d.date===today;
          let act="";
          if(isToday && !d.checkIn) act+=`<button class="btn ok sm" data-attin="${i}" style="margin-left:8px">ลงเวลาเข้า</button>`;
          else if(isToday && !d.checkOut) act+=`<button class="btn danger sm" data-attout="${i}" style="margin-left:8px">ลงเวลาออก</button>`;
          const person=esc(d.name||empName(d.employeeId)||d.employeeId);
          const status=d.status==="complete"?'<span class="badge">ครบ</span>':d.checkIn?'<span class="badge amber">รอออก</span>':'<span class="badge red">ไม่ครบ</span>';
          const rowState=d.status==="complete"?"complete":d.checkIn?"open":"review";
          return `<tr data-att="${i}" class="att-row ${rowState}${isToday?" is-today":""}">
          <td>${fmtDate(d.date)}</td><td class="person">${person}<span class="sub">${esc(d.employeeId||"")}</span></td><td class="num"><span class="time-stamp in${d.checkIn?"":" empty"}">${esc(d.checkIn||"—")}</span></td><td class="num"><span class="time-stamp out${d.checkOut?"":" empty"}">${esc(d.checkOut||"—")}</span></td>
          <td class="num">${d.workedMinutes?fmtHours(d.workedMinutes):"—"}</td><td>${status}</td>
          <td class="num time-ledger-row-actions">${act}</td></tr>`;}).join("")
        : `<tr><td colspan="7"><div class="empty">${ownerState.filter==="review"?"ไม่มีรายการที่ต้องตรวจ":ownerState.filter==="today"?"ยังไม่มีบันทึกเวลาวันนี้":"ไม่มีบันทึกเวลา"}</div></td></tr>`;
        const voidDay=(d,btn)=>voidAttendanceDay(d, loadAtt, btn);
        tb.querySelectorAll("[data-attin]").forEach(b=>b.onclick=()=>adminClock("check_in", shown[+b.dataset.attin].employeeId, loadAtt, b));
        tb.querySelectorAll("[data-attout]").forEach(b=>b.onclick=()=>adminClock("check_out", shown[+b.dataset.attout].employeeId, loadAtt, b));
        tb.querySelectorAll("tr[data-att]").forEach(tr=>{ const d=shown[+tr.dataset.att];
          tr.title="เปิดรายละเอียด Timesheet";
          tr.onclick=(event)=>{ if(!event.target.closest("button")) openAttendanceRecordDialog(d,loadAtt); };
          attachRowMenu(tr, [{label:"ยกเลิกบันทึกวันนี้", danger:true, fn:()=>voidDay(d)}]); });
      }catch(err){ tb.innerHTML=`<tr><td colspan="7"><div class="empty">${esc(err.message)}</div></td></tr>`; } };
    sel.onchange=()=>{ ownerState.emp=sel.value; loadAtt(); };
    node.querySelectorAll("[data-att-period]").forEach(b=>b.onclick=()=>{ setAttRange(b.dataset.attPeriod); loadAtt(); });
    [$("#attStart"),$("#attEnd")].forEach(input=>input.onchange=()=>{ ownerState.attRange="custom"; ownerState.attStart=$("#attStart").value; ownerState.attEnd=$("#attEnd").value; node.querySelectorAll("[data-att-period]").forEach(b=>b.classList.remove("active")); loadAtt(); });
    node.querySelectorAll("[data-att-filter]").forEach(b=>b.onclick=()=>{ ownerState.filter=b.dataset.attFilter; loadAtt(); });
    $("#ownIn").onclick=()=>adminClock("check_in", null, null, $("#ownIn"));
    $("#ownOut").onclick=()=>adminClock("check_out", null, null, $("#ownOut"));
    $("#expAttBtn").onclick=()=>attendanceExportDialog(ownerState.attStart,ownerState.attEnd);
    const showView=(v)=>{ node.querySelectorAll(".ts-view").forEach(x=>x.style.display=x.dataset.tsview===v?"":"none"); node.querySelectorAll("button[data-tsview]").forEach(b=>b.classList.toggle("active",b.dataset.tsview===v)); const nav=$("#pmNav"); if(nav) nav.style.visibility=v==="month"?"visible":"hidden"; ownerState.tsView=v; if(v==="month") loadPersonMonth(); else loadAtt(); };
    node.querySelectorAll("button[data-tsview]").forEach(b=>b.onclick=()=>showView(b.dataset.tsview));
    showView(ownerState.tsView||"month");
  }catch(err){ errorBox(node, err, renderOwner); }
}

function openAttendanceRecordDialog(day, refresh){
  if(!day) return;
  const today=todayISO(), isToday=day.date===today;
  const status=day.status==="complete"?"เวลาครบ":day.checkIn?"รอเช็กเอาต์":"ไม่มีเวลาเข้า";
  const body=el(`<div><section class="employee-review-summary"><div class="employee-review-identity"><div class="profile-line"><div class="pm-av">${esc((day.name||day.employeeId||"?").trim().slice(0,2))}</div><div><h4>${esc(day.name||empName(day.employeeId)||day.employeeId)}</h4><p>${esc(day.employeeId||"")} · ${fmtDate(day.date)}</p></div></div></div><div class="employee-review-history"><h4>สถานะ Timesheet</h4><div><span>${esc(status)}</span><b>${day.status==="complete"?"ครบ":"ต้องตรวจ"}</b></div></div></section><section class="employee-review-calendar"><div class="employee-review-today"><div><span>เวลาเข้า</span><b>${esc(day.checkIn||"—")}</b></div><div><span>เวลาออก</span><b>${esc(day.checkOut||"—")}</b></div><div><span>ชั่วโมงทำงาน</span><b>${day.workedMinutes?fmtHours(day.workedMinutes):"—"}</b></div><div><span>แหล่งข้อมูล</span><b>บันทึกเวลา</b></div></div><div class="notice blue" style="margin-top:12px"><div><b>การแก้ไขต้องทำจากรายการที่จำเป็นเท่านั้น</b><br><span class="sub">ระบบจะไม่แก้ยอดเงินเดือนย้อนหลังจนกว่าจะคำนวณ Payroll run ใหม่</span></div></div></section></div>`);
  const close=el(`<button class="btn sub">ปิด</button>`); close.onclick=closeModal;
  const actions=[close];
  if(isToday&&!day.checkIn){ const checkIn=el(`<button class="btn ok">ลงเวลาเข้า</button>`); checkIn.onclick=()=>adminClock("check_in",day.employeeId,()=>{closeModal(); refresh();},checkIn); actions.push(checkIn); }
  else if(isToday&&!day.checkOut){ const checkOut=el(`<button class="btn danger">ลงเวลาออก</button>`); checkOut.onclick=()=>adminClock("check_out",day.employeeId,()=>{closeModal(); refresh();},checkOut); actions.push(checkOut); }
  openModal("รายละเอียด Timesheet",body,actions);
}

async function adminClock(eventType, empId, after, btn){
  const target=empId||ownerState.emp;
  if(!target){ toast("เลือกพนักงานก่อน (ต้องไม่ใช่ 'ทุกคน')","bad"); return; }
  const emp=(state.employees||[]).find(e=>e.id===target);
  const label=eventType==="check_in"?"ลงเวลาเข้า":"ลงเวลาออก";
  if(!await confirmDialog(label, `${label}ให้ <b>${esc(emp?emp.name:target)}</b> (${esc(target)}) ณ เวลาปัจจุบัน?`, {okText:label})) return;
  await withBtn(btn, async()=>{
    try{ const d=await api("admin_record_attendance",{employeeId:target, eventType, reviewer:state.reviewer||"Admin"});
      toast(d.message||"บันทึกแล้ว","good"); if(typeof after==="function") after(); else renderOwner();
    }catch(err){ toast(err.message,"bad"); }
  });
}

/* ============ Per-employee monthly view (รายคน) ============
   Built from two deployed endpoints: admin_attendance_days (per-day in/out/hours)
   and admin_preview_payroll (authoritative per-employee totals + pay). Pay numbers
   are the same "ประมาณการ" the payroll page shows (locked only at period close).
   Per-day ฿ is the employee's effective daily rate = baseGross / workDays. */
const PM_TH_MON=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function pmHM(s){ const p=String(s||"").split(":"); return (+p[0]||0)*60+(+p[1]||0); }
function pmRange(){ const d=ownerState.pmMonth||new Date(); const y=d.getFullYear(),m=d.getMonth();
  const first=new Date(y,m,1), last=new Date(y,m+1,0);
  const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
  return {y,m,first,last,lastD:last.getDate(),start:iso(first),end:iso(last)}; }
function shiftPersonMonth(delta){ const d=ownerState.pmMonth||new Date(); ownerState.pmMonth=new Date(d.getFullYear(),d.getMonth()+delta,1); ownerState.pmSel=null; loadPersonMonth(); }

let pmModel=[];
async function loadPersonMonth(){
  if(!ownerState.pmMonth) ownerState.pmMonth=new Date();
  const r=pmRange();
  $("#pmLabel").textContent=`${PM_TH_MON[r.m]} ${r.y+543}`;
  if(!silentRefresh){ const mx=$("#pmMatrix"); if(mx) mx.innerHTML=`<div class="empty">กำลังโหลด…</div>`; const dt=$("#pmDetail"); if(dt) dt.innerHTML=""; }
  try{
    if(!state.employees||!state.employees.length){ try{ await loadEmployees(true); }catch(_){} }
    const [att,pay,setRes,holRes]=await Promise.all([
      api("admin_attendance_days",{startDate:r.start,endDate:r.end}),
      api("admin_preview_payroll",{startDate:r.start,endDate:r.end}).catch(()=>({lines:[]})),
      api("admin_get_settings").catch(()=>({settings:{}})),
      api("admin_list_holidays").catch(()=>({holidays:[]}))
    ]);
    const days=att.days||[], lines=pay.lines||[], settings=setRes.settings||{};
    const workdays=String(settings.workdays||"1,2,3,4,5").split(",").filter(x=>x!=="").map(Number);
    const shiftLabel=settings.shift_start||"09:00", graceMin=Number(settings.shift_grace_min||5);
    const shiftMin=pmHM(shiftLabel)+graceMin;
    ownerState.pmShift=`${shiftLabel}${graceMin?` (+${graceMin} น.)`:""}`;
    const holSet={}; (holRes.holidays||[]).forEach(h=>holSet[h.date]=h.name||"วันหยุด");
    const payBy={}; lines.forEach(l=>payBy[l.employeeId]=l);
    const byEmp={}; days.forEach(d=>{ (byEmp[d.employeeId]=byEmp[d.employeeId]||{})[d.date]=d; });
    const today=new Date().toISOString().slice(0,10);
    // Active employees only — test/inactive accounts must not pollute the roster,
    // the "ดีเด่น" ranking or the pay totals.
    const emps=(state.employees||[]).filter(e=>String(e.status||"").toLowerCase()==="active");
    pmModel=emps.map(e=>{
      const rec=byEmp[e.id]||{};
      let present=0,late=0,absent=0,incomplete=0,workedMin=0,full8=0;
      const cells=[];
      for(let dn=1;dn<=r.lastD;dn++){
        const dt=new Date(r.y,r.m,dn), iso=`${r.y}-${String(r.m+1).padStart(2,"0")}-${String(dn).padStart(2,"0")}`;
        const dow=dt.getDay(), holName=holSet[iso], isHoliday=!!holName, isWork=workdays.includes(dow)&&!isHoliday, future=iso>today, d=rec[iso];
        let base,ot=false;
        if(d){
          const ws=d.workedMinutes||0; workedMin+=ws;
          const lateFlag=d.checkIn && pmHM(d.checkIn)>shiftMin;
          if(d.status==="complete"){ if(ws>=480) full8++; ot=ws>540;
            if(lateFlag){ late++; base="late"; } else { present++; base="present"; } }
          else { incomplete++; base="late"; }
        } else if(isWork && !future){ absent++; base="absent"; }
        else base=isWork?"future":"off";
        cells.push({dn,iso,dow,base,ot,d,isToday:iso===today,holName:holName||""});
      }
      return {e,present,late,absent,incomplete,workedMin,full8,cells,pl:payBy[e.id]||{}};
    });
    { const sn=$("#pmShiftNote"); if(sn) sn.textContent=`เกณฑ์สาย: เข้าหลัง ${ownerState.pmShift}`; }
    pmRenderMatrix();
    if(!ownerState.pmSel){ const best=pmModel.slice().sort((a,b)=>b.workedMin-a.workedMin)[0]; ownerState.pmSel=best?best.e.id:null; }
    pmRenderDetail();
  }catch(err){ const mx=$("#pmMatrix"); if(mx) mx.innerHTML=`<div class="empty">${esc(err.message)}</div>`; }
}
function pmRenderMatrix(){
  const host=$("#pmMatrix"); if(!host) return;
  if(!pmModel.length){ host.innerHTML=`<div class="empty">ไม่มีพนักงานที่ใช้งานอยู่</div>`; return; }
  const r=pmRange();
  const dcol={present:"#10b981",late:"#f59e0b",absent:"#ef4444"};
  let head=`<th class="pm-name pm-corner">พนักงาน</th>`;
  for(let dn=1;dn<=r.lastD;dn++){ const dow=new Date(r.y,r.m,dn).getDay(); const wk=dow===0||dow===6; head+=`<th class="pm-d${wk?" wk":""}">${dn}</th>`; }
  head+=`<th class="pm-tot">มา</th><th class="pm-tot">สาย</th><th class="pm-tot">ขาด</th><th class="pm-tot">ชม.</th>`;
  const rows=pmModel.map(m=>{
    const cells=m.cells.map(c=>{
      if(c.base==="future") return `<td class="pm-x pm-future"${c.isToday?' data-today':''}></td>`;
      if(c.base==="off") return `<td class="pm-x pm-off"${c.isToday?' data-today':''} title="${c.iso}${c.holName?' · '+esc(c.holName):''}">·</td>`;
      const col=dcol[c.base]||"#cbd5e1";
      const io=c.d?`${esc(c.d.checkIn||'—')}–${esc(c.d.checkOut||'—')}${c.d.workedMinutes?' · '+fmtHours(c.d.workedMinutes):''}`:c.iso;
      return `<td class="pm-x pm-has${c.isToday?' is-today':''}" data-emp="${esc(m.e.id)}" data-iso="${c.iso}" style="--pc:${col}" title="${c.iso} · ${io}">${c.ot?'<i class="pm-ot"></i>':''}<span>${c.dn}</span></td>`;
    }).join("");
    const init=(m.e.name||m.e.id).trim().slice(0,2);
    return `<tr class="pm-mrow${ownerState.pmSel===m.e.id?' active':''}" data-emp="${esc(m.e.id)}">
      <th class="pm-name"><div class="pm-av">${esc(init)}</div><div class="pm-nm">${esc(m.e.name||m.e.id)}<span class="sub">${esc(m.e.id)}${m.e.role?' · '+esc(m.e.role):''}</span></div></th>
      ${cells}
      <td class="pm-tot pm-tot-p">${m.present+m.late}</td><td class="pm-tot pm-tot-l">${m.late}</td><td class="pm-tot pm-tot-a">${m.absent}</td><td class="pm-tot pm-tot-h">${fmtHours(m.workedMin)}</td></tr>`;
  }).join("");
  host.innerHTML=`<div class="pm-matrix-scroll"><table class="pm-matrix"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  // Selecting an employee only moves the highlight + re-renders the detail panel.
  // Toggle the active class in place instead of rebuilding the whole matrix DOM.
  const setActive=(id)=>{ ownerState.pmSel=id; host.querySelectorAll(".pm-mrow").forEach(r=>r.classList.toggle("active",r.dataset.emp===id)); pmRenderDetail(); };
  host.querySelectorAll(".pm-mrow .pm-name").forEach(th=>th.onclick=()=>{ setActive(th.closest(".pm-mrow").dataset.emp); const d=$("#pmDetail"); if(d) d.scrollIntoView({behavior:"smooth",block:"nearest"}); });
  host.querySelectorAll("td.pm-has").forEach(td=>td.onclick=()=>{ const m=pmModel.find(x=>x.e.id===td.dataset.emp); const c=m&&m.cells.find(x=>x.iso===td.dataset.iso); if(c&&c.d) openAttendanceRecordDialog(c.d, ()=>loadPersonMonth()); else setActive(td.dataset.emp); });
}
function pmRenderDetail(){
  const host=$("#pmDetail"); if(!host) return;
  const m=pmModel.find(x=>x.e.id===ownerState.pmSel); if(!m){ host.innerHTML=""; return; }
  const r=pmRange(), pl=m.pl;
  const daily=(pl.workDays&&pl.baseGross)?Math.round(pl.baseGross/pl.workDays):0;
  const net=pl.netPay!=null?pl.netPay:(pl.grossPay||0);
  const dc={present:["#d1fae5","#047857"],late:["#fdecd8","#b45309"],absent:["#f7e3e1","#8f322d"]};
  const head=["จ","อ","พ","พฤ","ศ","ส","อา"];
  let cal=`<div class="calm">`+head.map((d,i)=>`<div class="dh" style="color:${i===5?"#185fa5":i===6?"#a32d2d":"var(--muted)"}">${d}</div>`).join("");
  const lead=(r.first.getDay()+6)%7; for(let b=0;b<lead;b++) cal+=`<div></div>`;
  m.cells.forEach(c=>{
    if(c.isToday && c.d && c.d.checkIn && !c.d.checkOut){
      cal+=`<div class="cd" style="background:var(--blue-ink);color:#fff;border-color:var(--blue-ink)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="d">${c.dn}</span><span style="font-size:9px;background:rgba(255,255,255,.25);padding:1px 5px;border-radius:10px">วันนี้</span></div><div class="io" style="color:#eaf3de">${esc(c.d.checkIn)}–•••</div><div style="font-size:10px;margin-top:auto">กำลังทำงาน</div></div>`; return;
    }
    if(c.d && (c.base==="present"||c.base==="late")){
      const col=dc[c.base]||dc.present, pay=c.d.status==="complete"?daily:0;
      const tag=c.ot?'<span style="font-size:8px;color:#1f66b0;background:#e4eff9;padding:1px 4px;border-radius:8px"><span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#2f7fd6;vertical-align:1px;margin-right:2px"></span>เกินเวลา</span>'
        :c.base==="late"?'<span style="font-size:8px;color:#b45309;background:#fdecd8;padding:1px 4px;border-radius:8px">สาย</span>'
        :'<span style="font-size:9px;color:#047857">✓</span>';
      cal+=`<div class="cd" style="border-left:3px solid ${c.ot?"#2f7fd6":col[1]}"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="d">${c.dn}</span>${tag}</div><div class="io">${esc(c.d.checkIn||"—")}–${esc(c.d.checkOut||"—")}</div><div class="hp"><span class="sub">${c.d.workedMinutes?fmtHours(c.d.workedMinutes):"—"}</span>${pay?`<span style="font-size:11px;font-weight:600;color:var(--blue-ink)">${fmtBaht(pay)}</span>`:""}</div></div>`; return;
    }
    if(c.base==="absent"){ cal+=`<div class="cd off"><span class="d" style="color:#8f322d">${c.dn}</span><span class="sub" style="margin-top:auto">ขาด</span></div>`; return; }
    const lbl=c.holName?esc(c.holName):(c.base==="off"?"หยุด":"—"); const dcol=c.holName?"#6d4ea8":c.dow===0?"#8f322d":c.dow===6?"#2b5a86":"var(--muted)";
    cal+=`<div class="cd off"${c.holName?' style="background:#f1ecfa;border-style:solid;border-color:#ddd0f2"':""}><span class="d" style="color:${dcol};font-weight:400">${c.dn}</span><span class="sub" style="margin-top:auto;font-size:9px;line-height:1.1;overflow:hidden;text-overflow:ellipsis">${lbl}</span></div>`;
  });
  cal+=`</div>`;
  host.innerHTML=`<div class="panel" style="margin-top:18px"><div class="body">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div class="pm-av" style="width:40px;height:40px;font-size:14px">${esc((m.e.name||m.e.id).slice(0,2))}</div>
      <div style="flex:1;min-width:140px"><div style="font-size:15px;font-weight:600">${esc(m.e.name||m.e.id)}</div><div class="sub">${esc(m.e.id)}${m.e.role?" · "+esc(m.e.role):""}</div></div>
      <div style="text-align:right"><div class="sub">ประมาณการเงินเดือนงวดนี้</div><div style="font-size:20px;font-weight:600;color:var(--blue-ink)">${fmtBaht(net)}</div></div>
      <button class="btn sub sm" id="pmPrintTs" type="button">พิมพ์ Timesheet</button>
      <button class="btn sm" id="pmIssueSlip" type="button">ออกสลิปเงินเดือน</button>
    </div>
    <div class="cards" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="card" style="padding:10px 12px"><div class="label">ค่าแรงฐาน</div><div style="font-size:17px;font-weight:600">${fmtBaht(pl.baseGross||0)}</div><div class="sub">${pl.workDays||0} วัน${daily?" × "+fmtBaht(daily):""}</div></div>
      <div class="card" style="padding:10px 12px"><div class="label">OT</div><div style="font-size:17px;font-weight:600;color:#185fa5">${fmtBaht(pl.otGross||0)}</div><div class="sub">${pl.otMinutes?fmtHours(pl.otMinutes):"ไม่มี"}</div></div>
      <div class="card" style="padding:10px 12px"><div class="label">ชั่วโมงรวม</div><div style="font-size:17px;font-weight:600">${fmtHours(m.workedMin)}</div><div class="sub">สาย ${m.late} · ขาด ${m.absent}</div></div>
      <div class="card" style="padding:10px 12px"><div class="label">วันครบ 8 ชม.</div><div style="font-size:17px;font-weight:600;color:#3b6d11">${m.full8}<span class="sub">/${pl.workDays||m.present+m.late}</span></div><div class="sub">ได้ค่าแรงเต็ม</div></div>
    </div>
    ${cal}
    <div class="notice blue" style="margin-top:12px">ตัวเลขเงินเป็น<b>ประมาณการ</b> คิดจากวันที่เช็กเอาต์ครบ ยอดจริงล็อกตอนปิดงวดที่หน้า “จ่ายเงินเดือน”</div>
  </div></div>`;
  const pb=host.querySelector("#pmPrintTs");
  if(pb) pb.onclick=()=>{ const days=m.cells.map(c=>({date:c.iso,checkIn:c.d?c.d.checkIn:"",checkOut:c.d?c.d.checkOut:"",workedMinutes:c.d?c.d.workedMinutes:0,status:c.d?c.d.status:"",base:c.base,holName:c.holName})); printTimesheet({employeeId:m.e.id,role:m.e.role,regularMinutes:(pl.regularMinutes!=null?pl.regularMinutes:m.workedMin),otMinutes:(pl.otMinutes||0)},{start:r.start,end:r.end},days,{}); };
  // Issue a payslip for this employee straight from Timesheet (review → adjust → ออกสลิป).
  const sb=host.querySelector("#pmIssueSlip");
  if(sb) sb.onclick=()=>payrollTimesheetDialog({employeeId:m.e.id,name:m.e.name,role:m.e.role,...pl},{start:r.start,end:r.end});
}

/* Dashboard path for exceptional, Admin-recorded attendance. The server remains
   responsible for Bangkok-date duplicate/order validation and writes admin_manual
   to the immutable attendance/audit trail. */
async function adminAttendanceDialog(){
  let employees;
  try { employees=await loadEmployees(); }
  catch(err){ toast(`โหลดรายชื่อพนักงานไม่สำเร็จ: ${err.message}`,"bad"); return; }
  const active=employees.filter(e=>String(e.status||"").toLowerCase()==="active");
  if(!active.length){ toast("ยังไม่มีพนักงานที่ใช้งานอยู่สำหรับลงเวลา","bad"); return; }
  const body=el(`<div>
    <div class="notice blue" style="margin:0 0 14px">บันทึกนี้ใช้กรณี Admin ลงเวลาแทนพนักงานเท่านั้น ระบบจะไม่ขอ GPS และจะระบุแหล่งที่มาเป็น <b>admin_manual</b> ใน audit trail</div>
    <div class="field"><label for="adminClockEmp">เลือกพนักงาน</label>
      <select id="adminClockEmp"><option value="">— เลือกพนักงาน —</option>${active.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.id)})</option>`).join("")}</select>
      <div class="hint">เวลาที่บันทึกคือเวลาปัจจุบันของระบบ (เวลาไทย)</div>
    </div>
  </div>`);
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const record=async(eventType, button)=>withBtn(button, async()=>{
    const employeeId=$("#adminClockEmp").value;
    if(!employeeId){ toast("เลือกพนักงานก่อน","bad"); return; }
    const emp=state.empById[employeeId]||active.find(e=>e.id===employeeId);
    const label=eventType==="check_in"?"เช็กอิน":"เช็กเอาต์";
    if(!await confirmDialog(`ยืนยัน${label}`, `${label}ให้ <b>${esc(emp?.name||employeeId)}</b> (${esc(employeeId)}) ณ เวลาปัจจุบัน?<br><span class="sub">บันทึกโดย ${esc(state.reviewer||"Admin")} และตรวจสอบย้อนหลังได้</span>`, {okText:`${label}ให้`})) return;
    try{
      const data=await api("admin_record_attendance",{employeeId,eventType,reviewer:state.reviewer||"Admin"});
      toast(data.message||"บันทึกเวลาสำเร็จ","good");
      renderDashboard();
    }catch(err){ toast(err.message,"bad"); }
  });
  const checkIn=el(`<button class="btn">เช็กอินให้</button>`);
  const checkOut=el(`<button class="btn ghost">เช็กเอาต์ให้</button>`);
  checkIn.onclick=()=>record("check_in",checkIn);
  checkOut.onclick=()=>record("check_out",checkOut);
  openModal("ลงเวลาแทนพนักงาน",body,[cancel,checkIn,checkOut]);
}

/* Per-employee quick clock straight from the dashboard attendance table. Same
   immutable admin_manual path as adminAttendanceDialog — server validates the
   Bangkok-date order/duplicates and records the acting Admin in the audit trail. */
function bangkokClockNow(){
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
}
function patchDashboardClockRow(employeeId,eventType){
  const row=[...document.querySelectorAll("#page-dashboard [data-calendar]")].find(x=>x.dataset.calendar===employeeId);
  if(!row) return;
  const time=bangkokClockNow();
  const inTime=row.querySelector(".tc-clock-in b"), outTime=row.querySelector(".tc-clock-out b"), pill=row.querySelector(".tc-pill");
  const inBtn=row.querySelector("[data-checkin]"), outBtn=row.querySelector("[data-checkout]");
  row.classList.remove("tc-out","tc-in","tc-late","tc-done","is-offline","is-online","is-late","is-done");
  if(eventType==="check_in"){
    row.classList.add("tc-in","is-online");
    if(inTime) inTime.textContent=time;
    if(pill) pill.innerHTML="<i></i>กำลังทำงาน";
    if(inBtn) inBtn.disabled=true;
    if(outBtn) outBtn.disabled=false;
  }else{
    row.classList.add("tc-done","is-done");
    if(outTime) outTime.textContent=time;
    if(pill) pill.innerHTML="<i></i>ออกงานแล้ว";
    if(inBtn) inBtn.disabled=true;
    if(outBtn) outBtn.disabled=true;
  }
}
async function quickClock(employeeId, eventType, button){
  const emp=state.empById[employeeId]||(state.employees||[]).find(e=>e.id===employeeId);
  const label=eventType==="check_in"?"เช็กอิน":"เช็กเอาต์";
  if(!await confirmDialog(`ยืนยัน${label}`, `${label}ให้ <b>${esc(emp?.name||employeeId)}</b> (${esc(employeeId)}) ณ เวลาปัจจุบัน?<br><span class="sub">บันทึกโดย ${esc(state.reviewer||"Admin")} · แหล่งที่มา admin_manual ตรวจสอบย้อนหลังได้</span>`, {okText:`${label}ให้`})) return;
  try{
    const data=await withBtn(button,()=>api("admin_record_attendance",{employeeId,eventType,reviewer:state.reviewer||"Admin"}));
    toast(data.message||"บันทึกเวลาสำเร็จ","good");
    // Run after withBtn restores its loading state, so the new disabled/enabled
    // action state is not overwritten by the generic button helper.
    patchDashboardClockRow(employeeId,eventType);
  }catch(err){ toast(err.message,"bad"); }
}

function settingsDialog(s){
  const body=el(`<div></div>`);
  const freqField=el(`<div class="field"><label>รอบการจ่าย</label><select id="sFreq" style="width:100%;padding:9px 10px;border:1px solid #d7dce5;border-radius:8px;font:inherit">
    <option value="monthly">รายเดือน (เดือนละครั้ง)</option><option value="semimonthly">เดือนละ 2 ครั้ง</option><option value="weekly">รายสัปดาห์ (จ่ายทุกวันศุกร์)</option></select></div>`);
  body.append(freqField); freqField.querySelector("#sFreq").value=s.pay_frequency||"monthly";
  const payDayOpts=(sel)=>{ let o=`<option value="end"${String(sel)==="end"?" selected":""}>สิ้นเดือน</option>`;
    for(let d=1;d<=31;d++) o+=`<option value="${d}"${String(sel)===String(d)?" selected":""}>วันที่ ${d}</option>`; return o; };
  const g=el(`<div class="grid2"></div>`);
  g.append(
    field("วันจ่าย (หลัก)", `<select id="sPay1">${payDayOpts(s.pay_day_1||"end")}</select>`),
    field("วันจ่ายรอบ 2 (เฉพาะเดือนละ 2 ครั้ง)", `<select id="sPay2">${payDayOpts(s.pay_day_2||"15")}</select>`),
  );
  body.append(g);
  const wd=el(`<div class="field"><label>วันทำงาน (เลือกวันที่พนักงานต้องมาทำงาน)</label><div id="sWd" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:4px"></div></div>`);
  const set=new Set((s.workdays||"").split(",").filter(x=>x!==""));
  [["1","จันทร์"],["2","อังคาร"],["3","พุธ"],["4","พฤหัส"],["5","ศุกร์"],["6","เสาร์"],["0","อาทิตย์"]].forEach(([v,n])=>{
    wd.querySelector("#sWd").append(el(`<label class="check" style="margin:0"><input type="checkbox" value="${v}" ${set.has(v)?"checked":""}> ${n}</label>`));
  });
  body.append(wd);
  body.append(el(`<div style="border-top:1px solid var(--line);margin:14px 0 2px;padding-top:12px"></div>`));
  body.append(el(`<label class="check" style="margin:0"><input type="checkbox" id="sSso" ${String(s.sso_enabled).toLowerCase()==="true"?"checked":""}> หักประกันสังคมอัตโนมัติ</label>`));
  const sg=el(`<div class="grid2" style="margin-top:8px"></div>`);
  sg.append(
    field("อัตราประกันสังคม (%)", `<input id="sSsoRate" type="number" min="0" max="100" step="0.5" value="${esc(s.sso_rate||"5")}">`),
    field("เพดานต่อเดือน (บาท)", `<input id="sSsoCap" type="number" min="0" step="1" value="${esc(s.sso_cap||"750")}">`),
  );
  body.append(sg);
  body.append(el(`<div style="border-top:1px solid var(--line);margin:14px 0 2px;padding-top:12px"><div class="label">โควตาวันลาต่อปี (วัน)</div></div>`));
  const qg=el(`<div class="grid2" style="margin-top:8px"></div>`);
  qg.append(
    field("ลาป่วย", `<input id="sQSick" type="number" min="0" step="1" value="${esc(s.quota_sick||"30")}">`),
    field("ลากิจ", `<input id="sQPer" type="number" min="0" step="1" value="${esc(s.quota_personal||"6")}">`),
    field("ลาพักร้อน", `<input id="sQVac" type="number" min="0" step="1" value="${esc(s.quota_vacation||"6")}">`),
  );
  body.append(qg);
  body.append(el(`<div style="border-top:1px solid var(--line);margin:14px 0 2px;padding-top:12px"><div class="label">เวลาทำงาน / OT</div></div>`));
  const tg=el(`<div class="grid2" style="margin-top:8px"></div>`);
  tg.append(
    field("เวลาเข้างาน", `<input id="sShift" type="time" value="${esc(normaliseTime(s.shift_start,"09:00"))}">`),
    field("เวลาเลิกงาน", `<input id="sShiftEnd" type="time" value="${esc(normaliseTime(s.shift_end,"18:00"))}">`),
    field("ผ่อนผันสาย (นาที)", `<input id="sGrace" type="number" min="0" step="1" value="${esc(s.shift_grace_min||"5")}">`),
    field("มาสายสะสม (วัน)", `<input id="sLateAbsence" type="number" min="1" max="31" step="1" value="${esc(s.late_absence_days||"4")}">`, "ครบจำนวนนี้ในงวดเดียว = ขาดงาน 1 วัน"),
    field("พักเที่ยง (นาที)", `<input id="sLunch" type="number" min="0" step="5" value="${esc(s.lunch_break_min||"60")}">`),
    field("เริ่มคิด OT เมื่อเกิน (ชม.)", `<input id="sOtTh" type="number" min="1" max="24" step="0.5" value="${esc(s.ot_threshold_hours||"8")}">`),
    field("เตือนก่อนเข้างาน (นาที)", `<input id="sRemBef" type="number" min="0" step="1" value="${esc(s.remind_before_min||"15")}">`),
    field("เตือนเช็กเอาต์หลังเลิก (นาที)", `<input id="sRemOut" type="number" min="0" step="1" value="${esc(s.remind_checkout_after_min||"10")}">`),
  );
  body.append(tg);
  body.append(el(`<label class="check" style="margin-top:8px"><input type="checkbox" id="sHolOt" ${String(s.holiday_ot_enabled).toLowerCase()==="true"?"checked":""}> คิด OT เมื่อทำงานวันหยุด (ทั้งวันเป็น OT)</label>`));
  const shortField=el(`<div class="field" style="margin-top:12px"><label>เมื่อทำงานไม่ครบกะ (น้อยกว่าเวลามาตรฐานต่อวัน)</label><select id="sShort" style="width:100%;padding:9px 10px;border:1px solid #d7dce5;border-radius:8px;font:inherit">
    <option value="none">ไม่ตัด — จ่ายเต็มตามปกติ (ค่าเริ่มต้น)</option>
    <option value="deduct_wage">ตัดค่าแรงตามสัดส่วนชั่วโมงที่ขาด</option>
    <option value="trim_ot">ไม่ตัดค่าแรง แต่หัก OT เท่าชั่วโมงที่ขาด</option>
  </select><div class="sub" style="margin-top:6px">ใช้กับพนักงานทุกคน · ตรวจผลรายคนได้ที่หน้าเงินเดือน → ตรวจ Timesheet</div></div>`);
  shortField.querySelector("#sShort").value=s.payroll_shortfall_policy||"none";
  body.append(shortField);
  // Settings are global. State the scope before save so Finance can decide
  // without opening each employee record or re-running payroll first.
  const impact=el(`<div class="notice blue" id="settingsImpact" style="margin-top:12px"><div></div></div>`);
  body.append(impact);
  const updateImpact=()=>{
    const active=(state.employees||[]).filter(e=>String(e.status||"active").toLowerCase()==="active").length;
    const workdays=[...body.querySelectorAll('#sWd input:checked')].map(c=>c.value);
    const ssoOn=$("#sSso",body).checked;
    const shortLabel={none:"ไม่ตัดค่าแรง",deduct_wage:"ตัดค่าแรงตามสัดส่วน",trim_ot:"ตัด OT ตามชั่วโมงที่ขาด"}[$("#sShort",body).value]||"—";
    const lateThreshold=Math.min(31,Math.max(1,Math.floor(Number($("#sLateAbsence",body).value)||4)));
    impact.firstElementChild.innerHTML=`<b>ผลกระทบก่อนบันทึก</b><br><span class="sub">มีผลกับพนักงานที่ใช้งาน ${fmtInt(active)} คน · วันทำงาน ${fmtInt(workdays.length)} วัน/สัปดาห์ · ประกันสังคม ${ssoOn?"เปิด":"ปิด"} · ไม่ครบกะ: ${esc(shortLabel)}<br>มาสายสะสม ${fmtInt(lateThreshold)} วันในงวดเดียว = ขาดงาน 1 วัน · การเปลี่ยนแปลงจะใช้ในการคำนวณ Timesheet ครั้งถัดไป และไม่แก้สลิปที่ออกไปแล้ว</span>`;
  };
  body.querySelectorAll("input,select").forEach(control=>control.addEventListener("change",updateImpact));
  updateImpact();
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">บันทึก</button>`);
  save.onclick=()=>withBtn(save, async ()=>{
    const workdays=[...body.querySelectorAll('#sWd input:checked')].map(c=>c.value).join(",");
    const lateAbsenceDays=Number($("#sLateAbsence").value);
    if(!Number.isInteger(lateAbsenceDays)||lateAbsenceDays<1||lateAbsenceDays>31){ toast("มาสายสะสมต้องเป็นจำนวนเต็ม 1–31 วัน","bad"); return; }
    try{ await api("admin_save_settings",{settings:{pay_frequency:$("#sFreq").value, pay_day_1:$("#sPay1").value.trim(), pay_day_2:$("#sPay2").value.trim(), workdays,
        sso_enabled:$("#sSso").checked, sso_rate:$("#sSsoRate").value, sso_cap:$("#sSsoCap").value,
        quota_sick:$("#sQSick").value, quota_personal:$("#sQPer").value, quota_vacation:$("#sQVac").value,
        shift_start:$("#sShift").value, shift_end:$("#sShiftEnd").value, shift_grace_min:$("#sGrace").value, late_absence_days:lateAbsenceDays, lunch_break_min:$("#sLunch").value, ot_threshold_hours:$("#sOtTh").value, holiday_ot_enabled:$("#sHolOt").checked, payroll_shortfall_policy:$("#sShort").value,
        remind_before_min:$("#sRemBef").value, remind_checkout_after_min:$("#sRemOut").value}});
      closeModal(); toast("บันทึกการตั้งค่าแล้ว","good"); renderOwner();
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal("ตั้งค่าการจ่ายเงินเดือน", body, [cancel, save]);
}

function workScheduleDialog(s){
  const body=el(`<div><div class="notice blue">การตั้งค่านี้ใช้กับพนักงานทุกคน: การแจ้งเตือน, ปฏิทิน, สถานะสาย และเงื่อนไข OT</div></div>`);
  const days=new Set(String(s.workdays||"1,2,3,4,5").split(","));
  const dayWrap=el(`<div class="field"><label>วันทำงานประจำ</label><div id="wsDays" style="display:flex;flex-wrap:wrap;gap:8px"></div></div>`);
  [["1","จันทร์"],["2","อังคาร"],["3","พุธ"],["4","พฤหัส"],["5","ศุกร์"],["6","เสาร์"],["0","อาทิตย์"]].forEach(([value,label])=>dayWrap.querySelector("#wsDays").append(el(`<label class="check" style="margin:0"><input type="checkbox" value="${value}" ${days.has(value)?"checked":""}> ${label}</label>`)));
  body.append(dayWrap);
  const grid=el(`<div class="grid2"></div>`);
  grid.append(
    field("เวลาเข้างาน", `<input id="wsStart" type="time" value="${esc(normaliseTime(s.shift_start,"09:00"))}">`),
    field("เวลาเลิกงาน", `<input id="wsEnd" type="time" value="${esc(normaliseTime(s.shift_end,"18:00"))}">`),
    field("ผ่อนผันสาย (นาที)", `<input id="wsGrace" type="number" min="0" max="180" step="1" value="${esc(s.shift_grace_min||"5")}">`),
    field("พักกลางวัน (นาที)", `<input id="wsLunch" type="number" min="0" max="240" step="5" value="${esc(s.lunch_break_min||"60")}">`),
    field("เริ่มคิด OT เมื่อทำงานเกิน (ชม.)", `<input id="wsOt" type="number" min="1" max="24" step="0.5" value="${esc(s.ot_threshold_hours||"8")}">`),
    field("เตือนก่อนเข้างาน (นาที)", `<input id="wsBefore" type="number" min="0" max="240" step="1" value="${esc(s.remind_before_min||"15")}">`),
    field("เตือนเช็กเอาต์หลังเลิก (นาที)", `<input id="wsAfter" type="number" min="0" max="240" step="1" value="${esc(s.remind_checkout_after_min||"10")}">`),
  );
  body.append(grid);
  body.append(el(`<label class="check"><input id="wsHolidayOt" type="checkbox" ${String(s.holiday_ot_enabled).toLowerCase()==="true"?"checked":""}> ทำงานวันหยุดให้คิดเป็น OT ทั้งวัน</label>`));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">บันทึกกะงาน</button>`);
  save.onclick=()=>withBtn(save, async()=>{
    const workdays=[...body.querySelectorAll("#wsDays input:checked")].map(input=>input.value).join(",");
    if(!workdays){ toast("เลือกวันทำงานอย่างน้อย 1 วัน","bad"); return; }
    try{
      await api("admin_save_settings",{settings:{workdays,shift_start:$("#wsStart",body).value,shift_end:$("#wsEnd",body).value,shift_grace_min:$("#wsGrace",body).value,lunch_break_min:$("#wsLunch",body).value,ot_threshold_hours:$("#wsOt",body).value,holiday_ot_enabled:$("#wsHolidayOt",body).checked,remind_before_min:$("#wsBefore",body).value,remind_checkout_after_min:$("#wsAfter",body).value}});
      closeModal(); toast("บันทึกกะงานแล้ว","good"); loadWorkRulesSummary();
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal("แก้ไขเวลาทำงาน",body,[cancel,save]);
}

async function lockFromOwner(p){
  if(!await confirmDialog("ล็อกงวดเงินเดือน", `ล็อกงวด <b>${fmtDate(p.start)} – ${fmtDate(p.end)}</b> และบันทึกเป็น snapshot ถาวร?<br>หลังล็อกยอดในงวดนี้จะแก้ไขไม่ได้ (เป็นการบันทึกยอด ไม่ใช่การจ่ายเงินจริง)`, {okText:"ล็อกงวด"})) return;
  try{ const d=await api("admin_lock_payroll",{startDate:p.start, endDate:p.end, lockedBy:state.reviewer||"Admin"});
    toast("ล็อกงวดแล้ว: "+d.payrollId,"good");
  }catch(err){ toast(err.message,"bad"); }
}

async function loadSites(){
  const tb=$("#siteRows"); if(!tb) return;
  try{
    const d=await api("admin_list_sites"); const sites=d.sites||[];
    tb.innerHTML = sites.length? sites.map((st,i)=>`<tr data-si="${i}" class="${st.active?"":"site-off"}">
      <td class="person"><div class="site-name-cell"><span class="site-pin" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span class="site-name-txt"><b>${esc(st.name||st.siteId)}</b><span class="sub">${esc(st.siteId)} · ${st.lat}, ${st.lng}</span></span></div></td>
      <td class="num"><span class="radius-badge">${fmtInt(st.radius)} ม.</span></td>
      <td>${st.active?'<span class="badge good"><span class="dot"></span>ใช้งาน</span>':'<span class="badge grey">ปิด</span>'}</td>
      <td><div class="row-actions"><button class="btn sub sm" data-sedit="${i}">แก้ไข</button></div></td></tr>`).join("")
      : `<tr><td colspan="4"><div class="empty">ยังไม่มีจุดเช็กอิน — กด “เพิ่มจุด”</div></td></tr>`;
    tb.querySelectorAll("[data-sedit]").forEach(b=>b.onclick=()=>siteDialog(sites[+b.dataset.sedit]));
    tb.querySelectorAll("tr[data-si]").forEach(tr=>{ const st=sites[+tr.dataset.si];
      attachRowMenu(tr, [{label:"แก้ไขจุด", fn:()=>siteDialog(st)}, st.active?{label:"ปิดใช้งานจุดนี้", danger:true, fn:()=>toggleSite(st,false)}:{label:"เปิดใช้งาน", fn:()=>toggleSite(st,true)}]); });
    attachSort($("#siteTable"));
  }catch(err){ tb.innerHTML=`<tr><td colspan="5"><div class="empty">${esc(err.message)}</div></td></tr>`; }
}
async function toggleSite(st,active){
  try{ await api("admin_save_site",{siteId:st.siteId, name:st.name, lat:st.lat, lng:st.lng, radius:st.radius, active});
    toast(active?"เปิดใช้งานจุดแล้ว":"ปิดใช้งานจุดแล้ว","good"); loadSites();
  }catch(err){ toast(err.message,"bad"); }
}
function siteDialog(site){
  const isNew=!site;
  const body=el(`<div></div>`);
  body.append(field("ชื่อพื้นที่ / สาขา", `<input id="tName" type="text" value="${esc(site?site.name:"")}" placeholder="เช่น สาขาสีลม">`));
  body.append(field("รหัสจุด (siteId)", `<input id="tSite" type="text" value="${esc(site?site.siteId:("SITE-"+Date.now().toString(36).toUpperCase().slice(-5)))}" ${site?"readonly":""}>`, isNew?"ตั้งอัตโนมัติให้แล้ว แก้ได้":"แก้ไม่ได้หลังสร้าง"));
  const g=el(`<div class="grid2"></div>`);
  g.append(field("Latitude", `<input id="tLat" type="text" value="${site?site.lat:""}">`), field("Longitude", `<input id="tLng" type="text" value="${site?site.lng:""}">`));
  body.append(g);
  body.append(field("รัศมีอนุญาต (เมตร)", `<input id="tRad" type="number" min="1" value="${site?site.radius:200}">`, "พนักงานต้องอยู่ในรัศมีนี้ถึงจะเช็กอินผ่าน"));
  const paste=field("วางพิกัดจาก Google Maps", `<input id="tPaste" type="text" placeholder="13.7629, 100.5582">`, "คัดลอกพิกัดจาก Google Maps มาวาง Lat/Lng จะเติมให้อัตโนมัติ");
  body.append(paste);
  paste.querySelector("#tPaste").oninput=(e)=>{ const m=/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(e.target.value); if(m){ body.querySelector("#tLat").value=m[1]; body.querySelector("#tLng").value=m[2]; } };
  if(!isNew) body.append(el(`<label class="check" style="margin-top:8px"><input type="checkbox" id="tActive" ${site.active?"checked":""}> เปิดใช้งานจุดนี้</label>`));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn ok">บันทึก</button>`);
  save.onclick=()=>withBtn(save, async ()=>{
    const lat=parseFloat(body.querySelector("#tLat").value), lng=parseFloat(body.querySelector("#tLng").value), radius=parseFloat(body.querySelector("#tRad").value);
    if(!body.querySelector("#tSite").value.trim()||isNaN(lat)||isNaN(lng)||!(radius>0)){ toast("กรอกชื่อ/พิกัด/รัศมีให้ครบ","bad"); return; }
    try{ await api("admin_save_site",{siteId:body.querySelector("#tSite").value.trim(), name:body.querySelector("#tName").value.trim(), lat, lng, radius, active: isNew?true:body.querySelector("#tActive").checked});
      closeModal(); toast("บันทึกจุดเช็กอินแล้ว","good"); loadSites();
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal(isNew?"เพิ่มจุดเช็กอิน":"แก้ไขจุดเช็กอิน", body, [cancel, save]);
}

const ADV_BADGE={pending:"blue",approved:"",paid:"amber",settled:"grey",rejected:"red"};
const ADV_LABEL={pending:"รออนุมัติ",approved:"อนุมัติแล้ว · รอจ่ายเงิน",paid:"จ่ายแล้ว · รอหักเงินเดือน",settled:"หักจากเงินเดือนแล้ว",rejected:"ปฏิเสธ"};
async function renderAdvances(){
  const node=$("#page-advances"); skeleton(node);
  setRouteShell(node,"advances");
  try{
    const data=await api("admin_list_advances");
    const adv=data.advances||[];
    const pending=adv.filter(a=>a.status==="pending"), approved=adv.filter(a=>a.status==="approved"), paid=adv.filter(a=>a.status==="paid");
    const sum=(arr)=>arr.reduce((s,a)=>s+Number(a.amount||0),0);
    node.innerHTML=`
      ${groupTabsHtml("advances")}
      <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">ทะเบียนรายการเงิน</div><h2>เงินล่วงหน้าพนักงาน</h2><p>อนุมัติ จ่าย และติดตามยอดหักคืนจากตารางเดียว</p></div><div class="directory-count"><b>${fmtInt(pending.length+approved.length)}</b> รายการต้องดำเนินการ</div></div>
      <div class="notice blue">ขั้นตอน: <b>อนุมัติ</b> → <b>บันทึกจ่ายแล้ว</b> (ยื่นเงินให้ลูกน้อง) → ระบบจะ<b>หักจากเงินเดือน</b>อัตโนมัติเมื่อล็อกงวด แล้วเปลี่ยนเป็น “หักแล้ว” (หักครั้งเดียว ไม่ซ้ำ)</div>
      <div class="cards">
        <div class="card"><div class="label">รออนุมัติ</div><div class="value">${fmtInt(pending.length)}</div><div class="note ${pending.length?"bad":""}">${fmtBaht(sum(pending))}</div></div>
        <div class="card"><div class="label">อนุมัติแล้ว รอจ่ายเงิน</div><div class="value">${fmtBaht(sum(approved))}</div><div class="note">${fmtInt(approved.length)} รายการ</div></div>
        <div class="card"><div class="label">จ่ายแล้ว รอหักเงินเดือน</div><div class="value">${fmtBaht(sum(paid))}</div><div class="note">${fmtInt(paid.length)} รายการ · จะถูกหักเมื่อล็อกงวด</div></div>
        <div class="card"><div class="label">คำขอทั้งหมด</div><div class="value">${fmtInt(adv.length)}</div><div class="note">ทุกสถานะ</div></div>
      </div>
      <div class="panel"><div class="head"><div><h2>ทะเบียนเงินล่วงหน้า</h2><span class="sub">เรียงรายการที่ต้องดำเนินการก่อน</span></div><div class="spacer"></div><div class="toolbar" id="advFilters" style="gap:4px"><button class="btn sm active" data-adv-filter="action">ต้องดำเนินการ ${fmtInt(pending.length+approved.length)}</button><button class="btn sub sm" data-adv-filter="paid">รอหัก ${fmtInt(paid.length)}</button><button class="btn sub sm" data-adv-filter="all">ทั้งหมด ${fmtInt(adv.length)}</button></div></div>
        <div class="body flush"><table>
          <thead><tr><th>พนักงาน</th><th class="num">จำนวน</th><th>เหตุผล</th><th>วันที่ขอ</th><th>ผลกระทบเงินเดือน</th><th>สถานะ</th><th></th></tr></thead>
          <tbody id="advRows"></tbody></table></div>
      </div>`;
    const tb=$("#advRows");
    const drawAdv=(filter="action")=>{
      $("#advFilters").querySelectorAll("[data-adv-filter]").forEach(b=>b.classList.toggle("active",b.dataset.advFilter===filter));
      const rows=filter==="action"?adv.filter(a=>a.status==="pending"||a.status==="approved"):filter==="paid"?adv.filter(a=>a.status==="paid"):adv;
      tb.innerHTML=rows.length? rows.map(a=>{
      const acts=[];
      if(a.status==="pending"){ acts.push(`<button class="btn ok sm" data-ap="${esc(a.advanceId)}">อนุมัติ</button>`); acts.push(`<button class="btn danger sm" data-rj="${esc(a.advanceId)}">ปฏิเสธ</button>`); }
      if(a.status==="approved"){ acts.push(`<button class="btn sm" data-paid="${esc(a.advanceId)}">บันทึกจ่ายแล้ว</button>`); }
      const payrollImpact=a.status==="paid"?"รอหักในงวดเงินเดือนถัดไปที่ล็อก":a.status==="settled"?"หักจากเงินเดือนแล้ว":a.status==="approved"?"ยังไม่กระทบจนกว่าจะบันทึกจ่าย":"ยังไม่กระทบเงินเดือน";
      return `<tr><td class="person">${esc(a.name)}<span class="sub">${esc(a.employeeId)}</span></td>
        <td class="num"><b>${fmtBaht(a.amount)}</b></td><td>${esc(a.reason||"—")}</td><td>${fmtDate(a.requestDate)}</td>
        <td><span class="sub">${payrollImpact}</span></td>
        <td><span class="badge ${ADV_BADGE[a.status]||"grey"}">${ADV_LABEL[a.status]||a.status}</span></td>
        <td><div class="row-actions">${acts.join("")}</div></td></tr>`;
      }).join("") : `<tr><td colspan="7"><div class="empty">ไม่มีรายการในสถานะนี้</div></td></tr>`;
      tb.querySelectorAll("[data-ap]").forEach(b=>b.onclick=()=>decideAdvance(b.dataset.ap,"approved"));
      tb.querySelectorAll("[data-rj]").forEach(b=>b.onclick=()=>decideAdvance(b.dataset.rj,"rejected"));
      tb.querySelectorAll("[data-paid]").forEach(b=>b.onclick=()=>markAdvancePaid(b.dataset.paid));
    };
    $("#advFilters").querySelectorAll("[data-adv-filter]").forEach(b=>b.onclick=()=>drawAdv(b.dataset.advFilter));
    drawAdv();
  }catch(err){ errorBox(node, err, renderAdvances); }
}
async function decideAdvance(id, decision){
  const t=decision==="approved"?"อนุมัติ":"ปฏิเสธ";
  if(!await confirmDialog(t+"คำขอเบิกเงิน", `${t}คำขอเบิกเงินรายการนี้?`, {okText:t})) return;
  try{ await api("admin_decide_advance",{advanceId:id, decision, reviewer:state.reviewer||"Admin"}); toast("บันทึกแล้ว","good"); PAGES[state.page].load(); }
  catch(err){ toast(err.message,"bad"); }
}
async function markAdvancePaid(id){
  if(!await confirmDialog("บันทึกการจ่ายเงิน", "ยืนยันว่าได้จ่ายเงินเบิกล่วงหน้ารายการนี้ให้พนักงานแล้ว?", {okText:"จ่ายแล้ว"})) return;
  try{ await api("admin_mark_advance_paid",{advanceId:id}); toast("บันทึกการจ่ายแล้ว","good"); PAGES[state.page].load(); }
  catch(err){ toast(err.message,"bad"); }
}

async function renderInvoices(){
  const node=$("#page-invoices");
  setRouteShell(node,"invoices");
  skeleton(node);
  try{
    const [data, invoiceConfig]=await Promise.all([
      api("admin_list_invoices"),
      api("admin_get_invoice_settings").catch(()=>({settings:{}})),
    ]);
    state.invoiceSettings=invoiceConfig.settings||{};
    const inv=data.invoices||[];
    const sum=(pred)=>inv.filter(pred).reduce((s,i)=>s+Number(i.total||0),0);
    const badge=(s)=>({draft:"grey",issued:"blue",paid:"",overdue:"red",void:"grey"}[s]||"grey");
    const label=(s)=>({draft:"ร่าง",issued:"ออกบิลแล้ว",paid:"ชำระแล้ว",overdue:"เกินกำหนด","void":"ยกเลิก"}[s]||s);
    node.innerHTML=`
      <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">ลูกหนี้การค้า</div><h2>ใบแจ้งหนี้ลูกค้า</h2><p>ติดตามสถานะเอกสารและการชำระเงินจากตารางเดียว</p></div><div class="directory-count"><b>${fmtInt(inv.filter(i=>i.status==="overdue").length)}</b> ใบเกินกำหนด</div></div>
      <div class="cards">
        <div class="card"><div class="label">เอกสารร่าง</div><div class="value">${fmtBaht(sum(i=>i.status==="draft"))}</div><div class="note">${inv.filter(i=>i.status==="draft").length} ใบ</div></div>
        <div class="card"><div class="label">รอรับชำระ</div><div class="value">${fmtBaht(sum(i=>i.status==="issued"))}</div><div class="note">${inv.filter(i=>i.status==="issued").length} ใบ</div></div>
        <div class="card"><div class="label">เกินกำหนด</div><div class="value">${fmtBaht(sum(i=>i.status==="overdue"))}</div><div class="note bad">${inv.filter(i=>i.status==="overdue").length} ใบต้องติดตาม</div></div>
        <div class="card"><div class="label">ชำระแล้ว</div><div class="value">${fmtBaht(sum(i=>i.status==="paid"))}</div><div class="note">${inv.filter(i=>i.status==="paid").length} ใบ</div></div>
      </div>
      <div class="panel"><div class="head"><div class="toolbar"><input type="search" id="invSearch" placeholder="ค้นหา เลขที่ / ลูกค้า" style="width:260px"></div>
        <div class="spacer"></div>${allowedPages().includes("settings")?`<button class="btn sub sm" id="invoiceConfig">ตั้งค่าหัวบิล</button>`:""}<button class="btn" id="newInv">+ สร้างใบแจ้งหนี้</button></div>
        <div class="body flush"><table><thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ครบกำหนด</th><th class="num">ยอดรวม</th><th>สถานะ</th><th></th></tr></thead>
        <tbody id="invRows"></tbody></table></div>
      </div>`;
    const draw=(q="")=>{
      q=q.trim().toLowerCase();
      const rows=inv.filter(i=>!q||(i.invoiceNo+i.customer).toLowerCase().includes(q));
      const tb=$("#invRows");
      tb.innerHTML=rows.length? rows.map(i=>{
        const acts=[];
        acts.push(`<button class="btn ghost sm" data-print="${esc(i.invoiceNo)}">พิมพ์</button>`);
        if(i.status==="draft"){ acts.push(`<button class="btn ghost sm" data-issue="${esc(i.invoiceNo)}">ออกบิล</button>`); acts.push(`<button class="btn danger sm" data-void="${esc(i.invoiceNo)}">ยกเลิก</button>`); }
        if(i.status==="issued"||i.status==="overdue"){ acts.push(`<button class="btn ok sm" data-pay="${esc(i.invoiceNo)}">บันทึกชำระ</button>`); acts.push(`<button class="btn danger sm" data-void="${esc(i.invoiceNo)}">ยกเลิก</button>`); }
        return `<tr><td class="person">${esc(i.invoiceNo)}<span class="sub">${esc(i.description||"")}</span></td>
          <td>${esc(i.customer)}</td><td>${fmtDate(i.dueDate)}</td><td class="num"><b>${fmtBaht(i.total)}</b><span class="sub">VAT ${fmtBaht(i.vat)}</span></td>
          <td><span class="badge ${badge(i.status)}">${label(i.status)}</span>${i.paymentReference?`<span class="sub">ref: ${esc(i.paymentReference)}</span>`:""}</td>
          <td><div class="row-actions">${acts.join("")}</div></td></tr>`;
      }).join("") : `<tr><td colspan="6"><div class="empty">ยังไม่มีใบแจ้งหนี้</div></td></tr>`;
      tb.querySelectorAll("[data-issue]").forEach(b=>b.onclick=()=>invStatus(b,b.dataset.issue,"issued"));
      tb.querySelectorAll("[data-void]").forEach(b=>b.onclick=()=>invStatus(b,b.dataset.void,"void"));
      tb.querySelectorAll("[data-pay]").forEach(b=>b.onclick=()=>payInvoice(b.dataset.pay));
      tb.querySelectorAll("[data-print]").forEach(b=>b.onclick=()=>printInvoice(inv.find(x=>x.invoiceNo===b.dataset.print)));
    };
    draw();
    $("#invSearch").oninput=e=>draw(e.target.value);
    $("#newInv").onclick=newInvoiceDialog;
    $("#invoiceConfig")?.addEventListener("click", invoiceSettingsDialog);
  }catch(err){ errorBox(node, err, renderInvoices); }
}

function printInvoice(i){
  if(!i){ toast("ไม่พบใบแจ้งหนี้","bad"); return; }
  const issuer=invoiceIssuer(state.invoiceSettings);
  const label={draft:"ร่าง",issued:"ออกบิลแล้ว",paid:"ชำระแล้ว",overdue:"เกินกำหนด","void":"ยกเลิก"}[i.status]||i.status;
  const money=(n)=>Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const dateTh=(iso)=>{ if(!iso) return "—"; const d=new Date(iso.length<=10?iso+"T00:00:00+07:00":iso); return isNaN(d)?esc(iso):d.toLocaleDateString("th-TH",{dateStyle:"long"}); };
  const invoiceDate=i.createdAt?dateTh(i.createdAt):new Date().toLocaleDateString("th-TH",{dateStyle:"long"});
  const html=`<!doctype html><html lang="th"><head><meta charset="utf-8">
    <title>${esc(i.invoiceNo)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:"Sarabun","TH Sarabun New","Tahoma",sans-serif;color:#111;margin:0;padding:24px;background:#f3f4f6}
      .sheet{max-width:780px;margin:0 auto;background:#fff;padding:40px 44px;box-shadow:0 1px 6px rgba(0,0,0,.12)}
      .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:3px solid #152c47;padding-bottom:16px}
      .issuer-brand{display:flex;align-items:flex-start;gap:14px}.issuer-logo{width:74px;height:74px;object-fit:contain;flex:none}
      .co-name{font-size:20px;font-weight:700;color:#152c47;margin:0} .co-en{font-size:13px;color:#374151;margin:2px 0 8px}
      .co-line{font-size:13px;color:#374151;line-height:1.5}
      .doc-title{text-align:right} .doc-title h1{font-size:26px;margin:0;letter-spacing:1px;color:#111} .doc-title .sub{font-size:12px;color:#6b7280}
      .meta{display:flex;justify-content:space-between;margin-top:20px;gap:24px}
      .meta .box{font-size:13px;line-height:1.7} .meta .k{color:#6b7280} .meta b{color:#111}
      table{width:100%;border-collapse:collapse;margin-top:22px;font-size:14px}
      th{background:#152c47;color:#fff;text-align:left;padding:9px 12px;font-weight:600} th.num,td.num{text-align:right}
      td{padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top}
      .totals{margin-top:14px;margin-left:auto;width:280px;font-size:14px}
      .totals div{display:flex;justify-content:space-between;padding:6px 2px} .totals .grand{border-top:2px solid #152c47;margin-top:4px;padding-top:10px;font-size:17px;font-weight:700;color:#152c47}
      .status{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:999px;font-size:12px;background:#e6f8ea;color:#152c47}
      .foot{margin-top:40px;display:flex;justify-content:space-between;font-size:13px;color:#374151}
      .sign{text-align:center;width:220px} .sign .line{margin-top:48px;border-top:1px dotted #9ca3af;padding-top:6px}
      .toolbar{max-width:780px;margin:0 auto 14px;text-align:right}
      .pbtn{font:inherit;font-size:14px;padding:8px 18px;border:0;border-radius:8px;background:#152c47;color:#fff;cursor:pointer}
      @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:none;padding:24px}.toolbar{display:none}}
    </style></head><body>
    <div class="toolbar"><button class="pbtn" onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
    <div class="sheet">
      <div class="top">
        <div class="issuer-brand">${printLogoMarkup(issuer)}<div>
          <p class="co-name">${esc(issuer.name)}</p>
          ${issuer.nameEn?`<p class="co-en">${esc(issuer.nameEn)}</p>`:""}
          <div class="co-line">${esc(issuer.address)}</div>
          <div class="co-line">โทร. ${esc(issuer.phone)}</div>
          <div class="co-line">เลขประจำตัวผู้เสียภาษี ${esc(issuer.taxId)}</div>
        </div></div>
        <div class="doc-title"><h1>ใบแจ้งหนี้</h1><div class="sub">INVOICE</div></div>
      </div>
      <div class="meta">
        <div class="box"><div><span class="k">ลูกค้า</span></div><div><b>${esc(i.customer)}</b></div><div class="status">${esc(label)}</div></div>
        <div class="box" style="text-align:right">
          <div><span class="k">เลขที่</span> <b>${esc(i.invoiceNo)}</b></div>
          <div><span class="k">วันที่ออกบิล</span> <b>${invoiceDate}</b></div>
          <div><span class="k">ครบกำหนดชำระ</span> <b>${dateTh(i.dueDate)}</b></div>
          ${i.paymentReference?`<div><span class="k">อ้างอิงการชำระ</span> <b>${esc(i.paymentReference)}</b></div>`:""}
        </div>
      </div>
      <table><thead><tr><th>รายการ</th><th class="num">จำนวนเงิน (บาท)</th></tr></thead>
        <tbody><tr><td>${esc(i.description||"-")}</td><td class="num">${money(i.subtotal)}</td></tr></tbody></table>
      <div class="totals">
        <div><span>ยอดก่อนภาษี</span><span>${money(i.subtotal)}</span></div>
        <div><span>ภาษีมูลค่าเพิ่ม ${esc(issuer.vatRate)}%</span><span>${money(i.vat)}</span></div>
        <div class="grand"><span>ยอดรวมทั้งสิ้น</span><span>฿${money(i.total)}</span></div>
      </div>
      <div class="foot">
        <div>หมายเหตุ: ${esc(issuer.footer)}</div>
        <div class="sign"><div class="line">ผู้มีอำนาจลงนาม<br>${esc(issuer.name)}</div></div>
      </div>
    </div></body></html>`;
  const w=window.open("","_blank");
  if(!w){ toast("เบราว์เซอร์บล็อก popup — อนุญาตแล้วลองใหม่","bad"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}


async function printPayslip(l, period, isInternal=false, issuerSnapshot=null){
  if(!l){ toast("ไม่พบข้อมูลพนักงาน","bad"); return; }
  // Payroll preview may be opened directly after login, before the people
  // cache is warm. Load the register once so the document has a real name.
  if(!state.empById[l.employeeId]){ try{ await loadEmployees(true); }catch(_){} }
  const money=(n)=>Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2});
  const hrs=(m)=>{ m=Number(m||0); return (Math.floor(m/60))+" ชม. "+(m%60)+" นาที"; };
  const dateTh=(iso)=>{ if(!iso) return "—"; const d=new Date(iso.length<=10?iso+"T00:00:00+07:00":iso); return isNaN(d)?esc(iso):d.toLocaleDateString("th-TH",{dateStyle:"long"}); };
  const today=new Date().toLocaleDateString("th-TH",{dateStyle:"long"});
  let invoiceSettings=issuerSnapshot||{};
  if(!issuerSnapshot) try{ invoiceSettings=(await api("admin_get_invoice_settings")).settings||{}; }catch(_){}
  const issuer=invoiceIssuer(invoiceSettings);
  const documentTitle=isInternal?"ใบแสดงรายละเอียดค่าจ้าง":"ใบแสดงรายละเอียดการจ่ายค่าจ้าง";
  const documentSub="PAYROLL STATEMENT";
  const periodText=(period&&period.start)?(dateTh(period.start)+" – "+dateTh(period.end)):(period&&period.label?esc(period.label):"—");
  // Payroll lines carry the immutable rate data, while the employee register is
  // the source of the display name. Never let an internal BVN code take the
  // place of the employee's name on a document sent to that employee.
  const payloadName=(l.employeeName||l.name)&&String(l.employeeName||l.name)!==String(l.employeeId)?(l.employeeName||l.name):"";
  const employeeName=String(state.empById[l.employeeId]?.name||payloadName||"ไม่พบชื่อพนักงาน").trim();
  const gross=Number(l.grossPay||0), adv=Number(l.advanceDeduction||0), sso=Number(l.sso||0), other=Number(l.otherDeduction||0), lateAbsenceDeduction=Number(l.lateAbsenceDeduction||0);
  const net=l.netPay!=null?Number(l.netPay):Math.max(0,gross-adv-sso-other);
  const html=`<!doctype html><html lang="th"><head><meta charset="utf-8">
    <title>${documentTitle} ${esc(employeeName)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:"Sarabun","TH Sarabun New","Tahoma",sans-serif;color:#152235;margin:0;padding:24px;background:#eef1f5}
      .sheet{max-width:720px;min-height:960px;margin:0 auto;background:#fff;padding:44px 48px;box-shadow:0 3px 14px rgba(21,44,71,.12)}
      .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #173a63;padding-bottom:20px}.issuer-brand{display:flex;align-items:flex-start;gap:16px;min-width:0}.issuer-logo{width:76px;height:76px;object-fit:contain;flex:none}
      .co-name{font-size:20px;font-weight:700;line-height:1.25;color:#173a63;margin:0}.co-en{font-size:12px;color:#42546a;margin:2px 0 8px}.co-line{font-size:12px;color:#42546a;line-height:1.55}
      .doc-title{min-width:220px;text-align:right;padding-top:2px}.doc-title h1{font-size:25px;line-height:1.18;margin:0;color:#14263d;font-weight:700}.doc-title .sub{font-size:11px;letter-spacing:.7px;color:#5c7088;margin-top:4px}.document-id{font-size:10px;color:#6a7c91;margin-top:9px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px;padding:14px 0;border-bottom:1px solid #dbe3ec;font-size:13px;line-height:1.7}.meta .k{display:inline-block;min-width:50px;color:#6a7c91}.meta strong{font-weight:700;color:#14263d}
      .paysum{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #dbe3ec;border-radius:8px;overflow:hidden;margin:16px 0 2px}.paysum>div{padding:10px 12px;border-right:1px solid #e7edf3;text-align:center}.paysum>div:last-child{border-right:0}.paysum span{display:block;font-size:10px;color:#6a7c91}.paysum b{display:block;font-size:16px;margin-top:3px;color:#14263d;font-variant-numeric:tabular-nums}
      table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}th{background:#173a63;color:#fff;text-align:left;padding:10px 12px;font-weight:600}th.num,td.num{text-align:right}td{padding:10px 12px;border-bottom:1px solid #dbe3ec}td.num{font-variant-numeric:tabular-nums}
      .totals{margin-top:18px;margin-left:auto;width:330px;font-size:14px}.totals div{display:flex;justify-content:space-between;gap:20px;padding:7px 4px}.totals .ded{color:#42546a}.totals .grand{border-top:2px solid #173a63;margin-top:5px;padding:12px 4px 4px;font-size:21px;font-weight:700;color:#173a63}.totals .grand span:last-child{font-variant-numeric:tabular-nums}
      .note{margin-top:22px;padding:10px 12px;border-left:3px solid #173a63;background:#f4f7fa;font-size:11px;line-height:1.55;color:#51657b}.foot{margin-top:54px;display:flex;justify-content:space-between;align-items:flex-end;font-size:13px;color:#42546a}.recipient{padding-bottom:6px}.sign{text-align:center;width:220px;color:#42546a}.sign .line{margin-top:54px;border-top:1px dotted #78899b;padding-top:7px;line-height:1.45}
      .toolbar{max-width:720px;margin:0 auto 14px;text-align:right}.pbtn{font:inherit;font-size:14px;padding:9px 18px;border:0;border-radius:8px;background:#173a63;color:#fff;cursor:pointer}
      @page{size:A4;margin:12mm}@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:none;min-height:0;padding:0}.toolbar{display:none}}
    </style></head><body>
    <div class="toolbar"><button class="pbtn" onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
    <div class="sheet">
      <div class="top">
        <div class="issuer-brand">${printLogoMarkup(issuer)}<div>
          <p class="co-name">${esc(issuer.name)}</p>
          ${issuer.nameEn?`<p class="co-en">${esc(issuer.nameEn)}</p>`:""}
          <div class="co-line">${esc(issuer.address)}</div>
          <div class="co-line">เลขประจำตัวผู้เสียภาษี ${esc(issuer.taxId)}</div>
        </div></div>
        <div class="doc-title"><h1>${documentTitle}</h1><div class="sub">${documentSub}</div><div class="document-id">เลขที่เอกสาร PAY-${esc(l.employeeId)}-${esc(String(period?.start||"").replaceAll("-",""))}</div></div>
      </div>
      <div class="meta">
        <div><div><span class="k">พนักงาน</span> <strong>${esc(employeeName)}</strong></div><div><span class="k">รหัส</span> ${esc(l.employeeId)}${l.role?" · "+esc(l.role):""}</div></div>
        <div style="text-align:right"><div><span class="k">งวดค่าจ้าง</span> <strong>${periodText}</strong></div><div><span class="k">${isInternal?"จัดทำเมื่อ":"วันที่จ่าย"}</span> ${isInternal?today:dateTh(period.paidAt||period.lockedAt)}</div></div>
      </div>
      <div class="paysum"><div><span>วันทำงาน</span><b>${fmtInt(l.workDays)} วัน</b></div><div><span>ชั่วโมงปกติ</span><b>${hrs(l.regularMinutes)}</b></div><div><span>ล่วงเวลา (OT)</span><b>${Number(l.otMinutes||0)?hrs(l.otMinutes):"—"}</b></div></div>
      <table><thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">เงิน (บาท)</th></tr></thead>
        <tbody>
          <tr><td>ค่าแรงฐาน · ${fmtInt(l.workDays)} วัน (${hrs(l.regularMinutes)})${lateAbsenceDeduction?`<br><span style="font-size:11px;color:#51657b">รวมผลหักจากมาสายสะสม ${fmtInt(l.lateDays||0)} วัน = ขาด ${fmtInt(l.lateAbsenceDays||0)} วัน (${money(lateAbsenceDeduction)} บาท)</span>`:""}</td><td class="num">${fmtInt(l.workDays)} วัน</td><td class="num">${money(l.baseGross)}</td></tr>
          ${Number(l.otGross||0)?`<tr><td>ค่าล่วงเวลา (OT) · ${hrs(l.otMinutes)}</td><td class="num">${hrs(l.otMinutes)}</td><td class="num">${money(l.otGross)}</td></tr>`:""}
        </tbody></table>
      <div class="totals">
        <div><span>รวมรายได้ก่อนหัก</span><span>${money(gross)}</span></div>
        <div class="ded"><span>หักเงินล่วงหน้า</span><span>${adv?"-"+money(adv):money(0)}</span></div>
        <div class="ded"><span>เงินสมทบกองทุนประกันสังคม</span><span>${sso?"-"+money(sso):money(0)}</span></div>
        ${other?`<div class="ded"><span>รายการหักอื่น</span><span>-${money(other)}</span></div>`:""}
        <div class="grand"><span>เงินได้สุทธิ</span><span>฿${money(net)}</span></div>
      </div>
      <div class="note">${isInternal?"เอกสารแสดงรายละเอียดค่าจ้างตามข้อมูลที่บันทึกในระบบ ณ วันที่จัดทำ":`อ้างอิงการจ่ายเงิน: ${esc(period.paymentReference||"—")} · เอกสารฉบับนี้แสดงรายละเอียดรายได้ รายการหัก และยอดเงินสุทธิประจำงวด`}</div>
      <div class="foot">
        <div class="recipient">ลงชื่อผู้รับเงิน</div>
        <div class="sign"><div class="line">ผู้จ่ายเงิน<br>${esc(issuer.name)}</div></div>
      </div>
    </div></body></html>`;
  const w=window.open("","_blank");
  if(!w){ toast("เบราว์เซอร์บล็อก popup — อนุญาตแล้วลองใหม่","bad"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function compressInvoiceLogo(file){
  return new Promise((resolve,reject)=>{
    if(!file) return reject(new Error("ไม่พบไฟล์โลโก้"));
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type)) return reject(new Error("เลือกไฟล์ PNG, JPG หรือ WEBP เท่านั้น"));
    if(file.size>8*1024*1024) return reject(new Error("ไฟล์ต้นฉบับต้องไม่เกิน 8 MB"));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("อ่านไฟล์โลโก้ไม่สำเร็จ"));
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>reject(new Error("ไฟล์รูปภาพไม่สมบูรณ์"));
      image.onload=()=>{
        const max=640, scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const ctx=canvas.getContext("2d"); ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const imageData=canvas.toDataURL("image/jpeg",.86);
        if(imageData.length>1400000) return reject(new Error("โลโก้หลังบีบอัดยังใหญ่เกินไป กรุณาใช้รูปที่เล็กลง"));
        resolve({imageData,fileName:(file.name||"invoice-logo").replace(/\.[^.]+$/," ").trim()+".jpg"});
      };
      image.src=String(reader.result||"");
    };
    reader.readAsDataURL(file);
  });
}

async function invoiceSettingsDialog(){
  let settings;
  try{ settings=(await api("admin_get_settings")).settings||{}; }
  catch(err){ toast(err.message||"โหลดการตั้งค่าหัวบิลไม่สำเร็จ","bad"); return; }
  const issuer=invoiceIssuer(settings), body=el(`<div>
    <div class="notice blue">ข้อมูลนี้จะแสดงบน Timesheet และสลิปเงินเดือนที่ออกหลังจากบันทึก การเปลี่ยนค่าไม่แก้เอกสารเดิม</div>
    <div class="grid2">
      ${field("ชื่อบริษัท / ร้าน", `<input id="invCompany" maxlength="160" value="${esc(issuer.name)}">`).outerHTML}
      ${field("ชื่อภาษาอังกฤษ", `<input id="invCompanyEn" maxlength="160" value="${esc(issuer.nameEn)}">`).outerHTML}
    </div>
    ${field("ที่อยู่บริษัท", `<textarea id="invAddress" maxlength="500" rows="3">${esc(issuer.address)}</textarea>`).outerHTML}
    <div class="grid2">
      ${field("โทรศัพท์", `<input id="invPhone" maxlength="80" value="${esc(issuer.phone)}">`).outerHTML}
      ${field("เลขประจำตัวผู้เสียภาษี", `<input id="invTaxId" maxlength="40" value="${esc(issuer.taxId)}">`).outerHTML}
      ${field("เลขนำหน้าเอกสาร", `<input id="invPrefix" maxlength="20" value="${esc(issuer.prefix)}" placeholder="เช่น PAY">`).outerHTML}
      ${field("VAT (%)", `<input id="invVat" type="number" min="0" max="100" step="0.01" value="${esc(issuer.vatRate)}">`).outerHTML}
    </div>
    ${field("ข้อความท้ายเอกสาร", `<input id="invFooter" maxlength="300" value="${esc(issuer.footer)}">`).outerHTML}
    <div class="field"><label>โลโก้บนเอกสาร</label><input id="invLogo" type="file" accept="image/png,image/jpeg,image/webp"><div class="hint">PNG, JPG หรือ WEBP · ระบบย่อภาพก่อนอัปโหลดและเก็บใน Supabase Storage · ใช้กับ Timesheet และสลิปเงินเดือน</div><div id="invLogoPreview" style="margin-top:8px">${printLogoMarkup(issuer,"invoice-logo-preview")}</div></div>
  </div>`);
  const fileInput=$("#invLogo",body), preview=$("#invLogoPreview",body);
  fileInput.onchange=()=>{ const f=fileInput.files&&fileInput.files[0]; if(!f) return; const url=URL.createObjectURL(f); preview.innerHTML=`<img src="${esc(url)}" alt="ตัวอย่างโลโก้ใหม่" style="max-width:110px;max-height:72px;object-fit:contain;border:1px solid var(--line);border-radius:8px;padding:5px;background:#fff"> <span class="sub">จะอัปโหลดเมื่อกดบันทึก</span>`; };
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">บันทึกข้อมูลเอกสาร</button>`);
  save.onclick=()=>withBtn(save, async ()=>{
    const payload={invoice_company_name:$("#invCompany",body).value,invoice_company_name_en:$("#invCompanyEn",body).value,invoice_address:$("#invAddress",body).value,invoice_phone:$("#invPhone",body).value,invoice_tax_id:$("#invTaxId",body).value,invoice_prefix:$("#invPrefix",body).value,invoice_vat_rate:$("#invVat",body).value,invoice_footer:$("#invFooter",body).value};
    const saved=await api("admin_save_settings",{settings:payload});
    let finalSettings=saved.settings||payload;
    const file=fileInput.files&&fileInput.files[0];
    if(file){ const packed=await compressInvoiceLogo(file); const uploaded=await api("admin_upload_invoice_logo",packed); finalSettings={...finalSettings,...(uploaded.settings||{})}; }
    state.invoiceSettings=finalSettings; closeModal(); toast(file?"บันทึกข้อมูลเอกสารและอัปโหลดโลโก้แล้ว":"บันทึกข้อมูลเอกสารแล้ว","good"); renderSettings();
  });
  openModal("บริษัทและโลโก้เอกสาร",body,[cancel,save]);
}

async function newInvoiceDialog(){
  if(!Object.keys(state.invoiceSettings||{}).length){
    try{ state.invoiceSettings=(await api("admin_get_invoice_settings")).settings||{}; }catch(_){ /* Server remains source of truth on create. */ }
  }
  const issuer=invoiceIssuer(state.invoiceSettings), vatRate=Math.max(0,Number(issuer.vatRate||0))/100;
  const body=el(`<div></div>`);
  body.append(
    field("ลูกค้า", `<input id="iCust" type="text" required>`),
    field("รายละเอียด", `<textarea id="iDesc" rows="2"></textarea>`),
  );
  const g=el(`<div class="grid2"></div>`);
  g.append(
    field("ยอดก่อน VAT (บาท)", `<input id="iSub" type="number" min="0" step="0.01">`),
    field("ครบกำหนด", `<input id="iDue" type="date" value="${todayISO()}">`),
  );
  body.append(g);
  const vatLine=el(`<div class="notice blue" style="margin-top:4px">VAT ${esc(issuer.vatRate)}% และยอดรวมจะคำนวณโดยเซิร์ฟเวอร์</div>`);
  body.append(vatLine);
  const sub=g.querySelector("#iSub");
  sub.oninput=()=>{ const s=parseFloat(sub.value)||0; vatLine.innerHTML=`VAT ${esc(issuer.vatRate)}% = <b>${fmtBaht(s*vatRate)}</b> · ยอดรวม = <b>${fmtBaht(s*(1+vatRate))}</b>`; };
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">สร้างใบแจ้งหนี้</button>`);
  save.onclick=()=>withBtn(save, async ()=>{
    const customer=$("#iCust").value.trim(), description=$("#iDesc").value.trim(), subtotal=parseFloat($("#iSub").value), dueDate=$("#iDue").value;
    if(!customer||!description||!(subtotal>=0)||!dueDate){ toast("กรอกข้อมูลให้ครบ","bad"); return; }
    try{ await api("admin_create_invoice",{customer, description, subtotal, dueDate});
      closeModal(); renderInvoices(); toast("สร้างใบแจ้งหนี้แล้ว (สถานะ: ร่าง)","good");
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal("สร้างใบแจ้งหนี้ใหม่", body, [cancel, save]);
}

async function invStatus(btn, invoiceNo, status){
  const verb={issued:"ออกบิล","void":"ยกเลิก"}[status];
  if(status==="void" && !await confirmDialog("ยกเลิกใบแจ้งหนี้",`ยกเลิก <b>${esc(invoiceNo)}</b>?`,{danger:true,okText:"ยกเลิกบิล"})) return;
  await withBtn(btn, async ()=>{
    try{ await api("admin_update_invoice_status",{invoiceNo, status}); toast(verb+"แล้ว","good"); renderInvoices(); }
    catch(err){ toast(err.message,"bad"); }
  });
}
function payInvoice(invoiceNo){
  const body=el(`<div></div>`);
  body.append(field("เลขอ้างอิงการชำระ (payment reference)", `<input id="payRef" type="text" placeholder="เช่น เลขสลิป / เลขโอน" required>`,
    "จำเป็นต้องมีเมื่อเปลี่ยนสถานะเป็น “ชำระแล้ว”"));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const ok=el(`<button class="btn ok">บันทึกชำระ</button>`);
  ok.onclick=()=>withBtn(ok, async ()=>{
    const paymentReference=$("#payRef").value.trim();
    if(!paymentReference){ toast("กรอกเลขอ้างอิงก่อน","bad"); return; }
    try{ await api("admin_update_invoice_status",{invoiceNo, status:"paid", paymentReference});
      closeModal(); renderInvoices(); toast("บันทึกการชำระแล้ว","good");
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal("บันทึกการชำระ "+invoiceNo, body, [cancel, ok]);
}

async function voidAttendanceDay(d, reload, btn){
  if(!d) return;
  if(!await confirmDialog("ยกเลิกบันทึกเวลา",
    `ยกเลิก (void) บันทึกเวลาของ <b>${esc(d.name)}</b> วันที่ <b>${fmtDate(d.date)}</b>?<br>วันนี้จะไม่ถูกนับในเงินเดือน แต่ยัง<b>เก็บไว้ใน Sheet เพื่อ audit</b> (ไม่ลบจริง)`,
    {danger:true, okText:"ยกเลิกวันนี้"})) return;
  await withBtn(btn, async()=>{
    try{ const r=await api("admin_void_attendance_day",{employeeId:d.employeeId, date:d.date, reviewer:state.reviewer||"Admin"});
      toast("ยกเลิกแล้ว ("+(r.voided||0)+" รายการ)","good"); if(reload) reload();
    }catch(err){ toast(err.message,"bad"); }
  });
}

/* =================================================================
   AUDIT LOG
   ================================================================= */
const AUDIT_LABEL={
  advance_approved:"อนุมัติเบิกเงิน",advance_rejected:"ปฏิเสธเบิกเงิน",advance_paid:"จ่ายเงินเบิก",
  leave_approved:"อนุมัติลา",leave_rejected:"ปฏิเสธลา",time_request_approved:"อนุมัติ OT/เวลา",time_request_rejected:"ปฏิเสธ OT/เวลา",
  overtime_added:"บันทึก OT",payroll_locked:"ล็อกงวดเงินเดือน",attendance_voided:"ยกเลิกบันทึกเวลา",
  attendance_manual_check_in:"ลงเวลาเข้าแทน",attendance_manual_check_out:"ลงเวลาออกแทน",
  password_reset:"รีเซ็ตรหัสผ่าน",pay_rule_saved:"ตั้งเรตค่าจ้าง",settings_saved:"แก้ตั้งค่า",
  admin_user_saved:"บันทึกบัญชีแอดมิน",admin_user_deleted:"ลบบัญชีแอดมิน"};
async function renderAudit(){
  const node=$("#page-audit"); skeleton(node);
  try{
    const data=await api("admin_list_audit_log");
    const entries=data.entries||[];
    node.innerHTML=`
      ${groupTabsHtml("audit")}
      <div class="notice blue">บันทึกการกระทำสำคัญทั้งหมด (เก็บถาวรใน Sheet) — ใช้ตรวจสอบย้อนหลังว่าใครทำอะไร</div>
      <div class="panel"><div class="head"><h2>ประวัติการใช้งาน</h2><span class="sub" id="auditCount" style="margin-left:8px">${fmtInt(entries.length)} รายการล่าสุด</span><div class="spacer"></div>
        <input type="search" id="auditSearch" placeholder="ค้นหา ผู้ทำ / การกระทำ / เป้าหมาย" style="width:240px;border:1px solid var(--line);border-radius:9px;padding:9px 11px;background:var(--card);color:var(--ink)"></div>
        <div class="body" style="padding:12px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line)">
          <div class="subtabs" id="auditFilters" style="flex-wrap:wrap"></div>
          <div class="spacer"></div>
          <label class="sub" style="display:flex;gap:6px;align-items:center">ตั้งแต่ <input type="date" id="auditFrom" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--card);color:var(--ink)"></label>
          <label class="sub" style="display:flex;gap:6px;align-items:center">ถึง <input type="date" id="auditTo" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--card);color:var(--ink)"></label>
          <button class="btn ghost" id="auditClear" type="button">ล้างตัวกรอง</button>
        </div>
        <div class="body flush"><table id="auditTable">
          <thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>เป้าหมาย</th><th>รายละเอียด</th></tr></thead>
          <tbody id="auditRows"></tbody></table></div>
      </div>`;
    const actionCounts={};
    entries.forEach(e=>{ actionCounts[e.action]=(actionCounts[e.action]||0)+1; });
    const actions=Object.keys(actionCounts).sort((a,b)=>actionCounts[b]-actionCounts[a]);
    let actFilter="";
    $("#auditFilters").innerHTML=`<button class="active" data-act="">ทั้งหมด</button>`+
      actions.map(a=>`<button data-act="${esc(a)}">${esc(AUDIT_LABEL[a]||a)} <span class="sub">${actionCounts[a]}</span></button>`).join("");
    const draw=()=>{
      const q=($("#auditSearch").value||"").trim().toLowerCase();
      const from=$("#auditFrom").value, to=$("#auditTo").value;
      const fromT=from?new Date(from+"T00:00:00").getTime():null;
      const toT=to?new Date(to+"T23:59:59").getTime():null;
      const list=entries.filter(e=>{
        if(actFilter && e.action!==actFilter) return false;
        if(q && !(e.actor+e.action+(AUDIT_LABEL[e.action]||"")+e.target+e.detail).toLowerCase().includes(q)) return false;
        if(fromT||toT){ const t=new Date(e.at).getTime(); if(isNaN(t)) return false; if(fromT&&t<fromT) return false; if(toT&&t>toT) return false; }
        return true;
      });
      $("#auditCount").textContent=`${fmtInt(list.length)} / ${fmtInt(entries.length)} รายการ`;
      const tb=$("#auditRows");
      tb.innerHTML=list.length? list.map(e=>`<tr>
        <td class="sub" style="white-space:nowrap">${fmtDateTime(e.at)}</td>
        <td class="person">${esc(e.actor)}</td>
        <td><span class="badge grey">${esc(AUDIT_LABEL[e.action]||e.action)}</span></td>
        <td>${esc(e.target||"—")}</td><td class="sub">${esc(e.detail||"—")}</td></tr>`).join("")
        : `<tr><td colspan="5"><div class="empty">ไม่พบรายการ</div></td></tr>`;
      attachSort($("#auditTable"));
    };
    draw();
    $("#auditSearch").oninput=draw;
    $("#auditFrom").onchange=draw;
    $("#auditTo").onchange=draw;
    $("#auditFilters").onclick=ev=>{ const b=ev.target.closest("button[data-act]"); if(!b) return;
      actFilter=b.dataset.act; $("#auditFilters").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b)); draw(); };
    $("#auditClear").onclick=()=>{ actFilter=""; $("#auditSearch").value=""; $("#auditFrom").value=""; $("#auditTo").value="";
      $("#auditFilters").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x.dataset.act==="")); draw(); };
  }catch(err){ errorBox(node, err, renderAudit); }
}

/* =================================================================
   SETTINGS (connection + admin accounts)
   ================================================================= */
async function renderSettings(){
  const node=$("#page-settings");
  setRouteShell(node,"settings");
  node.innerHTML=`
    ${groupTabsHtml("settings")}
    <div class="settings-workspace">
    <div class="directory-page-head bvn-page-head"><div><div class="route-eyebrow">การควบคุมระบบ</div><h2>ตั้งค่าบริษัทและการดูแลข้อมูล</h2><p>แก้เฉพาะกติกาที่มีผลกับการเช็กอิน ค่าจ้าง และเอกสารทั้งระบบ</p></div><div class="directory-count">ระดับสิทธิ์<br><b>${esc(ROLE_LABEL[state.role]||"ผู้ดูแล")}</b></div></div>
    <div class="setting-group-label">ข้อมูลเอกสาร</div>
    <div class="panel"><div class="head"><h2>บริษัทและโลโก้เอกสาร</h2><span class="sub" style="margin-left:8px">ใช้กับ Timesheet และสลิปเงินเดือน</span><div class="spacer"></div><button class="btn" id="editDocumentIdentity">แก้ไขข้อมูลเอกสาร</button></div><div class="body"><p class="sub" style="margin:0">ตั้งชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี ผู้ลงนาม และโลโก้ที่ปรากฏบนเอกสารพนักงาน</p></div></div>
    <div class="setting-group-label">นโยบายบริษัท</div>
    <div class="panel"><div class="head"><h2>เงินสมทบกองทุนประกันสังคม</h2><span class="sub" style="margin-left:8px">นโยบายเดียว ใช้กับสลิปของพนักงานทุกคน</span>
      <div class="spacer"></div><button class="btn" id="editSocialSecurity">ตั้งค่าประกันสังคม</button></div>
      <div class="body" id="socialSecuritySummary"><div class="empty">กำลังโหลดนโยบายประกันสังคม…</div></div>
    </div>
    <div class="panel"><div class="head"><h2>กะงานและกติกาลงเวลา</h2><span class="sub" style="margin-left:8px">เวลาเข้า–ออก · สาย · พัก · OT · วันทำงาน</span>
      <div class="spacer"></div><button class="btn" id="editWorkRules">แก้ไขเวลาทำงาน</button></div>
      <div class="body" id="workRulesSummary"><div class="empty">กำลังโหลดการตั้งค่าเวลาทำงาน…</div></div>
    </div>
    <div class="panel"><div class="head"><h2>บัญชีผู้ดูแลระบบ</h2><span class="sub" style="margin-left:8px">โหมดใช้งานง่าย: รหัสผ่านแสดงใน Google Sheet และตารางนี้</span>
      <div class="spacer"></div><button class="btn ok sm" id="addAdmin">เพิ่มบัญชี</button></div>
      <div class="body flush"><table>
        <thead><tr><th>ชื่อผู้ใช้</th><th>รหัสผ่าน</th><th>ชื่อแสดง</th><th>สิทธิ์</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
        <tbody id="adminRows"><tr><td colspan="6"><div class="empty">กำลังโหลด…</div></td></tr></tbody>
      </table></div>
    </div>
    <div class="panel"><div class="head"><h2>วันหยุดบริษัท</h2><span class="sub" style="margin-left:8px">เติมวันหยุดมาตรฐานอัตโนมัติ · เพิ่มวันพิเศษได้</span>
      <div class="spacer"></div><button class="btn sub sm" id="importHoliday">เติมปีปัจจุบัน</button><button class="btn ok sm" id="addHoliday">เพิ่มวันพิเศษ</button></div>
      <div class="body flush"><table id="holTable"><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th data-nosort></th></tr></thead>
      <tbody id="holRows"><tr><td colspan="3"><div class="empty">กำลังโหลด…</div></td></tr></tbody></table></div>
    </div>
    <div class="setting-group-label">ระบบและการเผยแพร่</div>
    <div class="panel"><div class="head"><h2>เวอร์ชันแอปพนักงาน</h2><span class="sub" style="margin-left:8px">ปล่อยอัปเดต APK ให้พนักงาน (ไฟล์อยู่บน Google Drive)</span></div>
      <div class="body">
        <div class="grid2">
          <div class="field"><label>เลขเวอร์ชัน (version code)</label><input id="appVC" type="number" min="0" step="1"></div>
          <div class="field"><label>ชื่อเวอร์ชัน</label><input id="appVN" type="text" placeholder="1.0.1"></div>
        </div>
        <div class="field"><label>ลิงก์ดาวน์โหลด APK (Drive)</label><input id="appUrl" type="url" placeholder="https://drive.google.com/uc?export=download&confirm=t&id=..."></div>
        <div class="field"><label>หมายเหตุอัปเดต</label><input id="appNotes" type="text" placeholder="เช่น ยืนยันข้อมูลพนักงาน ตรวจ Timesheet และออกสลิป"></div>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="appMand"> บังคับอัปเดตก่อนใช้งาน</label>
        <div class="notice blue" id="beVer" style="margin-top:12px">กำลังตรวจเวอร์ชันหลังบ้าน…</div>
        <div class="notice" id="appPolicyHint" style="margin-top:8px">ตรวจนโยบายเวอร์ชันแอป…</div>
        <div class="toolbar"><button class="btn sub sm" id="useAppNotesTemplate">ใช้ข้อความแนะนำ</button><button class="btn" id="saveAppVer">บันทึกเวอร์ชันแอป</button></div>
      </div>
    </div>
    <div class="panel"><div class="head"><h2>สำรองข้อมูล</h2><span class="sub" style="margin-left:8px">ดึงข้อมูลออกเก็บเอง — ข้อมูลเป็นของคุณ ไม่ถูกจับเป็นตัวประกัน</span></div>
      <div class="body">
        <p class="sub" style="margin:0 0 12px">ดาวน์โหลดข้อมูลตั้งค่า + รายชื่อพนักงาน + ค่าจ้าง + จุดเช็กอิน + วันหยุด + รายการงวดเงินเดือน เป็นไฟล์ JSON เดียว (เก็บไว้สำรอง หรือย้ายระบบในอนาคต) สำหรับเวลาเข้า-ออกให้ใช้ปุ่มส่งออก CSV ในหน้าเวลาทำงาน</p>
        <div class="toolbar"><button class="btn" id="backupBtn">ดาวน์โหลดไฟล์สำรอง (JSON)</button></div>
      </div>
    </div>
    <div class="setting-group-label">คำสั่งที่ย้อนกลับไม่ได้</div>
    <div class="panel" style="border-color:#fecaca"><div class="head"><h2>เก็บเวลาเช็กอิน/เอาต์ 6 เดือน</h2><span class="sub" style="margin-left:8px">Archive ลงเครื่องก่อนล้างข้อมูลเก่า (การล้างย้อนกลับไม่ได้)</span>
      <div class="spacer"></div><button class="btn sub sm" id="readAttendanceArchive">อ่านไฟล์ Archive</button><button class="btn sm" id="createAttendanceArchive">สร้าง Archive</button></div>
      <div class="body"><p class="sub" style="margin:0">ฐานข้อมูลเก็บเวลาเข้า–ออกย้อนหลัง 6 เดือนเท่านั้น ข้อมูลที่เก่ากว่านั้นต้องดาวน์โหลดเป็นไฟล์ JSON ลงเครื่องและเลือกไฟล์กลับมาเพื่อตรวจสอบก่อนระบบอนุญาตให้ล้าง</p>
      <input id="verifyAttendanceArchiveFile" type="file" accept="application/json,.json" style="display:none"><div class="notice blue" id="attendanceArchiveStatus" style="margin-top:12px">ยังไม่ได้สร้าง Archive ในรอบนี้</div><div class="toolbar" style="margin-top:12px"><button class="btn danger sm" id="purgeOldAttendance" disabled>ล้างเวลาเกิน 6 เดือน</button></div></div>
    </div>
    <div class="panel" style="border-color:#fecaca"><div class="head"><h2 style="color:#b91c1c">เริ่มเก็บข้อมูลใหม่</h2><span class="sub" style="margin-left:8px">ล้างเฉพาะข้อมูลปฏิบัติการแบบถาวร</span>
      <div class="spacer"></div><button class="btn danger sm" id="factoryResetBtn">ล้างข้อมูล</button></div>
      <div class="body"><p class="sub" style="margin:0">ลบพนักงาน, ไซต์, เวลาเข้าออก, คำขอ, เงินล่วงหน้า, งวดเงินเดือน, ใบแจ้งหนี้, วันหยุด, token พนักงาน และบันทึกการใช้งานทั้งหมด แต่เก็บบัญชี Admin และข้อมูลบริษัท/หัวบิลไว้</p>
      <div class="notice" style="margin-top:12px;border-color:#fecaca;background:#fff7f7;color:#991b1b">คำสั่งนี้ย้อนกลับไม่ได้ ต้องสำรอง JSON ก่อน และยืนยันรหัสผ่าน Owner สองรอบภายใน 10 นาที</div></div>
    </div>
    <details class="panel advanced-settings"><summary><span><b>การเชื่อมต่อขั้นสูง</b><small>สำหรับผู้ดูแลระบบเมื่อเปลี่ยน endpoint/หลังบ้าน</small></span><span aria-hidden="true">⌄</span></summary>
      <div class="body">
        <div class="field"><label>Endpoint (/exec หรือ Supabase function)</label><input id="setEndpoint" type="url" value="${esc(state.endpoint||"")}"></div>
        <div class="field"><label>Supabase apikey (publishable key)</label><input id="setApikey" type="text" value="${esc(state.apikey||"")}" placeholder="sb_publishable_... (เว้นว่างถ้าใช้ Apps Script)"></div>
        <div class="notice blue">ค่าเชื่อมต่อนี้บันทึกในเครื่องนี้เท่านั้น · apikey จำเป็นเฉพาะ endpoint แบบ Supabase (public key ไม่ลับ)</div>
        <div class="toolbar"><button class="btn" id="saveEndpoint">บันทึก Endpoint</button></div>
      </div>
    </details></div>`;
  $("#setEndpoint").value = state.endpoint || LS.getItem("bvn_endpoint") || DEFAULT_ENDPOINT;
  $("#saveEndpoint").onclick=(e)=>{ const v=$("#setEndpoint").value.trim(); if(!v){ toast("กรอก endpoint","bad"); return; }
    const k=(($("#setApikey")&&$("#setApikey").value)||"").trim();
    state.endpoint=v; state.apikey=k; LS.setItem("bvn_endpoint", v); LS.setItem("bvn_apikey", k); clearApiReadCache(); syncBackendBadge(); toast("บันทึกการเชื่อมต่อแล้ว","good"); };
  $("#addAdmin").onclick=()=>adminUserDialog(null);
  $("#editDocumentIdentity").onclick=()=>invoiceSettingsDialog();
  $("#editWorkRules").onclick=async()=>{
    try{ const d=await api("admin_get_settings"); workScheduleDialog(d.settings||{}); }
    catch(err){ toast(err.message,"bad"); }
  };
  $("#editSocialSecurity").onclick=async()=>{
    try{ const d=await api("admin_get_settings"); socialSecurityDialog(d.settings||{}); }
    catch(err){ toast(err.message,"bad"); }
  };
  $("#addHoliday").onclick=()=>holidayDialog();
  $("#importHoliday").onclick=(e)=>importHolidays(e.target);
  $("#backupBtn").onclick=(e)=>withBtn(e.target, exportFullBackup);
  $("#createAttendanceArchive").onclick=(e)=>createAttendanceArchive(e.target);
  $("#readAttendanceArchive").onclick=()=>openAttendanceArchiveReader();
  $("#verifyAttendanceArchiveFile").onchange=(e)=>verifyAttendanceArchiveFile(e.target.files&&e.target.files[0]);
  $("#purgeOldAttendance").onclick=()=>purgeOldAttendanceDialog();
  $("#factoryResetBtn").onclick=()=>factoryResetDialog();
  $("#useAppNotesTemplate").onclick=()=>{ $("#appNotes").value="ยืนยันข้อมูลพนักงาน ตรวจ Timesheet และออกสลิปเงินเดือน"; toast("ใส่ข้อความแนะนำแล้ว · ตรวจและบันทึกได้เลย","good"); };
  $("#saveAppVer").onclick=async(e)=>{ await withBtn(e.target, async()=>{
    try{
      await api("admin_save_settings",{settings:{
        app_version_code:$("#appVC").value||"0", app_version_name:$("#appVN").value.trim(),
        app_apk_url:$("#appUrl").value.trim(), app_update_notes:$("#appNotes").value.trim(),
        app_update_mandatory:$("#appMand").checked}});
      toast("บันทึกเวอร์ชันแอปแล้ว · พนักงานจะได้รับแจ้งเตือนเมื่อเปิดแอป","good");
    }catch(err){ toast(err.message,"bad"); }
  }); };
  loadSocialSecuritySummary(); loadWorkRulesSummary(); loadAdminUsers(); loadHolidays(); loadAppVersion();
}

function socialSecurityDialog(s){
  const enabled=String(s.sso_enabled).toLowerCase()==="true";
  const body=el(`<div><div class="notice blue"><div><b>ใช้กับสลิปทุกคนในทุกงวด</b><br><span class="sub">ระบบคำนวณจากรายได้ก่อนหักตามอัตราและเพดานที่กำหนด ไม่สามารถเปลี่ยนแยกรายสลิปได้</span></div></div><label class="check" style="margin:14px 0"><input type="checkbox" id="policySso" ${enabled?"checked":""}> หักเงินสมทบกองทุนประกันสังคม</label><div class="grid2"><div class="field"><label>อัตราเงินสมทบ (%)</label><input id="policySsoRate" type="number" min="0" max="100" step="0.5" value="${esc(s.sso_rate||"5")}"></div><div class="field"><label>เพดานเงินสมทบต่อเดือน (บาท)</label><input id="policySsoCap" type="number" min="0" step="1" value="${esc(s.sso_cap||"750")}"></div></div></div>`);
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const save=el(`<button class="btn">บันทึกนโยบาย</button>`);
  save.onclick=()=>withBtn(save,async()=>{try{await api("admin_save_settings",{settings:{sso_enabled:$("#policySso").checked,sso_rate:$("#policySsoRate").value,sso_cap:$("#policySsoCap").value}}); clearApiReadCache(); closeModal(); toast("บันทึกนโยบายประกันสังคมแล้ว","good"); loadSocialSecuritySummary();}catch(err){toast(err.message,"bad");}});
  openModal("ตั้งค่าประกันสังคม",body,[cancel,save]);
}

async function loadSocialSecuritySummary(){
  const box=$("#socialSecuritySummary"); if(!box) return;
  try{const s=(await api("admin_get_settings")).settings||{}, enabled=String(s.sso_enabled).toLowerCase()==="true";
    box.innerHTML=`<div class="grid3"><div class="metric"><span>สถานะ</span><b>${enabled?"หักอัตโนมัติ":"ไม่หัก"}</b><small>ใช้กับสลิปทุกคน</small></div><div class="metric"><span>อัตราเงินสมทบ</span><b>${esc(s.sso_rate||"5")}%</b><small>คิดจากรายได้ก่อนหัก</small></div><div class="metric"><span>เพดานต่อเดือน</span><b>${fmtBaht(Number(s.sso_cap||750))}</b><small>สูงสุดต่อพนักงาน</small></div></div>`;
  }catch(err){box.innerHTML=`<div class="empty">${esc(err.message)}</div>`;}
}

async function loadAppVersion(){
  try{
    const d=await api("admin_get_settings"); const s=d.settings||{};
    if($("#appVC")) $("#appVC").value=s.app_version_code||"";
    if($("#appVN")) $("#appVN").value=s.app_version_name||"";
    if($("#appUrl")) $("#appUrl").value=s.app_apk_url||"";
    if($("#appNotes")) $("#appNotes").value=s.app_update_notes||"";
    if($("#appMand")) $("#appMand").checked=String(s.app_update_mandatory)==="true";
  }catch(_){}
  try{
    const v=await api("version"); const be=$("#beVer"); if(!be) return;
    be.textContent="เวอร์ชันหลังบ้านที่ deploy อยู่: "+(v.backendVersion||"ไม่ทราบ")+" · เวอร์ชันแอปล่าสุดที่ตั้งไว้: "+(v.appVersionName||v.appVersionCode||"ยังไม่ตั้ง");
    const hint=$("#appPolicyHint"); if(hint){ const oldCopy=/แก้เวลา/.test(String(s.app_update_notes||"")); const correctionOff=v.capabilities&&v.capabilities.attendanceCorrection===false; hint.className="notice "+(oldCopy?"":"blue"); hint.textContent=oldCopy?"หมายเหตุอัปเดตปัจจุบันกล่าวถึง ‘แก้เวลา’ แต่ระบบไม่เปิดใช้งานการขอแก้เวลา · ใช้ข้อความแนะนำแล้วบันทึกเพื่อแก้ไข":"นโยบายปัจจุบัน: พนักงานไม่ส่งคำขอแก้เวลา · ตรวจ Timesheet และออกสลิปจากหลังบ้าน"; if(!correctionOff) hint.textContent="ตรวจ capability หลังบ้านไม่ได้ครบ · ตรวจสอบ revision ก่อนประกาศอัปเดต"; }
  }catch(_){ const be=$("#beVer"),hint=$("#appPolicyHint"); if(be){ be.textContent="ตรวจเวอร์ชันหลังบ้านไม่ได้ (ต้อง deploy swift-handler ที่มี action version ก่อน)"; } if(hint) hint.textContent="ยังตรวจนโยบายเวอร์ชันแอปไม่ได้"; }
}

async function loadWorkRulesSummary(){
  const box=$("#workRulesSummary"); if(!box) return;
  try{
    const s=(await api("admin_get_settings")).settings||{};
    const labels=[["1","จ."],["2","อ."],["3","พ."],["4","พฤ."],["5","ศ."],["6","ส."],["0","อา."]];
    const active=new Set(String(s.workdays||"1,2,3,4,5").split(","));
    const days=labels.filter(([id])=>active.has(id)).map(([,label])=>label).join(" ")||"ยังไม่ได้เลือก";
    box.innerHTML=`<div class="grid4">
      <div class="metric"><span>เวลาเข้างาน</span><b>${esc(normaliseTime(s.shift_start,"09:00"))}</b><small>ผ่อนผัน ${esc(s.shift_grace_min||"5")} นาที</small></div>
      <div class="metric"><span>เวลาเลิกงาน</span><b>${esc(normaliseTime(s.shift_end,"18:00"))}</b><small>พัก ${esc(s.lunch_break_min||"60")} นาที</small></div>
      <div class="metric"><span>เริ่ม OT</span><b>เกิน ${esc(s.ot_threshold_hours||"8")} ชม.</b><small>${String(s.holiday_ot_enabled).toLowerCase()==="true"?"วันหยุดคิดเป็น OT":"วันหยุดไม่คิด OT อัตโนมัติ"}</small></div>
      <div class="metric"><span>วันทำงาน</span><b>${days}</b><small>ใช้กับปฏิทินและเงินเดือน</small></div>
    </div>`;
  }catch(err){ box.innerHTML=`<div class="empty">${esc(err.message)}</div>`; }
}
async function importHolidays(btn){
  const yNow=new Date().getFullYear();
  const y=prompt("เติมวันหยุดมาตรฐานของบริษัท ปี (ค.ศ.):", String(yNow));
  if(!y) return;
  await withBtn(btn, async ()=>{
    try{ const r=await api("admin_import_holidays",{year:parseInt(y,10)||yNow, reviewer:state.reviewer||"Admin"});
      toast(r.message||("เพิ่ม "+(r.added||0)+" วัน"),"good"); loadHolidays();
    }catch(err){ toast(err.message,"bad"); }
  });
}
async function loadHolidays(){
  const tb=$("#holRows"); if(!tb) return;
  try{ const d=await api("admin_list_holidays"); const hs=d.holidays||[];
    tb.innerHTML=hs.length? hs.map(h=>`<tr><td style="white-space:nowrap">${fmtDate(h.date)}</td><td>${esc(h.name)}</td>
      <td><div class="row-actions"><button class="btn danger sm" data-holdel="${esc(h.date)}">ลบ</button></div></td></tr>`).join("")
      : `<tr><td colspan="3"><div class="empty">ยังไม่มีวันหยุด</div></td></tr>`;
    tb.querySelectorAll("[data-holdel]").forEach(b=>b.onclick=()=>deleteHoliday(b.dataset.holdel));
  }catch(err){ tb.innerHTML=`<tr><td colspan="3"><div class="empty">${esc(err.message)}</div></td></tr>`; }
}
function holidayDialog(){
  const body=el(`<div></div>`);
  body.append(field("วันที่", `<input id="hDate" type="date" value="${todayISO()}">`));
  body.append(field("ชื่อวันหยุด", `<input id="hName" type="text" placeholder="เช่น วันปีใหม่">`));
  const ok=el(`<button class="btn ok">บันทึก</button>`), cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  ok.onclick=()=>withBtn(ok, async ()=>{ const date=$("#hDate").value, name=$("#hName").value.trim()||"วันหยุด";
    if(!date){ toast("เลือกวันที่","bad"); return; }
    try{ await api("admin_save_holiday",{date,name,reviewer:state.reviewer||"Admin"}); closeModal(); toast("บันทึกวันหยุดแล้ว","good"); loadHolidays(); }
    catch(err){ toast(err.message,"bad"); } });
  openModal("เพิ่มวันหยุด", body, [cancel, ok]);
}
async function deleteHoliday(date){
  if(!await confirmDialog("ลบวันหยุด",`ลบวันหยุด <b>${fmtDate(date)}</b>?`,{danger:true,okText:"ลบ"})) return;
  try{ await api("admin_delete_holiday",{date,reviewer:state.reviewer||"Admin"}); toast("ลบแล้ว","good"); loadHolidays(); }
  catch(err){ toast(err.message,"bad"); }
}

async function loadAdminUsers(){
  const tb=$("#adminRows");
  try{
    const data=await api("admin_list_admin_users");
    const users=data.users||[];
    tb.innerHTML = users.length? users.map(u=>`<tr oncontextmenu="return false" data-user="${esc(u.username)}">
        <td class="person">${esc(u.username)}</td><td><code style="font-size:11px">${esc(u.password||"ต้องตั้งใหม่")}</code></td><td>${esc(u.displayName)}</td>
        <td><span class="badge grey">${esc(ROLE_LABEL[u.role]||u.role||"เจ้าของระบบ")}</span></td>
        <td>${u.active?'<span class="badge">ใช้งาน</span>':'<span class="badge red">ปิด</span>'}</td>
        <td><div class="row-actions">
          <button class="btn sub sm" data-edit>แก้ไข</button>
          <button class="btn danger sm" data-del>ลบ</button></div></td></tr>`).join("")
      : `<tr><td colspan="6"><div class="empty">ยังไม่มีบัญชี</div></td></tr>`;
    tb.querySelectorAll("tr[data-user]").forEach(tr=>{
      const u=users.find(x=>x.username===tr.dataset.user);
      tr.querySelector("[data-edit]").onclick=()=>adminUserDialog(u);
      tr.querySelector("[data-del]").onclick=()=>deleteAdminUser(u);
      attachRowMenu(tr, [
        {label:"แก้ไข", fn:()=>adminUserDialog(u)},
        {label:"ลบบัญชี", danger:true, fn:()=>deleteAdminUser(u)},
      ]);
    });
  }catch(err){ tb.innerHTML=`<tr><td colspan="6"><div class="empty">${esc(err.message)}</div></td></tr>`; }
}

function adminUserDialog(u){
  const body=el(`<div></div>`);
  body.append(field("ชื่อผู้ใช้", `<input id="auUser" type="text" value="${u?esc(u.username):""}" ${u?"readonly":""} placeholder="เช่น admin2">`));
  body.append(field("ชื่อแสดง", `<input id="auName" type="text" value="${u?esc(u.displayName):""}" placeholder="เช่น คุณวรวุฒิ">`));
  body.append(field("สิทธิ์", `<select id="auRole"><option value="owner">เจ้าของระบบ — ทุกสิทธิ์</option><option value="manager">ผู้จัดการ — งานปฏิบัติการและการเงิน</option><option value="operations">ฝ่ายปฏิบัติการ — พนักงาน อนุมัติ เบิกเงิน</option><option value="finance">ฝ่ายการเงิน — ค่าจ้าง เงินเดือน บิล</option></select>`, "ระบบหลังบ้านตรวจสิทธิ์ซ้ำ ไม่ใช่เพียงซ่อนเมนู"));
  body.append(field(u?"รหัสผ่าน":"รหัสผ่าน", `<input id="auPass" type="text" value="${esc(u?.password||"")}" autocomplete="new-password" placeholder="รหัสผ่าน">`, u?"แสดงและแก้ไขรหัสตามโหมด Google Sheet แบบบ้าน ๆ":"ตั้งรหัสผ่านที่ผู้ดูแลคนนี้ใช้เข้าสู่ระบบ"));
  if(u) body.append(el(`<label class="check" style="margin-top:6px"><input type="checkbox" id="auActive" ${u.active?"checked":""}> เปิดใช้งานบัญชีนี้</label>`));
  const ok=el(`<button class="btn ok">บันทึก</button>`);
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  ok.onclick=()=>withBtn(ok, async ()=>{
    const username=($("#auUser").value||"").trim(), displayName=($("#auName").value||"").trim(), password=$("#auPass").value, role=$("#auRole").value;
    const active=u?$("#auActive").checked:true;
    if(!username){ toast("กรอกชื่อผู้ใช้","bad"); return; }
    if(!u && !password){ toast("ตั้งรหัสผ่านให้บัญชีใหม่","bad"); return; }
    try{ await api("admin_upsert_admin_user",{username, displayName:displayName||username, password, active, role});
      const currentUser=String(state.username||"").toLowerCase()===username.toLowerCase();
      const accessChanged=currentUser && (!!password || role!==state.role || !active);
      closeModal();
      if(accessChanged){
        toast("สิทธิ์หรือรหัสผ่านของบัญชีนี้เปลี่ยนแล้ว — กรุณาเข้าสู่ระบบใหม่","good");
        setTimeout(()=>logout(),900);
        return;
      }
      toast("บันทึกบัญชีแล้ว","good"); loadAdminUsers();
    }catch(err){ toast(err.message,"bad"); }
  });
  openModal(u?"แก้ไขบัญชีแอดมิน":"เพิ่มบัญชีแอดมิน", body, [cancel, ok]);
  $("#auRole").value=u?.role||"owner";
}

async function deleteAdminUser(u){
  if(!u) return;
  if(!await confirmDialog("ลบบัญชีแอดมิน", `ลบบัญชี <b>${esc(u.username)}</b>?`, {danger:true, okText:"ลบ"})) return;
  try{ await api("admin_delete_admin_user",{username:u.username});
    if(String(state.username||"").toLowerCase()===String(u.username).toLowerCase()){
      toast("ลบบัญชีที่กำลังใช้งานแล้ว — กรุณาเข้าสู่ระบบใหม่","good"); setTimeout(()=>logout(),900); return;
    }
    toast("ลบบัญชีแล้ว","good"); loadAdminUsers(); }
  catch(err){ toast(err.message,"bad"); }
}

function factoryResetDialog(){
  const firstPassword=el(`<input id="resetPasswordOne" type="password" autocomplete="current-password" placeholder="รหัสผ่าน Owner ปัจจุบัน">`);
  const phrase=el(`<input id="resetPhraseOne" type="text" autocomplete="off" placeholder="พิมพ์ RESET BVN">`);
  const body=el(`<div>
    <div class="notice" style="border-color:#fecaca;background:#fff7f7;color:#991b1b"><b>โปรดอ่านก่อนดำเนินการ</b><br>การดำเนินการนี้ลบข้อมูลปฏิบัติการทั้งหมดและย้อนกลับไม่ได้ หากยังไม่ได้สำรองข้อมูล ให้ปิดหน้าต่างนี้และกดสำรอง JSON ก่อน</div>
    <div class="field"><label>ขอบเขตที่ล้าง</label><div class="sub">พนักงาน · จุดเช็กอิน · เวลาเข้าออก · คำขอ · เงินล่วงหน้า · เงินเดือน · ใบแจ้งหนี้ · วันหยุด · token พนักงาน · audit log</div><div class="sub" style="margin-top:4px">คงไว้: บัญชี Admin, การตั้งค่าบริษัท, หัวบิล และโลโก้</div></div>
  </div>`);
  body.append(field("รหัสผ่าน Owner",firstPassword.outerHTML));
  body.append(field("ข้อความยืนยัน",phrase.outerHTML,"พิมพ์ RESET BVN ให้ตรงทั้งหมด"));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const next=el(`<button class="btn danger">ยืนยันชั้นที่ 1</button>`);
  next.onclick=()=>withBtn(next,async()=>{
    const password=$("#resetPasswordOne",body).value, confirmation=$("#resetPhraseOne",body).value;
    try{
      const r=await api("admin_begin_factory_reset",{password,confirmation});
      factoryResetConfirmDialog(r.challengeId,r.expiresAt);
    }catch(err){ toast(err.message||"ยืนยันชั้นที่ 1 ไม่สำเร็จ","bad"); }
  });
  openModal("ยืนยันการล้างข้อมูล",body,[cancel,next]);
}

function factoryResetConfirmDialog(challengeId,expiresAt){
  const body=el(`<div>
    <div class="notice" style="border-color:#fecaca;background:#fff7f7;color:#991b1b"><b>ยืนยันชั้นที่ 2</b><br>รายการนี้จะหมดอายุ ${fmtDateTime(expiresAt)} เมื่อกดยืนยัน ระบบจะล้างข้อมูลทันที</div>
  </div>`);
  body.append(field("รหัสผ่าน Owner อีกครั้ง",`<input id="resetPasswordTwo" type="password" autocomplete="current-password" placeholder="กรอกรหัสผ่านอีกครั้ง">`));
  body.append(field("ข้อความยืนยันอีกครั้ง",`<input id="resetPhraseTwo" type="text" autocomplete="off" placeholder="พิมพ์ RESET BVN">`));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const confirm=el(`<button class="btn danger">ล้างข้อมูลถาวร</button>`);
  confirm.onclick=()=>withBtn(confirm,async()=>{
    const password=$("#resetPasswordTwo",body).value, confirmation=$("#resetPhraseTwo",body).value;
    try{
      const r=await api("admin_confirm_factory_reset",{challengeId,password,confirmation});
      clearApiReadCache(); closeModal(); toast(`${r.message||"ล้างข้อมูลแล้ว"} · เริ่มเพิ่มพนักงานและตั้งค่าจุดเช็กอินใหม่ได้`,"good"); go("dashboard");
    }catch(err){ toast(err.message||"ล้างข้อมูลไม่สำเร็จ","bad"); }
  });
  openModal("ยืนยันการล้างข้อมูลครั้งสุดท้าย",body,[cancel,confirm]);
}

let attendanceArchiveSession=null;
function downloadJson(filename, content){
  const url=URL.createObjectURL(new Blob([content],{type:"application/json;charset=utf-8"}));
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function createAttendanceArchive(btn){
  await withBtn(btn,async()=>{
    try{
      const r=await api("admin_create_attendance_archive");
      downloadJson(r.fileName||"BVN-attendance-archive.json",r.content||"");
      attendanceArchiveSession={archiveId:r.archiveId,sha256:r.sha256,verified:false,recordCount:Number(r.recordCount||0),cutoff:r.cutoff||"",expiresAt:r.expiresAt||""};
      const box=$("#attendanceArchiveStatus"); if(box) box.textContent=`ดาวน์โหลด ${attendanceArchiveSession.recordCount.toLocaleString("th-TH")} รายการแล้ว · เลือกไฟล์เดิมกลับมาเพื่อตรวจสอบก่อนล้าง`;
      $("#verifyAttendanceArchiveFile")?.click();
    }catch(err){ toast(err.message||"สร้าง Archive ไม่สำเร็จ","bad"); }
  });
}
async function sha256Text(text){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function verifyAttendanceArchiveFile(file){
  if(!file) return;
  try{
    const content=await file.text(), parsed=JSON.parse(content);
    if(parsed?.format!=="BVN-ATTENDANCE-ARCHIVE/1"||!parsed?.archiveId) throw new Error("ไฟล์นี้ไม่ใช่ Archive เวลาเข้าออกของ BVN");
    const checksum=await sha256Text(content);
    const r=await api("admin_verify_attendance_archive",{archiveId:parsed.archiveId,sha256:checksum});
    attendanceArchiveSession={archiveId:parsed.archiveId,sha256:checksum,verified:true,recordCount:Number(r.recordCount||parsed.attendance?.length||0),cutoff:r.cutoff||parsed.cutoff||"",expiresAt:r.expiresAt||""};
    const box=$("#attendanceArchiveStatus"); if(box) box.textContent=`ตรวจไฟล์สำรองแล้ว · ${attendanceArchiveSession.recordCount.toLocaleString("th-TH")} รายการ · พร้อมล้างเฉพาะข้อมูลก่อน ${fmtDateTime(attendanceArchiveSession.cutoff)}`;
    const purge=$("#purgeOldAttendance"); if(purge) purge.disabled=false;
    toast("ตรวจไฟล์ Archive แล้ว","good");
  }catch(err){ attendanceArchiveSession=null; const purge=$("#purgeOldAttendance"); if(purge) purge.disabled=true; toast(err.message||"ตรวจไฟล์ Archive ไม่สำเร็จ","bad"); }
}
function openAttendanceArchiveReader(){
  const body=el(`<div><input id="archiveReaderFile" type="file" accept="application/json,.json"><div class="empty" id="archiveReaderResult">เลือกไฟล์ Archive ที่ดาวน์โหลดไว้เพื่อเปิดดูเวลาเช็กอิน/เอาต์ย้อนหลัง</div></div>`);
  const close=el(`<button class="btn sub">ปิด</button>`); close.onclick=closeModal;
  openModal("อ่านไฟล์ Archive เวลาเข้าออก",body,[close]);
  $("#archiveReaderFile",body).onchange=async(e)=>{
    try{
      const content=await e.target.files[0].text(), a=JSON.parse(content);
      if(a?.format!=="BVN-ATTENDANCE-ARCHIVE/1") throw new Error("ไฟล์ไม่ถูกต้อง");
      const rows=Array.isArray(a.attendance)?a.attendance:[];
      $("#archiveReaderResult",body).innerHTML=`<div class="notice blue"><b>Archive ${esc(a.archiveId||"")}</b><br><span class="sub">สร้าง ${esc(fmtDateTime(a.generatedAt))} · เก็บ ${fmtInt(rows.length)} รายการ · ก่อน ${esc(fmtDateTime(a.cutoff))}</span></div><div style="max-height:48vh;overflow:auto;margin-top:12px"><table><thead><tr><th>พนักงาน</th><th>เหตุการณ์</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>${rows.slice(0,500).map(r=>`<tr><td>${esc(r.employee_id||"")}</td><td>${esc(r.event_type||"")}</td><td>${esc(fmtDateTime(r.event_time))}</td><td>${esc(r.validity||"")}</td></tr>`).join("")||`<tr><td colspan="4" class="empty">ไม่มีข้อมูล</td></tr>`}</tbody></table></div>${rows.length>500?`<p class="sub">แสดง 500 รายการแรกจาก ${fmtInt(rows.length)} รายการ</p>`:""}`;
    }catch(err){ $("#archiveReaderResult",body).textContent=err.message||"อ่านไฟล์ไม่สำเร็จ"; }
  };
}
function purgeOldAttendanceDialog(){
  if(!attendanceArchiveSession?.verified){ toast("ต้องดาวน์โหลดและตรวจไฟล์ Archive ก่อน","bad"); return; }
  const body=el(`<div><div class="notice" style="border-color:#fecaca;background:#fff7f7;color:#991b1b"><b>ล้างเวลาเข้าออกที่เกิน 6 เดือน</b><br>Archive ได้รับการตรวจแล้ว ${fmtInt(attendanceArchiveSession.recordCount)} รายการ · ระบบจะลบเฉพาะรายการก่อน ${fmtDateTime(attendanceArchiveSession.cutoff)}</div></div>`);
  body.append(field("รหัสผ่าน Owner",`<input id="purgeAttendancePassword" type="password" autocomplete="current-password">`));
  body.append(field("ข้อความยืนยัน",`<input id="purgeAttendancePhrase" type="text" placeholder="พิมพ์ PURGE 6 MONTHS">`));
  const cancel=el(`<button class="btn sub">ยกเลิก</button>`); cancel.onclick=closeModal;
  const purge=el(`<button class="btn danger">ล้างเวลาเก่า</button>`);
  purge.onclick=()=>withBtn(purge,async()=>{
    try{
      const r=await api("admin_purge_attendance_before_cutoff",{archiveId:attendanceArchiveSession.archiveId,password:$("#purgeAttendancePassword",body).value,confirmation:$("#purgeAttendancePhrase",body).value});
      attendanceArchiveSession=null; clearApiReadCache(); closeModal(); const b=$("#attendanceArchiveStatus"); if(b)b.textContent=r.message||"ล้างเวลาเก่าแล้ว"; const pb=$("#purgeOldAttendance"); if(pb)pb.disabled=true; toast(r.message||"ล้างเวลาเก่าแล้ว","good");
    }catch(err){ toast(err.message||"ล้างเวลาเก่าไม่สำเร็จ","bad"); }
  });
  openModal("ยืนยันล้างเวลาเกิน 6 เดือน",body,[cancel,purge]);
}

/* ---------- reusable sortable table ---------- */
// Click a header to sort the current tbody rows (auto number vs text). Re-callable
// after a re-render. Add data-nosort on headers that shouldn't sort (action columns).
function attachSort(table){
  if(!table) return;
  const ths=[...table.tHead.rows[0].cells];
  ths.forEach((th,ci)=>{
    if(th.hasAttribute("data-nosort")||!th.textContent.trim()) return;
    th.style.cursor="pointer"; th.classList.add("sortable");
    th.onclick=()=>{
      const tb=table.tBodies[0]; const rows=[...tb.rows].filter(r=>r.cells.length>ci && !r.querySelector(".empty"));
      if(rows.length<2) return;
      const asc=th.dataset.sort!=="asc";
      ths.forEach(x=>{x.removeAttribute("data-sort");x.querySelector(".sort-ar")?.remove();});
      th.dataset.sort=asc?"asc":"desc";
      const val=(r)=>{ const t=(r.cells[ci].innerText||"").replace(/[,฿\s]/g,"").trim();
        const n=parseFloat(t); return (t!==""&&!isNaN(n)&&/^-?[\d.]+$/.test(t))?n:(r.cells[ci].innerText||"").trim().toLowerCase(); };
      rows.sort((a,b)=>{ const x=val(a),y=val(b); if(x<y)return asc?-1:1; if(x>y)return asc?1:-1; return 0; });
      rows.forEach(r=>tb.appendChild(r));
      const ar=document.createElement("span"); ar.className="sort-ar"; ar.textContent=asc?" ▲":" ▼"; th.appendChild(ar);
    };
  });
}

/* ---------- global quick-create menu ---------- */
function quickCreateMenu(btn){
  const r=btn.getBoundingClientRect();
  openRowMenu(r.right-176, r.bottom+6, [
    {label:"เพิ่มพนักงาน", fn:()=>employeeDialog(null)},
    {label:"บันทึก OT", fn:()=>addOvertimeDialog()},
  ]);
}

/* One visible primary action, based on the task the Admin is doing now. */
function syncQuickAction(){
  const b=$("#quickBtn"); if(!b) return;
  const page=state.page||"dashboard";
  const actions={
    owner:{label:"ลงเวลาแทน", fn:()=>adminAttendanceDialog()},
    employees:{label:"+ เพิ่มพนักงาน", fn:()=>employeeDialog(null)},
    approvals:{label:"งานรออนุมัติ", fn:()=>go("approvals")},
  };
  const action=actions[page];
  if(!action){ b.style.display="none"; b.onclick=null; return; }
  b.style.display=""; b.textContent=action.label; b.onclick=action.fn;
}

/* ---------- reusable right-click row menu ---------- */
function attachRowMenu(tr, items){
  tr.addEventListener("contextmenu",(e)=>{ e.preventDefault(); openRowMenu(e.clientX, e.clientY, items); });
}
function openRowMenu(x, y, items){
  closeRowMenu();
  const menu=el(`<div class="ctxmenu"></div>`);
  items.forEach(it=>{ const b=el(`<button class="${it.danger?"danger":""}">${it.label}</button>`); b.onclick=()=>{ closeRowMenu(); it.fn(); }; menu.append(b); });
  document.body.append(menu);
  const w=menu.offsetWidth, h=menu.offsetHeight;
  menu.style.left=Math.min(x, window.innerWidth-w-8)+"px";
  menu.style.top=Math.min(y, window.innerHeight-h-8)+"px";
  setTimeout(()=>document.addEventListener("click", closeRowMenu, {once:true}),0);
}
function closeRowMenu(){ const m=$(".ctxmenu"); if(m) m.remove(); }

/* =================================================================
   BOOT
   ================================================================= */
// Auto-heal: any saved Apps Script /exec URL that isn't the current default → migrate
// it to the default. The owner never overrides the endpoint intentionally, so this
// guarantees the console always points at the latest deployment baked into this file.
try{
  let ep=LS.getItem("bvn_endpoint");
  // No endpoint, or still on the retired default Apps Script → move to Supabase.
  // A custom /exec an owner typed is left alone (manual fallback).
  if(!ep || ep===LEGACY_APPS_SCRIPT){ ep=DEFAULT_ENDPOINT; LS.setItem("bvn_endpoint", ep); }
  if(isSupabaseEndpoint(ep) && !LS.getItem("bvn_apikey")){ LS.setItem("bvn_apikey", DEFAULT_APIKEY); }
}catch(_){}
$("#inEndpoint").value = LS.getItem("bvn_endpoint") || DEFAULT_ENDPOINT;
$("#inApikey") && ($("#inApikey").value = LS.getItem("bvn_apikey") || (isSupabaseEndpoint($("#inEndpoint").value)?DEFAULT_APIKEY:""));
state.apikey = LS.getItem("bvn_apikey") || "";
$("#loginForm").addEventListener("submit", doLogin);

// BVN uses one light operational surface. Remove a saved dark preference from
// earlier builds so every Admin sees the same colour/contrast hierarchy.
try{ LS.removeItem("bvn_codex_theme"); }catch(_){}
document.documentElement.removeAttribute("data-theme");
syncQuickAction();
// Auto-resume a session token kept in this tab.
(function resume(){
  const token=SS.getItem("bvn_token"), endpoint=LS.getItem("bvn_endpoint")||DEFAULT_ENDPOINT, username=SS.getItem("bvn_username")||"", reviewer=LS.getItem("bvn_reviewer")||"", role=SS.getItem("bvn_role")||"owner";
  if(!token) return;
  state.apikey=LS.getItem("bvn_apikey")||"";
  state.endpoint=endpoint; state.token=token; state.username=username; state.reviewer=reviewer; state.role=role;
  api("dashboard").then(enterApp).catch(()=>{ SS.removeItem("bvn_token"); });
})();
