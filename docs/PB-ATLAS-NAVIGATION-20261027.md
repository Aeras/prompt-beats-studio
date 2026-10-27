# Cultural Song Atlas — cascading research navigation

## Scope and investigation

Baseline main dd403170460af9dbfcc033f1be3179cf347dc1f3, merged #448. Current AGENTS and WORK-STATUS read; open PRs checked (no overlapping Atlas navigation PR). Source projection, strict compiler/handoff, Beta middleware/SQL/worker, account session drafts, i18n provider and existing Radix/Command/button tokens were traced. The old classification select was native and rendered raw entity IDs.

One presentation-only change. No migration, provider, entitlement, approval or Generator flow change. The prior approved Atlas registration was verified applied in the preceding release task; that is not evidence of an Atlas application publish. The existing feature remains research-only.

## Browsing paths and epistemic limits

Continent → Country → Musical genre/family → Subcategory → Musical profile.
Filters are separate from the research selection: changing a parent clears only downstream filters, never selected profiles/options, language, tempo or Generator state. Exact same parent is idempotent. Initially all 58 profiles remain browseable; downstream controls are disabled until their parents are chosen. Every displayed next option is derived from actual remaining entries, never a global empty list or fake “other” category. Reset only resets browsing filters. Text search intersects current filters.

**Geography is collection scope, not geographic origin.** RC1 explicitly describes Russian/Russophone-related, multi-origin material and forbids inferring region from lyric language. It supplies no verified per-profile continent/country ontology. This release therefore uses a single explicitly qualified Europe/Asia → Russia/Russophone collection path for this library. It does NOT assign Odessa to Russia, exclude Ukrainian or diaspora history, or claim that electronic genres originated in Russia. The warning remains visible. Additional verified country paths require separate per-profile editorial evidence. No empty countries, inferred territories or unrelated world genres are seeded.

**Genre/family is the original family_ids membership**, including crossovers, not a new musicological assertion. Every RC1 profile currently has one family; the sidecar records it exactly. Subcategory is the original entity_type, explicitly labeled as a type of entry: musical form, scene, ritual function, diaspora context, repertoire, etc. Context is not a sound preset or a subgenre. Context-only compiler behavior remains unchanged. These are source-attributed research metadata, not newly certified musicology.

Stable IDs are independent of translated labels. src/data/song-atlas/navigation.json is an explicit, reviewable 58-entry presentation sidecar; the original JSON is never rewritten. It is loaded through the already-authorized server catalogue; the browser does not import the full RC1 or review drafts.

## Names and language gaps

RC1 provides name_ru and display_el (the same original script), not approved translated profile names. No editorial authority to certify 58 new translations is assumed. Both locales therefore show the original name with lang=ru and, when different, a smaller fixed Latin romanization with lang=ru-Latn. No runtime translation/romanization service exists.

The sidecar uses a consistent readable letter-based convention: ж zh, х kh, ц ts, ч ch, ш sh, щ shch, ё yo, ю yu, я ya, й y, ы y; soft/hard signs omitted. Existing Latin terms, digits and punctuation remain unchanged. This is explicitly a transliteration, not an English genre translation, stress annotation or scholarly pronunciation guide. No second identical line is rendered.

Content gaps: 58 approved localized profile names are missing in both UI languages; summaries and knowledge have Greek only. English users see a localized Greek-content fallback notice and actual lang=el. Historical claims retain both provided language fields and prefer the user's language; missing versions get a localized notice and correct actual lang. Bibliographic titles remain verbatim source titles, not falsely translated. Technique instructions remain verbatim English with lang=en and an explicit untranslated-research notice; static dimension/mode labels, evidence states, filter labels and all new controls/messages have EL/EN resources. These gaps do not authorize generation or blanket content publication.

## CompactDropdown contract

Shared UI component uses existing Radix Popover, Command and Button primitives and semantic design tokens. Closed trigger is 42px on fine pointers; the existing platform-wide coarse-pointer minimum makes it 44px on touch devices. Options are at least 44px touch targets. Controlled open state allows exactly one list in the navigation group. Portal collision handling opens below/above as space allows; bounded internal scroll with overscroll containment preserves ordinary page scrolling. Large lists (8+) have searchable label, original/romanized text and stable-ID keywords. No native select or Android fullscreen picker.

Outside pointer, toggle and Escape dismiss. Selection restores trigger focus; outside dismissal does not steal focus from another target. Keyboard arrows/Enter and Home/End on non-search lists select choices. Accessible names remain present without duplicate visible labels. No arbitrary color literals, new UI package or global listener per profile.

## Safety and compatibility

Navigation cannot alter atlasOrigin, instruction provenance, manual inputs or strict Advanced Setup v1. Current 65 creative options and placeholders stay unapproved. All existing Beta/server/SQL/worker denials remain. Source SHA fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a, 58 profiles, 14 excluded candidates, 97 sources retained.

