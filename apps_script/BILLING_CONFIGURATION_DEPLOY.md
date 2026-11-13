# Billing configuration and logo upload

## What this release adds

The Admin console now has **ใบแจ้งหนี้ลูกค้า > ตั้งค่าหัวบิล** for the business owner.

- Legal company name (Thai and English), address, phone, tax ID
- Invoice prefix, VAT rate, and document footer
- Logo import from the Admin console
- Invoice numbering and VAT calculation use the saved settings for new invoices
- Printed invoices, payslips, and monthly payroll summaries use the saved header and logo

The logo binary is stored in Google Drive. The `Settings` sheet stores only the Drive file ID and a render URL. The uploaded logo is shared as **Anyone with the link: Viewer** so a printed invoice can display it in a new browser tab. It is not published in Google search.

## Deployment

1. Open the target spreadsheet, then **Extensions > Apps Script**.
2. Replace the project `Code.gs` with the contents of [`Code.gs`](Code.gs), then save.
3. Run `initializeSettingsSheet` once. Approve the new Google Drive permission when prompted.
4. Select **Deploy > Manage deployments > Edit**, choose **New version**, then deploy. Keep the existing Web app URL and execution identity.
5. Refresh the Admin console with `Ctrl + F5` and sign in again.
6. Open **ใบแจ้งหนี้ลูกค้า > ตั้งค่าหัวบิล**, save the company information, choose the logo file, then select **บันทึกหัวบิล**.

## Acceptance checks

1. Reopen **ตั้งค่าหัวบิล**: the saved values must remain.
2. Create a new draft invoice: its number uses the configured prefix and its VAT uses the configured rate.
3. Click **พิมพ์** on an invoice: company data and logo appear in the document header.
4. Inspect the `Settings` sheet: it contains settings values and Drive IDs/URLs only, never base64 image data.

## Holidays and payroll page

- **วันหยุดบริษัท** creates the editable company baseline in the Google Sheet without `UrlFetchApp`; it therefore does not require the external-request permission that caused the error in the prior deployment.
- The baseline is created automatically when the calendar or attendance calculation first needs the current year. The button **เติมปีปัจจุบัน** can also fill another year on demand, without duplicating dates already entered.
- Cabinet, provincial, bank, and company-specific exception days remain manually editable. Review those exceptions before payroll because a government announcement is not automatically a holiday for every private employer.
- The **เงินเดือน** page calculates the current month-to-date period when opened. The date fields remain available only for recalculation of a different period; locked payroll snapshots are loaded automatically.

## Scope and safety

- Only an Owner can save billing settings or upload a logo.
- Managers and Finance users can read the invoice header to print invoices but cannot change it.
- Existing invoice totals are not recalculated when the VAT setting changes. The new rate applies only when creating a new invoice.
