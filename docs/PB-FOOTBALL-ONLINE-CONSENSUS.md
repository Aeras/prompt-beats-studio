# Football — ανεξάρτητες προβλέψεις και αξιόπιστη ανάκτηση αποδόσεων

## Τεχνικό πόρισμα και υλοποίηση

Η εργασία προετοιμάζεται αποκλειστικά τοπικά στο `codex/football-online-consensus-20261106`, πάνω στο επαληθευμένο main `2394f22270a1727d7301a5bbd0c9dc2082e8f630` (#514). Δεν βρέθηκε επικαλυπτόμενο Football PR. Δεν εκτελέστηκε push, PR, Actions, πληρωμένη κλήση, παραγωγική SQL μεταβολή, publish ή αλλαγή μυστικών.

**Επιβεβαιωμένο:** η παλιά δέσμευση του μεγάλου JoJ feed δεν ολοκληρώθηκε. Τα logs δείχνουν claim στις 08:45:01 UTC χωρίς αντίστοιχο finish στο εξετασμένο διάστημα. Ο πρώτος αγώνας χρησιμοποίησε το άλλο feed· οι εννέα επόμενοι συνάντησαν το busy journal. Ο αναγνωστικός έλεγχος ταυτοτήτων και του υπάρχοντος registry επιβεβαίωσε 10/10 ακριβείς αγώνες/UTC kickoffs στο long feed και 1/10 στο near feed, χωρίς να θεωρηθούν φρέσκες ή έγκυρες οι επιμέρους τιμές. Το προηγούμενο payload ήταν ήδη ληγμένο. Συνεπώς ούτε η απουσία αυτών των αγώνων από τον πάροχο ούτε η ασφαλής χρήση του παλιού payload τεκμηριώνονται. **Μη επιβεβαιωμένο:** ο λόγος διακοπής του αρχικού worker· δεν υπάρχει διαθέσιμο hosting trace που να αποδεικνύει cancellation, CPU limit ή transport failure. Η διόρθωση αντιμετωπίζει τους αναπαραγόμενους μηχανισμούς, όχι μια κατασκευασμένη εξήγηση εκείνης της διακοπής.

- Το preview παρόχων διαβάζει πλέον μόνο cache. Δεν δεσμεύει quota και δεν ξεκινά εξωτερική ανάκτηση που μπορεί να εγκαταλειφθεί με αλλαγή καρτέλας. Αν δεν υπάρχει πρόσφατη cache, εμφανίζεται ειλικρινής κατάσταση· το preview δεν εγγυάται νέες αποδόσεις πριν από την εγκεκριμένη έρευνα.
- Νέο service-only `read_private_football_odds_feed(text)`: μόνο SELECT, χωρίς reset, refund, token mutation ή provider request. Ξεχωρίζει ενεργή ανάκτηση, άγνωστη έκβαση, παλιά cache και quota/cooldown. Οι 30s διαχωρίζουν την ένδειξη κατάστασης· ΔΕΝ είναι μικρότερο lease ή άδεια επανάληψης. Το 15λεπτο και τα 200 requests/μήνα ΚΑΙ κυλιόμενες 31 ημέρες παραμένουν απαράλλακτα.
- Η χαμένη επιβεβαίωση επιτυχούς finish ανακτάται με ανάγνωση του journal, όχι με δεύτερο GET ή αντικατάσταση του αποτελέσματος από failure receipt. Αν δεν αποδεικνύεται committed cache, παραμένει `recovery_pending`. Δεν γίνεται αυτόματο replay άγνωστης AI κλήσης ή άμεσο δεύτερο provider request.
- Source body/read waits παραμένουν bounded ακόμη όταν ο transport reader δεν απορρίπτει μετά από abort. Τα journal RPC έχουν bounded waits. Ασφαλή logs περιέχουν μόνο fixed filename, στάδιο και κατηγορία σφάλματος· ποτέ token, URL με credentials, raw exception ή payload. Δεν αποδεικνύεται από αυτά η αιτία του παλιού worker failure. Δεν καταργούνται τα όρια hosting ή οι διαδοχικές αναζητήσεις.
- Ελέγχονται τόσο capture/retrieval timestamps όσο και η πραγματική ώρα χρήσης. Payload φρέσκο κατά την αρχική αποθήκευση αλλά ληγμένο τώρα δεν προσφέρει quotes. Διατηρούνται competition, ordered teams, provider identity, exact kickoff, πλήρεις αγορές και απαγόρευση MR12/promos. Εμφανίζεται χωριστή κατάσταση ανά feed.

Η νέα ενότητα βρίσκεται μετά την κύρια ανάλυση/πηγές και πριν από τον Έμπειρο Αναλυτή. Χρησιμοποιεί versioned προαιρετικό `externalPredictionConsensus` μέσα στο ήδη υπάρχον analysis JSON. Παλιές αναλύσεις δεν ξαναγράφονται ή επανεκτελούνται. Ο Expert παραμένει ξεχωριστή, προαιρετική, consented κλήση με αμετάβλητο prompt· λαμβάνει μόνο το επικυρωμένο summary ως μη αυθεντικό input.

Ο server εξάγει deterministic αναφορές `sourceIndex + canonical market` από ρητές επιλογές στα ήδη ανακτημένα αποσπάσματα, πριν από την AI κλήση. Περνά τη μικρή έγκυρη σύνοψη συμφωνίας στην ίδια σύνθεση και επαληθεύει ανεξάρτητα τη μεταγενέστερη AI κρίση. Άκυρη AI κρίση δεν σβήνει έγκυρες ψήφους πηγών. Ο server ανακτά το πραγματικό bounded απόσπασμα, ελέγχει ολόκληρη την ταυτότητα και τον ρητό χρόνο/ζώνη, την πραγματική επιλογή και το line, την πρόσβαση πριν από τη σέντρα και τις διαθέσιμες publication πληροφορίες. Υποστηρίζονται ISO και ρητές αγγλικές/ρωσικές ημερομηνίες με UTC/GMT/CET/CEST/EET/EEST/BST. Δεν υποτίθεται ζώνη για ασαφή τοπική ώρα. Μη αναγνωρισμένη διατύπωση απορρίπτεται, δεν μετατρέπεται αυθαίρετα. Μικρό απόσπασμα χωρίς επαρκές fixture context μπορεί να αποκλείσει πραγματική πρόβλεψη· αυτό είναι συγκεκριμένος περιορισμός κάλυψης.

Publisher families, copied/near-copied κείμενα και ρητές αναφορές σε άλλη αρχική πρόβλεψη δεν πολλαπλασιάζουν ψήφους. Άγνωστη ιδιοκτησία/ανεξαρτησία ή community URL αποκλείεται από το count· δεν θεωρείται αυτόματα ανεξάρτητη. Η καταγραφή γνωστών ομίλων δεν αποδεικνύει την ανεξαρτησία κάθε δημοσιεύματος του internet. Εμφανίζονται πραγματικά counts, αντιφάσεις και εξαιρέσεις, όχι ποσοστά επιτυχίας από τις ψήφους. Η AI κρίση έχει χωριστή κύρια/προαιρετική εναλλακτική, τεκμήρια, αντίλογο και κίνδυνο ή αποχή. Άγνωστες παραπομπές και μη canonical/combo αγορές απορρίπτονται. Δεν προστίθεται +EV/calibration ή αναγκαστική επιλογή Over 1.5/2.5/3.5.

Η ρητά opt-in μεταφορά `published_date` μόνο για Football από τον κοινό Tavily adapter διατηρεί μόνο πραγματικό, έγκυρο timestamp με ζώνη. Δεν αλλάζουν τα Music Inspiration requests, prompts, source IDs/hashes ή εφαρμοζόμενα δεδομένα· μόνο προαιρετικό outer retrieval metadata. Ημερομηνία χωρίς ώρα δεν γίνεται μεσάνυχτα. Στο UI δηλώνεται «κατά τον πάροχο», όχι ανεξάρτητα επαληθευμένη δημοσίευση. Όταν λείπει, παραμένει άγνωστη.

## Κόστος και ειλικρινής κάλυψη

Παραμένουν ακριβώς τρεις Tavily searches, έως τρία αποτελέσματα ανά search, ίδιο Basic/Advanced και ίδιο επιλεγμένο μοντέλο/timeout/τιμολογιακή πολιτική. Καμία πρόσθετη κλήση ή automatic retry. Ένα query διευρύνεται ώστε να αναζητά και ανεξάρτητες προβλέψεις. Δεν υπόσχεται 5–7 πραγματικά ανεξάρτητα και επαρκώς ταυτοποιημένα άρθρα μέσα σε έως εννέα έγγραφα. Το UI δείχνει τα πραγματικά ευρήματα και την ανεπάρκεια. Οι server-owned αναφορές και η συμπαγής σύνοψη αποφεύγουν αντιγραφή μεγάλων αποσπασμάτων στο model output. Το νέο prompt και η πρόσθετη σύντομη κρίση μπορούν να μεταβάλουν τα πραγματικά input/output tokens και επομένως το κόστος της ίδιας κλήσης· δεν υποσχόμαστε ακριβώς ίδιο λογαριασμό ή μετρημένο επιπλέον ποσό χωρίς paid experiment. Η χρήση διατηρείται από τον υπάρχοντα μηχανισμό.

## Ασφαλές release και ανάκαμψη

1. Ξεχωριστή έγκριση για ένα consolidated push/Draft PR και τα τρία gates στο ακριβές HEAD. Δεν ισχύουν αποτελέσματα παλαιότερου HEAD ως τελικά. Ανεξάρτητο review πριν από merge.
2. Νέο πρόσφατο backup/recovery evidence πριν από παραγωγική SQL. Το backup της προηγούμενης εργασίας δεν θεωρείται αυτομάτως επαρκές για μεταγενέστερη βάση.
3. Η live αντιστοίχιση παλιών migrations επαληθεύτηκε με LF-normalized SQL MD5: shared cache `88bae9365ecc99c66e4a345196b2d485`, hourly cap `c2aae775d07bb70bd1824ff6ca1be8dd`, ίδια με τα εγκεκριμένα αρχεία. Production/source versions: `20261106060536`/`20261105200305` και `20261106084407`/`20261106075211`. Μη διπλοεφαρμόσετε τα SQL και μη διορθώσετε history χωρίς χωριστή έγκριση.
4. Με ρητή release approval εφαρμόζεται ΜΟΝΟ η νέα `20261106114210_football_odds_receipt_recovery.sql` από το εγκεκριμένο Git blob, με version-preserving history-aware διαδικασία και επαλήθευση του ακριβούς SQL SHA. Όχι blanket db push, ad hoc UPDATE/DELETE, reset ή migration repair. Μετά επαλήθευση service-only EXECUTE και διατήρησης RLS/παλιών grants, quotas και ιστορικού.
5. Ακολουθεί χωριστά εγκεκριμένο Lovable publish. Το project API δηλώνει published=true και editor latest SHA `2394f222…`, αλλά δεν παρέχει αποδεικτικό published commit· δεν εξισώνουμε το editor HEAD ή το merge με publish της συγκεκριμένης έκδοσης.
6. Μόνο μετά από νέα έγκριση μπορεί να ελεγχθεί πραγματικό source-only refresh (JoJ καταναλώνει quota), και ξεχωριστά paid AI smoke test. Τότε θα φανεί και η πραγματική διαθέσιμη κάλυψη πηγών, όχι μέσω κατασκευασμένων offline δεδομένων.
7. Rollback: επαναφορά εφαρμογής στην προηγούμενη εγκεκριμένη έκδοση χωρίς σβήσιμο JSON/usage/history. Η νέα read RPC μπορεί να μείνει αχρησιμοποίητη· claim/finish και πίνακες δεν αλλάζουν. Άγνωστα attempts παραμένουν χρεωμένα/δεσμευμένα κατά τον υπάρχοντα κανόνα. Δεν χρειάζεται destructive down migration.

## Τοπικοί έλεγχοι

- Focused νέες δοκιμές: **69 PASS / 0 FAIL** σε τέσσερα αρχεία. Περιλαμβάνουν πραγματικό handler με offline dependencies, malformed model extraction/metadata, άκυρη ξεχωριστή κρίση χωρίς απώλεια έγκυρων ψήφων, τρεις searches/μία AI attempt, idempotency και διατήρηση usage.
- Πλήρης Bun suite: **1.782 PASS / 0 FAIL / 1 υπάρχον άσχετο PHP parity skip**, **27.907 assertions / 230 αρχεία**. Εκτέλεση σε ελεγμένο LF-equivalent αντίγραφο, με byte-identical προστατευμένα immutable assets. Το τελικό source αντίγραφο συγκρίθηκε με το working tree.
- Browser: **54/54 PASS** desktop/tablet/touch-mobile· οι νέες περιπτώσεις ελέγχουν ελληνικά/αγγλικά, 320 και 390 px, keyboard, axe, source links, θέση πριν από τον Expert, legacy δεδομένα και μηδενικά paid/source dispatches από επαναλαμβανόμενα ανοίγματα. Οι υπάρχουσες τρεις χωριστές AI-search browser περιπτώσεις απαιτούν live SA storage και παραμένουν skipped: δεν χρησιμοποιήθηκαν παραγωγικά credentials. Το δικό τους feature δεν τροποποιήθηκε. Αρχική αστοχία συνθετικού kickoff με δευτερόλεπτα διορθώθηκε στα fixtures. Νεότερη αστοχία του parser που μπέρδευε 2026/league 2 διορθώθηκε στον κώδικα με cross-league regression tests· δεν χαλάρωσαν οι guards.
- Strict TypeScript, ESLint όλων των αλλαγμένων TS/TSX, Prettier και production build: **PASS**. Πλήρες ESLint audit σε LF: **197 προϋπάρχοντα errors σε 25 άλλα αρχεία / 5 warnings**· και τα 25 αρχεία ελέγχθηκαν byte-for-byte ίδια με τα Git blobs του main. Δεν δηλώνεται πλήρες global lint PASS και δεν γίνονται άσχετα refactors. Το ισχύον Regression Gate επιβάλλει lint στο diff.
- Καθαρό τοπικό SQL replay αρχικής cache migration και νέας read RPC σε ξεχωριστή συνθετική βάση, Docker `network=none`: **PASS**. ACL/RLS, fresh/cache/unknown/expired lease, UTC format, no refund, monthly/rolling caps και αποκλεισμός browser access: **PASS**. **12 ανεξάρτητες συνεδρίες** δεσμεύουν μία φορά, **12 recovery reads** ξοδεύουν μηδέν, δύο feeds δεν ξεπερνούν το τελευταίο quota slot: **PASS**. Κανένα πραγματικό δεδομένο ή production URL χρησιμοποιήθηκε στη βάση δοκιμής.
- Πραγματικός offline workerd: Tavily **12 cases PASS**, Polar55 adapter **PASS**, όλα τα outbound requests συνδεδεμένα με τοπικά fixtures, μηδενικές εξωτερικές κλήσεις. Το Polar55 hosting/DB/Cron δεν προσπελάστηκε.
- Νέα migration: canonical **LF Git SQL SHA-256 `4bfac2f59d0b9d949613b1412045970af9be460669b13a8cde4bcdf9813f3250`**. Δεν εφαρμόστηκε στην παραγωγή. Το αρχείο περιέχει μόνο τη νέα protected read RPC και grants, όχι αλλαγές claim/finish, cache rows, budgets ή history.
- Manual whole-diff/security review ολοκληρώθηκε τοπικά. Δεν παρουσιάζεται ως ανεξάρτητο review άλλου προσώπου/agent· το ανεξάρτητο PR review παραμένει προϋπόθεση πριν από merge.

Remote Regression / Browser Quality / Database Replay **NOT RUN**: απαιτείται ακόμη η ρητή έγκριση push/PR του AGENTS §7. Καμία παραγωγική επιτυχία ή πραγματική διαθεσιμότητα νέων odds/online προβλέψεων δεν επινοείται. Η ασφαλής προσαρμογή χωρίς πρόσθετο search budget είναι η διεύρυνση ενός υπάρχοντος query και η παρουσίαση του πραγματικού επαληθεύσιμου πλήθους· νέες searches ή επέκταση μη ελεγμένων εκδοτών απαιτούν χωριστή αξιολόγηση, όχι αυτόματο κρυφό κόστος.

## Πρωτογενής τεκμηρίωση ομαδοποίησης εκδοτών

- [North Star brands](https://north-star.network/brands/) και [Sports Mole acquisition](https://north-star.network/north-star-network-acquires-sportsmole-co-uk/).
- [PredictZ company](https://www.predictz.com/information/about/) και [WinDrawWin company](https://www.windrawwin.com/about/): ίδιος όμιλος Web Analysis Solutions.
- [Cipher brands](https://www.ciphersports.io/): Dimers / Stats Insider.
- [Nazara corporate information](https://investors.nazara.com/about): Sportskeeda.
- [BBC Charter](https://www.gov.uk/government/publications/bbc-charter-and-framework-agreement/bbc-charter).
- [Guardian ownership](https://www.theguardian.com/about/2017/nov/17/who-owns-the-guardian-our-unique-independent-structure).
- [Disney ESPN](https://thewaltdisneycompany.com/espn/).
- [Supabase database functions / security](https://supabase.com/docs/guides/database/functions): service-only explicit grants, pinned search path, no public raw-feed access.

Η πρόσβαση σε μερικές αρχικές about URLs απέτυχε· δεν παρακάμφθηκε. Χρησιμοποιήθηκαν οι παραπάνω διαθέσιμες πρωτογενείς σελίδες. Δεν πραγματοποιήθηκε νέα paid provider αναζήτηση.

## Αρχικό αγγλικό investigation checkpoint — πριν από τις αλλαγές

# Football — independent predictions and shared odds recovery

## Investigation and acceptance (before implementation)

Baseline: live main `2394f22270a1727d7301a5bbd0c9dc2082e8f630`, merged #514; 21 open PRs inspected, none overlap Football. Local branch `codex/football-online-consensus-20261106`. Prior worktrees remain untouched. Existing server auth, paid consent, model resolution, run admission, usage receipt, terminal history, expert call, odds parser, shared quota and UI inspected.

Confirmed production SELECT at 2026-11-06 11:38 UTC: long feed reserved, retrieved 08:01:59, lease 09:00:01; near feed ok, retrieved 08:45:48; monthly attempts eight. Ten stored runs reproduce one matched/ten quotes and nine unavailable/zero quotes. Edge logs show a claim at 08:45:01, no finish before the batch, then two claims and one successful finish around 08:45:45–47. This proves an abandoned/incomplete long-feed reservation and subsequent busy handling, not the reason the first worker disappeared. No matching Postgres error was found. Hosting termination/cancellation remains unverified. The long cached payload was already older than 15 minutes; serving it would violate freshness.

Production function inspection showed escaped timestamp literals; a separate read-only format evaluation confirmed valid strict UTC output (`2026-11-06T08:01:59.068Z`). This suspected formatting defect was disproved; claim/finish definitions remain unchanged. Migration versions differ from repository filenames: shared cache production `20261106060536` / source `20261105200305`; hourly cap production `20261106084407` / source `20261106075211`. No history repair or SQL write authorized.

Plan: separate cache-only source previews from quota-consuming refresh; retain the 15-minute per-file paid-attempt floor and shared 200/month AND rolling-31-day quota. Add a service-only read/status RPC so busy/unknown/cooldown/receipt-ack recovery never reserves or calls the provider. Use fresh cached data only after both retrieval and source timestamps pass. An unknown attempt cannot be magically recovered into valid prices: retain its consumed quota, expose recovery state and permit only the next normally eligible refresh. Keep historical receipts immutable.

Predictions: reuse exactly three Tavily basic/advanced searches (three results per search), the existing model and one synthesis call. Carry bounded source passages and server IDs; validate model interpretations against literal retrieved text, exact fixture binding and explicit canonical market/line before counting. Publisher-family and copy/attribution grouping are server-owned; unknown independence stays excluded, not guessed. Optional versioned history metadata, legacy histories unchanged. Separate source agreement from AI opinion; no vote-derived probabilities, no combos/+EV, no forced pick, no automatic expert. Compact accessible section before Expert, Greek/English resources.

Acceptance: synthetic seven-source and seven-URL/two-origin tests; wrong fixtures/dates/lines, copied/attributed/community sources, injection/citations, abstention, legacy history; ten serial fixtures and concurrency/unknown/ack-loss/stale/quota/ACL tests. Run focused/full tests, strict TS, ESLint, formatting, build and offline browsers. Remote three gates require separate push/PR approval. No paid source calls or production mutations.

## Search budget and evidence limits

Three searches × at most three results gives at most nine retrieved documents before URL deduplication. Five to seven independent, timely predictions cannot be guaranteed; some/all results may be facts, copies, forums, incomplete extracts or unrelated fixtures. Show actual qualifying count and exclusions, never add searches automatically. Existing 650-character source excerpts and source count bounds remain; this deliberately limits extraction coverage. Publication time stays unknown unless independently supplied, not inferred from retrieval time. A publisher registry can group known families but cannot prove that every unknown website is independent.

## Verification and release

IN_PROGRESS. Implementation and checks pending; no readiness, remote CI or deployment claimed. Production migration requires owner approval, current backup/recovery verification, exact SQL/hash and history-aware reconciliation of the two pre-existing version differences. Never run blanket db push or replay old SQL. Publish is separate from merge/migration. Roll forward journal changes; do not reset quotas, edit old analyses or replay uncertain AI calls.