No data migration. Rollback is the prior compatible application after authorization; preserve already-applied additive SQL and gates. No publish is performed by this PR.

## Coverage and verification

Unit/integration: all 58 exact source-family/entity mappings; no candidates; every reachable branch; zero empty children; parent reset/idempotence; synthetic future geography without current fake options; locale key parity and complete taxon/evidence labels; claim-language preservation; original script, duplicate secondary suppression; unchanged source SHA, zero unapproved compilation and no native select.
Browser: real mocked server/auth flow on desktop/tablet/mobile Android-like Chromium touch viewport, cascading filters, selected-research preservation, search/keyboard, outside/toggle/Escape, single-open list, list/page scroll, target size, overflow, locale preference, source fallback, axe checks and unchanged Generator provenance tests. These tests do not prove every physical Android browser/keyboard implementation.
Final actual local counts and exact-head Regression / Browser Quality / Database Replay links are recorded in the PR after execution. No claim of production UI verification.

## Explicit mapping

All rows share the qualified collection-scope path above. Family and type below are copied from the canonical profile, not inferred from names.

| Profile ID              | Original name                             | Fixed Latin transliteration                | Source family | Source type          |
| ----------------------- | ----------------------------------------- | ------------------------------------------ | ------------- | -------------------- |
| ru.protyazhnaya         | Протяжная песня                           | Protyazhnaya pesnya                        | folk          | music_style_or_form  |
| ru.chastushka           | Частушка                                  | Chastushka                                 | folk          | music_style_or_form  |
| ru.khorovod             | Хороводная песня                          | Khorovodnaya pesnya                        | folk          | dance_song_form      |
| ru.wedding_folk         | Свадебная обрядовая песня                 | Svadebnaya obryadovaya pesnya              | folk          | ritual_function      |
| ru.calendar_folk        | Календарно-обрядовая песня                | Kalendarno-obryadovaya pesnya              | folk          | ritual_function      |
| ru.bylina               | Былина / эпическое пение                  | Bylina / epicheskoe penie                  | folk          | epic_form            |
| ru.lyrical_folk         | Лирическая народная песня                 | Liricheskaya narodnaya pesnya              | folk          | umbrella             |
| ru.cossack_song         | Казачья песенная традиция                 | Kazachya pesennaya traditsiya              | folk          | community_repertoire |
| ru.folk_rock            | Фолк-рок                                  | Folk-rok                                   | hybrid        | crossover_style      |
| ru.urban_romance        | Городской романс                          | Gorodskoy romans                           | romance       | music_style_or_form  |
| ru.classical_romance    | Русский камерный романс                   | Russkiy kamernyy romans                    | romance       | music_style_or_form  |
| ru.cruel_romance        | Жестокий романс                           | Zhestokiy romans                           | romance       | music_style_or_form  |
| ru.bard_song            | Авторская песня / бардовская              | Avtorskaya pesnya / bardovskaya            | bard          | music_style_or_form  |
| ru.satirical_bard       | Сатирическая авторская песня              | Satiricheskaya avtorskaya pesnya           | bard          | thematic_approach    |
| ru.hiking_song          | Туристская / походная песня               | Turistskaya / pokhodnaya pesnya            | bard          | social_context       |
| ru.blatnaya             | Блатная песня                             | Blatnaya pesnya                            | chanson       | music_style_or_form  |
| ru.lager_song           | Лагерная песня                            | Lagernaya pesnya                           | chanson       | music_style_or_form  |
| ru.odessa_song          | Одесская городская песня                  | Odesskaya gorodskaya pesnya                | chanson       | regional_repertoire  |
| ru.emigre_song          | Эмигрантская песня                        | Emigrantskaya pesnya                       | chanson       | diaspora_context     |
| ru.lyrical_chanson      | Лирический русский шансон                 | Liricheskiy russkiy shanson                | chanson       | music_style_or_form  |
| ru.post_chanson         | Постшансон / гибридный шансон             | Postshanson / gibridnyy shanson            | chanson       | critical_style_label |
| ru.soviet_estrada_50_60 | Эстрадная песня 1950–1960-х               | Estradnaya pesnya 1950–1960-kh             | estrada       | historical_scene     |
| ru.soviet_estrada_70    | Эстрада 1970-х                            | Estrada 1970-kh                            | estrada       | historical_scene     |
| ru.soviet_estrada_80    | Эстрада 1980-х                            | Estrada 1980-kh                            | estrada       | historical_scene     |
| ru.via                  | ВИА / вокально-инструментальные ансамбли  | VIA / vokalno-instrumentalnye ansambli     | estrada       | ensemble_format      |
| ru.estrada_folk         | Эстрадная песня с фольклорными элементами | Estradnaya pesnya s folklornymi elementami | estrada       | crossover_style      |
| ru.russian_pop_90       | Русская поп-музыка 1990-х                 | Russkaya pop-muzyka 1990-kh                | pop           | historical_scene     |
| ru.russian_dance_pop_00 | Русский дэнс-поп 2000-х                   | Russkiy dens-pop 2000-kh                   | pop           | historical_scene     |
| ru.russian_pop_ballad   | Русская поп-баллада                       | Russkaya pop-ballada                       | pop           | music_style_or_form  |
| ru.modern_russian_pop   | Современная русскоязычная поп-музыка      | Sovremennaya russkoyazychnaya pop-muzyka   | pop           | umbrella             |
| ru.indie_pop            | Русскоязычный инди-поп                    | Russkoyazychnyy indi-pop                   | pop           | music_style_or_form  |
| ru.synth_pop            | Русскоязычный синти-поп                   | Russkoyazychnyy sinti-pop                  | pop           | music_style_or_form  |
| ru.rock_70              | Советский рок 1970-х                      | Sovetskiy rok 1970-kh                      | rock          | historical_scene     |
| ru.russian_rock_80      | Русский рок 1980-х                        | Russkiy rok 1980-kh                        | rock          | historical_scene     |
| ru.soviet_postpunk      | Советский постпанк / новая волна          | Sovetskiy postpank / novaya volna          | rock          | scene_and_style      |
| ru.russian_art_rock     | Арт-рок / экспериментальный русский рок   | Art-rok / eksperimentalnyy russkiy rok     | rock          | music_style_or_form  |
| ru.social_rock          | Социально ориентированный русский рок     | Sotsialno orientirovannyy russkiy rok      | rock          | thematic_approach    |
| ru.russian_rock_ballad  | Русская рок-баллада                       | Russkaya rok-ballada                       | rock          | music_style_or_form  |
| ru.russian_punk         | Русский панк-рок                          | Russkiy pank-rok                           | rock          | music_style_or_form  |
| ru.russian_alt_rock     | Русский альтернативный рок                | Russkiy alternativnyy rok                  | rock          | music_style_or_form  |
| ru.russian_indie_rock   | Русскоязычный инди-рок                    | Russkoyazychnyy indi-rok                   | rock          | music_style_or_form  |
| ru.shoegaze             | Русскоязычный шугейз / дрим-поп           | Russkoyazychnyy shugeyz / drim-pop         | rock          | overlapping_styles   |
| ru.folk_metal           | Русскоязычный фолк-метал                  | Russkoyazychnyy folk-metal                 | rock          | music_style_or_form  |
| ru.rap_90               | Русский рэп 1990-х                        | Russkiy rep 1990-kh                        | rap           | historical_scene     |
| ru.rap_00               | Русский хип-хоп 2000-х                    | Russkiy khip-khop 2000-kh                  | rap           | historical_scene     |
| ru.conscious_rap        | Социальный / концептуальный рэп           | Sotsialnyy / kontseptualnyy rep            | rap           | thematic_approach    |
| ru.battle_rap           | Баттл-рэп                                 | Battl-rep                                  | rap           | performance_format   |
| ru.trap                 | Русскоязычный трэп                        | Russkoyazychnyy trep                       | rap           | music_style_or_form  |
| ru.melodic_rap          | Мелодичный рэп / поп-рэп                  | Melodichnyy rep / pop-rep                  | rap           | overlapping_styles   |
| ru.drill                | Русскоязычный дрилл                       | Russkoyazychnyy drill                      | rap           | music_style_or_form  |
| ru.cloud_rap            | Русскоязычный клауд-рэп                   | Russkoyazychnyy klaud-rep                  | rap           | music_style_or_form  |
| ru.phonk                | Фонк / drift phonk scenes                 | Fonk / drift phonk scenes                  | electronic    | umbrella             |
| ru.hyperpop             | Русскоязычный гиперпоп                    | Russkoyazychnyy giperpop                   | electronic    | music_style_or_form  |
| ru.russian_electropop   | Русскоязычный электропоп                  | Russkoyazychnyy elektropop                 | electronic    | music_style_or_form  |
| ru.downtempo            | Русскоязычный даунтемпо / трип-хоп        | Russkoyazychnyy dauntempo / trip-khop      | electronic    | overlapping_styles   |
| ru.folk_electronic      | Электро-фолк / фолктроника                | Elektro-folk / folktronika                 | hybrid        | crossover_style      |
| ru.pop_chanson          | Поп-шансон                                | Pop-shanson                                | hybrid        | crossover_style      |
| ru.rap_rock             | Рэп-рок                                   | Rep-rok                                    | hybrid        | crossover_style      |
