# Russian Cultural Song Library V4 — πακέτο ανεξάρτητου ελέγχου

## Πραγματική κατάσταση

Το παρόν είναι versioned `4.0.0-review.1` dataset με 58 σταθερά profiles, 123 μη εκτελέσιμες τεχνικές, 101 source records, 29 νέες περιορισμένες παραγράφους τεκμηρίωσης και πλήρες μητρώο των 85 αρχικών ισχυρισμών. **Δεν δηλώνεται πλήρης μουσικολογική πιστοποίηση ή ολοκλήρωση του στόχου “Editorial & Musicological Ready”.** Παραμένουν 636 συγκεκριμένες μη τεκμηριωμένες διαστάσεις/προφίλ και ατομική επαλήθευση κληρονομημένων ισχυρισμών. Η καταγραφή τους δεν ισοδυναμεί με συμπλήρωση γνώσης.

Η HTTP πρόσβαση απέτυχε ή περιορίστηκε σε αρκετές διευθύνσεις· οι προσβάσιμες περιλήψεις/κατάλογοι δεν αρκούν για να επινοηθούν αρμονία, groove, μελωδία ή παραγωγή. Ο αναγνώστης πρέπει να διακρίνει αυτή την πραγματική έλλειψη από τις δημιουργικές εναλλακτικές, που είναι σαφώς χαρακτηρισμένες ως υποθέσεις. Η νέα δίγλωσση επιμέλεια χρειάζεται ανεξάρτητο γλωσσικό έλεγχο. Δεν έχει γίνει ακρόαση/ανάλυση ολόκληρου αντιπροσωπευτικού corpus για κάθε προφίλ.

## Αρχεία και αναπαραγωγή

- `src/data/song-atlas/v4/library.json`: το κανονικό νέο dataset, ανεξάρτητο από RC1.
- `schema.json`: JSON Schema draft 2020-12, παραγόμενο από το αυστηρό Zod contract.
- `manifest.json`: ακριβή SHA-256 και μετρήσεις· κανένα “production activated”.
- `source-access.json`: receipts δημόσιας πρόσβασης, όχι claim certification.
- `src/lib/song-atlas-v4.ts`: strict structural + relational validation και inert review-only projection.
- `scripts/validate-atlas-v4.ts`: offline integrity/coverage/schema/manifest έλεγχος, `--write` μόνο για αναγέννηση παραγόμενων artifacts.
- [Coverage 58 profiles](PB-ATLAS-V4-COVERAGE.md), [101 sources / 85 claims](PB-ATLAS-V4-SOURCES-AND-CLAIMS.md), [123 techniques / shortlist](PB-ATLAS-V4-TECHNIQUES.md).

```sh
bun install --frozen-lockfile
bun scripts/validate-atlas-v4.ts
bun test src/lib/song-atlas-v4.test.ts src/lib/song-atlas.test.ts src/lib/atlas-navigation.test.ts
bun test
bunx tsc --noEmit --pretty false
bunx eslint src/lib/song-atlas-v4.ts src/lib/song-atlas-v4.test.ts scripts/validate-atlas-v4.ts
bun run build
```

## Αποφάσεις επιμέλειας

1. Η RC1 παραμένει byte-identical, SHA-256 `fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a`. 58 profiles, 14 excluded candidates, 65 αρχικές τεχνικές, 97 αρχικές πηγές. Δεν αλλάζει κανένα live import.
2. Διατηρούνται οι διακριτές κατηγορίες της navigation schema v2 (υποείδος/φόρμα/σκηνή/πλαίσιο). Η γεωγραφία της συλλογής δεν ισχυρίζεται καταγωγή: Οδησσός δεν μετατρέπεται σε ρωσική πολιτισμική ιδιοκτησία, ούτε οι Molchat Doma σε σοβιετικό συγκρότημα.
3. Οι 1980s/1990s/2000s αντιστοιχίσεις που προέρχονται από το όνομα RC1 είναι `explicit_inherited_profile_scope`, όχι ανεξάρτητη ιστορική επαλήθευση. Οι πρόσθετες τεκμηριωμένες σχέσεις έχουν passage ID και όρια. “Contemporary” = editorial bucket από το 2010, όχι παγκόσμιος μουσικολογικός ορισμός. Η μη αντιστοίχιση σημαίνει άγνωστο, όχι ότι ένα είδος δεν υπήρχε τότε.
4. Καμία υποχρεωτική αφήγηση, BPM, κλίμακα, συγχορδίες, φύλο, αργκό, εθνική ταυτότητα, όργανο ή μίμηση δημιουργού. Οι context-only καταχωρίσεις δεν παράγουν ήχο αυτόματα.
5. Ελληνικοί/αγγλικοί τίτλοι, περιλήψεις και οδηγίες συντάχθηκαν στατικά. Όλα έχουν πραγματική κατάσταση draft translation. Αυθεντική ρωσική ονομασία και fixed Latin μεταγραφή διατηρούνται. Το αδρανές inherited archive κρατά τη γλώσσα πηγής και δεν αποτελεί εγκεκριμένο UI περιεχόμενο.
6. Τα `independentMusicologicalSignoff`, `claimCertification`, `executable`, `generatorTransfer` παραμένουν false. Η schema απορρίπτει την αυτόματη ενεργοποίησή τους — μελλοντική προαγωγή απαιτεί νέα ρητά αξιολογημένη έκδοση συμβολαίου, όχι αλλαγή ενός boolean.

## Ασφαλής μελλοντική μεταφορά

Δεν συνδέεται το V4 σε routes, Generator, worker, SQL ή frontend· η μόνη νέα projection είναι review-only και δεν επιστρέφει instructions. Μελλοντικό adapter οφείλει να έχει: exact library digest και schema version, σταθερή αντιστοίχιση profile IDs, χωριστή έγκριση κάθε τεχνικής, explicit opt-in, conflict validation έναντι των χειροκίνητων οδηγιών, provenance layer, fresh Beta/server/SQL/worker admission και αποτυχία κλειστής πρόσβασης. Το υπάρχον strict handoff v1 δεν δέχεται V4 JSON ή creative hypotheses ως executable selections. Bibliography URLs είναι αδρανή δεδομένα· δεν γίνεται runtime fetch ή HTML rendering.

## Επόμενο πραγματικά απαιτούμενο evidence

Πρόσβαση στα νόμιμα πλήρη κείμενα όπου οι περιλήψεις/κατάλογοι δεν αρκούν, ατομική αντιπαραβολή των 85 claims και εξειδικευμένη εξέταση παρτιτούρας/ηχογραφήσεων για τις συγκεκριμένες gaps του JSON. Για ορισμένες ευρείες scene/context καταχωρίσεις η ορθή απόφαση μπορεί να είναι “δεν υπάρχει ενιαίος κανόνας”, όχι συμπλήρωση ενός στερεοτυπικού ήχου. Χρειάζεται επίσης ανεξάρτητη επιμέλεια ρωσικής μουσικής ορολογίας και των EL/EN αποδόσεων. Δεν αποδίδεται ανύπαρκτη πιστοποίηση σε musicologist ή native-language editor.

## Release / rollback

Μόνο Draft PR #450, χωρίς merge/publish/migration. Το dataset δεν επηρεάζει παραγωγή. Μελλοντικό release δεν μπορεί να συναχθεί από τρία πράσινα CI gates ή από αυτό το έγγραφο. Rollback του πακέτου = αφαίρεση των νέων inert artifacts με νέο commit, χωρίς rewrite ιστορικού ή μεταβολή RC1. Δεν υπάρχουν database ή οικονομικές παρενέργειες και δεν έγιναν paid AI calls.
