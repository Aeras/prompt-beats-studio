# PB-AUD-011/012/013/022/023 — AI usage και recovery hardening

## Βάση και όρια

- Authoritative audit: `ef7b77656b1c6de7b85f113467d006f5d227f5f3`, Reports B/C/D/E/F της 24/10/2026.
- Implementation base: main `0cd4ea538cc3d632abf357e5798395396d90c0fd`, μετά το squash merge του #403.
- Branch: `fix/pb-aud-ai-usage-recovery`. Το #403 και το αρχικό checkout/attachments δεν τροποποιήθηκαν.
- Καμία paid generation, production query/migration, merge, deploy, αλλαγή prompt/model/scoring ή νέα πολιτική credits/τιμών/χρηματικών ορίων.
- Η database migration είναι additive και εφαρμόζεται μόνο σε disposable verification databases σε αυτή την εργασία.

## Findings και αιτίες

| Finding | Πριν                                                                                          | Διόρθωση                                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-011 | QC επέστρεφε records, αλλά cancellation μπορούσε να επιστρέψει πριν το flush                  | Usage settlement στο provider boundary και πριν το schema/cancellation/finalization path· επαναλαμβανόμενα flushes έχουν ίδιο execution ID                                                                  |
| AUD-012 | Background create/ID persistence/GET failure μπορούσε να αφήσει remote εργασία χωρίς recovery | Durable dispatch-intent ledger, remote identity πριν το job callback, provider-result checkpoint, GET-only reconciliation, bounded leases/retries και recovery από αποθηκευμένο αποτέλεσμα χωρίς νέο create |
| AUD-013 | Poll count χωρίς deadline στο cancel POST/GET/body                                            | Ανά-request deadline 5s και συνολικό 20s (εσωτερικό ανώτατο 30s), μαζί με JSON body reads· ανεξάρτητο generation AbortSignal                                                                                |
| AUD-022 | Reasoning/cache/provider-reported cost χάνονταν πριν το insert                                | Nullable reasoning/cache columns, allowlisted normalization, OpenRouter reported USD cost χωριστά από DB estimate· reasoning δεν προστίθεται ξανά στο output                                                |
| AUD-023 | Insert/ACK loss + retry/outbox μπορούσε να διπλασιάσει analytics                              | Σταθερό UUID ανά dispatch/receipt, primary-key uniqueness, atomic settlement RPC, ίδιο ID σε retries/outbox και idempotent drain                                                                            |

Οι παλιές εγγραφές δεν γίνονται αυθαίρετα «αληθινές invoices» και δεν διορθώνονται με εικαζόμενα tokens.

## Execution inventory / trust boundaries

| Διαδρομή                                                                                                   | Dispatch / receipt / accounting / recovery                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Generator και lyric section editing                                                                | `generation-jobs.server.ts` → `ai.functions.ts` → tracked `modelCaller` → provider → execution checkpoint + settlement → υπάρχον validation/persistence                                                                                                                                              |
| QC V1/V2/V2.1                                                                                              | `quality-check-jobs.server.ts` → `quality-check-core.server.ts` → tracked caller → ανεξάρτητο settlement πριν έλεγχο cancellation → υπάρχον report/finalizer                                                                                                                                         |
| Legacy synchronous QC                                                                                      | `ai.functions.ts` activeCaller/runQualityCheck, ίδιο tracked boundary και execution ID στα buffered records                                                                                                                                                                                          |
| Setup, audio-revision intent, Story Map, Universe, planner, Analyzer final judge                           | Υπάρχον owner/feature/model authorization και auxiliary admission· tracked shared caller με operation/user context· legacy final flush χρησιμοποιεί το ίδιο ID                                                                                                                                       |
| Analyzer V2                                                                                                | Dedicated one-call audio adapter, όχι shared chat caller· execution journal στο pre-dispatch marker, allowlisted receipt πριν validation, σταθερό ID στο finally, checkpoint validated result                                                                                                        |
| Analyzer V1 audio extraction/synthesis/reference stages, verifier, Gemini research, Inspiration multimodal | Οι dedicated adapters εξακολουθούν να χρησιμοποιούν το κοινό `recordAiUsage` και αποκτούν idempotent persistence/outbox και breakdown columns. Δεν μετατρέπονται σε νέες background/provider APIs. Κάθε υπάρχουσα stage καταγραφή παραμένει χωριστή· δεν γίνεται dedupe ολόκληρου Analyzer operation |
| Administrative model-health probe                                                                          | Υπάρχον ξεχωριστό probe/status path, χωρίς αυτόματο execution-context upgrade ή live εκτέλεση σε αυτή την εργασία                                                                                                                                                                                    |
| Sweep                                                                                                      | Ίδιο authenticated internal runner/cron endpoint· reconciliation και outbox/receipts, έπειτα επιλέξιμα jobs· κανένα νέο public recovery endpoint                                                                                                                                                     |

