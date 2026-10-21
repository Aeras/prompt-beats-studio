# V3-D — Phonetic Flow, Multilingual Singability (15-job study)

## Scope
One candidate only: **D**. Exactly 15 generations: three authored briefs in each of
Russian (ru), Greek (el), English (en), Spanish (es), French (fr). The three
brief families per language are pop (audible chorus rhyme, no forced scheme),
piano ballad (explicit four-sung-line ABAB chorus), and hook pop (literal
language-specific hook preserved in both choruses). One generation per brief.
Do not generate Current, A, A+B or C again.

D adds the existing A RHYME INTENT guidance plus a compact set of language-
specific audible-rhyme, breath/flow and section-dynamics instructions. It
does **not** include B's ending-word planning or C's long language-first
checklist. It preserves user-defined structure, hooks, genre and rhyme scheme,
and expressly rejects mandatory syllable formulas or arbitrary story arcs.

## Existing benchmark comparison
The previous V3-C ZIP has 24 Russian generations across Current, A, A+B and
C, with two repeats per pop/ballad/hook brief. Russian D briefs are thematically
aligned, but this new study is not a fully paired randomized controlled
comparison (one D output per brief; potential prompt/tempo/voice differences).
Do not compare raw averages across languages against Russian-only baselines.
Report Russian D vs historical Russian arms as **exploratory** and all other
languages as **new-language capability probes**. Preserve the old ZIP.

## Offline manifest (no API calls)
```sh
bun scripts/benchmarks/v3-runner.ts --d-only --dry-run
bun scripts/benchmarks/v3-runner.ts --d-only --dry-run --evidence .benchmarks.local/evidence.json
```

The separate D output root is `.benchmarks.local/v3-d-multilingual/`.
No generated result or other candidate is introduced by dry-run.
The live runner uses the same exclusive lock, ledger, pilot-stop, strict JSON,
per-job full-window reservation and no-retry safeguards as the V3-C runner.
The D spending admission reserves the previous $0.394662 conservative
exposure, leaving at most $2.605338 inside the original $3 project cap,
subject to additional charges since the previous benchmark. Do not start
paid execution until independent authorization, fresh verified evidence,
long-running process behavior and durable artifact delivery are confirmed.

## Potential authorized live commands (NOT authorization)
First pilot, only after operator approval:
```sh
bun scripts/benchmarks/v3-runner.ts --d-only --live --confirm-spend-usd 3.00 \
  --evidence .benchmarks.local/evidence.json
```
Review the first completed output and its SHA-256. Continue only after a
second explicit go-ahead:
```sh
bun scripts/benchmarks/v3-runner.ts --d-only --live --confirm-spend-usd 3.00 \
  --evidence .benchmarks.local/evidence.json \
  --continue-after-pilot <exact-pilot-result-sha256>
```
No retries, no fabricated results and no resetting a ledger after an uncertain
request. Stop safely if the budget guard, evidence or persistence check fails.

## Review and archival
Export a single downloadable ZIP with 15 complete result JSONs, 15 blind
JSONs, ledger, offline manifest, model/pricing evidence scrubbed of secrets,
summary, SHA-256 checksums, and a brief report. If interrupted, deliver a
PARTIAL ZIP with only authentic existing results. Keep backup outside transient
`/tmp` and verify archive can be reopened.

Blind review the sung lines rather than source labels using these dimensions:
natural idiom and stress (25%), audible rhyme **as requested** (20%),
breath/flow singability (20%), clarity/specificity (15%), hook and section
consistency (15%), avoidance of filler (5%). Record both individual subscores
and hard brief violations (wrong language, wrong hook, explicit ABAB absent,
wrong chorus sung-line count, schema or section failure). Record grammatical
rhymes as contextual evidence, never automatic failures.

The scores are expert judgment, not objective measurements, and 3 songs per
language are too few for claims of proven multilingual superiority. No
production activation, PR #377 merge or changes to original 24-song ZIP.
