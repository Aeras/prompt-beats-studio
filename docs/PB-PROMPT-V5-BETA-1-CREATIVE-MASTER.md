# Prompt Version 5 BETA 1 — Creative Master

Status: CODE_COMPLETE_RELEASE_PENDING. Research candidate, not proven superior to V4 or any earlier version.

## Source and integrity

Canonical source: [Creative Master V2 Markdown](prompts/PromptBeats_TEAM09_Creative_Master_Prompt_V2_CANDIDATE_2026-10-30.md), supplied by the owner on 2026-10-30. Exact UTF-8 bytes: 31,772; SHA-256 `f27e91b49e18b9d083359843b70ecb61b66fb4cab196878349fc086c5d0498e1`. No paraphrase, heading removal, line-ending conversion or creative edits. The checked-in immutable TypeScript literal reconstructs the same bytes. Narrow `.gitattributes` and Prettier exclusions protect only this canonical asset; automated hash equality checks detect drift.

All nine original placeholders occur once. The V5 builder validates required inputs, uses existing V4 platform normalization and occurrence-specific Blueprint serialization, then performs a single replacement pass with callback values. Inserted user text containing placeholders or dollar replacement syntax is never re-scanned. Blank optional fields retain V4's `(not provided)` convention.

## Routing and permissions

Internal version `v5_beta_1`; exact selector label `Prompt Version 5 BETA 1 — Creative Master`, immediately after V4. V1 remains the initial/default version. Visible only in Super Admin Advanced new-song mode. Admission checks current server-side Super Admin authority, advanced flag, Advanced input snapshot and generate operation before job creation. Worker independently re-checks Super Admin and Advanced new-song snapshot for raw/forged jobs before the provider-start marker.

`generateInput`, admission/stored-job contracts and benchmark type accept V5. Stored input payload preserves its identity through job reads/recovery and benchmark export; no historical job is relabelled or backfilled. Saved-prompt/revision schemas and version-history behavior are unchanged. Unknown versions reject rather than silently route to V5. The retired direct-generation endpoint remains disabled.

Independent V5 dispatch uses its own builder, never V4 or V3 planning. Shared system instructions, four-field result/schema (`title`, `tags`, `lyrics`, `note`), provider/model selection, usage/execution identity, idempotency, uncertain-outcome recovery and token/reasoning settings are unchanged. Existing Advanced Suno enrichment and final style fitting still operate through the same runtime pipeline. No extra generation/refinement/Quality Check call is introduced.

## Verification and limits

Tests compare canonical bytes, frozen template/hash, all placeholders and one-pass substitutions, repeated Blueprint occurrences, Suno/Udio, required/optional fields, actual dispatch branches, actual admission/worker permission rejection before provider start, duplicate completion, old defaults/job decoding and benchmark metadata. Existing V4 tests and source files remain unchanged. Mocked desktop/tablet/mobile checks cover selector order/default/selection, ordinary-user exclusion, Basic-mode hiding and no dispatch on selection. Final counts and three exact-head CI links are maintained in the single Draft PR and Work Status.

Offline tests establish implementation contracts, not musical superiority, native-language quality, generated audio, provider obedience or real latency/cost. The longer candidate may use more input tokens; evaluate only with separate explicit spend authorization. No paid generation was performed.

## Release and rollback

V5 introduces no SQL migration, global switch, pricing change or model setting. Independent review, all three green exact-head gates and separate merge/publish authorization are required. Before publishing the merged main, verify its existing release prerequisites (including PB-015 schema compatibility); this task does not infer that earlier main migrations or Lovable publication are complete and does not apply unrelated migrations.

After approved publication, verify selector restrictions and actual published version without a paid call. Any paid candidate comparison requires a separately approved experiment. V4 and V1–V3 remain selectable; V1 remains default. Roll back through a forward application commit/release, retain all job/usage/history records, and never rewrite pushed history or relabel existing jobs.