Η ενεργή QC input enum στο current main είναι **v1/v2/v2.1**, όχι ξεχωριστό QC V3. Generator V3 δεν σημαίνει QC V3. Κανένα prompt/scoring/schema αυτών των εκδόσεων δεν αλλάζει.

### Provider-specific evidence

- OpenAI Responses / Gemini Interactions background: durable remote IDs, GET retrieval και cancellation evidence. Καμία νέα background δυνατότητα δεν ενεργοποιείται σε άλλο μοντέλο.
- OpenRouter shared adapter: completion/input/reasoning/cache στοιχεία και reported cost από γνωστά receipt fields. Μόνο OpenRouter cost fields χαρακτηρίζονται USD από αυτόν τον normalizer.
- Anthropic/OpenRouter streaming και Gemini Argon SSE: observed usage μπορεί να αποθηκευτεί πριν το stream throw/cancel. Η ακύρωση transport δεν ισοδυναμεί με upstream stop.
- Gemini Argon διατηρεί το προηγούμενο timeout budget, αλλά συνθέτει το caller cancellation signal.
- Η κρυφή δεύτερη Mistral dispatch μετά από 429 αφαιρέθηκε: ένα accounted attempt δεν πρέπει να περιέχει δεύτερη μη διακριτή provider εκτέλεση. Ο χρήστης μπορεί να ξεκινήσει νέο explicit attempt. Αυτή είναι η μόνη σκόπιμη διόρθωση αυτόματου retry behavior· δεν αλλάζει model, prompt ή τιμή.

## Accounting invariants

1. Το ledger γράφει `execution_unknown` **πριν** από dispatch. Αυτό είναι intent, όχι ισχυρισμός provider acceptance.
2. `accepted` με remote ID σημαίνει παραληφθείσα provider identity· observed usage αποτελεί ξεχωριστό evidence κατανάλωσης.
3. `response_observed` και αποθηκευμένο provider result είναι διαφορετικά από application job `completed/failed/cancelled`.
4. `not_dispatched` χρησιμοποιείται όταν cancellation παρατηρείται μετά το journal write αλλά πριν το transport.
5. Το `ai_usage_logs.id` είναι η ίδια execution identity. Retry ίδιου receipt δεν δημιουργεί νέο UUID. Νέο πραγματικό dispatch δημιουργεί άλλο ID.
6. Settlement κάνει row-lock/identity validation και δεν επιτρέπει άλλο user/provider/model/operation να ξαναχρησιμοποιήσει το ίδιο ID.
7. Unknown tokens/cost παραμένουν NULL. Μερικό input δεν συνεπάγεται output=0 ή γνωστό total.
8. `provider_usage_state`: legacy/unknown/partial/final. Final evidence δεν σβήνεται από late null receipt. Partial snapshots εμπλουτίζονται και final receipt μπορεί να αντικαταστήσει provisional counters.
9. `reasoning_tokens` είναι breakdown του output. Δεν προστίθεται στο output total ή στο DB pricing δεύτερη φορά.
10. `estimated_cost_usd` παραμένει υπολογισμός από verified registry prices. `provider_reported_cost_usd` είναι ισχυρισμός του provider, **όχι ανεξάρτητα επαληθευμένη invoice**. Subscription/credit admission/finalization δεν αλλάζει.
11. Usage success σημαίνει provider completion, όχι παράδοση usable song. Για delivery/recoverability χρησιμοποιούνται το linked job και το checkpoint.
12. Δεν υπάρχει ισχυρισμός exactly-once provider execution σε δικτυακό/κατανεμημένο σύστημα χωρίς provider-supported idempotency.

## Failure / recovery matrix

