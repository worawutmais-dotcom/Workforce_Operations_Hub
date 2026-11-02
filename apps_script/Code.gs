/**
 * BVN Package attendance endpoint.
 * Bind this script to the Google Sheet database and replace SPREADSHEET_ID only
 * if it is not bound. Deploy only after implementing employee authentication.
 */
const SPREADSHEET_ID = '1-deVDtN8sZQmDyXTH7cR2TtmXgmm4RHOkONRk-HFdT4';
const SITE_TAB = 'Work_Sites';
const LOG_TAB = 'Attendance_Log';

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  // TODO: Verify an authenticated employee identity here. Do not trust employeeId from the browser.
  if (!payload.employeeId) return reply_(false, 'Employee authentication is required');
  const site = findSite_(payload.siteId);
  if (!site) return reply_(false, 'Unknown work site');
  const distance = metres_(Number(payload.latitude), Number(payload.longitude), site.lat, site.lng);
  const accuracy = Number(payload.accuracy);
  const accepted = distance <= site.radius && accuracy <= 100;
  const log = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(LOG_TAB);
  log.appendRow([
    Utilities.getUuid(), payload.employeeId, payload.siteId, payload.eventType,
    new Date(), payload.latitude, payload.longitude, accuracy, distance,
    accepted ? 'accepted' : 'rejected', payload.deviceTimezone || '', 'mobile_pwa', 'pending', new Date()
  ]);
  return reply_(accepted, accepted ? 'Recorded' : 'Outside permitted radius or low GPS accuracy');
}
function findSite_(siteId) {
  const rows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SITE_TAB).getDataRange().getValues();
  const row = rows.slice(1).find(r => r[0] === siteId && String(r[5]).toUpperCase() === 'TRUE');
  return row ? {lat:Number(row[2]), lng:Number(row[3]), radius:Number(row[4])} : null;
}
function metres_(a,b,c,d) { const R=6371e3,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,q=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2; return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q)); }
function reply_(ok,message) { return ContentService.createTextOutput(JSON.stringify({ok,message})).setMimeType(ContentService.MimeType.JSON); }
