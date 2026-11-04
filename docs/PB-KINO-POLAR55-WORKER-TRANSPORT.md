# KINO Lab: Lovable to Polar55 transport diagnosis — 2026-11-04

## Verified baseline and access boundary

- Current main `2755f56c8d904893a03387233b0075216c09c5ad`; #506 and #507
  independently confirmed merged. No overlapping open KINO/Polar55 PR found.
- Lovable project `5e47f960-74f1-4eda-9749-0196542f1025` read-only metadata reports
  the same latest editor commit and is_published=true. This **does not prove the
  published snapshot SHA** or expose runtime secrets. No trustworthy deployed SHA,
  request trace or runtime log/secret-inspection API was available through the
  connector. No Lovable chat agent was invoked, no settings/secrets read or changed.
- Owner reports authenticated API HTTP 200, 77 valid stored draws, both Lovable
  secrets configured, app response `unavailable`, and no matching host access log.
  These are owner observations, not a new production probe by this review.
- Followed client run -> queryPrivateKinoPolar55 -> auth middleware -> fresh active,
  not-banned account and Super Admin RPCs -> readPolar55 -> response validation ->
  fresh authorization. Existing permissions/account boundaries are unchanged.

## Two reproducible pre-dispatch defects

1. **Foreign native fetch receiver:** `deps.fetch(url, init)` binds `this` to the
   dependency object. Cloudflare native fetch rejects it with TypeError / Illegal
   invocation. The request is never sent. A bare local `fetcher` fixes the receiver.
2. **Unsupported redirect mode:** `redirect: "error"` also throws TypeError in
   Workers before dispatch. It is masked by defect 1 when both exist. Use
   `redirect: "manual"` and reject every non-2xx response without following Location.
   Never switch to `follow`, disable TLS or forward the bearer token on redirects.

Both failures are reproduced independently in official cached workerd 2026-10-12,
not just mocked Bun fetch. Before correction the actual configured adapter returns
`unavailable` and the local bound upstream sees no request. Correcting redirect
alone still fails because of the receiver; after both corrections the same adapter
returns `ok` and receives the valid local fixture. No external network is allowed.
The native Request tests continue to assert both failure modes explicitly.

Primary references:

- [Workers Request: unsupported error redirect mode](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Workers Illegal invocation errors](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors)

## What the response proves (and does not)

For this inspected code, disabled/missing/invalid runtime configuration returns
`not_configured` before fetch. `unavailable` is returned only after that guard.
Thus an actual `unavailable` payload from this version means that it already saw
`KINO_POLAR55_ENABLED` exactly true and a nonempty token matching its existing
48–256 character policy. This is a control-flow inference, **not independent live
secret inspection or proof that the token equals the host token**. Do not ask the
owner to share/recreate credentials based on this symptom.

`_serverFn` HTTP 200 is the successful application response envelope; the proxy
catches its downstream failure and returns `unavailable` inside that envelope.
It is not a Polar55 HTTP 200. This explains the misleading apparent success.

These two proven code defects explain the reported pre-dispatch symptom in the
target runtime. No evidence establishes additional production DNS/TLS/firewall,
authorization mismatch, redirects or schema defects. An offline service binding
cannot certify the real hostname's DNS/TLS, network egress, credential equality or
response. No production request or raw response was retrieved to claim otherwise.

## Minimal correction and safe diagnostics

Only the read proxy changes application behavior: call native fetch with the
correct receiver and manual redirect containment. Keep the fixed HTTPS URL,
25-second budget, 300k body limit, no cookies/Origin, TLS defaults, no retries,
strict UTF-8/JSON/Zod/request binding and before/after authorization.

Server-only `kino_polar55_failure` warnings contain fixed enums and optional
numeric HTTP status. No owner, environment values, token length/digest, headers,
Location, response body, raw exception/message/name or Zod paths are logged or
returned. Browser results retain the existing contract/UI. The diagnostic sink
cannot change the result if logging itself fails.

- configuration: disabled / missing_token / invalid_token
- transport: fetch_failed / timeout (does not guess DNS versus TLS)
- http: redirect_rejected / http_error, with numeric status
- headers/body: invalid_content_type / missing_body / body_read_failed / body_limit
- decode/json/schema/binding: invalid_utf8 / invalid_json / invalid_schema /
  request_mismatch

An HTTP 401/403 points to downstream authorization; 3xx identifies a redirect
without disclosing or following its destination; HTTP 200 followed by schema stage
isolates response compatibility. Missing configuration never sends an upstream
request. Diagnostics do not enable an endpoint or expose a raw troubleshooting API.

## Verification

- Official native workerd tests: default process.env reads synthetic bindings,
  authorized status fetch returns 77, all five redirect statuses and
  401/403/429/500 fail closed; unexpected destinations/duplicate dispatches fail.
  globalOutbound is bound to the fixture; external network allowlist is empty.
- Four new Bun tests cover native-compatible invocation/headers, configuration,
  individual failure stages with sensitive markers, no retry, strict validation
  and a throwing log sink. Focused total: 10 PASS / 1 explicit Docker parity skip;
  the full run below executes that parity test instead of skipping it.
- Full Bun regression: **1,646 PASS / 0 FAIL / 24,134 assertions / 220 files**,
  canonical LF-equivalent snapshot preserving immutable assets, with actual
  five-window/three-method Docker PHP parity enabled.
- Strict TypeScript, scoped ESLint/Prettier, production build and diff checks PASS.
  No UI changes; no extra browser suite or Supabase DB replay locally. No PHP, MariaDB, source collector, Cron, grants/data or Supabase changes.
- Regression workflow now includes the offline workerd adapter test. No CI was
  triggered: push/PR creation remain explicitly approval-gated under AGENTS §7.

## Next actions and release/recovery

1. One owner-approved push/Draft PR for this local branch, all three exact-HEAD CI
   gates, independent review and separately approved merge. #507 is merged and
   cannot receive this transport fix as an open PR; do not modify its history.
2. Separately approve Lovable publish of the resulting compatible main. **No new
   PHP ZIP, Polar55 install, secret change, DB migration, grants change, Cron,
   API activation or backfill action is required by these two defects.**
3. From the authorized existing KINO Lab account run one read, not collection.
   Confirm `ok` and the matching Polar55 request. Do not promise the historical
   owner-reported count stays exactly 77 as the existing source collector runs.
4. If failure remains, inspect the single safe `kino_polar55_failure` log event.
   Obtain only fixed stage/reason/HTTP status and timestamp from Lovable runtime
   logs, never secrets or raw response/error bodies. For transport-stage failures
   the hosting operator must check real outbound DNS/TLS/network traces securely;
   for 401/403 compare secrets inside trusted consoles without exposing values;
   for schema failures obtain a separately authorized sanitized structural fixture.
5. Recovery: keep this optional path disabled if necessary through a separately
   approved setting change; do not auto-retry, bypass validation/authentication,
   restore unsafe redirect following, edit source records or change the old Cron.

No push, PR creation, merge, deployment/publish, production read probe, Polar55
mutation, secret access/change or paid provider call was performed.