| Συμβάν                                   | Evidence / εφαρμοστική συμπεριφορά                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Cancel πριν dispatch                     | Καμία paid κλήση· existing cancellation winner semantics                                                                          |
| Cancel ενώ εκτελείται provider           | Preserved partial/unknown receipt· native cancellation μόνο αν υποστηρίζεται και επιβεβαιώνεται ανεξάρτητα                        |
| Cancel αμέσως μετά response              | Receipt/checkpoint πριν από cancellation check· καμία κανονική δημοσίευση όταν DB cancel κέρδισε                                  |
| Malformed JSON/schema ή truncated output | Η usage καταγράφεται ανεξάρτητα από failure· δεν υπάρχει automatic repair/create                                                  |
| Primary insert commit με χαμένο ACK      | Ίδιο ID στο retry, μία λογική analytics row                                                                                       |
| Primary και retry αποτυγχάνουν           | Durable outbox με ίδιο ID· αν αποτύχει και η βάση συνολικά, το pre-dispatch ledger παραμένει unknown και γίνεται reconciliation   |
| Worker πεθαίνει μετά checkpoint          | Recovery από stored provider output, χωρίς δεύτερο provider create                                                                |
| Remote ID job-write failure              | Το remote ID έχει ήδη γραφτεί στο execution journal πριν το παλιό job callback                                                    |
| Poll/transport failure                   | GET-only reconciliation. Χωρίς αξιόπιστο ID/receipt, unknown, όχι zero ή blind retry                                              |
| Ταυτόχρονοι recovery workers             | SKIP LOCKED + lease token/expiry και bounded claims. Μόνο ο σωστός token holder αποδεσμεύει το lease                              |
| Repeated recovery failures               | Μέχρι 8 claims, 5 executions ανά sweep, 15-minute retry schedule· rows μένουν για manual reconciliation, όχι deletion/retry storm |
| Orphan χωρίς remote ID/result            | Μετά το stale recovery window το processing job γίνεται failed, αλλά το οικονομικό outcome παραμένει unknown                      |
| Cancel σε ήδη orphaned background task   | Reconciler ελέγχει persisted cancellation, κάνει bounded cancel/retrieve χωρίς create                                             |
| Πραγματική δεύτερη user generation       | Άλλη execution identity και χωριστή usage· όχι dedupe βάσει γενικού operation/job description                                     |

Αυτόματο application-result recovery επιτρέπεται για stale απλές generations/section edits και processing QC με cached output. **Revision mutation δεν αναπαράγεται αυτόματα**: το AUD-014 transaction/persistence race δεν περιλαμβάνεται σε αυτό το PR. Το provider output/usage διατηρείται για ελεγχόμενη ανάκτηση χωρίς νέο paid call. Αυτό αποφεύγει overwrite νεότερης standalone revision ή μη ασφαλές replay εξωτερικών side effects.

## Database / security

Orphan failure χωρίς remote ID/result απαιτεί ηλικία τουλάχιστον **45 λεπτών**, ώστε να μην τερματίζεται λανθασμένα νόμιμο υπάρχον transport διάρκειας έως 30 λεπτών. Τα GET-only sweeps μπορούν να αρχίσουν νωρίτερα χωρίς νέο provider create.

Late cached QC output μπορεί να επαναφέρει και failed action μόνο μέσω service-side claim, χωρίς cancellation και χωρίς νέα κλήση. Orphaned processing cancellation γίνεται terminal cancelled με άγνωστο upstream outcome, εκτός αν υπάρχει έγκυρο terminal provider evidence· η πραγματική usage δεν σβήνεται.

Migration: `supabase/migrations/20261024060858_pb_aud_ai_usage_recovery.sql`.

- Service-only `ai_provider_executions`, RLS enabled, ρητά revoked PUBLIC/anon/authenticated.
- Additive nullable breakdown/cost columns και explicit usage state στα analytics· legacy rows διατηρούν ιστορική κατάσταση.
- Μοναδικότητα IDs, job/action identity και known remote identity.
- Recovery lease columns στα υπάρχοντα job tables· ownership έλεγχοι στα service RPCs.
- Νέες functions SECURITY INVOKER, pinned search_path και service-only EXECUTE. Δεν ανοίγει browser write ή privileged public endpoint.
- Το cron/runner authentication και τα φρέσκα account/feature/model authorization checks δεν παρακάμπτονται.
- Δεν αποθηκεύονται API keys, request bodies, audio/base64 ή prompts στο ledger. Αποθηκεύεται private provider result text για recovery, ήδη ίδιας ευαισθησίας με τα job outputs. Job/account deletion cascades διατηρούν απομόνωση. Auxiliary checkpoints διαγράφονται με τον λογαριασμό· καμία ανεξάρτητη production retention/cleanup policy δεν επιβλήθηκε.

## Tests και evidence

