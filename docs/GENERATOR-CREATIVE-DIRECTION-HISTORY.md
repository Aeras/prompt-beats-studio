# Ιστορικό μουσικών κατευθύνσεων — τεχνική σημείωση

## Κατάσταση

Το αρχικό branch `codex/creative-direction-history-20261108` έχει ήδη ανέβει στο origin στο commit `c6aced69a11de239b6498c22ca23d1307d4490ce`. Δεν υπάρχει PR ή CI run για αυτό το branch. Η παρούσα διόρθωση βρίσκεται ως μη δεσμευμένο τοπικό diff στο ίδιο branch. Η migration δεν έχει εφαρμοστεί σε βάση παραγωγής. Δεν έγιναν AI κλήσεις ή publish.

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

Τα offline tests καλύπτουν σχεδιαστικά το μοντέλο δεδομένων, το prompt context, το τετραπεδίο αποτέλεσμα, το Super Admin admission, τη διαδρομή durable job → worker, τα handoffs, την απομόνωση scopes, αποτυχία/ακύρωση, retention 15 και concurrency. Σε αυτή τη συνέχιση δεν μπόρεσαν να εκτελεστούν, επειδή λείπουν Bun και dependencies. Το `git diff --check` πέρασε. TypeScript, ESLint, Prettier, build και Playwright μπλοκαρίστηκαν πριν από την εκτέλεση: το `pnpm` απέτυχε να δημιουργήσει το απαιτούμενο symlink στο store (`EPERM`). Το Supabase CLI και το `psql` λείπουν, ενώ το Docker daemon δεν είναι διαθέσιμο· έτσι Database Replay, migration validation και concurrency SQL tests παραμένουν μπλοκαρισμένα. Η δημιουργία migration μέσω `supabase migration new` επίσης δεν ήταν δυνατή: το CLI λείπει και το npm registry επέστρεψε `ENOTFOUND`. Το forward-only migration γράφτηκε τοπικά και δεν εφαρμόστηκε. Αναλυτικά αποτελέσματα και ακριβείς εντολές καταγράφονται στο `docs/WORK-STATUS.md`. Η εργασία παραμένει `IN_PROGRESS`.
