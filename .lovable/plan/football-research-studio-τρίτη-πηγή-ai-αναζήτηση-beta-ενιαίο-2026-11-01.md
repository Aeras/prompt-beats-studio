# Football Research Studio — τρίτη πηγή «AI Αναζήτηση BETA» (ενιαίο PR)

## 0. Τι επαληθεύτηκε (read-only, 2026-11-01)

- Τοπικό checkout = `63e999c9` (#483) = το main που δώσατε. Διαβάστηκαν `AGENTS.md`, `docs/WORK-STATUS.md`.
- Ledger: όλες οι Football εγγραφές είναι `IN_PROGRESS`. Η `20261101180000` είναι στο production· η `20261101183000` (provider selection) **δεν** είναι εφαρμοσμένη σύμφωνα με το ledger (πρέπει να ξαναελεγχθεί στο preflight).
- Τα commits `af8223bc…96d4810f` (15) **δεν υπάρχουν** στο τοπικό repo, αλλά είναι προσβάσιμα μέσω public GitHub API: `compare 63e999c9...96d4810f` = ahead 15 / behind 0, άρα βρίσκονται ακριβώς πάνω στο τρέχον main. Αλλάζουν 12 αρχεία (+737/−12).
- Δεν υπάρχει ανοιχτό PR για αυτή τη δουλειά (ανοιχτά PRs: #478, #472, #469, #450, #445 κ.ά., άσχετα).
- Υπάρχοντα records: `private_football_research_runs.fixture_id bigint`, `source IN ('api-football','football-data')`, `league_id` μόνο 6 πρωταθλήματα, immutable trigger σε identity πεδία.

## 1. Συγκεκριμένα προβλήματα που βρέθηκαν στα ασύνδετα commits

| # | Πρόβλημα | Που |
|---|---|---|
| 1 | SQL δεν εκτελείται: `AS $ … $;` αντί `$$` (σφάλμα σύνταξης) | `supabase/migrations/20261101233000_private_football_ai_fixture_candidates.sql` |
| 2 | Λάθος σχήμα OpenRouter web search: `tools:[{type:"openrouter:web_search"}]` χωρίς επαλήθευση ότι υπάρχει· το τεκμηριωμένο είναι `plugins:[{id:"web"}]` ή suffix `:online`. Επίσης `response_format` λείπει, το `content` υποτίθεται καθαρό JSON, δεν διαβάζονται `annotations` (url_citation). Το model ID `google/gemini-3.8-flash` δεν έχει επαληθευτεί ως διαθέσιμο/εγκατεστημένο | `src/lib/football-ai-fixture-search.server.ts` |
| 3 | Corroboration ελέγχει μόνο **ημέρα**, όχι ώρα έναρξης· όχι timezone-aware (UTC vs τοπική ώρα σελίδας) | `football-ai-fixture-corroboration.server.ts` |
| 4 | «Ανεξάρτητες» πηγές: δεν επιβάλλονται ≥2 διαφορετικοί registrable domains/οργανισμοί (π.χ. 2 subdomains ίδιου site περνούν). Η λίστα hosts έχει JS-rendered sites (flashscore/livescore) που δεν επιστρέφουν δεδομένα σε HTML | ίδιο |
| 5 | HTTP fetch ασφάλεια: χρειάζεται `redirect:"manual"` με ρητό επανέλεγχο host ανά redirect, timeout, έλεγχο content-type, όριο αριθμού fetch ανά refresh | ίδιο |
| 6 | Το upsert μπορεί να **υποβαθμίσει** `verified`→`candidate` ή να αλλάξει kickoff/ομάδες ενός ήδη verified fixture· καμία προστασία σε DB | `football-ai-fixture-persistence.server.ts` + migration |
| 7 | ID ασυμβατότητα: AI fixtures έχουν `uuid`, τα analysis runs απαιτούν `fixture_id bigint > 0` | migration + `football-ai-research.functions.ts` |
| 8 | `private_football_research_runs`: `source` CHECK και `league_id` CHECK (6 πρωταθλήματα) απορρίπτουν τη νέα πηγή και τα 12 πρωταθλήματα | νέα migration |
| 9 | Admission: quota 3/ώρα μετρά πριν το paid call χωρίς σύνδεση με το υπάρχον global AI admission/usage journal· δεν καταγράφεται κόστος/ολοκλήρωση | migration + `ai-usage.server.ts` |
| 10 | RLS: πίνακες χωρίς SELECT policy για Super Admin (μόνο service_role) — αποδεκτό μόνο αν όλες οι αναγνώσεις περνούν από server function· πρέπει να τεκμηριωθεί και να ελεγχθεί | migration |
| 11 | `src/integrations/supabase/types.ts` δεν περιέχει τους νέους πίνακες/RPC → TS ασυνέπειες, `from(table: string)` untyped | types + functions |
| 12 | UI: εμφάνιση legacy provider controls / paid analysis σε μη επαληθευμένα candidates· consent χωρίς εκτίμηση κόστους | `src/routes/private/football-research.tsx` |
| 13 | Tests: μόνο 3 μικρά test αρχεία (~100 γραμμές), κανένα SQL/DB replay test | tests |

## 2. Σχέδιο υλοποίησης (ένα branch, ένα PR)

**Branch:** `feature/football-ai-search-beta` από `96d4810f` (ώστε να διατηρηθεί το ιστορικό) ή, αν προτιμάτε καθαρή βάση, από `63e999c9` με cherry-pick. Πρόταση: από `96d4810f`.

### 2.1 Database — μία νέα forward-only migration (αντικαθιστά τη `20261101233000`, που δεν έχει εφαρμοστεί)
- Διόρθωση `$$`, ένα transaction.
- `private_football_ai_fixtures`: προσθήκη `fixture_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE` (γέφυρα προς υπάρχον bigint μοντέλο χωρίς αλλαγή παλιών records), `kickoff_verified boolean`, `verified_at`, `verified_sources_count`.
- Trigger immutability: όταν `verification_status='verified'`, απαγορεύεται αλλαγή ομάδων/kickoff/league και υποβάθμιση status.
- Server-only RPC `upsert_private_football_ai_fixture(...)` (SECURITY DEFINER, service_role μόνο) — η εφαρμογή δεν κάνει πλέον απευθείας upsert.
- Επέκταση `private_football_research_runs`: `source IN ('api-football','football-data','ai-search')`, `league_id` στα 12. Τα υπάρχοντα records μένουν αμετάβλητα (μόνο χαλάρωση CHECK). Νέα admission RPC overload που για `ai-search` απαιτεί `fixture_id` να αντιστοιχεί σε **verified** AI fixture του ίδιου χρήστη με ίδια ομάδες/kickoff.
- Admission refresh: ένωση με global AI admission και usage journal (reserve → complete/fail), per-user quota (προτεινόμενο 3/ώρα, 10/ημέρα — **να επιβεβαιώσετε τιμές**).
- Grants/RLS ρητά· καμία πρόσβαση anon/authenticated· τεκμηριωμένο γιατί.
- Regenerate `src/integrations/supabase/types.ts` μετά την εφαρμογή σε dev/replay.

### 2.2 Server
- `football-ai-fixture-search.server.ts`: σωστό OpenRouter web-search σχήμα (θα επιβεβαιωθεί από επίσημη τεκμηρίωση πριν τον κώδικα), `response_format` json_schema, ανάγνωση `annotations` citations, model από εγκατεστημένο registry (όχι hardcoded), μία αποστολή/χωρίς retry, sanitized diagnostics. Τα citations του μοντέλου θεωρούνται μόνο υποψήφια URLs.
- `football-ai-fixture-corroboration.server.ts`: allowlist ανά πρωτάθλημα, ≥2 ανεξάρτητοι registrable domains (ένας τουλάχιστον επίσημος league/UEFA όπου υπάρχει), έλεγχος ακριβούς ώρας με ανοχή ±0 λεπτά σε UTC μετά από μετατροπή γνωστής ζώνης σελίδας (ή JSON-LD `SportsEvent.startDate` όπου υπάρχει), manual redirects με επανέλεγχο host, timeout, content-type, όριο fetch.
- Persistence μόνο μέσω RPC· verified μόνο από server corroboration.
- `football-ai-fixture.functions.ts`: Super Admin middleware, `consent: { acknowledged: true, estimatedMaxUsd }` υποχρεωτικό, quota admission, spend switch.
- `football-ai-research.functions.ts`: δέχεται `source:'ai-search'` μόνο για verified fixtures· η υπάρχουσα Tavily+OpenRouter ανάλυση μένει ίδια.
- football-data.org και API-Football ανέγγιχτα.

### 2.3 UI (`src/routes/private/football-research.tsx` + μικρά components)
- Τρίτη πηγή «AI Αναζήτηση BETA» στον provider selector.
- Picker 12 διοργανώσεων με σημαίες/εικονίδια κυπέλλου (UEFA CL/EL), design tokens.
- Κουμπί «Ανανέωση» → dialog με εκτιμώμενο μέγιστο κόστος, υπόλοιπο quota, ρητή επιβεβαίωση.
- Badges «Επαληθευμένο» / «Υποψήφιο»· ανάλυση ενεργή μόνο σε verified· legacy controls κρυμμένα για AI πηγή.
- EL/EN μεταφράσεις.

### 2.4 Tests
- Unit: payload shape, parsing annotations, απόρριψη μη-allowlisted/redirect/μεγάλων σελίδων, ώρα vs ημέρα, ίδιο domain ×2, prompt injection σε σελίδα.
- SQL (Database Replay): `$$` εκτέλεση, immutability verified, quota race (advisory lock), bigint γέφυρα, παλιά records αμετάβλητα, grants.
- Browser Quality: consent dialog, disabled analysis σε candidate.
- Ενημέρωση `docs/WORK-STATUS.md` + `docs/PRIVATE-FOOTBALL-RESEARCH-STUDIO.md`.

## 3. Κίνδυνοι
- Gemini 3.8 Flash / web search shape ίσως διαφέρει → επιβεβαίωση από τεκμηρίωση, χωρίς πληρωμένη κλήση μέχρι έγκριση.
- Πολλές πηγές είναι JS-rendered → λιγότερα verified fixtures (ασφαλής αποτυχία).
- Αν η `20261101183000` δεν είναι στο production, η νέα migration εξαρτάται από αυτή → σειρά εφαρμογής.
- Κόστος: web search χρεώνεται ανά αποτέλεσμα επιπλέον tokens.

## 4. Release boundary
1. Preflight read-only: `schema_migrations` για `20261101183000`/`233000`, μηδέν `processing` football runs.
2. Πλήρη CI στο τελικό HEAD: Regression, Browser Quality, Database Replay (+ localization).
3. Χωριστή έγκρισή σας για migration production (μόνο τα συγκεκριμένα αρχεία, με σειρά).
4. Χωριστή έγκριση για publish· έπειτα 1 εγκεκριμένη πληρωμένη smoke κλήση.
5. Ledger: `CODE_COMPLETE_RELEASE_PENDING` έως επαλήθευση production.

## 5. Μπορεί το Lovable να το κάνει χωρίς απευθείας εγγραφή στο main;
- **Όχι πλήρως με ασφάλεια.** Το Lovable γράφει στο συγχρονισμένο branch (main). Υπάρχει δυνατότητα **draft** (απομονωμένο backend + branch), από το οποίο ανοίγει PR προς main χωρίς άμεση εγγραφή — αυτός είναι ο προτεινόμενος δρόμος αν θέλετε Lovable.
- Όμως ο draft ξεκινά από το Lovable main (`63e999c9`) και **δεν** μπορεί να κάνει checkout τα ασύνδετα commits· θα χρειαζόταν μεταφορά του περιεχομένου τους με αντιγραφή από το GitHub (εφικτό, έχουν διαβαστεί). Επίσης δεν μπορώ να εκτελέσω τα GitHub CI gates — μόνο τοπικούς ελέγχους.
- Σύσταση βάσει AGENTS.md §2: **Codex** σε branch από `96d4810f` για όλο το PR· το Lovable μόνο για αξιολόγηση/preflight/publish μετά από έγκριση.

## Ερωτήσεις προς εσάς
1. Quota ανά χρήστη: 3/ώρα είναι σωστό; Ημερήσιο όριο;
2. Ανοχή ώρας: ακριβές λεπτό ή ±15 λεπτά;
3. Υλοποίηση: Codex branch (προτείνεται) ή Lovable draft;
