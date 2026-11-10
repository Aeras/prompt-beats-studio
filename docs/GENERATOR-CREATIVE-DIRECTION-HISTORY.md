# Ιστορικό μουσικών κατευθύνσεων — τεχνική σημείωση

## Κατάσταση

Η αρχική υλοποίηση του ιστορικού μουσικών κατευθύνσεων έχει συγχωνευθεί μέσω του PR [#526](https://github.com/Aeras/prompt-beats-studio/pull/526) στις 2026-11-09. Το merge commit είναι `8a94d15a0cd3bd871e12e6d933827d93dd4dda02` και τα τρία υποχρεωτικά gates πέρασαν σε αυτό: Regression `42593146368`, Database Replay `42593146342`, Browser Quality `42593146486`.

Η επέκταση χωρητικότητας βρίσκεται στο PR [#527](https://github.com/Aeras/prompt-beats-studio/pull/527), ανοικτό και Draft. Αυξάνει τα όρια από 140/560 σε 200 χαρακτήρες ανά πεδίο / 1.000 συνολικά. Μετά την τελική συμφωνία του μητρώου και της τεχνικής σημείωσης, στο exact final HEAD `16936f857195def738c239dffd4096fff3175294` πέρασαν και τα τρία gates: Regression `42630301719`, Browser Quality `42630301567`, Database Replay `42630301781`.

Οι migrations του ιστορικού και της επέκτασης δεν έχουν εφαρμοστεί στην παραγωγή. Δεν έχει γίνει production deployment ή publish· αυτά απαιτούν ξεχωριστή έγκριση.

## Συμπεριφορά

- Η επιλογή εμφανίζεται μόνο σε Super Admin, Advanced Generator και εκτός Revision. Είναι αρχικά κλειστή.
- Η ενεργοποίηση μηδενίζεται όταν ο Super Admin μεταβαίνει σε Basic ή Revision, ώστε να μην παραμένει κρυφή ρύθμιση που εμποδίζει άλλη λειτουργία δημιουργίας.
- Με OFF δεν στέλνεται ρύθμιση ιστορικού, δεν διαβάζονται ούτε αποθηκεύονται κατευθύνσεις και παραμένει η σημερινή τετραπεδική κλήση.
- Με ON, ο server διαβάζει έως 15 σύντομες εγγραφές στο σχετικό scope και τις ενσωματώνει στην υπάρχουσα generation κλήση. Δεν προστίθεται δεύτερη AI κλήση. Το τρέχον brief, η ποιότητα, η φυσική γραφή, η ρίμα και η τραγουδισιμότητα υπερισχύουν της διαφοροποίησης.
- Στην ίδια κλήση παράγεται εσωτερικό `creativeDirection` με κεντρική ιδέα, αφηγητή, συναίσθημα, hook και ηχητική ταυτότητα. Αυτό αποθηκεύεται μόνο σε ιδιωτικό πίνακα. Το αποτέλεσμα του job εξακολουθεί να περιέχει ακριβώς `title`, `tags`, `lyrics`, `note`.
- Η κατεύθυνση καταγράφεται στην ίδια συναλλαγή που αλλάζει το job σε `completed`. Αποτυχημένα ή ακυρωμένα jobs δεν γράφουν ιστορικό. Το μοναδικό κλειδί ανά job/scope και η κλειδαριά ανά scope εμποδίζουν διπλές εγγραφές και διατηρούν τις 15 νεότερες ανά scope.

## Scope και όρια

- Project: επιλέγεται πριν από τη δημιουργία στον Advanced Generator ή μεταφέρεται από έμπιστο Song Setup handoff (Story Map, Inspiration Wall ή Song Universe planner). Ο server ελέγχει ιδιοκτησία και, αν το Project είναι συνδεδεμένο, κανονικοποιεί το αποθηκευμένο job ώστε να περιλαμβάνει και τα δύο scopes.
- Song Universe: μεταφέρεται από το planner. Ο Super Admin μπορεί να επιλέξει ένα από τα Projects που ανήκουν στο Universe· με ένα μόνο Project επιλέγεται αυτόματα. Ο server επαληθεύει ιδιοκτησία και membership. Όταν υπάρχουν και τα δύο IDs, η βάση δέχεται μόνο το συγκεκριμένο ζεύγος Project–Universe.
- Είσοδοι από Story Map και Inspiration Wall μεταφέρουν το συνδεδεμένο Project· η ίδια server-side επίλυση προσθέτει το Universe αν υπάρχει. Το πεδίο «Project για αποθήκευση» μετά τη δημιουργία δεν αλλάζει αναδρομικά το scope της ήδη εκτελεσμένης δημιουργίας.
- Ανεξάρτητο τραγούδι: χρησιμοποιεί UUID της τρέχουσας mounted Generator δημιουργικής συνεδρίας ή το UUID του ρητού fresh Generator session. Το session scope είναι επιπλέον δεμένο με τον χρήστη στη βάση και αλλάζει σε νέα επίσκεψη/λογαριασμό· δεν αναμειγνύει άλλα browser sessions ή λογαριασμούς.
- Αν δεν επιλεγεί ούτε Project ούτε Universe, χρησιμοποιείται μόνο το ανεξάρτητο session ID. Session δεν συνδυάζεται με άλλα scopes. Άλλα Projects, Universes, Sessions και χρήστες δεν αναμιγνύονται.
- Το ιστορικό εφαρμόζεται σε νέες Advanced δημιουργίες, όχι σε Revision ή Basic. Τα αποθηκευμένα δεδομένα παραμένουν διαθέσιμα όταν ο διακόπτης κλείνει.

## Ασφάλεια και βάση

Η `generator_creative_direction_history` έχει RLS ενεργό, χωρίς grants ή read policies για `anon`/`authenticated`. Τα read/completion RPC είναι διαθέσιμα μόνο στο `service_role`. Επιπλέον, το trigger του `ai_generation_jobs` απορρίπτει ενεργοποίηση από μη Super Admin, μη Advanced job ή scope που δεν ανήκει στον χρήστη. Η ανάκτηση και η τελική ολοκλήρωση ελέγχουν ξανά τον ενεργό ρόλο και την ιδιοκτησία.

Η migration `20261108123000_generator_creative_direction_history.sql` δημιουργεί τον πίνακα, ownership checks, service-only RPCs και atomic completion. Η πρόσθετη forward-only migration `20261108233523_generator_creative_direction_linked_scope_guard.sql` απορρίπτει linked Project χωρίς αντίστοιχο Universe scope, ακόμη κι αν κάποιος παρακάμψει τον server handler και καλέσει απευθείας το authenticated job RPC. Καμία migration δεν εφαρμόστηκε σε παραγωγή. Απαιτούνται SQL replay και review πριν από οποιαδήποτε μελλοντική εφαρμογή.

## Επαλήθευση

Τα υποχρεωτικά CI gates πέρασαν στο exact HEAD `ed6012a5ac574f2375f0b489b942089c202c9170`:

- **Regression** [42581310645](https://github.com/Aeras/prompt-beats-studio/actions/runs/42581310645): PASS — πλήρες Bun suite, changed-source lint, build και strict TypeScript.
- **Database Replay** [42581310669](https://github.com/Aeras/prompt-beats-studio/actions/runs/42581310669): PASS — replay όλων των migrations σε φρέσκια τοπική βάση και έλεγχοι του creative-direction-history SQL test.
- **Browser Quality** [42581310640](https://github.com/Aeras/prompt-beats-studio/actions/runs/42581310640): PASS.

Το προηγούμενο Browser Quality failure `42578319581` ήταν fixture regression από αποκωδικοποίηση bodyless `_serverFn` POST requests. Η διόρθωση περιορίζει την ανάγνωση payload στα Music Inspiration POST routes και το επόμενο Browser Quality gate πέρασε. Η αλλαγή UUID παραμένει ανεξάρτητη SSR-safety βελτίωση.

Οι τοπικές εκτελέσεις είχαν περιοριστεί από ελλείποντα εργαλεία/dependencies και το pnpm symlink EPERM· αυτό δεν αναιρεί τα επιτυχημένα υποχρεωτικά CI gates. Οι migrations του ιστορικού, του linked-scope guard και της επέκτασης χωρητικότητας δεν έχουν εφαρμοστεί στην παραγωγή. Το αρχικό PR #526 έχει συγχωνευθεί. Η επέκταση χωρητικότητας παραμένει στο ανοικτό PR #527 μέχρι να ολοκληρωθεί το review. Όλα τα υποχρεωτικά gates έχουν περάσει στο exact final HEAD. Κάθε production migration/deployment απαιτεί ξεχωριστή έγκριση.

## 2026-11-09 — Responsive viewport regression check

The Browser Quality failure on PR #526 occurred after switching the viewport to 320px and immediately reading the document's scroll width. The shared AppShell applies a 200ms responsive padding transition. Both responsive checks now poll the real overflow measurement until it settles, while retaining the strict no-horizontal-overflow condition. Persistent overflow remains a failure; the test does not hide or clip content. Fresh CI verification on the resulting PR HEAD is pending.

## 2026-11-09 — PR workflow contract metadata

The initial Regression run on the first correction commit stopped at the Agent contract gate because the existing PR description headings did not match the required repository labels. The PR description has been normalized without changing its technical content. Fresh all-gate verification is required on the next synchronized PR HEAD.

## 2026-11-09 — Changed-source lint correction

The Regression gate passed the full Bun suite (2,126 passed, 1 skipped, 0 failed) and the Agent contract gate, then identified Prettier-only formatting differences in the two new Playwright poll assertions. Their formatting is normalized without changing the overflow check. Fresh all-gate verification is pending.

## 2026-11-09 — Creative-direction history capacity expansion

The follow-up to merged PR #526 increases the private direction metadata limits from 140 to 200 characters per field and from 560 to 1,000 characters combined. The five-field contract, single-line restriction, lyric-copy rejection, private storage, 15-entry retention, scopes and public four-field song result remain unchanged. A forward-only migration updates the database CHECK constraint; application and SQL boundary tests cover the new limits. The change is in progress pending exact-HEAD Regression, Browser Quality and Database Replay. No production migration or deployment is authorized by this change.

## 2026-11-09 — Επέκταση χωρητικότητας ιστορικού

Το PR #527 αυξάνει τα ιδιωτικά πεδία κατεύθυνσης από 140 σε 200 χαρακτήρες ανά πεδίο και το συνολικό όριο από 560 σε 1.000. Τα Regression `42622680043`, Database Replay `42622680125` και Browser Quality `42622680167` πέρασαν στο ίδιο exact HEAD `679f5bbdd0c82a14cce70e9602a4bec1ab0544bd`. Το PR παραμένει ανοικτό. Η νέα migration δεν έχει εφαρμοστεί στην παραγωγή.

## 2026-11-09 — Ευθυγράμμιση συνάρτησης ολοκλήρωσης και συμβατότητα AI παρόχων

Η follow-up διόρθωση συγχρονίζει τη stored procedure `public.complete_generation_with_creative_direction_history` με τα νέα όρια 200 χαρακτήρων ανά πεδίο / 1.000 συνολικά μέσω της νέας forward-only migration `20261109233000_align_generator_creative_direction_completion_function.sql`. Επιπλέον, το `creativeDirectionSongSchema` απλοποιείται σε `{ type: "STRING" }` χωρίς μη υποστηριζόμενα `minLength`/`maxLength`, διασφαλίζοντας πλήρη συμβατότητα με Gemini, OpenAI Structured Outputs και xAI. Το `CREATIVE_DIRECTION_SYSTEM_PROMPT` καθορίζει ρητά μονογραμμικά πεδία έως 200 χαρακτήρες, και το `safeErrorMessage` του worker διαχωρίζει τα σφάλματα αποθήκευσης/επικύρωσης από πραγματικές αποτυχίες παρόχου.

Τα υποχρεωτικά CI gates πέρασαν επιτυχώς στο exact HEAD `7ee33286ad4df19475ac5e57be3cc093db734153`:
- **Regression** [42733975008](https://github.com/Aeras/prompt-beats-studio/actions/runs/42733975008): PASS
- **Database Replay** [42733975469](https://github.com/Aeras/prompt-beats-studio/actions/runs/42733975469): PASS
- **Browser Quality** [42733976279](https://github.com/Aeras/prompt-beats-studio/actions/runs/42733976279): PASS

Το PR [#528](https://github.com/Aeras/prompt-beats-studio/pull/528) συγχωνεύθηκε επιτυχώς στο `main` (commit `bc2c2489f550eb78da1c604fc2178ae5732e39e4`). Η migration `20261109233000_align_generator_creative_direction_completion_function.sql` εφαρμόστηκε επιτυχώς στην παραγωγή (Supabase project `qwlksrcsovbncmretjdt`).
