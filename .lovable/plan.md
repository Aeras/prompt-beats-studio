# PB-011: HTTPS preview of `proof/pb-011-family-a-android` @ `5a1536e`

## Answer: Yes — with one caveat about the exact commit

Lovable can serve an HTTPS preview of that branch **without touching GitHub `main` or the
production deployment**, because:

- The preview URL (`id-preview--….lovable.app`) always reflects the project's **currently
  synced GitHub branch** — switching the synced branch changes only the preview.
- **Production (promptbeats.app) only changes when you click Publish.** Switching the synced
  branch does not deploy anything.
- GitHub `main` is never modified by a branch switch — no commits are created or lost.

### Caveat: commit pinning

Lovable syncs the **branch tip**, not an arbitrary commit SHA. Commit
`5a1536ee2b110103e051de55f809e603dd21f584` will be previewed exactly only if it is still the
tip of `proof/pb-011-family-a-android`. If the branch has moved, create a pointer branch on
GitHub at that commit first:

```text
git branch pb-011-preview-5a1536e 5a1536ee2b110103e051de55f809e603dd21f584
git push origin pb-011-preview-5a1536e
```

and sync to that pointer branch instead.

## Exact supported workflow (manual, in the Lovable editor)

1. On GitHub, confirm `5a1536e` is the tip of `proof/pb-011-family-a-android`
   (or push the pointer branch above).
2. In the Lovable editor: chat input **Plus (+) menu → GitHub → manage project** → switch
   the synced branch to `proof/pb-011-family-a-android` (or the pointer branch).
3. Wait for the sync to pull the branch in; the preview reloads automatically.
4. Open the preview URL — it now serves that branch over HTTPS.
5. **Do not click Publish** — production stays on the last published `main` state.
6. When done, switch the synced branch back to `main`; the previous main preview state is
   restored, nothing is lost.

## What I cannot do from chat

The branch switch itself is a dashboard-only action — the chat agent cannot select the synced
branch, and this sandbox's git mirror only receives the active branch, so I cannot verify the
branch tip from here. No code, commits, syncs, or deployments are part of this plan.
