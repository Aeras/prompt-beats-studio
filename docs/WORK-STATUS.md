# PromptBeats — Work Status (authoritative workflow ledger)

Read root `AGENTS.md` first. This ledger is **not** an audit report: it records independently verified current work, deployment status and evidence. Do not infer that a merged PR means release complete.

## Status vocabulary
- `OPEN`: verified remaining work not started.
- `IN_PROGRESS`: end-to-end work in active branch/PR.
- `BLOCKED`: cannot safely finish, with explicit owner/handoff and reason.
- `CODE_COMPLETE_RELEASE_PENDING`: complete merged code, but required deployment, migration or live verification is outstanding.
- `CLOSED`: all agreed acceptance and release checks verified, including deployment only if required.

## Reconciliation baseline — 2026-10-25

20 GitHub PRs **#403–#422** were verified merged during the audit conversation. Their merges are historical evidence of implementation, **not proof that every audit finding is CLOSED** or that code/migrations reached production. This ledger must be reconciled finding-by-finding against the live repository and release evidence; **do not repeat the original B-Findings register as an active backlog**.

| Scope | Current documented status | Evidence | Next verification / blocker |
| --- | --- | --- | --- |
| Repository workflow policy | IN_PROGRESS | This PR: root `AGENTS.md`, ledger and CI gate | Mandatory CI checks and merge; configure ChatGPT Project Instructions separately |
| Audit findings PB-AUD-001…026 | RECONCILIATION_REQUIRED (inventory only, **not** individual finding state) | Merged GitHub PRs #403–#422 and original Report B | Inspect complete merged PR evidence and release state before individually labeling findings; do not reopen solved code issues |
| New RLS scanner observations (profiles, likes, public_staff_badges) | DEFERRED BY OWNER (not in original 26) | User decision | No blanket RLS changes until explicitly resumed |

## Required entry for every new task/finding

Copy the entry below **before the feature PR is merged**, replacing each placeholder with factual evidence. A new entry can remain IN_PROGRESS or BLOCKED when the scope cannot safely be closed.

### TASK-ID — title
- **Status:** OPEN | IN_PROGRESS | BLOCKED | CODE_COMPLETE_RELEASE_PENDING | CLOSED
- **Scope / acceptance:** …
- **Investigation:** current main SHA; reproduction; affected client/server/DB/integration paths; prior PR and impact review
- **Execution owner:** ChatGPT; or ChatGPT + Codex; Lovable only for proven tool limitation
- **PR and exact HEAD:** …
- **Verification:** focused tests; Regression; Browser Quality; Database Replay; other relevant evidence
- **Release:** migration/deploy/live checks necessary? applied? rollback plan?
- **Remaining work / owner:** precise next action or “none”
- **Closure evidence:** date and links; do not state CLOSED until complete