- `ai-usage-recovery.test.ts`: success, pre-dispatch/in-flight/post-response cancellation, partial/unknown usage, provider error receipt, remote-ID write failure, cached recovery, no-redispatch, persistence/ACK loss/outbox, νέο πραγματικό dispatch, cache/reasoning/cost, invalid receipt και deadline/body stalls.
- Existing worker tests: atomic claim, no provider on denied read/claim, persisted-report finalization, ambiguous-call no-retry και concurrent delivery. Τα doubles επεκτάθηκαν μόνο για το νέο journal boundary.
- Analyzer V2 existing replay/concurrency tests ελέγχουν πλέον και μία execution row.
- `supabase/tests/ai_usage_recovery.sql`: real SQL grants, unknown→final enrichment, non-erasure, owner identity rejection, primary/outbox dedupe, δεύτερο dispatch/aggregation, reasoning/cache estimate και bounded recovery leases.
- `scripts/tests/ai-usage-db-races.sh`: δύο ανεξάρτητες PostgreSQL connections για receipt commit race και concurrent recovery claims σε CI disposable container.
- Τοπική verification: PostgreSQL/WASM με το πραγματικό νέο migration και canonical cost function σε απομονωμένο fixture schema. Αυτό **δεν παρουσιάζεται ως πλήρες Supabase production replay**.
- Database Replay gate εκτελεί πλήρη ιστορική replay και τα νέα SQL/concurrency tests στην ίδια disposable βάση. Καμία production connection.
- Full Bun, strict TS, changed-source ESLint/Prettier, production build και exact-head CI evidence καταγράφονται στο PR.

## Rollout / rollback — οδηγίες, όχι εκτέλεση

1. Απαιτείται ξεχωριστή έγκριση deployment. Πρώτα additive migration, έπειτα νέα workers/application.
2. Drain/stop παλιούς workers για καθαρό cutover: παλιός κώδικας μπορεί ακόμη να γράφει χωρίς execution identity. Το PR δεν υπόσχεται διόρθωση writes από παλιό binary.
3. Missing migration αποτυγχάνει κλειστά πριν tracked dispatch. Μην επιτρέψετε paid work με rollback bypass στο journal.
4. Database constraints/grants και bounded recovery queues πρέπει να παρακολουθούνται στο staging πριν production.
5. Rollback κώδικα δεν απαιτεί DROP νέων columns/tables ή διαγραφή financial evidence. Κρατήστε το additive schema και απενεργοποιήστε/παγώστε workers μέχρι συντονισμένο cutover. Παλιός κώδικας επαναφέρει τους παλιούς κινδύνους.
6. Μην αφαιρείτε constraints/receipts και μην κάνετε speculative refund/backfill. Ιστορικά duplicates χωρίς provider identity δεν ταυτοποιούνται αξιόπιστα μόνο από χρόνο/model/token equality.

## Ειλικρινείς περιορισμοί / υπολειπόμενοι κίνδυνοι

- Provider accepted create και worker death πριν παραληφθεί/persisted remote ID είναι αναπόφευκτο ambiguity window χωρίς upstream idempotency/receipt lookup. Το ledger κρατά unknown και απαγορεύει αυτόματο νέο create.
- Αν ο provider δεν δίνει usage, αν ένα stream δεν πρόλαβε να παραδώσει receipt ή αν όλες οι durable writes αποτύχουν, δεν μπορεί να ανακατασκευαστεί πραγματική χρέωση από υπόθεση. Journal/outbox και bounded reconciliation μειώνουν το κενό, δεν αποτελούν provider invoice guarantee.
- Background retrieval εξαρτάται από provider retention/API availability. Δεν έγιναν live compatibility ή billing probes.
- Dedicated legacy raw/SDK Analyzer/creative adapters αποκτούν ασφαλή delivery idempotency αλλά όχι γενική δυνατότητα αναδρομικού GET ή automatic result replay. Υπάρχον auxiliary provider-start fencing εξακολουθεί να αποτρέπει blind replay.
- OpenRouter receipt ποσό και registry estimate μπορεί να διαφέρουν. Δεν αλλάζει αυτόματα καμία subscription/credit χρέωση ούτε επιβάλλεται νέο spend cap.
- Τα unresolved executions και exhausted outbox rows απαιτούν operator reconciliation από πραγματικά redacted provider receipts. Δεν «διορθώνονται» ως μηδενικά.
- Η production schema/policy/cron κατάσταση δεν επαληθεύτηκε, επειδή δεν υπάρχει εξουσιοδότηση production access σε αυτή την εργασία.

**Ready for human review δεν σημαίνει deploy/merge έγκριση ή μηδενικό οικονομικό κίνδυνο.**
