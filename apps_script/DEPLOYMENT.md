# Deploying the BVN Package Apps Script API

This is the controlled gateway to the Google Sheet. Do not give employees Editor access to the spreadsheet and do not place its sharing URL inside either app.

## One-time owner setup

1. In the target Google Sheet, open **Extensions > Apps Script**, replace the default file with [`Code.gs`](Code.gs), and save.
2. In **Project Settings > Script properties**, create two different long random values: `ADMIN_API_KEY` and `MOBILE_TOKEN_PEPPER`. Never paste either value into source control, the public PWA, or a Google Sheet cell.
3. Run `initializeEmployeesSheet`, `initializeMobileAccessSheet`, and `initializeLeaveRequestsSheet` once from the editor and authorize them. These add the password-hash-only employee column, token-hash-only `Mobile_Access` tab, and append-only `Leave_Requests` register. If payroll rules will be configured, also run `initializePayrollRulesSheet`.
4. Deploy as a Web app running as the owner. Select the narrowest access policy that supports the intended clients; the API is not ready to be exposed to the entire internet without an additional identity gateway.

## Creating and enrolling an employee

1. Open **ทีมงาน** in the Windows Admin application and create an employee. The API assigns the immutable `EMP-xxxx` ID and returns an eight-digit temporary password exactly once.
2. Deliver the name and temporary password privately to that employee. Never write it in a Sheet cell, group chat, or public document.
3. On the Android app, the employee chooses their name from the active directory and enters that temporary password. A new device session is stored in Android Keystore; any previous session for that employee is revoked.
4. Use **รีเซ็ตรหัสชั่วคราว** in Admin for a lost phone or forgotten password. Resetting also revokes existing device sessions. The current password cannot be viewed by Admin or recovered from the Sheet.

## Admin desktop

The Admin EXE config file keeps only `apps_script_endpoint`. Put `ADMIN_API_KEY` in the Windows environment for the named user, then the future API adapter can send it in a POST body. Do not add this key to `admin_config.json`.

## Operational controls

- Use Admin password reset to revoke a lost phone. Do not edit the token or password-hash records manually.
- `Attendance_Log` is append-only. A rejected GPS event remains an audit record and is not a manager approval candidate.
- Leave requests enter `Leave_Requests` as `pending`; a future authenticated Admin action must be used to approve or reject them. Do not edit approved payroll-relevant records casually in the Sheet.
- Review Apps Script Executions and Google Sheet sharing monthly.
- Google Sheets remains appropriate only for the early operational phase. Move payroll and invoices to a proper relational database before high employee counts, formal payroll, or finance integration.
