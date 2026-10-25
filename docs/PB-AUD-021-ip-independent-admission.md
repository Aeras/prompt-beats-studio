# PB-AUD-021 — admission independent of client-IP headers

## Scope, baseline and investigation

Baseline main: `3aa23fa0b2e9bc72206061c5f7f9a2e83215a21d`. Branch `codex/pb-aud-021-admission`; one PR for implementation, SQL, tests and release handoff. No production migration, publish, provider call, SMTP delivery or hosting mutation is authorized/performed by this task.

Read root AGENTS.md, WORK-STATUS and original B-Findings register AUD-021. Reconciled #424 and the subsequent publish verification before starting. Open PRs were inspected; none touches Contact/Private Review admission. The owner's DNS-only Cloudflare records do not establish a trusted application proxy. `CF-Connecting-IP`, `X-Real-IP`, `X-Forwarded-For` are all untrusted and are never used by the new admission paths.

Affected flow inventory:

- `src/routes/contact.tsx` → `getContactChallenge` / `sendContactForm` → proof verification → service-role `admit_contact_request_v2` → `contact-email.server.ts` / existing SMTP. Only this handler calls the Contact sender. Honeypot still returns success without sending or consuming quota.
- `src/routes/review.$token.tsx` → `joinPrivateReviewSession` → one `join_private_review_session` transaction. Owner create/close/reply paths retain existing authenticated feature checks; reviewer get/comment paths retain bearer-key authorization and terminal-state content revocation.
- Historical migrations `20260922114000_contact_rate_limit.sql`, `20260926113000_final_005_private_review_join_admission.sql`, initial review/session schema, track-source support and `20260924022000_step8_public_token_rpc_hardening.sql` were inspected and left unchanged. The latter already removed direct anon/authenticated access to review bearer RPCs; no newly discovered anonymous RPC bypass is claimed.
- The actual residual flaw was untrusted network partitioning plus a split admission/PIN/failure-write sequence. A failure count returned by an exception would roll back, so failed PIN outcomes must commit a normal state result.

## Accepted design and limits

### Contact

| Layer              | Authoritative key / limit                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message-bound work | Server HMAC envelope, random 192-bit nonce, 5-minute expiry, fixed 16 leading SHA-256 zero bits; bound to normalized email, alias, subject, message and verified account/guest context |
| Replay             | Unique HMAC nonce receipt in PostgreSQL, consumed before SMTP                                                                                                                          |
| Email              | HMAC normalized email; 3 admitted send attempts / rolling 30 minutes, across guest/account contexts                                                                                    |
| Verified account   | Fresh Supabase `getUser` + existing private profile check, then SQL confirmed/non-anonymous/non-banned account check; 10 / rolling 30 minutes **per account**                          |
| Anonymous ceiling  | 120 / rolling 30 minutes, independent of email or forged headers                                                                                                                       |

No shared authenticated ceiling: guest flood or one exhausted account cannot consume another account's budget. This is deliberately not a single replacement global fingerprint. Anonymous users remain supported; signing in is not required. Existing email quota is retained; SMTP failures still consume an admitted attempt, as before.

The WebCrypto work runs asynchronously on submit under the existing sending spinner, with a 20-second solver deadline and a fresh challenge per retry. No CAPTCHA vendor, external script, new credential or hosting guarantee is required. `contact-admission.server.ts` signs with the existing server-only Supabase secret, domain-separated from other uses. Only a signature is sent to the browser, never that key. A key rotation invalidates outstanding challenges safely.

Principal locks are taken before email locks. The guest pool is serialized independently; accounts have independent locks. Email checks across those partitions share an email lock. `ON CONFLICT DO NOTHING` plus the unique nonce handles replay even across distinct actors. Admission commits before SMTP; DB failure/missing acknowledgement cannot authorize an email. This is not an exactly-once SMTP delivery guarantee: a disconnect after SMTP may leave delivery uncertain; there is no automatic resend.

### Private Review

`join_private_review_session` itself locks the real `private_review_sessions` row **before** checking eligibility, limits or PIN. Under that lock it admits the attempt, verifies PIN and either records failure or creates the reviewer. It returns `joined`, `invalid_pin`, `rate_limited`, `closed`, `unavailable`. Errors/failures cannot be recorded through a subsequent best-effort RPC anymore.

- Per actual session: 60 attempts and 12 PIN failures / fixed five-minute bucket; 300 attempts and 80 PIN failures / fixed clock hour. Bucket boundary bursts are bounded, not described as sliding-window limits.
- Existing current-hour aggregate counts from the legacy admission table are included during cutover, regardless of its old network hashes. No active legacy failure window is silently discarded.
- No browser fingerprint, client ID, IP, cookies or changing display name can reset a session limit.
- Existing session tokens, PIN hashes, snapshots, reviewer keys and owner controls are unchanged. Existing admitted reviewers use their current credentials and do not consume a new join budget.
- Deprecated service-only pre-admission RPC only checks link state; failure-record RPC is a no-op because failure recording now happens inside join. Neither can bypass the authoritative guarded join. Legacy Contact admission returns false, so old clients cannot bypass work/admission.

### Honest availability/security boundaries

Proof of work is computational friction, **not proof of humanity**. A sufficiently funded attacker can solve it. The independent DB caps enforce actual finite guest/per-account sends despite email rotation. A guest attacker can exhaust guest capacity for part of the 30-minute window; authenticated independent capacity remains available. Account farms and underlying HTTP/connection exhaustion are not solved by application admission. Existing per-email quota also permits targeted temporary exhaustion of a known email address; this is not a verified mailbox ownership mechanism.

