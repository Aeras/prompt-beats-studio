# Football — ελληνικές ονομασίες και ενιαίο μητρώο ομάδων

## Αντικείμενο και επαληθευμένο baseline

Main `72bc670dd4f3a9783bc79196ef4318877879b949`, merged #512. Root AGENTS και WORK-STATUS διαβάστηκαν· κανένα ανοιχτό επικαλυπτόμενο Football PR. Απομονωμένο τοπικό branch `codex/football-team-registry-20261106`. Δεν μεταβλήθηκαν η προϋπάρχουσα τοπική release reconciliation ή τα προηγούμενα worktrees.

Το παραγωγικό συμβάν Fiorentina–Juventus επέστρεψε `missing`, παρότι το ήδη παραληφθέν JoJ αρχείο είχε AC Fiorentina–Juventus FC, ίδιο kickoff/διοργάνωση και τιμές 3.35/3.55/2.12. Η παλιά δομή είχε δύο διαφορετικούς ελλιπείς alias πίνακες. Το παρόν διορθώνει την ταυτότητα, όχι τη σημασία των αγορών ή τους κανόνες freshness.

## Έρευνα και προέλευση

Στις 6 Νοεμβρίου 2026 ανακτήθηκαν μόνο έξι δημόσιες λίστες ESPN χωρίς credentials. Επιβεβαιώθηκαν 110 τρέχουσες ομάδες 2026-27: Ελλάδα 14, Αγγλία 20, Γαλλία 18, Ισπανία 20, Γερμανία 18, Ιταλία 20. Δεν χρησιμοποιήθηκαν παλιές λίστες σεζόν ως δήθεν τρέχουσες.

Οι ελληνικές ονομασίες διασταυρώθηκαν στις δημόσια ευρετηριασμένες λίστες ΑΘΛΟΣ ανά διοργάνωση. Η άμεση HTML πρόσβαση αρνήθηκε HTTP403 και δεν επιχειρήθηκε παράκαμψη· τα καταγεγραμμένα snippets περιείχαν τις έξι πλήρεις λίστες. Υφιστάμενες τεκμηριωμένες ετικέτες διατηρούνται όπου διαφέρουν μόνο ως καθιερωμένη σύντομη/πλήρης μορφή (Νιούκασλ, Άρης Θεσσαλονίκης, Μπορούσια Ντόρτμουντ). Αυτές είναι στατικές editorial επιλογές εμφάνισης, όχι runtime μετάφραση ή επίσημη δήλωση ονομασίας από τους συλλόγους.

