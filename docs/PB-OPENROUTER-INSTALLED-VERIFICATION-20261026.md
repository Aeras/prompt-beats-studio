# Επαλήθευση εγκατεστημένων OpenRouter μοντέλων — 26/10/2026

## Αποτέλεσμα και όρια

**PARTIAL — καμία νέα ενεργοποίηση.** Επαληθεύτηκε το main `2d12ded563d36eed2bb6a44a6ce8ef317c1a3d91`, τα ανοιχτά PR και η πραγματική βάση `qwlksrcsovbncmretjdt`. Υπάρχουν 11 εγκατεστημένα OpenRouter μοντέλα: 10 testing και 1 enabled. Όλα έχουν `admin_only`. Τα υπόλοιπα providers δεν τροποποιήθηκαν.

Ο δημόσιος, μη χρεώσιμος κατάλογος `https://openrouter.ai/api/v1/models` περιείχε όλα τα ακριβή IDs. Μόνο το ακριβές Nemotron `:free` είχε μηδενική τιμή input/output και δοκιμάστηκε: μία ενεργοποίηση του υπάρχοντος verifier, δηλαδή ακριβώς δύο μικρά αιτήματα (Generator/QC, max_tokens 120, χωρίς επανάληψη). Και τα δύο επέστρεψαν κενό output. Αυτό είναι **αβέβαιο αποτέλεσμα**, όχι απόδειξη ασυμβατότητας. Δεν έγινε δεύτερη δοκιμή ή ενεργοποίηση.

Εκτιμώμενο κόστος αυτών των δύο αιτημάτων: **$0 βάσει του δωρεάν ακριβούς catalog ID**. Ο υπάρχων verifier δεν επιστρέφει usage receipts, generation IDs ή provider cost: δεν επιβεβαιώνεται τιμολόγιο, πραγματικά tokens ή χρέωση ανεξάρτητα. Δεν πραγματοποιήθηκαν probes επί πληρωμή μοντέλων. Στον τοπικό ασφαλή χώρο δεν υπήρχε OpenRouter API key· δεν εξήχθη credential από browser/runtime.

## Ανά μοντέλο — τελική πραγματική κατάσταση

«Δεν εκτελέστηκε» σημαίνει ότι δεν υπάρχει νέο αποτέλεσμα· όχι ότι το μοντέλο απέτυχε. Κόστος $0 για μη εκτελεσμένα αιτήματα σημαίνει μηδενικές νέες κλήσεις αυτής της εργασίας.

| Ακριβές OpenRouter ID                              | Generator νέα δοκιμή     | QC νέα δοκιμή            | Τελική κατάσταση    | Κόστος εργασίας                   |
| -------------------------------------------------- | ------------------------ | ------------------------ | ------------------- | --------------------------------- |
| anthropic/claude-fable-5.1                         | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| anthropic/claude-opus-5.5                          | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| anthropic/claude-sonnet-5.5                        | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| google/gemini-3.8-flash                            | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| google/gemini-4-argon                              | Παραλείφθηκε, ήδη ενεργό | Παραλείφθηκε, ήδη ενεργό | enabled, αμετάβλητο | $0, καμία κλήση                   |
| meta/muse-spark-open                               | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | Αβέβαιο: κενό output     | Αβέβαιο: κενό output     | testing             | Εκτίμηση $0· receipt μη διαθέσιμο |
| openai/gpt-6-astra                                 | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| openai/gpt-6-luna                                  | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| openai/gpt-6.1-sol                                 | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |
| xiaomi/mimo-v2.6-pro                               | Δεν εκτελέστηκε          | Δεν εκτελέστηκε          | testing             | $0, καμία κλήση                   |

Επανέλεγχος πραγματικής βάσης: όλα τα status/access/capability/enabled/revision πεδία παρέμειναν ίδια. Μόνο το `last_checked_at` του δωρεάν Nemotron ενημερώθηκε από τον υπάρχοντα verifier σε `2026-10-26T10:12:47.783Z`. Οι τρεις προεπιλογές παρέμειναν `gpt-5.6-luna`, registry ID `d33c7afa-943e-4502-b4c2-76e527f91e1c`. Δεν έγινε Save στον editor, αλλαγή πρόσβασης ή χρήση ενεργού Argon.

## Επιβεβαιωμένα προβλήματα και στοχευμένη διόρθωση

1. `src/lib/ai-model-admin.functions.ts`, `verifyInstalledAiModelCompatibility`: συνδύαζε τα παλιά capability flags με τη νέα δοκιμή και επέστρεφε τις ιστορικές τιμές σαν αποτέλεσμα. Στην πραγματική δοκιμή το UI έγραφε «Επαληθεύτηκε» και ταυτόχρονα «empty model output». Πλέον επιστρέφεται ακριβώς το νέο probe result.
2. Η audit ενέργεια `VERIFY_AI_MODEL_COMPATIBILITY` δεν υπάρχει στο production `admin_audit_log_action_check` και το σφάλμα αγνοούνταν. Πλέον χρησιμοποιείται επιτρεπόμενο `UPDATE_AI_MODEL`, `details.operation=compatibility_probe`, με υποχρεωτική επιτυχία καταγραφής πριν από οποιαδήποτε ενημέρωση capability.
3. Νέο `src/lib/ai-model-verification.server.ts`: μόνο θετικές νέες ενδείξεις γράφουν capability=true. Δεν αντιγράφονται παλιά flags, status, επιλογές, πρόσβαση, τιμές ή defaults. CAS στο `admin_revision` απορρίπτει ανταγωνιστική επεξεργασία/απεγκατάσταση αντί να την καλύπτει. Έλλειψη εγγραφής ή αποτυχία αποθήκευσης αναφέρεται ως σφάλμα.
4. `src/lib/ai-provider-registry.server.ts`: αποτυχημένο routed OpenRouter sample, κενό/κομμένο/μη έγκυρο JSON είναι inconclusive· δεν αποδεικνύει καθολική ασυμβατότητα. Δεν αυξήθηκαν tokens, retries ή αριθμός κλήσεων. Οι άλλοι adapters διατηρούν τη συμπεριφορά τους.
5. Το UI δίνει ουδέτερο μήνυμα όταν δεν επιβεβαιώθηκε καμία λειτουργία. Τα ιστορικά capabilities εξακολουθούν να επιτρέπουν τις υπάρχουσες επιλογές χωρίς να παρουσιάζονται ως νέο επιτυχημένο probe.

