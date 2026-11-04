# BVN Package Employee App - Redesign Plan

## Honest assessment

The current app is technically a connected attendance client, not yet a credible employee app. It exposes employee selection publicly, presents a bare employee ID as the greeting, keeps the main status only in memory, mixes legacy unused demo widgets with live widgets, and does not explain shift, approval, payroll impact, or what happens when GPS/network fails.

## Target employee flow

1. Sign in: choose only an Admin-created active account and use the one-time password.
2. Today: see name, role, assigned site, server time, current work state, last successful sync, and exactly one next action.
3. Time: server history with clear Accepted/Pending/Rejected labels and an explanation of rejected GPS.
4. Requests: leave requests and approval state; later add OT and correction requests.
5. Me: profile, location policy, app version, device/session reset request, and logout.

## Changes ordered by value

### High

- Replace employee-ID greeting with verified profile name, role and work site.
- Load today's server attendance on entry; never infer it only from local button taps.
- Remove unused legacy/demo widgets and show a useful error/retry state for every API view.
- Add a dedicated `บัญชีของฉัน` view with logout and policy explanation.
- Prevent duplicate check-in/out on the server and return current state in the attendance response.

### Medium

- Shift schedule, leave balances, OT/correction requests, manager reason on rejection, Thai date formatting, offline retry queue with explicit user consent.
- QR invitation instead of public employee-name directory.
- Device change flow and one-time-password expiry.

### Non-negotiable release gates

- One live employee completes login, required-location check-in/out, leave request and Admin approval.
- One permitted no-location employee completes check-in/out.
- No demo data is visible in an active route.
- Payroll is not shown as final pay until approved attendance and statutory rules are implemented.