An attacker who possesses a review token can deliberately exhaust that session's join/PIN allowance and temporarily prevent a new legitimate reviewer joining it. Without a second verified identity, selectively recognizing a correct PIN after lockout would itself allow unlimited guesses. The bounded lockout is retained instead of pretending to eliminate this trade-off. Other sessions and already-admitted reviewers remain available. More identity/CAPTCHA/infrastructure controls would need a separate product/infrastructure decision; none is a hidden dependency for this fix.

## Privacy and permissions

New tables: `contact_admission_receipts`, `private_review_session_admissions`. Both have RLS and no PUBLIC/anon/authenticated table privileges. Admission and guarded join RPCs revoke client EXECUTE; only service_role is granted access. SECURITY DEFINER functions use an empty search_path and qualified application/extension references. Narrow TypeScript RPC contract follows the existing internal-adapter pattern, without regenerating unrelated schemas.

No raw IP, email, content, PIN, bearer token, proof token or credential is stored in the admission tables. Contact has HMAC email/nonce, necessary account UUID and timestamp. Review has session UUID, bucket and counters. Expired Contact receipts (>24h) and review buckets (>48h) are pruned lazily on admitted traffic under nonblocking cleanup locks; no strict wall-clock retention guarantee is claimed while traffic is idle. Existing legacy tables/history are not rewritten. SMTP diagnostics use only safe error category, not message/body.

## Verification

- `pb-aud-021-admission.test.ts`: actual server cryptography, browser-compatible WebCrypto solver, tampering/expiry/identity/content binding; real public handler source with offline DB/SMTP mocks; forged headers, no-send failure paths, generic SMTP errors, honeypot, single private-review RPC and state mapping. No weak replacement validator is used to validate the signed envelope.
- `supabase/tests/ip_independent_admission.sql`: actual RPC grants/RLS, service and anon invocation, email/actor/guest ceilings, distinct-user capacity, nonce replay, recovery of window, old tokens/reviewer keys/snapshot, committed PIN failures, independent sessions/shared-NAT-sized guest cohort, closed/expired links, legacy failure carry-over and legacy path protection. Rollback-only local fixtures.
- `scripts/tests/ip-independent-admission-races.sh`: independent PostgreSQL connections race the guest last slot, cross-context email quota, single nonce and remaining PIN failure slot. Synthetic fixtures are cleaned by explicit known identifiers only.
- The new SQL and race script are included in Database Replay alongside the five existing security suites and four existing race scripts. Full migration replay uses only disposable local Docker/Supabase and the existing CI bootstrap fixture.
- Frozen Bun install; full offline suite; strict TypeScript; affected-source ESLint/Prettier; production build; immutable migration/diff checks. Final exact-HEAD counts and the three CI run URLs are recorded in the PR.
- Windows local source-string tests run in a separate canonical-LF detached checkout with only this patch overlaid; no unrelated file conversion is committed. This avoids CRLF-only false failures without weakening assertions.
- `e2e/contact-proof.pw.ts` executes the actual shared solver functions in real Chromium/WebCrypto on an intercepted local fixture page, checks the real digest and event-loop responsiveness, and never sends mail. It runs in all three configured viewport projects in Browser Quality.

Local verification: **1,070 Bun tests PASS / 7,245 assertions**, strict TypeScript, affected-source ESLint/Prettier and production build PASS; full fresh final migration replay, **six SQL suites and five race scripts PASS**. Standalone Chromium solver test PASS (2.0s test duration). CI results on the final PR HEAD are authoritative and recorded in the PR; no full-tree lint-debt cleanup is included.

## Release — separate approval required

Migration: **`supabase/migrations/20261025030941_pb_aud_021_ip_independent_admission.sql`**. Do not apply it to production as part of PR preparation.

1. Approve merge separately. Verify final PR SHA and all three green gates. Confirm the deployment includes this code and no unrelated pending migration. Confirm the verified production project, prerequisites/current function definitions, backup/recovery capability and no overlapping release.
2. Announce a short Contact maintenance interval. Apply **only** this forward migration via the established Supabase migration mechanism after explicit authorization. It adds counters/receipts and replaces internal functions without changing existing links/content or RLS of application data.
3. Migration-first is fail closed: the old Contact RPC returns false, so Contact sending is temporarily unavailable until publish. Old review joins with a correct PIN retain the old reviewer result fields; invalid outcomes may display a generic validation failure on an old app build, but counts commit and no PIN bypass is possible. New code before migration also fails closed; do not knowingly publish first.
4. After explicit publish authorization, publish the matching application in Lovable. Do not infer that GitHub merge or editor synchronization publishes the server. Verify Published History/release snapshot and ordinary page availability.
5. Read-only production metadata: function signatures/definitions/search_path/grants, RLS and indexes match; verify service_role-only admission/join and client denial. Never repeat the local SQL fixture/race scripts against production.
6. With separately authorized safe test account/sink, confirm a valid Contact message and Private Review join/correct/incorrect PIN. Do not send uncontrolled messages, stress PIN limits, create payments or run AI calls. Use offline concurrency evidence for hostile cases. Only then mark PB-AUD-021 CLOSED and record release evidence in WORK-STATUS.

## Rollback

No destructive down migration or history rewrite. Preserve new tables and existing session data. A blind rollback to the old application leaves Contact deliberately unavailable; do not restore the spoofable legacy admission to make it appear healthy. Use a reviewed compatible application repair retaining proof verification and the atomic join, or keep Contact fail-closed during diagnosis. Any production database change/publish requires explicit authorization. Counter cleanup never deletes reviews, content, users or tracks.

## Primary references

[Supabase database functions and privileges](https://supabase.com/docs/guides/database/functions), [PostgreSQL explicit/advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html). Changelog markdown endpoint was unavailable to the browsing tool; no new Supabase product API/version upgrade was assumed. CLI 2.118.0 and Bun 1.4.2 match repository CI.
