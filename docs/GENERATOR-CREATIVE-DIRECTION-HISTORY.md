# Ιστορικό μουσικών κατευθύνσεων — τεχνική σημείωση

## Κατάσταση

Η υλοποίηση βρίσκεται στο PR #526, branch `codex/creative-direction-history-20261108`. Το προηγούμενο Browser Quality failure (`42578319581`, 189 failures) διορθώθηκε: ο fixture handler αποκωδικοποιεί πλέον μόνο POST routes του Music Inspiration, επειδή ορισμένα `_serverFn` requests δεν έχουν body. Η μεταφορά UUID σε browser-only effect είναι ανεξάρτητη βελτίωση SSR safety, όχι η αιτία της αποτυχίας.

Στο επαληθευμένο HEAD `ed6012a5ac574f2375f0b489b942089c202c9170` πέρασαν και τα τρία υποχρεωτικά gates:
- Regression `42581310645` — PASS.
- Database Replay `42581310669` — PASS.
- Browser Quality `42581310640` — PASS.

Το PR παραμένει ανοικτό και δεν υπάρχει καταγεγραμμένη ανεξάρτητη έγκριση review. Δεν έχει γίνει production migration, merge, deployment, AI κλήση ή publish.

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

Οι τοπικές εκτελέσεις είχαν περιοριστεί από ελλείποντα εργαλεία/dependencies και το pnpm symlink EPERM· αυτό δεν αναιρεί τα επιτυχημένα υποχρεωτικά CI gates. Οι δύο forward-only migrations δεν έχουν εφαρμοστεί στην παραγωγή. Το PR παραμένει ανοικτό μέχρι να ολοκληρωθεί το απαιτούμενο review και να ληφθεί ξεχωριστή απόφαση για merge/release.


## 2026-11-09 — Responsive viewport regression check

The Browser Quality failure on PR #526 occurred after switching the viewport to 320px and immediately reading the document's scroll width. The shared AppShell applies a 200ms responsive padding transition. Both responsive checks now poll the real overflow measurement until it settles, while retaining the strict no-horizontal-overflow condition. Persistent overflow remains a failure; the test does not hide or clip content. Fresh CI verification on the resulting PR HEAD is pending.


## 2026-11-09 — PR workflow contract metadata

The initial Regression run on the first correction commit stopped at the Agent contract gate because the existing PR description headings did not match the required repository labels. The PR description has been normalized without changing its technical content. Fresh all-gate verification is required on the next synchronized PR HEAD.


## 2026-11-09 — Changed-source lint correction

The Regression gate passed the full Bun suite (2,126 passed, 1 skipped, 0 failed) and the Agent contract gate, then identified Prettier-only formatting differences in the two new Playwright poll assertions. Their formatting is normalized without changing the overflow check. Fresh all-gate verification is pending.