- `gr-sl`: [ελληνικές ονομασίες](https://athlosnews.gr/matchcenter/competition/football/197/super-league/) · [πραγματική λίστα ESPN](https://site.api.espn.com/apis/site/v2/sports/soccer/gre.1/teams?limit=100) · SHA-256 `66c63d2d4a3e90317b8f3c43f98951fbc7800a5d8683679c0ca234c78bec8ba9`.
- `en-pl`: [ελληνικές ονομασίες](https://athlosnews.gr/matchcenter/competition/football/39/premier-league/) · [πραγματική λίστα ESPN](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams?limit=100) · SHA-256 `0746d7ba071771de6796ea769b18d090366e5fbffda7418acb6613533aaa4cf6`.
- `fr-l1`: [ελληνικές ονομασίες](https://athlosnews.gr/matchcenter/competition/football/61/ligue-1/) · [πραγματική λίστα ESPN](https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams?limit=100) · SHA-256 `039df194ec9b7fe7e3a09ef15d81007bcc42c34461597ab1ca77e96883082d25`.
- `es-ll`: [ελληνικές ονομασίες](https://athlosnews.gr/matchcenter/competition/football/140/la-liga/) · [πραγματική λίστα ESPN](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams?limit=100) · SHA-256 `fc3b6f335d4cd263aaf15779ff8624f8fa9dc5a5708c92fbdf3094fbed87aa9b`.
- `de-bl`: [ελληνικές ονομασίες](https://athlosnews.gr/matchcenter/competition/football/78/bundesliga/) · [πραγματική λίστα ESPN](https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/teams?limit=100) · SHA-256 `ddf0425e233fb607d317c9f94888fdf2d3f341bfe4c4f2067f16be6c6d43e600`.
- `it-sa`: [ελληνικές ονομασίες](https://athlosnews.gr/matchcenter/competition/football/135/serie-a/) · [πραγματική λίστα ESPN](https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams?limit=100) · SHA-256 `575f8fd96cb7e5b015902c61a344796bf312d99d470683e2c99a3b8f97331eab`.

Το JoJ ταυτοποιήθηκε από τις δύο πραγματικές απαντήσεις που είχαν ήδη παραληφθεί στην παραγωγή στις 06:10:43/06:10:45 UTC. Δεν έγινε νέο χρεώσιμο αίτημα, δεν ανακτήθηκε κλειδί και δεν αντιγράφηκε raw feed στο Git. Οι 110 συσχετίσεις ελέγχθηκαν ως ζεύγη ονομάτων/IDs εντός της σωστής εγχώριας διοργάνωσης. Οι hashes στο coverage artifact αφορούν σειριοποιημένο cached JSON, όχι άγνωστα bytes δικτύου. Τα API-Football, football-data.org και PitchAPI δεν έχουν υποθετικά IDs: παραμένουν χωρίς ID binding μέχρι ασφαλή επαλήθευση, χρησιμοποιώντας μόνο τις ακριβείς επιμελημένες ονομασίες.

## Αρχιτεκτονική και ασφάλεια

- Versioned JSON μητρώο με ανεξάρτητο `country-club` ID, senior-men squad, χώρα, εγχώρια διοργάνωση/σεζόν ως snapshot metadata, αγγλική/ελληνική ονομασία, ρητά aliases, namespaced ESPN/JoJ IDs και προέλευση.
- Τα IDs είναι μόνιμα: αλλαγή ονόματος, ανόδου/υποβιβασμού ή σεζόν δεν τα επανυπολογίζει. Η παρούσα αρχική seed δημιουργία δεν είναι runtime importer. Οι μελλοντικές αλλαγές απαιτούν ενημέρωση του ίδιου αρχείου και review/test, χωρίς νέα υπηρεσία ή live learning.
- Ένα κοινό resolver χρησιμοποιείται στην εμφάνιση, στην αντιστοίχιση JoJ και στο υπάρχον all-provider evidence matching. Καμία αντιστοίχιση δεν γράφεται αυτόματα από μοντέλο ή από ομοιότητα κειμένου.
- Μόνο NFKC/case/whitespace normalization. Καμία αφαίρεση accents, πόλης, women, B/II, U19/U21 ή άλλων qualifiers. Το μητρώο δεν θεωρεί όλα τα FC/AC ως αφαιρέσιμα.
- Γνωστό provider ID απαιτεί συμφωνία με επιμελημένο alias. Αντιφατικό/qualified όνομα απορρίπτεται. Άγνωστο ID μπορεί να χρησιμοποιήσει γνωστό ακριβές alias, αλλά χαρακτηρίζεται alias resolution, όχι επαληθευμένο νέο provider ID.
- Διπλά IDs απορρίπτουν το μητρώο. Κοινό alias πολλών ομάδων δίνει ambiguous. Τα snapshots του μητρώου είναι immutable. Fallback πίνακες δέχονται μόνο own properties, ώστε `__proto__`/`constructor` να μη γίνονται αντικείμενα ή ψευδείς ονομασίες.
- Διοργάνωση, γηπεδούχος/φιλοξενούμενος, ακριβής UTC kickoff, ακέραιη πλήρης αγορά, χρόνος παραλαβής/freshness και αμφίσημοι αγώνες παραμένουν ανεξάρτητες αναγκαίες προϋποθέσεις. Η ταυτότητα ομάδας δεν αποδεικνύει από μόνη της ότι ένας αγώνας είναι πραγματικός.
- Ελληνικά μόνο στην εμφάνιση EL. EN/άγνωστες ονομασίες/ιστορικά raw δεδομένα διατηρούνται. Δεν μεταφράζονται οι ελεύθερες προτάσεις AI, τα outbound prompts/queries, τα provider names ή το αποθηκευμένο ιστορικό. Υφιστάμενες ετικέτες εκτός των έξι πρωταθλημάτων διατηρούνται ως display-only fallback.

## Πραγματική offline επαλήθευση

Το coverage artifact καταγράφει επιτυχή αντιστοίχιση 111/111 επιλέξιμων αγώνων των έξι διοργανώσεων στο soccer_leagues και 4/4 στο soccer, με 110/110 αναγνωρισμένες ομάδες. Τα 115 events δεν δηλώνονται ως μοναδικά μεταξύ αρχείων. Καμία νέα κλήση JoJ ή AI. Το πραγματικό incident αναπαράγεται σε μικρό offline regression fixture: actual collector επιστρέφει matched και τις ακριβείς 3 τιμές χωρίς database/network mutation. Οι πρώτοι 61 focused tests πέρασαν. Τα τελικά πλήρη αποτελέσματα αναγράφονται στο WORK-STATUS, όχι ως υπόθεση εδώ.

## Αποδοχή, συμβατότητα και release

Όλες οι 110 ESPN και JoJ ονομασίες πρέπει να επιλύονται στο ίδιο club ID και ελληνικό label. Tests για συγκρούσεις IDs/aliases, immutable registry, αλλαγή locale, διαφορετικά squad/πόλη, λάθος διοργάνωση/ώρα, ανάποδες ομάδες και διπλούς αγώνες πρέπει να παραμένουν πράσινα. Browser mock tests καλύπτουν τις έξι χώρες σε desktop/tablet/mobile, με τα υπάρχοντα preview/history/auth/focus/overflow tests και μηδενικό paid dispatch.

Δεν αλλάζουν auth, RLS, οικονομικά, quotas, prompts, API credentials, paid retries, KINO ή μουσικές λειτουργίες. Δεν χρειάζεται migration. Άγνωστες νέες ομάδες ή αλλαγές provider IDs μπορεί ακόμη να απαιτήσουν editorial προσθήκη· δεν υπάρχει εγγύηση αυτόματης αναγνώρισης όλων των μελλοντικών ονομάτων. Δεν ισχυριζόμαστε ότι όλες οι υπάρχουσες υπηρεσίες παρέχουν όλες τις αγορές/στατιστικά.

Μετά την τοπική ολοκλήρωση απαιτείται ρητή έγκριση για ένα consolidated push/Draft PR και τα τρία exact-HEAD CI gates, ανεξάρτητο review/merge και ξεχωριστό συμβατό Lovable publish. Smoke με φρέσκο JoJ feed μπορεί να καταναλώσει quota και δεν εκτελείται χωρίς έγκριση. Καμία παλιά ανάλυση δεν ξανατρέχει αυτόματα. Rollback με κανονικό code revert, χωρίς DB migration ή ιστορική αλλοίωση· θα επαναφέρει και τον παλιό περιορισμό aliases.

## Πλήρης κατάλογος 110 ομάδων

| Διοργάνωση | Μόνιμο ID                     | Πρωτογενής ονομασία ESPN | Ελληνική ετικέτα       | ESPN ID | JoJ ID  |
| ---------- | ----------------------------- | ------------------------ | ---------------------- | ------- | ------- |
| GR-SL      | `gr-aek-athens`               | AEK Athens               | ΑΕΚ                    | 887     | 109066  |
| GR-SL      | `gr-aris`                     | Aris                     | Άρης Θεσσαλονίκης      | 11553   | 109349  |
| GR-SL      | `gr-asteras-tripoli`          | Asteras Tripoli          | Αστέρας Τρίπολης       | 8354    | 108718  |
| GR-SL      | `gr-atromitos`                | Atromitos                | Ατρόμητος              | 6790    | 108722  |
| GR-SL      | `gr-iraklis`                  | Iraklis                  | Ηρακλής                | 2575    | 1929617 |
| GR-SL      | `gr-kalamata`                 | Kalamata                 | Καλαμάτα               | 132429  | 108494  |
| GR-SL      | `gr-kifisia`                  | Kifisia                  | Κηφισιά                | 21969   | 1882660 |
| GR-SL      | `gr-levadiakos`               | Levadiakos               | Λεβαδειακός            | 5276    | 108465  |
| GR-SL      | `gr-ofi-crete`                | OFI Crete                | ΟΦΗ                    | 1010    | 107861  |
| GR-SL      | `gr-olympiacos`               | Olympiacos               | Ολυμπιακός             | 435     | 108723  |
| GR-SL      | `gr-paok`                     | PAOK                     | ΠΑΟΚ                   | 605     | 109159  |
| GR-SL      | `gr-panathinaikos`            | Panathinaikos            | Παναθηναϊκός           | 443     | 108432  |
| GR-SL      | `gr-panetolikos`              | Panetolikos              | Παναιτωλικός           | 11431   | 108471  |
| GR-SL      | `gr-volos-nfc`                | Volos NFC                | Βόλος ΝΠΣ              | 20043   | 1916043 |
| EN-PL      | `en-afc-bournemouth`          | AFC Bournemouth          | Μπόρνμουθ              | 349     | 106709  |
| EN-PL      | `en-arsenal`                  | Arsenal                  | Άρσεναλ                | 359     | 106359  |
| EN-PL      | `en-aston-villa`              | Aston Villa              | Άστον Βίλα             | 362     | 107586  |
| EN-PL      | `en-brentford`                | Brentford                | Μπρέντφορντ            | 337     | 106864  |
| EN-PL      | `en-brighton-hove-albion`     | Brighton & Hove Albion   | Μπράιτον               | 331     | 106747  |
| EN-PL      | `en-chelsea`                  | Chelsea                  | Τσέλσι                 | 363     | 106835  |
| EN-PL      | `en-coventry-city`            | Coventry City            | Κόβεντρι               | 388     | 109638  |
| EN-PL      | `en-crystal-palace`           | Crystal Palace           | Κρίσταλ Πάλας          | 384     | 107915  |
| EN-PL      | `en-everton`                  | Everton                  | Έβερτον                | 368     | 106753  |
| EN-PL      | `en-fulham`                   | Fulham                   | Φούλαμ                 | 370     | 106357  |
| EN-PL      | `en-hull-city`                | Hull City                | Χαλ Σίτι               | 306     | 106373  |
| EN-PL      | `en-ipswich-town`             | Ipswich Town             | Ίπσουιτς               | 373     | 106315  |
| EN-PL      | `en-leeds-united`             | Leeds United             | Λιντς                  | 357     | 106731  |
| EN-PL      | `en-liverpool`                | Liverpool                | Λίβερπουλ              | 364     | 108840  |
| EN-PL      | `en-manchester-city`          | Manchester City          | Μάντσεστερ Σίτι        | 382     | 106785  |
| EN-PL      | `en-manchester-united`        | Manchester United        | Μάντσεστερ Γιουνάιτεντ | 360     | 108757  |
| EN-PL      | `en-newcastle-united`         | Newcastle United         | Νιούκασλ               | 361     | 107610  |
| EN-PL      | `en-nottingham-forest`        | Nottingham Forest        | Νότιγχαμ Φόρεστ        | 393     | 109058  |
| EN-PL      | `en-sunderland`               | Sunderland               | Σάντερλαντ             | 366     | 107366  |
| EN-PL      | `en-tottenham-hotspur`        | Tottenham Hotspur        | Τότεναμ                | 367     | 106364  |
| FR-L1      | `fr-aj-auxerre`               | AJ Auxerre               | Οσέρ                   | 172     | 106482  |
| FR-L1      | `fr-as-monaco`                | AS Monaco                | Μονακό                 | 174     | 106311  |
| FR-L1      | `fr-angers`                   | Angers                   | Ανζέ                   | 7868    | 108439  |
| FR-L1      | `fr-brest`                    | Brest                    | Μπρεστ                 | 6997    | 106881  |
| FR-L1      | `fr-le-havre-ac`              | Le Havre AC              | Χάβρη                  | 3236    | 108415  |
| FR-L1      | `fr-le-mans`                  | Le Mans                  | Λε Μαν                 | 2697    | 106493  |
| FR-L1      | `fr-lens`                     | Lens                     | Λανς                   | 175     | 107542  |
| FR-L1      | `fr-lille`                    | Lille                    | Λιλ                    | 166     | 106887  |
| FR-L1      | `fr-lorient`                  | Lorient                  | Λοριάν                 | 273     | 106889  |
| FR-L1      | `fr-lyon`                     | Lyon                     | Λιόν                   | 167     | 107634  |
| FR-L1      | `fr-marseille`                | Marseille                | Μαρσέιγ                | 176     | 108621  |
| FR-L1      | `fr-nice`                     | Nice                     | Νις                    | 2502    | 106645  |
| FR-L1      | `fr-paris-fc`                 | Paris FC                 | Παρί FC                | 6851    | 116951  |
| FR-L1      | `fr-paris-saint-germain`      | Paris Saint-Germain      | Παρί Σεν Ζερμέν        | 160     | 107635  |
| FR-L1      | `fr-stade-rennais`            | Stade Rennais            | Ρεν                    | 169     | 106481  |
| FR-L1      | `fr-strasbourg`               | Strasbourg               | Στρασμπούρ             | 180     | 109484  |
| FR-L1      | `fr-toulouse`                 | Toulouse                 | Τουλούζ                | 179     | 107120  |
| FR-L1      | `fr-troyes`                   | Troyes                   | Τρουά                  | 170     | 109164  |
| ES-LL      | `es-alaves`                   | Alavés                   | Αλαβές                 | 96      | 1970458 |
| ES-LL      | `es-athletic-club`            | Athletic Club            | Αθλέτικ Μπιλμπάο       | 93      | 107463  |
| ES-LL      | `es-atletico-madrid`          | Atlético Madrid          | Ατλέτικο Μαδρίτης      | 1068    | 107168  |
| ES-LL      | `es-barcelona`                | Barcelona                | Μπαρτσελόνα            | 83      | 118748  |
| ES-LL      | `es-celta-vigo`               | Celta Vigo               | Θέλτα                  | 85      | 107809  |
| ES-LL      | `es-deportivo`                | Deportivo                | Ντεπορτίβο Λα Κορούνια | 90      | 107791  |
| ES-LL      | `es-elche`                    | Elche                    | Έλτσε                  | 3751    | 106643  |
| ES-LL      | `es-espanyol`                 | Espanyol                 | Εσπανιόλ               | 88      | 108655  |
| ES-LL      | `es-getafe`                   | Getafe                   | Χετάφε                 | 2922    | 1970457 |
| ES-LL      | `es-levante`                  | Levante                  | Λεβάντε                | 1538    | 109295  |
| ES-LL      | `es-malaga`                   | Málaga                   | Μάλαγα                 | 99      | 109195  |
| ES-LL      | `es-osasuna`                  | Osasuna                  | Οσασούνα               | 97      | 108639  |
| ES-LL      | `es-racing-santander`         | Racing Santander         | Ράσινγκ Σανταντέρ      | 87      | 107153  |
| ES-LL      | `es-rayo-vallecano`           | Rayo Vallecano           | Ράγιο Βαγιεκάνο        | 101     | 107232  |
| ES-LL      | `es-real-betis`               | Real Betis               | Ρεάλ Μπέτις            | 244     | 1904622 |
| ES-LL      | `es-real-madrid`              | Real Madrid              | Ρεάλ Μαδρίτης          | 86      | 107805  |
| ES-LL      | `es-real-sociedad`            | Real Sociedad            | Ρεάλ Σοσιεδάδ          | 89      | 107704  |
| ES-LL      | `es-sevilla`                  | Sevilla                  | Σεβίλλη                | 243     | 1970454 |
| ES-LL      | `es-valencia`                 | Valencia                 | Βαλένθια               | 94      | 1970455 |
| ES-LL      | `es-villarreal`               | Villarreal               | Βιγιαρεάλ              | 102     | 1970456 |
| DE-BL      | `de-1-fc-union-berlin`        | 1. FC Union Berlin       | Ουνιόν Βερολίνου       | 598     | 107376  |
| DE-BL      | `de-bayer-leverkusen`         | Bayer Leverkusen         | Λεβερκούζεν            | 131     | 108822  |
| DE-BL      | `de-bayern-munich`            | Bayern Munich            | Μπάγερν Μονάχου        | 132     | 108215  |
| DE-BL      | `de-borussia-dortmund`        | Borussia Dortmund        | Μπορούσια Ντόρτμουντ   | 124     | 108294  |
| DE-BL      | `de-borussia-monchengladbach` | Borussia Mönchengladbach | Γκλάντμπαχ             | 268     | 108687  |
| DE-BL      | `de-eintracht-frankfurt`      | Eintracht Frankfurt      | Άιντραχτ Φρανκφούρτης  | 125     | 107642  |
| DE-BL      | `de-fc-augsburg`              | FC Augsburg              | Άουγκσμπουργκ          | 3841    | 107489  |
| DE-BL      | `de-fc-cologne`               | FC Cologne               | Κολωνία                | 122     | 106812  |
| DE-BL      | `de-hamburg-sv`               | Hamburg SV               | Αμβούργο               | 127     | 107288  |
| DE-BL      | `de-mainz`                    | Mainz                    | Μάιντς                 | 2950    | 106861  |
| DE-BL      | `de-rb-leipzig`               | RB Leipzig               | Λειψία                 | 11420   | 108344  |
| DE-BL      | `de-sc-freiburg`              | SC Freiburg              | Φράιμπουργκ            | 126     | 108572  |
| DE-BL      | `de-sc-paderborn-07`          | SC Paderborn 07          | Πάντερμπορν            | 3307    | 107643  |
| DE-BL      | `de-sv-elversberg`            | SV Elversberg            | Έλβερσμπεργκ           | 10388   | 106595  |
| DE-BL      | `de-schalke-04`               | Schalke 04               | Σάλκε                  | 133     | 108284  |
| DE-BL      | `de-tsg-hoffenheim`           | TSG Hoffenheim           | Χόφενχαϊμ              | 7911    | 108875  |
| DE-BL      | `de-vfb-stuttgart`            | VfB Stuttgart            | Στουτγκάρδη            | 134     | 108838  |
| DE-BL      | `de-werder-bremen`            | Werder Bremen            | Βέρντερ Βρέμης         | 137     | 106358  |
| IT-SA      | `it-ac-milan`                 | AC Milan                 | Μίλαν                  | 103     | 107075  |
| IT-SA      | `it-as-roma`                  | AS Roma                  | Ρόμα                   | 104     | 107363  |
| IT-SA      | `it-atalanta`                 | Atalanta                 | Αταλάντα               | 105     | 107244  |
| IT-SA      | `it-bologna`                  | Bologna                  | Μπολόνια               | 107     | 108188  |
| IT-SA      | `it-cagliari`                 | Cagliari                 | Κάλιαρι                | 2925    | 107754  |
| IT-SA      | `it-como`                     | Como                     | Κόμο                   | 2572    | 106478  |
| IT-SA      | `it-fiorentina`               | Fiorentina               | Φιορεντίνα             | 109     | 106943  |
| IT-SA      | `it-frosinone`                | Frosinone                | Φροζινόνε              | 4057    | 1968627 |
| IT-SA      | `it-genoa`                    | Genoa                    | Τζένοα                 | 3263    | 108232  |
| IT-SA      | `it-internazionale`           | Internazionale           | Ίντερ                  | 110     | 108866  |
| IT-SA      | `it-juventus`                 | Juventus                 | Γιουβέντους            | 111     | 107717  |
| IT-SA      | `it-lazio`                    | Lazio                    | Λάτσιο                 | 112     | 106498  |
| IT-SA      | `it-lecce`                    | Lecce                    | Λέτσε                  | 113     | 108845  |
| IT-SA      | `it-monza`                    | Monza                    | Μόντσα                 | 4007    | 107248  |
| IT-SA      | `it-napoli`                   | Napoli                   | Νάπολι                 | 114     | 108856  |
| IT-SA      | `it-parma`                    | Parma                    | Πάρμα                  | 115     | 106462  |
| IT-SA      | `it-sassuolo`                 | Sassuolo                 | Σασουόλο               | 3997    | 107732  |
| IT-SA      | `it-torino`                   | Torino                   | Τορίνο                 | 239     | 108134  |
| IT-SA      | `it-udinese`                  | Udinese                  | Ουντινέζε              | 118     | 106496  |
| IT-SA      | `it-venezia`                  | Venezia                  | Βενέτσια               | 17530   | 117857  |
