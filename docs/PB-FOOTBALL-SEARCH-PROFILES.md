# Football Search Profiles V1/V2 — σχεδιασμός και έλεγχοι

> Τα αρχικά τμήματα διατηρούν το ιστορικό του #518. Η ισχύουσα αναθεώρηση των V2 prompts και της διάγνωσης αποτυχιών καταγράφεται στο τέλος, στην ενότητα διόρθωσης7/11/2026.

## Preflight πριν τα edits — 7/11/2026

Live main `b8354577b5be6383ae05bbbb1d6080937a037e99`, merged #517 / head `1e4b353491bd88ba3993ef3526ee62696efd514c`.21 ανοικτά PR, κανένα Football overlap. Root AGENTS/ledger διαβάστηκαν. Το αρχικό checkout είναι παλιό και παραμένει ανέπαφο. Απομονωμένο branch `codex/football-search-profiles-20261107`.

### Impact map / αποφάσεις πριν την υλοποίηση

- UI route → authenticated SA-only setup → validated request/consent → verified scheduled fixture → SQL claim/advisory lock → global admission → provider/JoJ evidence → fixed-host Tavily → deterministic ledger/consensus → μία synthesis → bounded usage journal/CAS → strict analysis + versioned sources sidecar/history/export. Expert παραμένει χωριστά consented, αμετάβλητος.
- Request profile ID χωριστό από ForecastProfile: v1_current default (legacy missing-field), v2_experimental. Server ορίζει counts/queries/credits. Νέο consent snapshot συνδέει profile/depth/model/fixture/calls/results. Legacy consent ισχύει μόνο στο default V1. Duplicate request key δεν ξανακάνει dispatch ακόμη και με αλλαγή profile: existing atomic claim αποδίδει μη claimed status. Δεν απαιτείται νέο SQL ούτε ιστορικό rewrite.
- Planner: V1 exact existing P1-Preserve strings/callbacks. V2 μόνο EN/RU exact fixed wording, trusted team labels και venue-local calendar.400 Unicode code points: ποτέ κόψιμο σταθερών οδηγιών, ημερομηνίας ή ονόματος. Μόνο reviewed identity-equivalent short alias fallback· αν δεν χωρά, safe failure πριν από paid dispatch. Το αυστηρό όριο μπορεί να περιορίσει τη V2 σε μακρά ονόματα· δεν παρουσιάζεται ως καθολική κάλυψη. Χωρίς επιβεβαιωμένη timezone/registry identity, V2 fails closed.
- Adapter: Football opt-in10, Music4k/text/3 αμετάβλητο.4MiB response hard rejection/abort,24k cleaned chars ανά document, χωρίς retries/extract. results[] ανακαλύψεις χωριστά από raw-content documents[]. Candidate receipt με safe URL/title και explicit dropped missing-raw/unsafe/duplicates/excess/truncated counts, όχι άρθρα. Αποτυχία oversized body παραμένει unconfirmed usage, ποτέ πλαστή πλήρης επιτυχία.
- V2 έως20 docs φτάνουν σε ledger/synthesis/saved sources. Η συμβατή V1 researchBrief/consensus projection18 παραμένει συνειδητά περιορισμένη, με explicit omitted telemetry· δεν αφαιρεί τις άλλες2 από την authoritative V2 ledger ή την AI είσοδο. Η version αποθηκεύεται server-side στο sidecar/usage, το strict legacy analysis διατηρείται rollback-readable. Νέοι readers εμφανίζουν legacy-unknown για πραγματικά παλιές εγγραφές, χωρίς αναδρομική συμπλήρωση.
- Budgets παραμένουν150s overall/15s search/90s model,262144 prompt bytes/16384 output tokens. V1 basic5/advanced10 estimated credits, V2 basic2/advanced4· actual usage από provider receipt, unknown price null. Δεν αλλάζει token cap ή model. Source-specific provider facts/odds εξακολουθούν να συλλέγονται και να αξιολογούνται· V2 δεν ισχυρίζεται EL/facts/news web search.
- Acceptance: exact golden templates/counts, V1 parity, V2 real-handler/HTTP2×10 Basic/Advanced, consent/auth/tamper/idempotency/cancel/zero extra retries,20 source survival and truthful omissions, missing raw/unsafe transport, mobile320/390/axe/dropdown position/default/disabled/history/export. Full local Bun/TS/scoped lint/format/build/browser/transport/relevant isolated SQL. Χωρίς paid API/production DB ή CI.

### Pricing reference

