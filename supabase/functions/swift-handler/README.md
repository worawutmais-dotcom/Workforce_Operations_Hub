# swift-handler (deploy mirror)

This folder exists **only so the Supabase CLI can deploy the Edge Function
under its real slug `swift-handler`** (the CLI deploys `supabase/functions/<name>/`).

- The real source of truth is `../bvn-api/index.ts`. **Edit there, not here.**
- Before every deploy, re-sync this copy:

```bash
cp supabase/functions/bvn-api/index.ts supabase/functions/swift-handler/index.ts
cp supabase/functions/bvn-api/mobile_session_security.ts supabase/functions/swift-handler/mobile_session_security.ts
```

See `../../DEPLOY.md` for the full deploy steps.
