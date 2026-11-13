import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "D:/Cowork/Workforce_Operations_Hub/outputs/20261102-bvn-database";
await fs.mkdir(outputDir, { recursive: true });

const wb = Workbook.create();
const navy = "#102A43", blue = "#146EF5", pale = "#EEF5FF", line = "#D9E2EC";
function header(sheet, range) {
  const r = sheet.getRange(range);
  r.format.fill = navy; r.format.font = { bold: true, color: "#FFFFFF" };
  r.format.horizontalAlignment = "center"; r.format.verticalAlignment = "center";
}
function grid(sheet, range) { sheet.getRange(range).format.borders = { preset: "all", style: "thin", color: line }; }
function finish(sheet, used) { sheet.freezePanes.freezeRows(1); sheet.getRange(used).format.wrapText = true; sheet.getRange(used).format.autofitColumns(); }

const sites = wb.worksheets.add("Work_Sites");
sites.getRange("A1:H2").values = [["Site ID","Site name","Latitude","Longitude","Radius (m)","Active","Notes","Updated at"],["SITE-001","BVN Package",13.762962071350593,100.5582875856417,150,"TRUE","Primary check-in point","2026-11-02"]];
header(sites,"A1:H1"); grid(sites,"A1:H2"); sites.getRange("C2:D2").setNumberFormat("0.000000000000000"); sites.getRange("E2").setNumberFormat("0"); finish(sites,"A1:H2");

const employees = wb.worksheets.add("Employees");
employees.getRange("A1:J2").values = [["Employee ID","Full name","Role","Mobile","Assigned site ID","Employment status","Start date","Payroll rate","Bank details reference","Updated at"],["EMP-001","Sample Employee","Employee","","SITE-001","Active","","","Store a secure reference only, never account number","2026-11-02"]];
header(employees,"A1:J1"); grid(employees,"A1:J2"); employees.getRange("F2:F500").dataValidation = { rule: { type: "list", values: ["Active","Inactive","On leave"] } }; finish(employees,"A1:J2");

const logs = wb.worksheets.add("Attendance_Log");
logs.getRange("A1:N2").values = [["Log ID","Employee ID","Site ID","Event type","Occurred at (ICT)","Latitude","Longitude","Accuracy (m)","Distance (m)","Decision","Device timezone","Source","Manager review","Created at"],["","","","check_in","",null,null,null,null,"","Asia/Bangkok","mobile_pwa","",""]];
header(logs,"A1:N1"); grid(logs,"A1:N2"); logs.getRange("D2:D5000").dataValidation = { rule: { type: "list", values: ["check_in","check_out"] } }; logs.getRange("J2:J5000").dataValidation = { rule: { type: "list", values: ["accepted","rejected","review"] } }; logs.getRange("M2:M5000").dataValidation = { rule: { type: "list", values: ["pending","approved","rejected"] } }; finish(logs,"A1:N2");

const payroll = wb.worksheets.add("Payroll_Periods");
payroll.getRange("A1:J2").values = [["Period ID","Period start","Period end","Employee ID","Base pay","OT pay","Deductions","Net pay","Approval status","Paid at"],["","","","",null,null,null,null,"draft",""]];
header(payroll,"A1:J1"); grid(payroll,"A1:J2"); payroll.getRange("I2:I5000").dataValidation = { rule: { type: "list", values: ["draft","review","approved","paid"] } }; payroll.getRange("E2:H5000").setNumberFormat("#,##0.00"); finish(payroll,"A1:J2");

const invoices = wb.worksheets.add("Invoices");
invoices.getRange("A1:J2").values = [["Invoice ID","Customer","Issue date","Due date","Subtotal","VAT","Total","Status","Paid at","Updated at"],["","","","",null,null,null,"draft","",""]];
header(invoices,"A1:J1"); grid(invoices,"A1:J2"); invoices.getRange("H2:H5000").dataValidation = { rule: { type: "list", values: ["draft","sent","paid","overdue","cancelled"] } }; invoices.getRange("E2:G5000").setNumberFormat("#,##0.00"); finish(invoices,"A1:J2");

const readme = wb.worksheets.add("ReadMe");
readme.getRange("A1:B8").values = [["BVN Package Operations Database",""],["Purpose","Google Sheets storage for early-stage attendance, payroll preparation and invoice tracking."],["Mobile check-in","The app must write via Apps Script, not direct Sheet sharing."],["Location rule","Server-side Apps Script recomputes distance from Work_Sites. Client distance alone is not proof."],["Security","Do not store passwords, bank account numbers, ID cards or raw salary evidence in this Sheet."],["Permissions","Restrict Editors to owner/HR. Employees must submit through an authenticated app endpoint."],["Retention","Keep Attendance_Log append-only. Use Manager review instead of editing original event data."],["Created","2026-11-02"]];
readme.getRange("A1:B1").merge(); readme.getRange("A1").format.fill = navy; readme.getRange("A1").format.font = { bold: true, color: "#FFFFFF", size: 16 }; readme.getRange("A1:B8").format.wrapText = true; readme.getRange("A1:B8").format.borders = { preset: "all", style: "thin", color: line }; readme.getRange("A2:A8").format.fill = pale; readme.getRange("A2:A8").format.font = { bold: true }; readme.getRange("A:B").format.autofitColumns(); readme.getRange("B:B").format.columnWidth = 65;

await wb.recalculate();
const check = await wb.inspect({ kind: "table", range: "Work_Sites!A1:H2", include: "values", tableMaxRows: 3, tableMaxCols: 10 });
if (!check.ndjson.includes("BVN Package")) throw new Error("Work site data validation failed");
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 20 } });
if (errors.ndjson.includes("#REF!") || errors.ndjson.includes("#DIV/0!")) throw new Error("Formula error scan failed");
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(`${outputDir}/BVN_Package_Operations_Database.xlsx`);
const preview = await wb.render({ sheetName: "Work_Sites", range: "A1:H2", autoCrop: "all", scale: 2, format: "png" });
await fs.writeFile(`${outputDir}/work-sites-preview.png`, new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ output: `${outputDir}/BVN_Package_Operations_Database.xlsx`, check: check.ndjson, errors: errors.ndjson }));