Το audit καταγράφει **το probe**, όχι επιτυχημένη αλλαγή ρυθμίσεων: αν το επόμενο CAS/DB write αποτύχει, παραμένει έγκυρη απόδειξη δοκιμής και επιστρέφεται σφάλμα. Τα δύο writes δεν είναι μία συναλλαγή. Δεν προστίθεται migration ή δήλωση ατομικού audit/settings commit.

## Adapter και δυναμικές προεπιλογές

Ο πραγματικός adapter `src/lib/ai-provider.server.ts`, `callOpenRouter`, χρησιμοποιεί το OpenRouter chat completions transport. Ο registry verifier χρησιμοποιεί το ίδιο ακριβές provider model ID και μικρό chat request, χωρίς jsonMode για OpenRouter. Τα μικρά schemas `{title,lyrics}` και `{passed,score}` είναι βασικός έλεγχος output capability, **όχι πλήρης παραγωγική δημιουργία/αναφορά QC**.

`AiModelsPanel.tsx`: οι τρεις επιλογείς παίρνουν `data.models`, όχι hardcoded λίστες. `canSetOperationDefault` απαιτεί enabled + compatible + enabled flag της αντίστοιχης λειτουργίας. Τα testing μοντέλα εμφανίζονται αλλά είναι μη επιλέξιμα. Η ενεργοποίηση δεν γίνεται αυτόματα από verification. Το server RPC `admin_set_ai_model_default` διατηρεί τους ίδιους ελέγχους. Υπάρχουν mocked browser tests επιλογών/δικαιωμάτων· δεν άλλαξε πραγματική προεπιλογή.

Η πολιτική παραμένει admin_only για όλα. Δεν δόθηκε καθολική πρόσβαση. Η επιλογή καθολικού default έχει δική της σημασιολογία inherit και δεν πρέπει να χρησιμοποιηθεί ως έμμεση αλλαγή πρόσβασης στη συγκεκριμένη εργασία.

## Συγκεκριμένο εμπόδιο για τις υπόλοιπες δοκιμές

Ο deployed verifier δεν έχει συνολικό budget reservation, επαληθευμένο provider/key hard cap, `provider.max_price`, accounting receipts ή σαφή όρια reasoning ανά routed upstream. Οι μικροί output περιορισμοί και οι catalog τιμές δεν αρκούν ως απόδειξη αυστηρού συνολικού ορίου $0.10. Δεν έγινε προσπάθεια παράκαμψης. Οι reasoning tokens μπορεί να καταναλώσουν το μικρό output budget χωρίς εμφανές κείμενο.

Για να συνεχιστούν τα επί πληρωμή probes χρειάζεται ασφαλής εκτέλεση με **επαληθευμένο συνολικό hard cap έως $0.10 για όλη την παρτίδα**, αξιόπιστη ανά αίτημα δέσμευση/καταγραφή τιμής και usage, χωρίς επανάληψη και χωρίς αποκάλυψη API key. Η παρούσα διόρθωση δεν υλοποιεί νέο μηχανισμό billing ούτε ισχυρίζεται ότι λύνει αυτό το operational εμπόδιο.

Πηγές για τρέχουσα εξωτερική συμπεριφορά: [OpenRouter pricing](https://openrouter.ai/pricing), [επίσημη τεκμηρίωση reasoning](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx). Τα catalog στοιχεία είναι στιγμιότυπο της ημέρας, όχι διαρκής εγγύηση τιμολόγησης.

## Verification / release

Νέα offline unit tests καλύπτουν διπλό κενό output, mixed success, δύο έγκυρα schemas, network/routing failure χωρίς retry, διατήρηση ρυθμίσεων, CAS conflict, απεγκατάσταση, audit/DB failures και raw result contract. Browser regression σε desktop/tablet/mobile αποδεικνύει ότι παλιό true capability δεν εμφανίζεται ως νέα επιτυχία. Η παλιά source assertion προσαρμόζεται στη νέα helper διαδρομή με ισοδύναμη προστασία against automatic enabling.

Ακριβή αποτελέσματα full Bun/TypeScript/lint/format/build και των τριών CI gates καταγράφονται μαζί με το τελικό HEAD στο μοναδικό PR. Χωρίς SQL αλλαγές, production migration, merge ή publish. Μετά από ανεξάρτητο review απαιτείται συμβατό publish για να διορθωθεί ο deployed verifier. Rollback: επαναφορά του κώδικα μέσω νέου commit και publish με ξεχωριστή έγκριση· δεν γίνεται αναίρεση πραγματικών capability flags ή audit evidence.
