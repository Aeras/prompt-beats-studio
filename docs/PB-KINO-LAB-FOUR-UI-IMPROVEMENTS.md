# KINO Lab — τέσσερις συμφωνημένες βελτιώσεις

## Επαληθευμένη βάση και όρια

Main `2329baf09cf3c63f4419040abf4662f0716a1ac1` (#508 merged), επαληθευμένο
με fetch και live remote ref στις 05/11/2026. Δεν υπάρχει επικαλυπτόμενο
ανοιχτό KINO PR. Τοπικό branch `codex/kino-lab-four-ui-improvements-20261105`.
Οι παλιές μη καταχωρισμένες αλλαγές του ακυρωμένου collector και τα συνημμένα
μένουν στα προηγούμενα checkouts, ανέπαφα.

Το προηγούμενο UI Polar55 είχε 8 στήλες στο κινητό, μόνο πέντε ιστορικά
παράθυρα, επιλογές k=5/8/10 και default 8. Τα PHP και Zod contracts επέβαλλαν
τους ίδιους περιορισμούς. Reproduction με την αμετάβλητη βάση: n=5/k=12
απορρίπτεται πριν από το patch και γίνεται δεκτό μετά. Η offline JSON μηχανή
ήδη υποστηρίζει k=1–12 και 10 στήλες, αλλά τα controls δεν τα εξέθεταν.

Δεν έγινε σύνδεση σε Polar55/production MariaDB/Supabase, αίτημα στον ΟΠΑΠ,
συλλογή/εισαγωγή δεδομένων, αλλαγή cron, writer, hosting, secrets, πίνακα,
αλγορίθμου ή dependency. Δεν έγινε production installation ή publish.

## Συμπεριφορά

1. Κοινό heatmap με ακριβώς 80 διαδοχικά κελιά, 10 στήλες και 8 σειρές σε
   όλες τις οθόνες. Ίσα κελιά, θεματικά tokens, αριθμός και ακριβές πλήθος,
   προσιτό όνομα με αριθμό/πλήθος/ένταση. Μεγάλα πλήθη αναδιπλώνονται μόνο
   στα διαχωριστικά χιλιάδων: δεν αποκρύπτονται, δεν γίνονται `25k` και δεν
   στρογγυλοποιούνται.
2. Τέσσερις δυνατές εντάσεις. Για counts c, m=min(counts), M=max(counts):
   `min(3, floor(4*(c-m)/(M-m)))`. Αν M=m, όλα έχουν ένταση 0 (UI: 1/4).
   Ίσα πλήθη έχουν πάντα ίδια ένταση. Μηδενικές συχνότητες υποστηρίζονται.
   Δεν επιβάλλεται η εμφάνιση και των τεσσάρων επιπέδων όταν το δείγμα έχει
   λιγότερες διακριτές τιμές. Η κλίμακα αφορά το συγκεκριμένο δείγμα, όχι
   πιθανότητα επιτυχίας ή απόλυτη σύγκριση διαφορετικών παραθύρων.
3. Ακριβώς `5,10,20,50,100,200,500,1000,5000,20000,50000,100000`.
   Ακέραια τιμή από UI → server validator → fixed-host proxy → PHP validator →
   υπάρχον consistent SQL snapshot. Χωρίς cap 100/1000, fallback ή μεταβολή
   της επιλογής. Εμφανίζονται πραγματικά stored/requested/loaded και partial.
   Η αλλαγή επιλογής αδειάζει το παλιό αποτέλεσμα πριν από την επόμενη ρητή
   ανάλυση. Δεν δημιουργείται query από μόνη της.
4. Ευθυγραμμισμένα «Κληρώσεις / Αριθμοί / Μέθοδος», ύψος 44px, κοινά labels
   και Radix dropdowns. Όλοι οι ακέραιοι k=1–12, default 5, σε JSON και Polar55.
   P00/F00/P01, seeds, prior, recent-100 και backtest protocol αμετάβλητα.

Η JSON εισαγωγή παραμένει 4 MiB / 5.000 εγγραφές. Μεγαλύτερο επιλεγμένο
παράθυρο σε μικρό αρχείο δεν απορρίπτεται ούτε αλλάζει σιωπηρά: εμφανίζεται
το διαθέσιμο πλήθος και «Μερικό δείγμα». Για μεγάλο αποθηκευμένο ιστορικό
χρησιμοποιείται η υπάρχουσα aggregation στον Polar55, όχι τεράστιο browser upload.

## Απόδοση και ασφάλεια

Διατηρούνται η SELECT-only σύνδεση, read-only repeatable-read transaction,
hash/revision quarantine, ιδιωτικό spool, όριο σάρωσης, 18s deadline,
25s proxy timeout, 300KB response cap, cross-process admission και απαγόρευση
redirects/retries. Στον browser μεταφέρεται μόνο aggregate και έως 500 targets.
Καμία raw ιστορική κλήρωση δεν προστίθεται στο response.

Τα mutable στατιστικά/ranking δεν μεταβάλλονται από την απεικόνιση· οι εντάσεις
υπολογίζονται O(80), με memoization ανά counts array. Η PHP συνεχίζει streaming
O(N), με bounded counts/recent ring/500-target output και disk snapshot.

## Επαλήθευση

- Focused Bun: 30 PASS, μία ξεχωριστά ενεργοποιούμενη Docker parity δοκιμή.
- Πλήρης Bun: **1.649 PASS / 0 FAIL / 24.544 assertions / 221 files** σε
  αναλώσιμο LF-equivalent snapshot. Μία Docker-gated δοκιμή παραλείπεται εκεί
  και εκτελείται ρητά χωριστά: **5 PASS**, όλα τα 12 N × 3 μέθοδοι.
  Όλα τα `-text` canonical assets παραμένουν byte-identical. Δεν αλλάζουν
  assertions ή παλιός κώδικας για να αποκρυφτούν Windows line-ending διαφορές.
- Offline PHP: syntax, HTTP/auth/default-off, grants, writer-idempotency,
  backfill/lock regressions PASS, χωρίς εξωτερικό network.
- Πραγματική αναλώσιμη MariaDB 11.4: όλα τα 12 SQL windows, k=12,
  77 διαθέσιμες / 100.000 ζητούμενες, snapshot έναντι concurrent insert/update,
  hash quarantine, SELECT-only Unix socket και ασφαλές cleanup PASS.
- Μετρημένη ανάλυση 100.000 εγγραφών: **1,58s**, peak **6.295.552 bytes**
  (περιλαμβάνει επιπλέον fixtures), απάντηση **99.095 bytes**. Πρόκειται για
  τοπική συνθετική μέτρηση, όχι SLA του production host.
- Strict TypeScript, scoped ESLint/Prettier και production build PASS.
- Browser: **36/36** πλήρης σχετική σουίτα PASS και **6/6** τελικοί στοχευμένοι
  έλεγχοι PASS (39 διαφορετικές viewport περιπτώσεις συνολικά).
  Έλεγχοι 320×640, 360×740, 390×844, 667×375, 768×1024, 1280×800,
  10×8 γεωμετρία/80 κελιά, μεγάλα πλήθη, alignment, axe, keyboard,
  όλα τα N, πραγματικό selected k για όλες τις μεθόδους, partial, access
  revocation, ακύρωση, export και ανεξαρτησία Live/JSON.

Η πρώτη mobile εκτέλεση αναπαρήγαγε overflow πλήθους 100.000 στα στενά κελιά
και λάθος αποκωδικοποίηση Seroval στο νέο test fixture. Διορθώθηκαν αντί να
χαλαρώσουν οι assertions. Μετά πέρασαν οι δύο στοχευμένοι έλεγχοι.

## Αρχεία και release

- UI: `KinoAnalysisLab.tsx`, `KinoPolar55Lab.tsx`, νέο `KinoFrequencyHeatmap.tsx`.
- Contracts/presentation: `kino-lab.presentation.ts`, `kino-lab.shared.ts`,
  `kino-polar55.shared.ts`.
- Read-only PHP: **μόνο** `private/lab-service.php`, `private/lab-core.php`.
- Tests: νέο `kino-lab.presentation.test.ts`, `kino-polar55.test.ts`,
  `__fixtures__/kino-polar55-analysis.ts`, `e2e/kino-lab.pw.ts`,
  `tests/core-offline.php`, `tests/database-offline.php`.
- Docs: αυτό το αρχείο, WORK-STATUS και additive-package README.

Μία τοπική ενοποιημένη αλλαγή. Root AGENTS §7 απαιτεί χωριστή ρητή έγκριση
πριν από push/PR creation και έναρξη των τριών CI gates. Δεν υπάρχει ακόμη
PR ή remote sign-off. Μετά την έγκριση απαιτούνται Regression, Browser Quality
και Database Replay στο ίδιο ακριβές τελικό HEAD, ανεξάρτητο review και έγκριση merge.

**Δεν απαιτείται SQL migration.** Απαιτείται όμως χωριστά εγκεκριμένο release:

1. Διατήρηση ασφαλών αντιγράφων των δύο υπάρχοντων πρόσθετων PHP read-plane files.
2. Εγκατάσταση μόνο `lab-core.php` και `lab-service.php` στον ιδιωτικό υπάρχοντα
   κατάλογο, syntax/read-only smoke με τον operator. Τα νέα επιτρεπτά options
   είναι additive και δέχονται όλα τα παλιά αιτήματα.
3. Μόνο μετά τη συμβατότητα του PHP backend, Lovable publish της ελεγμένης εφαρμογής.
4. Εξουσιοδοτημένο read-only UI smoke: μικρό/μεγάλο παράθυρο, requested/loaded,
   k=1/5/12, 10×8 σε smartphone, χωρίς Live/cron μεταβολές.

Rollback: πρώτα προηγούμενη συμβατή εφαρμογή· το διευρυμένο PHP συνεχίζει να
δέχεται τα παλιά αιτήματα. Επαναφορά των δύο PHP files μόνο μετά από αυτό,
αν χρειαστεί. Καμία διαγραφή δεδομένων, SQL rollback ή αλλαγή writer/cron/config.
Δεν χαρακτηρίζεται CLOSED πριν από το ελεγχόμενο production release και smoke.
