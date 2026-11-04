# Atlas V4 — offline candidate completion workbench

The owner-supplied completion archive is preserved byte-for-byte at
`research/atlas-v4-completion-20261031.zip` (1,396,334 bytes; SHA-256
`85c42846ed23902a65630af811ff7302a1f4c664bdae7004396610b5292efa20`).
The verifier checks every one of its 12 manifest entries, all intermediate
technique objects, the 123 immutable originals and the final Step4c SHA
`3a0f8c079b6be50d27f9e461cfc7b370ff61f41429173de80500bdc12c59b0dc`.
The archive contains research data, not executable dependencies.

## Evidence and limits

All 123 techniques retain their IDs, original instructions, provenance and false
production approval/execution flags. There are 107 offline candidates and 16
held/context-only entries. The complete candidate universe is 5,671 pairs:
57 preliminary same-profile screenings and 5,614 explicitly unknown pairs,
including all 975 earlier cross-profile priority pairs. No pair is verified
compatible or conflicting. The older 7,503-pair count covers all 123 techniques,
not just the 107 candidates. Empty conflicts never prove compatibility.
The supplied 16 policy checks are editorial assertions, not certification.

Only one candidate can be previewed at a time, including for the 57 screened
pairs. No candidate becomes approved through use of this workbench. The canonical
RC1, canonical V4, original 636-task JSON, production SQL/worker guards and live
Generator authorization remain authoritative and unchanged.

## Local review and confirmation

Run with the repository Bun version:

```sh
bun scripts/atlas-offline-review.ts verify
bun scripts/atlas-offline-review.ts preview --setup /local/control.json --request /local/request.json --actor local-reviewer --out /local/new-preview --opt-in --accept-unverified --locale el
bun scripts/atlas-offline-review.ts confirm --setup /local/control.json --preview /local/new-preview/preview.json --confirmation /local/confirmation.json --actor local-reviewer --out /local/new-confirmed --opt-in --accept-unverified
```

Paths must be local. Output directories must not exist. The tool writes an exact
EL/EN HTML and Markdown preview, before/after data, a non-executable result
wrapper and four assembled V5 BETA 1/BETA 2 prompt strings. HTML disables scripts,
forms and connections, escapes all input, uses project design tokens and supports
keyboard/scroll/mobile review. Files can contain the reviewer's own manual text:
keep them locally outside Git and do not upload them as public artifacts.

`prepareOfflineAtlasPilot("ATLAS-OFFLINE-01")` through `10` supplies reproducible
control text and a request. Requests contain `techniqueIds` (exactly one),
`profileId`, `optIn: true`, `acceptUnverified: true`, an exact Blueprint section
identity in `scope`, explicit `intent`, `voices` and optional `pilotId`.
Confirmation contains `actorId`, `previewSha256`, `acceptUnverified: true` and
`manualCompatibility: "reviewed_no_conflict"`. Inspect manual constraints first;
declaring this value is the local reviewer's responsibility, not an automated
musicological adjudication.

The local `offline/local-review` context binds confirmation to the local actor,
full setup, pinned source and preview. It is not a Supabase authentication token,
live CAS/replay receipt or authorization to execute a model. The result wrapper
is deliberately rejected by the ordinary Advanced Setup importer. No server,
browser route, job, worker or provider imports this tooling. No signing key or
production approval is needed to assemble local candidate previews.

## Correct fields, bounds and preserved controls

Each candidate appends to its exact Step3 field (`additionalInstructions`,
`productionStyle` or `customInstruments`) with the selected section and occurrence.
Every other setup value remains identical. Manual instructions, language,
rhyming/singability, BPM, instruments, structure, Blueprint/energy and voice
choices are never silently replaced. Explicit wedding/group/traditional intent
checks supplement manual review. General natural-language contradictions remain
a human review boundary; this tool does not claim to detect all of them.

Real Generator parser, language resolver, value merging, Blueprint serializer,
authoring bounds and pure V5 builders are reused. Duplicate text, ambiguous
Blueprint identities, unknown/held/multiple techniques, extra properties,
stale/foreign/tampered confirmation and values requiring truncation are rejected.
Some source instrument instructions exceed the existing 200-character authoring
limit: they remain inspectable source candidates but cannot be materialized in
that field. They are never silently rerouted into another field.

## Ten deterministic A/B contract pilots

The immutable source ZIP contains ten A/B pairs for protyazhnaya (3), chastushka
(3), khorovod (2) and wedding folk (2). The original B differs only in additional
instructions. All original controls use lowercase `bpmMode: "custom"`; the file
parser accepts it but the actual Generator expects `"Custom"`. Derived offline
controls explicitly record that spelling correction without changing 96 BPM.
Original archive bytes stay unchanged. Wedding pilots 09/10 use their exact
more-specific supplied pilot instruction rather than inventing replacements.

Each pilot parses a real setup, binds a specific Verse scope, previews exactly
one field, preserves every other value, confirms locally and renders control
and candidate text through the actual V5 BETA 1 and registry BETA 2 compilers.
The generic acoustic-rock/electric-guitar controls and synthetic vocal intent
are contract fixtures, not proof that these arrangements suit every folk profile.
Before a separately authorized listening experiment, a reviewer must choose
musically suitable controls and evaluate the predicted phrasing/refrain/dialogue
change against an otherwise identical control, including negative effects on
language, singability, rhythm and arrangement. No audible improvement is claimed.
The owner's earlier two-A/two-B observation was inconclusive.

## Verification and next release boundary

Focused offline tests validate all ten flows, archive integrity, mapping/bounds,
confirmation freshness, consent, local authority and injection escaping. Browser
tests exercise EL/EN exact text, mobile/tablet/desktop containment, keyboard
expansion and zero report network requests. V5 and existing Atlas regressions
remain required, as do full Bun, TypeScript, lint/format, build and the three
exact-final-HEAD CI gates. Final links and results belong in PR #450.

This is a local research candidate workbench. Live Generator transfer, approval,
musicological/native-language certification and any paid listening experiment
remain separate decisions. No migration is needed for the offline addition.
Do not merge, deploy, publish or activate techniques as part of this task.
Recovery for this code-only addition is to stop using the local tool; it has no
production state to roll back and preserves the original archive and libraries.
