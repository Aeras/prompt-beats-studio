# Durable song generation — corrected execution architecture

## What I found first (important)

Cloudflare Workflows cannot be used on this app's hosting. The app is deployed through the managed Lovable/TanStack pipeline: there is no `wrangler.jsonc`, no way to declare a Workflow binding, and no deploy step that would register a Workflow class. Adding a Workflow class here would compile but never actually run — exactly the "unbound Workflow" outcome your brief forbids.

So instead of the browser triggering generation, the **database scheduler** triggers it. That is genuinely independent of the browser: once the job row exists, the phone can be closed, killed or offline and the generation still runs and is still recoverable.

```text
Generate → reserve 1 creation + create job (pending) → return jobId immediately
                                   │
        database scheduler (every minute, server-side) ──► runner claims job
                                   │                        (pending → processing)
                                   ▼
                      AI generation via existing abstraction
                                   ▼
                   result persisted → job completed / failed
Browser only reads job state.
```

## What changes

**Database**
- Enable the scheduler and its HTTP sender; schedule a minute-by-minute sweep that calls the internal runner endpoint with the existing internal secret. This is the durable trigger — no browser involved.
- Add `cancelled` to the job status set, plus a `dismissed_at` marker so a cleared job is never resurrected.
- Same sweep marks jobs that were claimed but never finished as `failed` with a recoverable message. It never re-issues a provider call for a claimed job (that could be billable twice).
- Existing stuck job: handled by this rule — it becomes failed/recoverable, no second AI call, no extra creation charged.

**Server**
- The runner endpoint stops being kicked by the browser's Generate request. It stays only as the internal control-plane target the scheduler calls (secret-protected).
- Claiming stays atomic (`pending → processing` conditional update), so one job = at most one provider call, whatever happens.
- The provider step keeps exactly one controlled attempt; on failure the job is marked failed. Database reads/writes stay safely repeatable.
- Generation keeps going through the existing `runSongGeneration` abstraction, so the selected provider/model, the v3 prompt, the JSON schema and the `{ title, tags, lyrics, note }` result shape are untouched.
- Job rows stay readable only by their owner; nothing new is exposed to the browser.

**Front end (Generator only)**
- The stored active-job pointer gains explicit states: active / completed / failed / dismissed. Only an active pointer is recovered on load — no "latest job for this user" resurrection.
- A failed job stops polling, shows a clear error and frees the Generator immediately.
- Clear is available at all times, including mid-generation. Confirming Clear marks the job dismissed (and cancelled if it had not been claimed yet), wipes local state and resets the Generator. It costs nothing, starts nothing, and the cleared job never comes back after a refresh.
- Returning to the tab, reconnecting or refreshing re-reads the job and shows the result, the error, or keeps waiting.

## Not touched

Model list and permissions, admin model selection, pricing, generation prompt v3, Quality Check / Apply / Undo / Repair / Check Again / Recheck, credit rules (one Generate = one creation), Basic/Advanced inputs, Library, Feed, Trending, auth, profiles, Stripe, tracks.

## Verification

Normal generate; refresh mid-generation; tab backgrounded and returned; simulated lost response; double-click Generate; Clear during generation then refresh; forced provider failure; the existing stuck job; plus build and type checks. Mobile-background behaviour is verified against the live job records, since that is what proves the generation survived the browser.
