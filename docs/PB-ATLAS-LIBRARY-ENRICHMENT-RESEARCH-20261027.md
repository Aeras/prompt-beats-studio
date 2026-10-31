# Cultural Song Atlas — library enrichment editorial working register
Date: 2026-10-27
State: RESEARCH_ONLY / PROVISIONAL. This document is NOT an approval to publish, modify RC1, or enable Generator transfer.

## Verified baseline
Repository Aeras/prompt-beats-studio, baseline main fdf34b2e601dc90d4fbdaf1a3192ff948f09f698.
Canonical file: src/data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json; protected SHA-256 fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a.
58 profiles / 14 research-only candidates / 65 unapproved creative techniques / 97 sources / 85 historical claims.
All 58 profiles have summary_el. 115 knowledge subfields have null text_el; DO NOT automatically fill these or label them defects. Existing technique English instruction strings are distinct.
Counts by musical family (multiple family membership may occur):
| Family | Profiles | Techniques | Null knowledge entries |
| folk | 8 | 10 | 15 |
| romance | 3 | 3 | 6 |
| bard | 3 | 4 | 6 |
| chanson | 6 | 6 | 12 |
| estrada | 5 | 5 | 10 |
| pop | 6 | 7 | 12 |
| rock | 11 | 13 | 22 |
| rap | 8 | 8 | 16 |
| electronic | 4 | 5 | 8 |
| hybrid | 4 | 4 | 8 |

## Critical editorial principle
Musicological description ≠ creative suggestion ≠ validated Generator instruction. An acoustic or cultural generalization without source scope must not become a mandatory genre prescription. Especially avoid made-up BPM/key/chord progressions, mandatory instrumentation, required narrative/lyrics language, geography/ownership inference, and confidence fabricated from genre names. Retain RC1 byte-exact and existing Beta/SQL/worker/Generator deny-by-default.

## Required per-profile coverage assessment
Track each existing ID, name_ru, families, entity_type, provenance and exact source claim references. Review:
- formal structure, text-meter and singability, vocal articulation, call/response and polyphony where evidenced;
- groove, meter and tempo **only if sourced**; instrumentation and performance alternatives, never mandatory defaults;
- melodic/harmonic contours where evidenced, including regional variation and source scope;
- production, mix, dynamics, transitions, section functions as **modern optional production ideas**, not historical facts;
- lyric voice and narrative vs non-narrative options, literal/cultural idioms, language-dependent pronunciation;
- decade/era when explicit evidence exists, allowing null/multiple periods, and preserving collection geography vs genuine origin;
- overlap/hybrids, counterexamples, open research questions, and semantic conflicts with Generator fields;
- missing EL/EN localized public content, original-script primary names, romanization and editorial review provenance.

## Provisional addition candidates — not historical facts
Each line is a candidate technique family to editorially evaluate and bind to named profiles only after source/counterexample analysis. Differentiate historical research claim from nonessential creative option.

| Family | Candidate creative dimensions to investigate |
| Folk | text-accent vs melodic elongation, variant strophes, regional/ensemble call-and-response, unaccompanied option, optional dance/ritual context; never assume accordion or balalaika universally |
| Romance | stanza/refrain alternatives, rubato/phrase breathing, solo vocal delivery, sparse accompaniment, restrained climax; avoid universal piano/strings requirement |
| Bard | intelligible lyric-forward verses, sparse guitar option, flexible verse variation, rhetorical pauses, alternative nonnarrative sketches |
| Chanson | refrain/verse contrasts, speech-like phrasing, low-density arrangement option, character viewpoint only if requested, distinctions between crime/camp/emigré/social context |
| Estrada | period-specific orchestral vs band/electronic arrangement **only with evidence**, vocal-forward hook, optional instrumental response/turnaround, refrain dynamics |
| Pop | hook placement, chorus economy, singability, synth/acoustic alternatives, dance pulse vs ballad, dynamic transitions, decade labels only when documented |
| Rock | riff vs melodic-guitar counterlines, live-band dynamics, guitar space, chorus growth, post-punk texture vs punk articulation vs indie restraint, optional lyrical emphasis |
| Rap | flow density, syllabic stress, bar-length and pause design, hook/verse contrast, speech melody, beat/hats/bass production alternatives, dialect review and rhyme naturalness |
| Electronic | sequenced pulse, bass/drum relationship, timbral evolution, layering and drop vs nondrop alternatives, transient/space balance, avoid assumed BPM |
| Hybrid | explicitly chosen source influences, balanced timbral borrowing, cross-style section transitions, source-cultural specificity, prevent default ethnic ornaments and genre caricature |

Proposed technique fields: immutable candidate_id; profile_id; language/locale; dimension; descriptive_text; optional_instruction_en; source_ids; exact claim/evidence scope; classification (historical fact / editorial interpretation / creative experiment); limitations/counterexamples; no_auto_inference; confidence rationale; reviewer and date; status RESEARCH_ONLY/REVIEWED/APPROVED; mutually exclusive groups; safe removal, conflicts; test fixtures and acceptance evidence.

## Example source triangulation (external; DO NOT treat as validation of all profiles)
1. Olson & Adonyeva, "Chastushki", Oxford Handbook of Slavic and East European Folklore, 2023. Describes compact rhymed one-stanza form and variable social/ritual use. DOI: 10.1093/oxfordhb/9780190080778.013.36.
2. Beliaev, "The Russian Protiazhnaia 'Prolonged' Folk Song", Yearbook of IFMC 1969, pp 165-175 (Cambridge published online 2019), DOI 10.2307/767638. Broad melodic development.
3. Okhlobystina & Starostina, "On the Analysis of Form in the Southern Russian 'Prolonged' Folksong", 2022, DOI 10.26158/TK.2022.23.3.002. Specific southern-Russian form; must not generalize geographically.
4. Steinholt, "You can't rid a song of its words", Popular Music 22(1), 2003, DOI 10.1017/S0261143003003064. Text-literary emphasis in Russian rock discourse; does not prove a compulsory musical arrangement.
5. AcousticBrainz official docs: acousticbrainz.org/data. Low-level extracted audio features versus more uncertain high-level inferred genres/moods; project ceased receiving new data in 2022. Recording-level metrics are never universal genre prescriptions.

## Review and release acceptance
A) Produce coverage matrix for all 58 IDs, every existing 65 technique, all unknown fields, source quality and differences between documented and proposed material.
B) Create additive versioned **candidate** content in a separate research-only file/schema, retaining canonical RC1 bytes and SHA.
C) Validate profile IDs/source references, language and romanization, non-duplication, conflicting instructions, provenance and stable migrations/no backend changes unless proven necessary.
D) Editorially approve a small diverse pilot only after independent assessment; no automatic status flip. Test offline transfer fixtures before requesting explicit owner permission for controlled Beta activation or paid-provider calls.
E) Keep all code/tests/CI and docs/WORK-STATUS.md in one cohesive PR. No merge, Lovable publish or production activation without separate authorization.
