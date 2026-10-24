# PB-AUD-020 — dependency hardening

## Baseline and scope

- Audit and implementation base: `ef7b77656b1c6de7b85f113467d006f5d227f5f3`.
- Date: 24 October 2026. Package manager and CI: Bun 1.4.2, text `bun.lock`.
- The original checkout and its untracked attachments were preserved. Implementation uses a separate clean worktree.
- The fresh baseline audit reproduced 15 unique GHSA IDs (22 package/range entries, 8 package names). Upstream severity is not a demonstrated production exploit.
- No overlapping dependency-hardening PR was found during preflight.
- No application source, schemas, prompts, model selection, Quality Check, billing, migrations, or production configuration changed.

## Compatible updates

All transitive updates stay within their existing parent ranges. No new overrides or dependencies were introduced.

| Package         | Before         | After           | Dependency path and exposure                                                                                   |
| --------------- | -------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| vite            | 8.1.5          | 8.1.6           | Direct dev dependency; dev server/build tooling, not the deployed server runtime                               |
| launch-editor   | 2.14.1         | 2.14.2          | Lovable Vite config → TanStack devtools-vite → devtools-bundler-core; editor launch endpoint in development    |
| shell-quote     | 1.10.0         | 1.12.0          | Above → launch-editor; command quoting in development tooling                                                  |
| brace-expansion | 1.1.16 / 5.0.8 | 1.1.21 / 5.0.12 | ESLint config-array → minimatch 3; typescript-estree → minimatch → brace-expansion 5; build/lint glob handling |
| nanoid          | 3.3.16         | 3.3.20          | Vite → PostCSS; build-time identifier generation                                                               |
| source-map-js   | 1.2.1          | 1.2.2           | PostCSS and Tailwind node; source-map generation/consumption during build                                      |

Both brace-expansion API majors were preserved. Vite remains on the supported 8.1 security patch line. Existing TanStack, Lovable, React, Supabase and Zod pins/ranges are unchanged. Incidental picomatch hoisting changes from resolution were removed; frozen installation accepts the narrowed lockfile.

## Advisories removed from the fresh audit

The affected ranges below are those reported for the installed baseline branches, not an exhaustive listing of all upstream major lines.

