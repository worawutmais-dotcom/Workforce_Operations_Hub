# Employee Mobile — Option 3: Operational Calm

## Goal

Redesign the employee APK to feel like a dependable workforce product, not a
colour-heavy demonstration. The experience should be readable on a phone at a
glance, especially during check-in/out, without changing APIs, GPS behaviour,
authentication, payroll rules, or any administrator account.

## Scope

- Included: `employee_mobile` login, shell, Today, month calendar, requests,
  account/profile, and shared visual tokens.
- Excluded: `admin_codex`, Supabase migrations/functions/settings, employee
  records, admin-user records, and all back-office workflows.
- Data deletion is explicitly out of scope. Demo staff remain until the user
  confirms a deletion plan separately.

## Visual direction

- **Header and primary action:** deep navy `#152C47`.
- **Application canvas:** white `#FFFFFF`; cards are white with a thin
  `#DCE4EE` border and no elevation or glossy gradients.
- **Text:** primary dark ink; muted text remains readable slate, never pale
  grey on white.
- **Status colour:** green, amber, red, and blue are reserved for attendance
  and request states. They do not decorate ordinary cards, page headers, or
  navigation.
- **Geometry:** 52 px app bar, 62 px bottom navigation, 44 px standard
  controls, 48 px attendance action, 12 px card radius, 10 px compact radius.

## Interaction rules

1. The current attendance state is the strongest signal on Today.
2. The check-in/out action updates the relevant state rather than relying on
   decorative motion or nonessential colour.
3. A user can distinguish normal content from a status or destructive action
   through label, border, and semantic colour together.
4. Profile/account content remains compact enough for a normal phone viewport;
   no financial advance screen is added.

## Acceptance criteria

- The app bar uses deep navy with white title/navigation content.
- Standard buttons are 44 px high or smaller where semantics permit.
- Bottom navigation is compact (62 px), white, and clearly selected.
- Shared cards are flat, bordered, and have no shadow.
- Calendar and account hero panels are solid navy rather than gradients.
- Widget tests prove the shared theme geometry and primary chrome values.
- `flutter analyze`, `flutter test`, and release APK build pass.
