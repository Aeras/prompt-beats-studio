# Publishing branch `pb010-ui-ux-quality-audit` (commit cc5bf6b)

## Answer

**Yes for a branch, no for pinning an arbitrary commit SHA directly.**

Lovable publishes the project state that is currently synced with the project's **active GitHub branch** — it has no "publish this commit SHA" option.

- **Branch:** Supported. Switch the project's GitHub sync to `pb010-ui-ux-quality-audit` (Project Settings → GitHub branch switch, one dashboard action). Lovable pulls that branch's tip into the project; Publish then deploys exactly that state.
- **Exact commit `cc5bf6b`:** Not directly supported. If the branch tip has moved past that commit, create a pointer branch at it on GitHub (e.g. `pb010-publish-cc5bf6b` → `cc5bf6b68edb726eb0743a72e2ab32dae001f240`), switch the synced branch to it, and publish. The deployed tree then equals that commit exactly.

## Verification notes (read-only, already done)

- Docs confirm: sync is one-branch-at-a-time; branch switching is supported; there is no publish-from-arbitrary-commit feature.
- The sandbox's Lovable-side git mirror only tracks `main` (plus `_agent-publish` and two `lovable-backup-main-*` branches). The `pb010...` branch is not visible from the sandbox, so its existence and whether its tip still equals `cc5bf6b` must be confirmed on GitHub before publishing.

## Execution steps (only if approved)

1. On GitHub, confirm `pb010-ui-ux-quality-audit` exists and check whether its tip is `cc5bf6b`. If the tip has moved, create `pb010-publish-cc5bf6b` at `cc5bf6b`.
2. In Lovable Project Settings, switch the GitHub sync to the chosen branch; wait for the sync so the preview serves the branch state.
3. Verify the preview reflects the branch (spot-check the pb010 UI/UX changes).
4. Publish (deploy) with the branch checked out.
5. Switch the GitHub sync back to `main` afterwards so normal two-way sync and the PB release flow resume.

## Caveats

- Publishing a branch bypasses the repo's release gates (regression, browser quality, database replay) that the PB registry requires for `main` — this ships unmerged code to https://promptbeats.app.
- While the synced branch is not `main`, chat edits land on that branch and two-way sync with `main` is paused until switched back.
- The local sandbox cannot itself perform the branch switch or push branches; steps 1–2 are dashboard/GitHub actions.