| GHSA ID                                                                  | Package / affected baseline range      | First fixed version in that line |
| ------------------------------------------------------------------------ | -------------------------------------- | -------------------------------- |
| [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | shell-quote >=1.8.4 <1.11.0            | 1.11.0                           |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | launch-editor <=2.14.1; Vite 8.0–8.1.5 | 2.14.2 / 8.1.6                   |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | launch-editor <=2.14.1; Vite 8.0–8.1.5 | 2.14.2 / 8.1.6                   |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | launch-editor <=2.14.1; Vite 8.0–8.1.5 | 2.14.2 / 8.1.6                   |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | Vite >=8.0.0 <=8.1.5                   | 8.1.6                            |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | Vite >=8.0.0 <=8.1.5                   | 8.1.6                            |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | brace-expansion <1.1.17                | 1.1.17                           |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | brace-expansion <1.1.18; >=4 <5.0.9    | 1.1.18 / 5.0.9                   |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion <1.1.20; >=4 <5.0.11   | 1.1.20 / 5.0.11                  |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion <1.1.19; >=4 <5.0.10   | 1.1.19 / 5.0.10                  |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | brace-expansion <1.1.21; >=4 <5.0.12   | 1.1.21 / 5.0.12                  |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | nanoid <3.3.18                         | 3.3.18                           |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js >=1.0.0 <1.2.2           | 1.2.2                            |

## Reachability assessment

- Vite/editor/quoting vulnerabilities require development-server/editor functionality, not simply a running deployed PromptBeats site. A browser/developer may supply untrusted filenames, requests, or quoting input to that tooling. They are patched regardless; do not expose development servers to untrusted networks.
- Brace expansion processes glob patterns in the lint/build dependency tree. No application endpoint importing it was found. Untrusted generated source/globs can affect developer/CI tooling; no production attack path was demonstrated.
- Nanoid and source-map-js are reached by the CSS build pipeline. Their presence does not establish that application users control the vulnerable API parameters. Build input and source maps remain trust boundaries. Production build and Browser Quality gate cover compatibility.
- These are static call-site/dependency-tree conclusions, not penetration-test or production-install evidence.

## Remaining findings — not suppressed or accepted silently

### Zod 3.25.76 — High upstream; decision required

- [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): affected <4.6.6; official patched release 4.6.6.
- Direct runtime dependency. Registry metadata still lists 3.25.76 as the highest 3.x version. The official [fix #6652](https://github.com/colinhacks/zod/pull/6652) is for v4; no supported 3.x patch was found.
- Server input validation genuinely uses collection schemas, e.g. `src/lib/project-bulk-delete.functions.ts`, `src/lib/playlists.functions.ts`, and `src/lib/song-analyzer-final.functions.ts`. Untrusted request collections reach Zod. Authentication does not by itself bound parser resource consumption.
- Collection `.max()` rejects invalid results but is not an early parser-work bound in the installed v3. A safe two-element local probe against an array with max(1) visited both elements before rejecting; no oversized payload or production request was used.
- Request/body limits can reduce exposure but were not established as a universal pre-validation bound here. Do not claim this production risk is eliminated.
- The already-existing transitive Zod 4.6.7 copies used by TanStack are patched; they do not replace the application's v3 dependency.
- Recommended next decision: authorize a separately assessed Zod 4 migration with schema/default/coercion/refinement/error-shape compatibility tests. Alternative: an upstream-supported v3 backport if one becomes available. No unreviewed fork, monkeypatch, or assertion-based compatibility shim was installed.

### esbuild 0.18.20 — Moderate upstream; dev-only non-reachable serve API in inspected path

- [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99): affected <=0.24.2; patched 0.25.0.
- Path: dev `drizzle-kit@0.31.10` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → esbuild ~0.18.20.
- The vulnerable feature is esbuild's HTTP serve API/CORS behavior. Inspected core-utils uses transforms, not that serve API. No application import or serve call was found; Drizzle is only referenced by `drizzle.config.ts`. This is not a demonstrated production exploit.
- Registry's current Drizzle 0.31.11 still depends on the old loader; current core-utils is still 3.3.2. A parent patch does not remove the vulnerable copy.
- Existing esbuild 0.25.12 and tsx's 0.28.2 are unaffected. Do not globally override or force 0.25+ into the loader's ~0.18.20 contract without dedicated compatibility authority/testing.
- Mitigation: never run this copy's serve API or expose database/development tooling. Retain visibility in audit output. Follow up with upstream loader replacement/removal, or explicitly authorize a tested out-of-range override. No database command was executed.

## Verification and reproduction

Commands use installed local tooling (no unpinned bunx downloads):

```sh
bun install --frozen-lockfile
bun audit --json
bun test src/lib/dependency-security.test.ts
bun test
bunx --no-install eslint src/lib/dependency-security.test.ts
bunx --no-install prettier --check package.json src/lib/dependency-security.test.ts docs/PB-AUD-020-dependency-hardening.md
bun run build
bunx --no-install tsc --noEmit --pretty false
git diff --check
```

Local full-suite runs use an external offline preload blocking network and subprocess execution, while allowing existing test doubles. No secrets were copied into the clean worktree. The baseline-compatible dependency update passed the original 963 tests (148 files, 6,833 assertions). Seven new lockfile security-floor tests inspect every installed lock entry within each remediated major, guarding against vulnerable nested duplicates; these are not a substitute for ongoing advisory audits.

The fresh audit exits 1 intentionally because the two findings above remain visible. No audit-ignore file, severity filter, or allowlist was added. Full-tree lint has documented pre-existing debt; this PR enforces changed-source lint and does not reformat unrelated files.

Final test/CI results and exact head are recorded in the PR/check runs. Browser Quality and Database Replay must be read at that exact head before any readiness claim. Database Replay uses a fresh CI-local database, never production.

## Compatibility, rollback and release decision

Only compatible dependency patches, this report and focused regression tests are in scope. No compatibility adaptation to application code was necessary. Lockfile diff preserves unrelated versions/resolution and existing overrides. No database migration, data change, release, paid AI call, or deployment is part of this PR.

Rollback, if authorized after merge, is a normal revert of this dependency change and frozen reinstall, not history rewriting; it would reintroduce the documented advisories. No data rollback is needed.

**PB-AUD-020 is partially remediated, not closed.** Keep the PR in Draft until the user decides the Zod migration scope and explicitly reviews the residual esbuild justification. Green functional CI is not a zero-advisory security approval.
