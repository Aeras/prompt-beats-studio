# Cultural Song Atlas Beta — implementation and release

## Contract / baseline

User-approved handoff dated 27 October 2026. Baseline main `adef34e31803a5e41736144066fe5c90db2f0184`; one branch `codex/cultural-song-atlas-beta` and one Draft PR. No merge, production SQL, publish, policy rollout or paid calls authorized. Existing PR #445 and Analyzer experiments remain independent.

## What is intentionally usable now

`/song-atlas` is an authenticated **internal research preview**, gated by permanent Beta key `cultural_song_atlas`. Staff and explicitly entitled Beta testers only, subject to fresh account/ban/suspension checks. There are 58 searchable Russian profile cards, 14 candidates excluded, evidence/provenance, context-only badges, independent dimension selection, locally saved account-scoped research drafts and explicit conflicts. Greek source text is identified as such in the English UI, not silently machine-translated. Source links are HTTPS only with no credentials/query/fragment/local addresses and use opener isolation. No remote fetching or HTML rendering.

**No RC1 option is approved for Generator transfer.** All 65 original creative instructions are preserved verbatim and all remain unapproved. Six optional mode placeholders (chastushka lively/legato, battle rap a cappella/beat, phonk lineage/drift) are separate from the immutable source and remain unapproved. Dimension choices are research selections, not active instructions. Disabled transfer UI, authenticated validation, server compilation, raw SQL job trigger and worker RPC all deny live unapproved transfer. A future Beta-to-Stable transition does not bypass the additional internal-preview SQL check.

This is the explicit content boundary in the handoff, not a missing production enablement step. No cultural card implies language, instruments, BPM, scale, harmony, gender or narrative. Empty/context-only selections compile an empty string. Ballad narrative is optional; language-specific fixture guidance is matched against actual selected lyrics language. No narrative progression score is added.

## Source and projection

Canonical source: `src/data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json`, byte SHA-256 `fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a`. Exact bytes use a narrowly scoped `-text` attribute and Prettier exemption. No editing of RC1, research drafts or approval fields. Its 58 profiles, 14 candidates, 65 techniques and 97 source records remain losslessly available in the repository.

`src/lib/song-atlas-data.server.ts` projects only explicit card fields, safe bibliography fields and option definitions. Review drafts and full evidence metadata are not returned to clients. The source JSON is a server-only dependency loaded after authorization, not a public static asset or main browser-bundle import. The projection includes stable profile/claim/source IDs and exact source SHA. The protected response uses private/no-store and Vary Cookie/Authorization. Downloaded content cannot be retrospectively erased; no-store is not DRM.

## Entry / admission matrix

- Sidebar: managed Beta visibility; direct deep links also gated by BetaFeatureGate.
- `getSongAtlasPreview`: authenticated middleware, fresh requireFeatureAccess, caller-bound `atlas_preview_admission`, then dynamic server content read.
- `validateSongAtlasHandoff`: same authorization and strict versioned envelope, then selected-only approved-option compiler.
- `startGenerationJob`: optional strict atlasOrigin validated before model selection/admission; no Atlas branch at all without metadata.
- Direct/raw SQL generation: trigger rejects any non-null atlasOrigin. Worker: service-only explicit-owner admission and compiler before provider selection. RC1 transfer is denied unconditionally at SQL boundaries until separately reviewed individual promotion.
- Existing 19 Feature Access keys/policies and role meanings unchanged. Existing Beta predicates/RLS are reused; no browser or service-role access to Beta tables is granted.

Browser caches are account-scoped and revalidate every 15 foreground seconds, on focus and reload; refetch errors hide content. Every new protected server request checks real access. An already delivered response/open connection cannot be retroactively revoked. PWA background timers are not a server authorization guarantee; relaunch/deep-link checks remain authoritative. No new service worker cache is introduced.

## Versioned Generator bridge

