# BVN Package Admin Desktop

Run locally with `py app.py`.

This is the Python desktop application for the shop owner and HR administrator.
It uses local demo data until a restricted Google Apps Script endpoint is deployed.
Copy `admin_config.example.json` to `admin_config.json` and only paste a deployed endpoint URL after the script authenticates each administrator.

To refresh the live dashboard, set `BVN_ADMIN_TOKEN` for the Windows user that runs the EXE. The token is sent only to the configured endpoint and is deliberately not saved in `admin_config.json`.

```powershell
[Environment]::SetEnvironmentVariable('BVN_ADMIN_TOKEN', 'token-issued-in-Apps-Script-properties', 'User')
```

Close and reopen the EXE after setting the variable. The **ดึงข้อมูลล่าสุด** button then calls the `dashboard` action in the deployed Apps Script API.

## Current modules

- Dashboard
- Employee directory
- Attendance exception review
- Payroll and invoice control views
- Endpoint configuration

## Production boundary

Do not store passwords, employee bank accounts, ID card information, or Apps Script secrets in this application or Google Sheet. The API must authenticate the administrator and calculate attendance rules server-side. See [`../apps_script/DEPLOYMENT.md`](../apps_script/DEPLOYMENT.md) before deployment.