Official Tavily [Credits & Pricing](https://docs.tavily.com/documentation/api-credits), checked7/11/2026: basic1 credit/request, advanced2. max_results δεν πολλαπλασιάζει credits. USD estimate χρησιμοποιεί τις αποθηκευμένες τιμές διαχειριστή, όχι αυθαίρετα τρέχον online tariff. Το observed receipt υπερισχύει της προεκτίμησης.

### Release / rollback

Μία ενιαία τοπική εργασία, καμία επαναφορά λυμένων #517 defects. Απαιτείται χωριστή έγκριση πριν consolidated push/new Draft PR/three exact-HEAD gates. Merge/publish/live A/B χωριστά. V1 default και διαθέσιμο rollback. Καμία production SQL ή migration, εκτός αν προκύψει αποδεδειγμένη ανάγκη. Ledger CODE_COMPLETE_RELEASE_PENDING μόνο μετά πλήρη local verification, ποτέ CLOSED χωρίς release acceptance. Η πραγματική live recall/precision/κόστος/κάλυψη παραμένουν μη μετρημένα.

## Υλοποίηση — τεχνική αναφορά

### Αλλαγές και συμβατότητα

- `football-search-profiles.shared.ts`: public version contract, ακριβώς δύο επιλογές, server-owned counts, consent snapshot και λίγα reviewed Cyrillic aliases. Δεν είναι επέκταση του στοιχηματικού catalogue.
- `football-forecast-planner.shared.ts`: το αρχικό `planFootballForecasts` δεν αλλάζει. Ο νέος wrapper επιστρέφει την ίδια V1 και ξεχωριστό V2 plan. Οι σταθερές οδηγίες διατηρούνται αυτούσιες.
- `football-ai-research.shared.ts`, `football-research-budget.shared.ts`: default/legacy V1, strict new profile/depth/model/fixture consent, profile-aware worst-case estimate, observed usage χωριστά, receipt έως10 safe discoveries ανά call. Άγνωστη τιμή παραμένει null. Δεν ερμηνεύονται10 URLs ως10 credits.
- `football-ai-research.functions.ts`: πραγματικό validated server dispatch2×10 ή5×5, SA guard, atomic claim/admission, serial searches, ίδια provider/odds paths και μία model synthesis. Προστέθηκε εσωτερική attribution/omission telemetry, χωρίς επανάληψη αποτυχημένης πληρωμένης κλήσης.
- `music-inspiration-research.server.ts`: μόνο Football opt-in10. Music defaults παραμένουν3/text/4k, χωρίς footballAudit στο Music return. Παλιό raw-filtering order για5 αποτελέσματα παραμένει ίδιο. V2 excess results περιορίζονται και καταγράφονται ρητά.
- `football-evidence-v2.shared.ts/.server.ts`, `football-ai-source-snapshot.shared.ts`: έως20 retained V2 docs στο authoritative ledger/model/saved sources. Το παλιό brief18 διατηρείται ως συμβατό projection, με explicit omitted count. Reviewed V2 query aliases χρησιμοποιούνται και στο fixture/claim binding μόνο στη V2. Wrong fixture/year/league εξακολουθούν να αποκλείονται.
- `football-research.tsx`, `football-independent-assessment.ts`: μία Radix επιλογή πάνω από settings, V1 default, disabled ενόσω εκτελείται, frozen consent/dispatch payload και lock. Ιστορικό/export διατηρούν πραγματική version. Legacy records εμφανίζονται ως μη καταγεγραμμένο προφίλ. Διορθώθηκε επιπλέον η υπάρχουσα άκυρη ARIA χρήση main-as-tabpanel με ουδέτερο wrapper, χωρίς αλλαγή εμφάνισης.
- Νέες/επεκταμένες δοκιμές: `football-search-profiles.test.ts`, `football-online-research.integration.test.ts`, `e2e/football-provider-evidence.pw.ts`, `scripts/tests/fixtures/tavily-workerd/{entry.ts,mock.mjs}`.

### Ιστορικά query examples του #518 (αντικαταστάθηκαν στην επόμενη διόρθωση)

EN — **398 Unicode code points**:

```text
Napoli vs Lazio, 8 November 2026. Find independent published predictions and betting recommendations from distinct publishers for this exact match. Look for an explicit author's pick and reasoning—e.g. 1X2, double chance, totals, BTTS, score, handicap, player or corner bets, or any other bettable market. These are examples, not limits. Exclude odds-only pages, news and statistics without a pick.
```

RU — **391 Unicode code points**:

```text
Наполи — Лацио, 8 ноября 2026. Найди независимые опубликованные прогнозы и рекомендации по ставкам от разных авторов на этот матч. Нужен конкретный выбор с обоснованием: например, исход, двойной шанс, тотал, обе забьют, счёт, фора, ставки на игроков, угловые или любой другой рынок. Это примеры, не ограничения. Исключи страницы только с коэффициентами, новостями и статистикой без прогноза.
```

### Κόστος, όρια και γνωστοί περιορισμοί

| Προφίλ | Calls | Results/call | Max candidate URLs | Basic estimated credits | Advanced estimated credits |
| ------ | ----: | -----------: | -----------------: | ----------------------: | -------------------------: |
| V1     |     5 |            5 |                 25 |                       5 |                         10 |
| V2     |     2 |           10 |                 20 |                       2 |                          4 |

Μία model call και στα δύο. Κοινό worst-case prompt budget262144 UTF-8 bytes +4096 framing-token allowance, output16384 tokens. Δεν αυξήθηκε όριο. Μεγάλο πλήθος/μέγεθος docs μπορεί να υπερβεί το prompt cap: η εκτέλεση σταματά πριν model dispatch με διατηρημένα search receipts, αντί σιωπηλής περικοπής/retry. Adapter4MiB response,24k cleaned chars/doc,15s search,90s model,150s run. Raw-byte overflow είναι αποτυχία και όχι πλήρης συλλογή. Snippet-only URL καταγράφεται ως discovery, όχι ως αναγνωσμένο άρθρο/ψήφος.

Η V2 δεν εγγυάται πλήρη κάλυψη όλων των αγώνων: άγνωστη ταυτότητα/venue timezone ή UEFA/ουδέτερος αγώνας χωρίς επιβεβαιωμένο venue contract απορρίπτονται. Το όριο400 και οι αμετάβλητες οδηγίες αφήνουν μικρό χώρο για ονόματα. Εφόσον δεν χωρά trusted reviewed σύντομη εναλλακτική (π.χ. Manchester United–Liverpool), γίνεται ασφαλής άρνηση πριν από provider/Tavily/model dispatch. Δεν αλλοιώνονται οι ημερομηνίες/τα ονόματα ή η εντολή. V1 παραμένει διαθέσιμη. Η επόμενη διεύρυνση κάλυψης απαιτεί reviewed identities/venue data ή νέα συμφωνία query contract, όχι αυθαίρετα συντομευμένα strings.

Η πραγματική recall/precision, live publisher diversity και latency **δεν μετρήθηκαν**. Τα fixtures είναι synthetic ή προϋπάρχοντα νόμιμα frozen extracts· δεν παρουσιάζονται ως νέο πραγματικό discovery benchmark. Δεν έγινε paid search/model smoke ή authenticated provider refresh. Missing provider facts παραμένουν missing, χωρίς promise xG/τραυματισμών για κάθε πρωτάθλημα. Expert/JoJ/KINO/production quotas δεν τροποποιήθηκαν.

### Έλεγχος ασφάλειας / release

Χωρίς SQL/schema migration. Το sidecar αποθηκεύει τη version με τα νέα δεδομένα, ο server αγνοεί model-forged attribution. Νέοι readers ελέγχουν profile provenance πριν hydrate. Το strict παλιό analysis παραμένει αναγνώσιμο από rollback client· το usage/history δεν ξαναγράφεται. Ειδική επαλήθευση auth, malformed profile, stale consent, changed depth/model/fixture, duplicate request με άλλο profile, post-kickoff, cancellation, malformed model και timeout. Αυτές οι δοκιμές δεν αποτελούν άδεια paid live execution.

Τοπικός manual diff/security review ολοκληρώνεται πριν commit. Ανεξάρτητος PR review και οι τρεις GitHub gates παραμένουν release dependencies μετά από ξεχωριστή έγκριση consolidated push. Δεν εξισώνεται local code-complete ή merge με publish. Production migration δεν απαιτείται.

## Πραγματική επαλήθευση / evidence

| Έλεγχος                                                                      | Αποτέλεσμα                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Focused Bun (five Football contract/complete/evidence/handler/profile files) | 163 PASS,0 FAIL,1,673 assertions                                                                                    |
| Full Bun LF-equivalent source                                                | 1,966 PASS,0 FAIL,1 existing PHP parity skip,29,579 assertions,234 files                                            |
| Source equivalence                                                           | 1,245 tracked files compared;ten immutable `-text` files byte-exact;no unexpected difference                        |
| Strict TypeScript                                                            | PASS                                                                                                                |
| ESLint changed source/test files                                             | PASS                                                                                                                |
| Global canonical LF-source ESLint                                            | 197 pre-existing errors in25 main-identical files;5 warnings;not a global PASS                                      |
| Prettier changed files / diff whitespace                                     | PASS                                                                                                                |
| Production build                                                             | PASS;existing upstream inputValidator deprecation notices retained                                                  |
| Native workerd real transport                                                | 23 PASS;local service mock only;zero external dispatch                                                              |
| Isolated SQL/ACL/RLS                                                         | Football research,AI-search,odds PASS;ten existing migrations replayed                                              |
| 12 independent-session races                                                 | one reservation/11 busy;recovery reads spend zero;two feeds cannot exceed last shared quota slot                    |
| Browser/Playwright desktop/tablet/mobile                                     | 87/87 PASS on frozen source;320/390px,keyboard,axe,EL/EN,consent/history/export;mobile screenshot visually reviewed |
| GitHub three gates                                                           | NOT RUN: separate approval required                                                                                 |
| Paid/live A/B                                                                | NOT RUN: separate approval required                                                                                 |

Local SQL used new `football_consensus_profiles_20261107` in `pb-football-v2-final`, network none/mounts empty. Minimal synthetic auth/roles bootstrap plus the repository's actual `_has_role_internal` helper and all ten unmodified Football migrations. Existing three SQL tests rolled back synthetic users/runs;race script used only disposable quota fixtures. Container returned stopped. Earlier attempt against an older odds-only test database failed on missing research tables;correct clean bootstrap above passed. No product SQL changed to accommodate a test.

One full-suite attempt during simultaneous build/browser work hit an untouched Atlas5-second timeout. Full regression rerun passed without changing its assertions/timeout. Initial browser harness treated TanStack's serialized request as plain JSON;correct seroval decoding restored actual POST verification. New axe scope found the pre-existing main/tabpanel role issue;correct structural wrapper fixed it without weakening axe. No failure is hidden as a skipped new test.

Evidence artifacts stay outside Git under the sibling `football-profiles-*` logs/screenshots, not provider exports. These local logs are not GitHub CI proof. Global Windows raw lint additionally reports CRLF-format noise in untouched files;canonical LF audit isolates the197 existing errors above. No unrelated files were reformatted to hide that baseline.

## 2026-11-07 — Διόρθωση μήκους V2: preflight πριν τα edits

Baseline main46b6d47dafbec401e43e9858bacf72eb4ee56a44 (#518 merged),21 open PRs χωρίς Football overlap. Απομονωμένο codex/football-v2-query-length-20261107. Root AGENTS/ledger και όλη η διαδρομή dropdown → frozen consent/request → SA/fixture/claim/admission → planner → provider/odds → Tavily → ledger/synthesis → immutable history/usage και εμφάνιση σφαλμάτων εξετάστηκαν. Δεν υπάρχει παραγωγικό incident receipt σε αυτή την εργασία· δεν αποδίδονται όλες οι πραγματικές αποτυχίες στο ίδιο αίτιο.

Offline reproducer στο αμετάβλητο main: τα παλιά suffixes είναι364/360 code points. Napoli–Lazio δημιουργεί398/391 queries, ενώ Fiorentina–Juventus και Manchester United–Liverpool έχουν δύο matched registry identities αλλά αποτυγχάνουν στο400 πριν από provider/Tavily/model. Άγνωστο qualified club, λάθος league ή UEFA χωρίς venue contract απορρίπτονται χωριστά από τον ίδιο υπάρχοντα identity guard. Ο handler καταγράφει όλες αυτές τις pre-model αποτυχίες ως research_unavailable και η UI δείχνει γενικό μήνυμα, αποκρύπτοντας την αιτία. Consent/SA/postkickoff/admission/credentials μπορούν επίσης να απορρίψουν πριν Tavily· δεν αποδείχθηκε διαφορετικό ελάττωμα αυτών των ελέγχων.

Σχέδιο/acceptance: μόνο τα δύο V2 suffixes αντικαθίστανται με το νέο ακριβές306/313 κείμενο. Trusted πλήρη ονόματα/venue date,400 Unicode όριο και μόνο identity-equivalent alias fallback παραμένουν. V1 πέντε queries αμετάβλητα. Προστίθενται bounded V2-specific reasons/messages για team/competition/date/length και terminal failure journal με zero searches/no automatic retry. Η UI εμφανίζει μόνο γνωστά ασφαλή μηνύματα, όχι arbitrary exception/provider data. Δεν αλλάζει registry, pricing/consent/caps, transport, SQL/RLS, provider matching, Expert ή Music/KINO. Έλεγχοι πριν push: exact strings/lengths, έξι domestic leagues, μακρά reviewed aliases, DST/unknown/ambiguous guards, actual handler2×10 και failure persistence/idempotency, full Bun/TS/scoped lint/format/build/browser/native transport. No paid calls ή production writes. Rollback application-only· δεν απαιτείται migration.

### Ισχύουσα διόρθωση — ακριβή κείμενα και αποτέλεσμα

EN σταθερή οδηγία **306 Unicode code points**:

```text
Find published, independent expert predictions from different sites for this exact match. Require a clear recommended bet with reasoning, e.g. result, totals, BTTS, handicap, score, player or corner markets, or any other market; examples, not limits. Exclude odds-only, news and stats pages without a pick.
```

RU σταθερή οδηγία **313 Unicode code points**:

```text
Найди независимые опубликованные прогнозы разных сайтов именно на этот матч. Нужны конкретные ставки с обоснованием: например, исход, тотал, обе забьют, фора, счёт, игроки, угловые или любой другой рынок. Это примеры, не ограничения. Исключи страницы лишь с коэффициентами, новостями или статистикой без прогноза.
```

Η τελική μορφή παραμένει `{home} vs {away}, {venue-local English date}. {EN}` και `{home} — {away}, {venue-local Russian date}. {RU}`. Για Napoli/Lazio8/11/2026 τα πλήρη queries έχουν **340/344**, όχι306/313· αυτά τα τελευταία μετρούν μόνο τις σταθερές οδηγίες. Fiorentina/Juventus και Manchester United/Liverpool προχωρούν χωρίς αυθαίρετο clipping. Ο ενδεικτικός χώρος50 χαρακτήρων για ομάδες δεν επιβάλλεται ως hard cap. Καμία αλλαγή V1/query count/max_results/depth/model/consent/budget/registry/Expert/provider/Music/KINO.

- `football-forecast-planner.shared.ts`: ακριβής αντικατάσταση μόνο των V2 suffixes. Οι ίδιες συνθήκες identity/competition/date απορρίπτονται πλέον με ξεχωριστούς κωδικούς αντί ενιαίου identity failure. Ο400-codepoint έλεγχος και το trusted alias fallback παραμένουν.
- `football-search-profiles.shared.ts`: τέσσερα σταθερά ασφαλή planning messages. Arbitrary exceptions/credentials δεν περνούν στον χρήστη. Δεν άλλαξαν profile settings ή rates.
- `football-ai-research.functions.ts`: μόνο V2 αποτυχία πριν δημιουργηθεί budget/provider dispatch μπορεί να αποκτήσει γνωστή planning διάγνωση. Ο terminal failed run κρατά source usage/version και zero-search receipt. Τα υπόλοιπα σφάλματα και η V1 διατηρούν την υπάρχουσα συμπεριφορά. Το ίδιο requestKey εξακολουθεί να αποκλείεται από νέο dispatch.
- `football-research.tsx`: γνωστή V2 διάγνωση στη batch αποτυχία και στο ιστορικό, με generic fallback για άγνωστη εξαίρεση. Χωρίς τεχνικούς κωδικούς ή επαναληπτική κλήση στη UI.

### Διάγνωση / πραγματικοί περιορισμοί

**Επαληθευμένο offline:** η παλιά διατύπωση προκαλούσε400 failure σε Fiorentina/Juventus και Manchester United/Liverpool παρότι τα clubs είναι matched. Δεν υπάρχει ανάγκη αλλαγής registry/aliases για αυτές τις περιπτώσεις. Και τα1.934 διαφορετικά ordered pairings του σημερινού registry εντός ίδιας domestic league παράγουν δύο queries<=400 για το stress calendar30/9/2026 late UTC. Πρόκειται για έλεγχο σύνθεσης queries, όχι επιβεβαίωση πραγματικού fixture/API coverage.

**Παραμένουν ασφαλείς απορρίψεις:** unknown/ambiguous/squad-qualified clubs, διαφορετικό πρωτάθλημα, ανεπιβεβαίωτη venue-local ημερομηνία, UEFA/ουδέτερο venue χωρίς κατάλληλο trusted contract, forged/stale consent, revoked SA ή μη scheduled/post-kickoff fixture. Δεν χαλαρώθηκε κανένα από αυτά. Δεν υπάρχει ambiguous alias στο τρέχον registry· synthetic collision δύο πραγματικών club identities ελέγχει ότι ο πραγματικός planner αρνείται ambiguous resolution.

**Δεν επαληθεύτηκε live:** κανένα νέο production incident receipt/log ή πληρωμένο Tavily/AI request δεν ανακτήθηκε/εκτελέστηκε. Δεν ισχυριζόμαστε ότι όλες οι άμεσες παραγωγικές αποτυχίες είχαν την ίδια αιτία. Αν αποτύχει άλλο στάδιο, απαιτείται η συγκεκριμένη ασφαλής καταγραφή του run, όχι γενική χαλάρωση ταυτοποίησης.

**Release:** application-only αλλαγή, χωρίς νέα migration. Ίδιο public V2 profile/consent/cost contract· οι πραγματικές νέες query strings αποθηκεύονται στα νέα receipts, χωρίς ιστορικό rewrite. Απαιτούνται consolidated push/Draft PR approval και τρία exact-HEAD gates πριν ανεξάρτητη αξιολόγηση/merge. Publish/live spend χωριστά. V1 default και διαθέσιμη ως rollback.

### Τελική τοπική επαλήθευση της διόρθωσης

| Έλεγχος                                            | Πραγματικό αποτέλεσμα                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Focused contracts/planner/ledger/actual handler    | 174 PASS,0 FAIL,5,728 assertions                                                                                                    |
| Full Bun σε επαληθευμένο LF-equivalent source      | 1,977 PASS,0 FAIL,1 existing unrelated PHP parity skip,33,634 assertions,234 files                                                  |
| Source equivalence                                 | 1,248 tracked files compared,ten immutable assets byte-exact,zero unexpected differences                                            |
| Strict TypeScript / changed-file ESLint / Prettier | PASS                                                                                                                                |
| Production build                                   | PASS;existing upstream deprecation notices,not deployment                                                                           |
| Browser desktop/tablet/mobile                      | 99/99 PASS;320/390px,keyboard/axe,known planning failures/history/no retry,no technical code leakage                                |
| Native workerd transport                           | 23 PASS;local service mock only,zero external requests                                                                              |
| Existing Football SQL/ACL/RLS / independent races  | three SQL suites PASS;12-session claim/read/shared-quota races PASS in network-none,mount-free disposable local DB,returned stopped |
| Live/paid providers,GitHub CI                      | NOT RUN;separate approvals required                                                                                                 |

Το πρώτο full regression κατά την ταυτόχρονη εκτέλεση build/browser είχε timeout5s στον ανέπαφο Atlas offline-import scan. Η πλήρης επανάληψη μόνη της πέρασε σε9.87s χωρίς αλλαγή timeout/assertions. Νέο test ambiguity αρχικά χρειαζόταν μόνο την ίδια ρητή Bun.Transpiler type δήλωση που χρησιμοποιεί το existing integration harness·διορθώθηκε και TypeScript πέρασε. Δεν μετατράπηκε νέα αποτυχία σε skip.

Τοπικός manual diff/security review: V1 planner μέχρι το V2 suffix boundary byte-equivalent υπό LF·request/consent/budget/provider/registry/Expert/transport/SQL files δεν τροποποιήθηκαν. Επαλήθευση μηδενικών paid dispatches σε identity/league/date rejects, terminal reason/usage persistence και idempotent rejection στην ίδια αίτηση. Τα παλιά398/391 assertions αφαιρέθηκαν από executable tests·παραμένουν μόνο στο σαφώς σημειωμένο ιστορικό κείμενο. Το γενικό global lint δεν επαναλήφθηκε σε αυτή τη διόρθωση·η προϋπάρχουσα197-error baseline του #518 δεν δηλώνεται λυμένη ή PASS. Δεν παρακάμπτεται CI gate.

Αλλαγμένα αρχεία: `src/lib/football-forecast-planner.shared.ts`, `src/lib/football-search-profiles.shared.ts`, `src/lib/football-ai-research.functions.ts`, `src/routes/private/football-research.tsx`, `src/lib/football-search-profiles.test.ts`, `src/lib/football-online-research.integration.test.ts`, `e2e/football-provider-evidence.pw.ts`, `docs/PB-FOOTBALL-SEARCH-PROFILES.md`, `docs/WORK-STATUS.md`. Δεν άλλαξε infrastructure ή schema.