Separate strict format `promptbeats-atlas-handoff`, schemaVersion 1, UUID, source SHA and selected stable IDs. **Existing Advanced Setup v1 is unchanged and remains strict.** No unknown extra fields are passed through its importer. No broad DNA text or client-authoritative instructions enter the compiler. Selection limits: 8 profiles, 24 options; no duplicates; explicit exclusivity and language conflicts; 1,600-character compiled ceiling plus 2,000-character combined Generator ceiling with no truncation.

Session handoff is account-scoped. The Generator bridge appears only when an Atlas-origin envelope exists, shows Creative Techniques only there, requests fresh server validation and requires explicit Apply. Ordinary Generator fields, setup drafts, Blueprint, language, PB-007 New Song/Resume, prompts and QC are not rewritten. Failed/unapproved handoffs never call the application callback. Repeated identical additions are idempotent; different handoffs remain explicit. Selected-only instructions are additive, never silently replacing existing values. Current RC1 cannot reach a live Apply success.

## Individual approval / promotion (not authorized here)

1. Select a stable profile/option ID and source SHA; independently adjudicate sources, language/prosody, context versus genre, creative suggestion versus factual claim and safety. Keep candidates out of preview until individually cleared with traceable review.
2. Run fixed multilingual/genre/Blueprint/narrative and user-conflict fixtures plus explicitly authorized provider/audio evaluation. Offline fixture `approved:true` is not live approval.
3. Approve only reviewed individual instructions in a dedicated, versioned server allowlist; do not turn all options on or trust RC1's wording. Review server re-compilation, persisted provenance/idempotency, existing-field conflicts and limits.
4. Replace the RC1 deny-all SQL transfer gates with an individually constrained admission design in the same reviewed forward release. Never simply remove guards, toggle Beta to Stable or treat manual checkbox selection as validation.
5. Public browsing is a separate editorial approval. Until then retain beta_can_test even if lifecycle is promoted. No global approval switch exists in this implementation.

## Migration / release / rollback

New forward migration `20261027011834_register_cultural_song_atlas.sql`: exact Beta registration, caller-only internal-preview RPC, RC1 generation trigger and service-only worker gate. No existing rows, data, legacy policies or historical migrations are modified. Trigger leaves ordinary/legacy payloads unchanged. No destructive backfill.

Read-only production preflight at implementation time: correct project `qwlksrcsovbncmretjdt`, Beta tables/registration function exist, Atlas not registered and all 19 original policy rows exist. This is not authorization to deploy and not proof of the currently published binary.

Before separately approved production release: exact final HEAD/all gates/review, actual prerequisite definitions/history, recovery capability, no concurrent release, compare the 19 rows, apply only this registration migration via history-aware workflow, verify permissions/stage, then publish compatible code through Lovable with separate approval. Verify allowed tester versus ordinary/banned/suspended roles, direct links, search and disabled transfer. Do not move the feature to everyone/Stable automatically.

Rollback: restore a previously compatible application through the approved publish process, retaining additive registration, trigger and audit evidence. Prefer forward correction. Do not drop Beta metadata, reset policies, disable RLS or remove transfer guards. There are no live Atlas generations to migrate. Never represent merge/editor sync as release completion.

## Verification evidence

Focused tests validate byte hash, all IDs/source references/counts, no active technique, context-only emptiness, optional variants, cross-language/conflicts, strict handoff/limits, unchanged Advanced Setup v1, ordinary byte-identical instructions, idempotence, real mocked server authorization order and safe failures. SQL/RLS fixture covers staff/tester/ordinary, grant revocation, Auth bans, staff suspension, ACLs, Stable internal-only restriction, worker/raw-job denial and legacy policy equality. Independent PostgreSQL connections prove revocation-first admission ordering and regrant compatibility.

Playwright desktop/tablet/mobile exercises 58 cards, source details, accessibility, viewport overflow, search, selection/conflicts, draft refresh, disabled transfer and denied/revoked direct links. No paid providers are used. Full local and exact-head Regression/Browser Quality/Database Replay results and final SHA are recorded in the single Draft PR and WORK-STATUS. Status remains CODE_COMPLETE_RELEASE_PENDING; content transfer remains intentionally unapproved.
