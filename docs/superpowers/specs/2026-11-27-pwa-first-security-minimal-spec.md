# PWA-first Security and Minimal Workflow

## Intent

Make the employee product PWA-first: protect employee privacy, remove APK-only behaviour from the web experience, and make the daily attendance task the dominant screen.

## Goals

- Disable the public employee directory action; an employee must not be able to enumerate colleagues.
- Make browser clients identify themselves as `PWA web`.
- Remove the APK update prompt, Android project, Android-only notifications, and APK release documentation.
- Restrict Edge Function CORS to the production PWA and local development origins.
- Reduce the Today screen to status, attendance times, one primary action, and a compact location confirmation. The interactive map stays available only after an explicit action.

## Non-goals

- No migration from mobile-token sessions to Supabase Auth in this increment.
- No Web Push implementation or offline attendance queue in this increment.
- Do not alter Admin functionality or data.

## Product decisions

- The PWA is the only employee channel for iPhone and Android. There is no Android fallback in this repository.
- PWA clients use the explicit `PWA web` device label.
- CORS allow-list includes the GitHub Pages PWA origin and `http://localhost` development variants. Unknown production origins receive no CORS header.
- The home screen shows location status but defers map creation until the employee presses `ดูแผนที่และพื้นที่อนุญาต`.

## Acceptance criteria

- A no-token `employee_directory` request receives an unsupported-action response and no employee names/IDs.
- The mobile login payload has the explicit `PWA web` device label.
- The PWA shell has no APK update/download code or Android project.
- Today does not instantiate the map until the map action is opened.
- CORS response permits only configured PWA/local origins and preserves requests without an Origin header for non-browser operational clients.
