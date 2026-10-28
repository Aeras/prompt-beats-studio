# Music Inspiration — result consistency and trusted provenance

## Verified incident and baseline

Baseline main 077a03f0ff556fc86361ae608407c831e726b7d9 (merged #461). Production job f77c1b09-a5d4-4012-ad05-cdaa2b0dde34 failed at ai_schema / proposal. Read-only inspection and offline validation of its stored response proved:

1. Eight ordered Blueprint entries have zero-based indices, but songStructure includes duration annotations while sectionType contains bare section names. The exact-equality refinement fails; that relational refinement is not expressed in generated JSON Schema.
2. After resolving that mismatch, the same full offline validation exposes source metadata differences: rewritten titles/locators and one copied retrieval timestamp. IDs, URLs, content hashes, receipt identity/accessibility and every quoted substring match the saved retrieval evidence.
3. The actual receipt provider is openrouter; the model is openai/gpt-6.1-sol. Input/output 4071/4198, reasoning 185 included in output, cache reads 0, cache writes 4068, provider-reported amount USD 0.052156. Five observed search credits at the saved USD 0.008 tariff give USD 0.04. The saved cache-write tariff is null: an independent complete platform-tariff estimate cannot be fabricated. These usage fields did not cause validation failure. [OpenRouter cache usage documentation](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/prompt-caching.mdx) distinguishes cache writes from reads. No tariff, model routing, historical accounting or production record is changed.

## Minimal correction and invariants

- Tell the research model explicitly that both structure arrays must have identical order, length, zero-based indices and labels; durations belong in instruction. Copy server-owned source metadata verbatim.
- At the provider boundary only, reconcile duplicate labels when one is the other's exact prefix followed by a spaced dash or colon annotation. Keep the complete longer label in both arrays. Preserve all section content, instructions, energy, ordering and raw response. This is not fuzzy matching, section reordering, duration invention or a change to user-authored Generator settings.
- Reject inconsistent counts/indices, unrelated labels, conflicting annotations and malformed entries. Reapply the unchanged strict application schema. Already-valid proposals remain unchanged.
- Hydrate server-owned source metadata only for a matching source ID, URL, content hash, evidence-access mode and receipt document ID/final URL/hash/accessibility. Dates, titles and locators come from the trusted retriever. Unknown identities or changed protected fields are not repaired; the existing strict provenance validator rejects them. Exact quotation checks and all evidence cross-references remain enforced.
- Keep the original provider receipt/text and usage unchanged. No second model request, source retrieval or automatic repair call. Existing durable recovery uses the same parser for stored responses; claims, cancellation, global AI policy and accounting constraints are unchanged.
- Allowlisted diagnostics distinguish proposal.blueprint / proposal.songStructure without logging arbitrary property names, prompt contents or provider bodies.

## Verification

The full synthesis path was replayed offline using the actual stored response and four saved retrieval documents: PASS, eight sections, exact provenance/quotes verified, original receipt preserved, zero external calls. No real research content or private production fixture is committed.

Synthetic regressions cover multilingual annotations in both directions, idempotency and no mutation, actual source metadata restoration, changed URL/hash/receipt/accessibility/unknown-source rejection, fabricated quotation rejection, inconsistent section labels, safe nested diagnostics, concurrent stored-response recovery without new provider dispatch or duplicate accounting, and missing cache-write tariffs without invented cost.

Local focused tests: 60 PASS / 0 FAIL. Full suite: 1305 PASS / 0 FAIL / 13083 assertions / 180 files in an isolated LF-equivalent source snapshot. Exact-head CI links/results are maintained in the PR. Required gates: Regression, Browser Quality, Database Replay. No production changes or paid API calls.

## Release, existing failed job and rollback

Application-only: no migration, scheduler/secret update, price update or database repair. Merge and compatible Lovable publish require separate owner authorization. Verify published snapshot, then any real pilot needs approval for external search/AI consumption.

The historical failed job remains failed and its saved receipt/accounting remain intact. Offline recoverability is proven; it does not authorize a production status rewrite or imply that failed jobs are automatically reclaimed. Restoring that particular result to the account requires a separately authorized, controlled no-dispatch recovery action using the preserved receipt. Never start a fresh paid request merely to recover already obtained work.

If publication reveals a problem, stop initiating new research, preserve provider/search receipts and diagnostics, and use a scoped forward correction or the last compatible application snapshot. No rollback of database/financial history is required or authorized. Atlas #450 remains paused/untouched. Keep CODE_COMPLETE_RELEASE_PENDING until production acceptance is actually verified.
