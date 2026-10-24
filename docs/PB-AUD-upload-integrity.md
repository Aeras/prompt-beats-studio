# PB-AUD upload integrity & references

Base main: `b20912f3ec151cb32a6dc0460d7a0bde58d1289a`. Scope PB-AUD-001/002/003/009; authoritative audit `ef7b77656b1c6de7b85f113467d006f5d227f5f3`. No production R2/database operations, quota-policy change (AUD-008), AI/billing/UI redesign.

## Fixes

- **001:** exclude exactly the framing CRLF preceding a valid multipart delimiter. Preserve genuine trailing CRLF and binary boundary-like sequences. Actual-file limit remains 50 MiB; request envelope 52 MiB. Incomplete bodies, duplicate file parts and malformed boundaries fail closed; headers bounded at 16 KiB and boundary at 70 characters. A syntactically identical valid delimiter cannot be distinguished from framing: MIME requires choosing a delimiter absent from the payload.
- **002:** verified MP3/WAV signature plus compatible extension/type produces canonical `audio/mpeg` or `audio/wav`. MIME aliases/generic metadata normalize; active-content types and conflicting extensions/types are rejected. R2 gets unchanged bytes, canonical Content-Type, attachment disposition and server SHA-256 metadata. Existing playback/download code remains unchanged. This is not full decoder certification or a claim that the original finding proved XSS.
- **003:** new object names use `crypto.randomUUID()`, bounded sanitized filename and the existing owner namespace. Fixed-clock concurrent tests cover identical and lossy-normalized names. Historical objects are not renamed or rewritten. UUID collision probability is negligible, not mathematically zero; receipt primary-key uniqueness prevents duplicate key registration.
- **009:** service-only `audio_upload_receipts` stores key/owner, byte size, SHA-256, canonical MIME/URL, ETag, pending/finalized/discarded status, expiry and consumption. Pending registration precedes PUT (after the existing admission). Finalization requires successful PUT and private-origin HEAD verification. The client contract remains `{key,url}`: the opaque key resolves to authoritative server state, not a trusted client claim.

## Transactions and cleanup

All application creation paths (`createTrack`, `createUploadedTrackWithIdentity`) and audio replacement require owner-bound, finalized, non-expired, unconsumed receipt plus a current HEAD metadata check. Canonical URL comes from server evidence. Duplicate-detection content hash is checked against server SHA-256.

A DB trigger consumes the receipt in the **same transaction as Track insertion/new audio attachment**, including direct inserts and existing edit RPCs. Existing cleanup per-key advisory locks and a receipt row lock serialize creation, replay and discard. Failed Track creation rolls back consumption. Cleanup admitted first invalidates an unused receipt; an already committed Track remains protected by existing reference checks.

Metadata-only edits of existing Tracks need no receipt and retain their stored audio URL. Replacement uses the new server hash and clears an obsolete fingerprint rather than attaching old audio identity to new bytes. External Suno/Udio links remain on their existing normalization path.

Upload finalization failure queues the existing durable cleanup mechanism. Rejected receipt registration never cleans a pre-existing key. Existing UI Track-creation failures retain their discard flow. Unconsumed receipts expire after 24 hours; this is a reference-validity window, not a quota-policy change.

## Migration and security

`supabase/migrations/20261024111133_pb_aud_upload_integrity.sql` is additive/forward-only, with no historical backfill or object rewrite.

- Receipt table: RLS enabled, no PUBLIC/anon/authenticated access; service-role SELECT/INSERT/UPDATE only.
- Two table-trigger functions need SECURITY DEFINER to enforce the hidden ledger from existing authenticated Track edit RPCs. EXECUTE is revoked from all API roles, including service_role; pinned search_path, exact owner/state checks. Existing account/feature/RLS/cleanup boundaries remain.
- No production migration is performed in this implementation task.

## Tests

`src/lib/upload-integrity.test.ts` runs actual parser/handler/key-builder/receipt-reader code with offline injections: exact bytes and SHA-256, true CRLF endings, false boundary sequences, empty/malformed/duplicate/chunked bodies, actual 50 MiB −1/exact/+1, envelope cap/cancellation, aliases/mismatches, concurrent same-millisecond keys, missing/replaced object evidence, stale/replayed/invalid receipts, registration/PUT/finalization failure, cleanup and admission ordering.

`supabase/tests/upload_integrity.sql` checks actual DB grants, missing/pending/expired/cross-owner receipt rejection, canonical URL, one-time consumption, failed-insert rollback, legacy metadata, external links, replacement and cleanup invalidation. Local PostgreSQL/WASM execution uses the real migration but is not called full Supabase replay.

`scripts/tests/upload-receipt-races.sh` uses two independent PostgreSQL connections to consume one receipt; exactly one Track wins. Database Replay CI executes the full immutable migration history, SQL assertions and concurrency test in its disposable local container only. No R2 or AI calls.

Final suite counts, exact HEAD, TypeScript, changed-source ESLint/Prettier, build and all three CI results are recorded in the PR.

## Rollout, rollback and residual risks

1. **Coordinated upload cutover required:** pause new uploads/drain in-progress upload forms; apply migration; deploy new upload/server code together; reopen uploads. Applying the enforcing trigger while an old upload endpoint still issues receipt-less keys rejects new attachments. Existing Tracks remain usable. This PR performs neither migration nor deployment.
2. Missing migration fails closed at receipt registration, before PUT. Do not bypass validation during rollout. Unattached pre-cutover uploads must be re-uploaded; never fabricate receipts for historical keys.
3. SQL and R2 cannot form a distributed transaction. Managed deletion is fenced; HEAD is point-in-time evidence, not protection from later out-of-band deletion using storage credentials. Ambiguous PUT/total DB outage may leave an unreferenced object/pending receipt needing operator reconciliation; no unsafe Track is authorized.
4. Expired receipts/orphan objects are not automatically swept here. Any later retention job must take the receipt/key lock and recheck Track references. Explicit discard/failure cleanup remains durable.
5. R2 credentials must support HEAD/object metadata reads; endpoint must return Content-Length, Content-Type, ETag and custom SHA-256 metadata. CI mocks this contract; no production R2 probe was authorized.
6. Rollback must pause uploads and coordinate code/schema. Preserve evidence/cleanup data and RLS; do not drop receipt enforcement while new writers remain live.

References: [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).
