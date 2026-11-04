# PromptBeats — Independent Research Task for Atlas V4 (636 Evidence Gaps)

You are an independent multilingual musicology research/editorial agent. Your assignment is to research **the exact 636 named, unresolved profile/dimension evidence tasks**, NOT to fill all blanks by guesswork.

## Input
Attached: `atlas-v4-636-evidence-tasks.json`.
Project: PromptBeats, Russian Cultural Song Atlas V4, PR #450.
Each task has immutable `gapId`, `profileId`, `dimension`, original Russian name, existing EL/EN summaries, and related IDs. These are authoritative *identities and editorial context*, **not themselves proof**.

## Required actions
1. Work from the actual 636 tasks; never invent profiles, eras, genres, task IDs, musical facts, references or coverage. Preserve task order and every original field/ID. Use a copy of the input JSON with *only* the listed answer fields completed.
2. For **each task**, search independently for the best directly pertinent trustworthy research: scholarly monographs/journals, university/institutional archives, conservatory publications, song scores, recordings with metadata, artist interviews where appropriate, and both Russian-language and international sources. Prefer primary musicological analyses and original-language studies. Cross-check independent sources and specify which musical *subtradition*, time, region, artist, or recording each finding describes.
3. Distinguish `source_supported_bounded`, `supported_no_universal_rule`, `insufficient_evidence`, and `not_applicable_with_reason`. The second status is appropriate if credible literature demonstrates diversity or no single universal form; do NOT convert lack of access into evidence that no rule exists.
4. `suggestedStatementEl` and `suggestedStatementEn` should be natural, concise, qualified editorial statements, and only present when supported. Preserve original Russian terminology when helpful, with correct diacritics/transliteration.
5. For each positive claim, give one or more verifiable citations with exact bibliographic details and DOI/publisher URL where available. Cite **specific page, section, score bars or audio timestamps**, exact support, and real evidence access (`full_text`, `extract`, `abstract`, `catalog_record`, `listening`). Never claim full-text review based only on an abstract, never use a search-result snippet as proof, and never fabricate URLs, locators, listening or personal musicologist certification.
6. Do not universalize instrumentation, chord progressions, scales, time signatures, BPM, rhyme, narrative voice, performer gender, political/ethnic identity or recording technology on the basis of genre labels or a few examples. Separate cultural/historical context from acoustic and creative-production claims.
7. Put explicit sample limitations and divergent examples in `validityScope` and `exceptionsAndCounterexamples`. Do not hallucinate examples. Keep `musicologistReview` as `not_reviewed`.
8. `creativeTechniqueCandidate`, if present, is an **OPTIONAL unvalidated creative experiment**, not a historical fact or automatically approved Generator instruction. Suggested object: `{ "instructionEl": "...", "instructionEn": "...", "target": "lyrics|vocals|rhythm|instruments|production|blueprint|energy|creative_techniques", "rationale": "...", "limitations": ["..."], "status": "experimental_not_approved" }`. If no responsible idea exists, leave null.
9. When evidence is absent, return `researchDecision: "insufficient_evidence"`, both suggested statements null, a clear `validityScope` indicating what corpus or primary work is needed, empty citations, and no asserted conclusion. Do not work around paywalls or invent material to maximize filled cells.
10. You may deliver batches of 30–80 tasks but **preserve all original tasks** in the final consolidated JSON, including unchanged/unresolved ones. If context/time limits stop the research, preserve remaining tasks as null, and report completed task IDs and trustworthy source coverage honestly.
11. Quality check the output as valid UTF-8 JSON, exact `taskCount: 636`, exactly the 636 source `gapId` values once each, unchanged profile/dimension, citations consistent with statements. Do NOT alter the library's canonical RC1 or the V4 software, release flags, or approval states.

## Deliverables
A. `atlas-v4-636-evidence-researched.json` — same shape and 636 task IDs as the input, completed where evidence exists. Research statuses must follow allowedResearchDecisions.
B. `atlas-v4-research-methodology.md` — databases searched, search strings and language choices, evidence access limitations, positive vs unresolved counts, doubtful sources, candidate conflicts, key editorial decisions, and an exact list of gap IDs that should be prioritized for score/audio/full-text study.

Success is **quality and traceability, not reducing 636 to zero**. Never declare any technique approved or production-ready. An independent editorial reviewer will check the results before importing them into V4.
