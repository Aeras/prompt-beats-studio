# Diagnosis: preview cannot see the backend secret key

## Findings (facts only, no values read or printed)

1. **Secret exists.** `EXTERNAL_SUPABASE_SECRET_KEY` is present in the project's stored secrets, alongside `EXTERNAL_SUPABASE_URL` and `EXTERNAL_SUPABASE_PUBLISHABLE_KEY`. Nothing was deleted.
2. **Not injected into the running preview server.** The live preview process (started 08:49:20 UTC today, PID 187) carries only 44 environment entries and **none** of them are Supabase-related — no `EXTERNAL_SUPABASE_*`, no `SUPABASE_*`, no `VITE_SUPABASE_*`.
3. **`SUPABASE_SERVICE_ROLE_KEY` is also absent** from that process, so both the primary name and the fallback name are missing — which is exactly the error text.
4. **`EXTERNAL_SUPABASE_URL` and `EXTERNAL_SUPABASE_PUBLISHABLE_KEY`** are present in the sandbox environment but likewise **absent from the running preview process**.
5. **Binding.** Every Supabase URL visible in the sandbox environment (external, fallback and client-side) points to the same project ref `qwlksrcsovbncmretjdt`. The tracked `.env` also references that ref. No second ref appears anywhere.
6. **Why it stopped.** The secrets were verified earlier against the sandbox environment. The preview server process was then restarted at 08:49:20 and came up **without** the secret set inherited — it was spawned before/outside the injection, so it has an environment snapshot that predates the secrets being bound. Environment variables are fixed at process start; a running process cannot pick up new ones, and hot reload (visible in the log at 08:51:57) only reloads code, not environment.
7. **Category.** This is a **preview runtime issue** (stale process environment), not a missing secret, not a broken backend binding, and not a code problem. The log confirms the sequence: before 08:51:57 the error named only `SUPABASE_SERVICE_ROLE_KEY`; after the code hot-reloaded it names both — same underlying cause.

## Minimal fix

Restart the preview server process so it starts with the current secret set. No dashboard action, no secret change, no binding change, no migration, no code edit.

## Production vs preview

Yes, they differ. Published deployments receive secrets at deploy time as part of the build, so the live site is unaffected by this stale preview process. The problem is confined to the currently running preview server.

## Explicitly not proposed

No hardcoded secrets, no client-side exposure, no new backend, no data migration.

## Next step (needs your approval)

Restart the preview server, then confirm the error is gone in the server log and the feed loads.
