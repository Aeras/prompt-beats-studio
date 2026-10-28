# Atlas V4 — research ingest και ασφαλής structured transfer

## Επαληθευμένη βάση και κριτήρια αποδοχής

Συνέχεια στο ίδιο Draft PR #450, βάση main `fdf34b2e601dc90d4fbdaf1a3192ff948f09f698`, αρχικό PR HEAD `acb05df3848ac5d4f54ed9e72b16c5bc059422f1`. Το συνημμένο handoff ελέγχθηκε έναντι των πραγματικών client/server/worker/SQL διαδρομών. Το νέο JSON έχει SHA-256 `0d2aa2f20e5645c69a26e054de77bc8a821baf1406c910644754bf19222cdd56` και 636 εγγραφές: 396 bounded, 20 no-universal-rule, 220 insufficient. Οι 416 θετικές αποφάσεις δεν είναι έγκριση τεχνικής ή πιστοποίηση πηγής.

Αποδοχή της ασφαλούς εργασίας: byte-exact immutable sidecar, πλήρης ταύτιση IDs/σειράς/58 προφίλ, αυστηρό schema, ακριβείς παραπομπές, πηγές ως κείμενο, no-store authenticated/Beta-only προβολή ανά προφίλ, καθαρές καταστάσεις έρευνας και review. Η RC1, το αρχικό `v4/library.json`, το ordinary Advanced Setup v1, το Atlas instructions v1 και οι SQL deny guards διατηρούνται.

Αποδοχή **ζωντανής** μεταφοράς: ξεχωριστή, ελεγμένη, versioned promoted projection ανά τεχνική/αντιστοίχιση· έγκριση συγκεκριμένου περιεχομένου και συγκρούσεων· λειτουργικό preview/apply/remove με snapshot/provenance σε save/import/export/revision/worker· generation admission που επαληθεύει τα πραγματικά τελικά πεδία· αντίστοιχο SQL admission. Δεν αντικαθίστανται αυτά από `approved=true` στον client ή από researchDecision.

## Πραγματικός περιορισμός περιεχομένου

Και οι 123 V4 τεχνικές είναι μη εγκεκριμένες. Όλες οι 636 εγγραφές έχουν `musicologistReview=not_reviewed`, `creativeTechniqueCandidate=null`. Οι 65 RC1 επιλογές και όλα τα dimension placeholders παραμένουν μη εγκεκριμένα. Δεν υπάρχει κανένα τεκμηριωμένο promoted mapping προς συγκεκριμένες τιμές Generator. Επομένως **δεν είναι δυνατή η αποδοχή πλήρους end-to-end μεταφοράς** χωρίς να κατασκευαστεί ανύπαρκτη έγκριση. Η προβολή της έρευνας και οι δοκιμές μηχανισμού με συνθετικά fixtures δεν υποκαθιστούν αυτό το κενό.

Ο νέος pure structured-transfer μηχανισμός είναι προπαρασκευαστικός και fail-closed: δεν καταχωρίζει approved live επιλογές και δεν ανοίγει SQL/worker gates. Δεν παρέχεται UI που να προσποιείται επιτυχή μεταφορά κενών ή μη εγκεκριμένων τιμών. Οι υφιστάμενες v1 ροές παραμένουν ως έχουν.

## Απογραφή πλήρους διαδρομής

- `song-atlas.tsx` → `getSongAtlasPreview` → auth/feature/`atlas_preview_admission` → RC1 catalog. Νέο `getSongAtlasResearch`: ίδιοι fresh έλεγχοι, ένα profile μόνο, χωριστή ερευνητική προβολή, χωρίς οδηγίες.
- `AtlasGeneratorBridge.tsx` → `validateSongAtlasHandoff` → selected-only canonical compiler → ξεχωριστό immutable instruction layer. Δεν είναι structured field mapper.
- `generate.tsx`: manual controls, draft account isolation, Atlas-aware import/export και composition σε instructions· υπάρχουν explicit ambiguity safeguards από το #448.
- `generation-jobs.functions.ts`: επανέλεγχος origin πριν το job admission. Ο database trigger `guard_atlas_generation_input` απορρίπτει κάθε μη-null origin.
- `generation-jobs.server.ts` → `ai.functions.ts::runSongGeneration`: `atlas_worker_admission` πριν την επιλογή/κλήση provider. Απορρίπτει ανεπιφύλακτα στο σημερινό SQL.
- `song-analyzer-handoff.shared.ts::analyzerV2GeneratorPatch` χαρτογραφεί ήδη πραγματικά πεδία/Blueprint. Δεν επαναχρησιμοποιείται η αντικατάσταση manual state ως ownership μηχανισμός Atlas.
- `advanced-generator-setup.ts`: styles/moods/instruments, custom variants, production, language, BPM, structure/Blueprint, additional instructions. Δεν υπάρχουν αυτόνομα πεδία harmony/melody/vocal sex/era/groove. Αυτές οι έννοιες χρειάζονται συγκεκριμένη εγκεκριμένη οδηγία σε υπάρχον συμβατό πεδίο ή skip.
- `song-blueprint.shared.ts`: έως 40 sections, instruction 800, energy 1–5/null, index/type και προαιρετικό sectionId. Δεν παράγεται energy από γενική περιγραφή είδους. Αλλαγή δομής χρειάζεται atomic ζεύγος structure/Blueprint και προστασία ταυτότητας.
- Οι generation snapshots/revisions δεν μεταφέρουν νέο v2 origin σήμερα. Η μελλοντική ενεργοποίηση πρέπει να καλύψει και αυτές τις διαδρομές, όχι μόνο το κουμπί apply.

## Ασφάλεια και κόστος

Τα δεδομένα πηγών δεν γίνονται HTML ή runtime network fetch. Μη ασφαλή bibliography URLs προβάλλονται ως αδρανή τίτλοι. Ολόκληρο το ερευνητικό JSON παραμένει server-only· η προβολή φορτώνεται κατ’ επιλογή ανά προφίλ, με cache key χρήστη και private/no-store. Δεν στέλνεται σε κάθε poll του καταλόγου. Δεν προστίθεται provider call, DB πίνακας, οικονομική πολιτική ή runtime μετάφραση.

## Release / ανάκαμψη / επόμενο αναγκαίο evidence

Το PR παραμένει Draft και δεν είναι πλήρης λειτουργική παράδοση Atlas → Song. Δεν απαιτείται production migration για το αδρανές sidecar ή την προβολή. Release απαιτεί ανεξάρτητο review και χωριστή έγκριση merge/publish. Rollback με νέο commit της προβολής/sidecar, χωρίς αλλαγή RC1, DB ή διαγραφή ιστορικού.

Για άνοιγμα πραγματικής μεταφοράς χρειάζονται: ατομικά reviewed/approved περιεχόμενα και πραγματικές canonical τιμές πεδίων· υπογεγραμμένη/επαληθεύσιμη promoted projection (δεν υπάρχει signing key ούτε υπογραφή που να δηλώνεται εδώ)· συντονισμένη ολοκλήρωση client/server/snapshots/SQL/worker στον ίδιο ελεγχόμενο κύκλο και νέα αρνητικά/θετικά end-to-end tests. Το digest ακεραιότητας **δεν** αποτελεί κρυπτογραφική υπογραφή ή μουσικολογική πιστοποίηση.
