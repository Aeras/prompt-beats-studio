import type { SongBlueprintSection } from "@/lib/song-blueprint.shared";

export type SmartPresetCategory =
  | "pop"
  | "rock"
  | "electronic"
  | "hiphop"
  | "acoustic"
  | "global";

export type SmartPreset = {
  id: string;
  category: SmartPresetCategory;
  name: { en: string; el: string };
  description: { en: string; el: string };
  fingerprint: string;
  musicStyles: string[];
  moods: string[];
  instruments: string[];
  bpm: string;
  structure: string[];
  productionStyle: string;
  additionalInstructions: string;
  blueprint: Array<{ sectionType: string; occurrence: number; instruction: string }>;
  cultural?: boolean;
  searchTerms?: string[];
};

export type CulturalStyle = {
  id: string;
  name: { en: string; el: string };
  musicStyles: string[];
  instruments: string[];
  productionStyle: string;
  additionalInstructions: string;
};

const commonPopStructure = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Final Chorus", "Outro"];
const compactPopStructure = ["Intro", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Final Chorus", "Outro"];
const rockStructure = ["Intro", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Solo", "Final Chorus", "Outro"];

const p = (
  id: string,
  category: SmartPresetCategory,
  en: string,
  el: string,
  descEn: string,
  descEl: string,
  fingerprint: string,
  musicStyles: string[],
  moods: string[],
  instruments: string[],
  bpm: string,
  structure: string[],
  productionStyle: string,
  additionalInstructions: string,
  blueprint: SmartPreset["blueprint"] = [],
  searchTerms: string[] = [],
): SmartPreset => ({
  id,
  category,
  name: { en, el },
  description: { en: descEn, el: descEl },
  fingerprint,
  musicStyles,
  moods,
  instruments,
  bpm,
  structure,
  productionStyle,
  additionalInstructions,
  blueprint,
  searchTerms,
});

export const SMART_PRESETS: SmartPreset[] = [
  p("modern-pop","pop","Modern Pop","Modern Pop","Polished contemporary pop with a strong, clean hook.","Σύγχρονη γυαλισμένη pop με καθαρό, δυνατό hook.","Contemporary radio-pop fingerprint",["Pop"],["Energetic","Uplifting"],["Synth","Electric Bass","Drums","Electric Guitar"],"120",commonPopStructure,"Polished modern pop mix, punchy low end, bright vocal presence, controlled width and a clear dynamic lift into the chorus.","Prioritize a memorable chorus hook and concise verses.",[{sectionType:"Chorus",occurrence:1,instruction:"Open the arrangement wider with stronger drums and layered backing vocals."},{sectionType:"Final Chorus",occurrence:1,instruction:"Make the final chorus the widest and most energetic section."}],["radio","chart","contemporary"]),
  p("80s-synth-pop","pop","80s Synth Pop","80s Synth Pop","Retro synth-pop with bright analog textures and gated energy.","Retro synth-pop με φωτεινές αναλογικές υφές και έντονη 80s αισθητική.","1980s synth-pop fingerprint",["Pop"],["Nostalgic","Energetic"],["Synth","Synth Bass","Electronic Drums","Electric Guitar"],"116",commonPopStructure,"Analog-style synth layers, gated drum ambience, chorus-treated guitar, glossy but warm retro mix.","Use a clear melodic hook and tasteful 80s-style transitions without overloading effects.",[{sectionType:"Intro",occurrence:1,instruction:"Introduce the main synth motif before the vocal enters."},{sectionType:"Chorus",occurrence:1,instruction:"Widen synth layers and backing vocals."}],["retro","eighties","analog"]),
  p("90s-power-pop","pop","90s Power Pop","90s Power Pop","Bright guitar-led pop with compact songwriting and energetic choruses.","Φωτεινή κιθαριστική pop με συμπαγή γραφή και ενεργητικά ρεφρέν.","1990s power-pop fingerprint",["Pop","Rock"],["Energetic","Joyful"],["Electric Guitar","Bass","Drums"],"132",compactPopStructure,"Tight live-band mix, crunchy rhythm guitars, direct drums and minimal studio gloss.","Keep verses concise and make the chorus immediately singable.",[{sectionType:"Chorus",occurrence:1,instruction:"Bring in fuller guitars and stronger vocal doubles."}],["90s","guitar pop"]),
  p("2000s-pop-rock","pop","2000s Pop Rock","2000s Pop Rock","Melodic pop-rock with acoustic/electric contrast and a large chorus.","Μελωδικό pop-rock με αντίθεση ακουστικής/ηλεκτρικής κιθάρας και μεγάλο ρεφρέν.","Early-2000s pop-rock fingerprint",["Pop","Rock"],["Uplifting","Emotional"],["Acoustic Guitar","Electric Guitar","Bass","Drums","Piano"],"104",rockStructure,"Clean verse production that builds into dense guitars and punchy live drums in the chorus.","Use a strong melodic lift from verse to chorus.",[{sectionType:"Verse",occurrence:1,instruction:"Keep the arrangement lighter and more intimate."},{sectionType:"Chorus",occurrence:1,instruction:"Bring in full drums and wide electric guitars."}],["2000s","pop rock"]),
  p("indie-pop","pop","Indie Pop","Indie Pop","Warm, modern indie-pop with organic detail and restrained polish.","Ζεστή σύγχρονη indie-pop με οργανικές λεπτομέρειες και συγκρατημένο polish.","Modern indie-pop fingerprint",["Indie","Pop"],["Dreamy","Warm"],["Electric Guitar","Synth","Bass","Drums"],"108",compactPopStructure,"Warm midrange, subtle modulation, natural dynamics and a slightly intimate vocal presentation.","Avoid overproduction; let the hook feel effortless.",[{sectionType:"Intro",occurrence:1,instruction:"Start with a small memorable instrumental texture."}],["indie","bedroom pop"]),
  p("dark-pop","pop","Dark Pop","Dark Pop","Minimal dark pop with tension, sub weight and controlled dynamics.","Minimal dark pop με ένταση, βαθύ low end και ελεγχόμενες δυναμικές.","Dark contemporary pop fingerprint",["Pop"],["Dark","Mysterious"],["Synth","Synth Bass","Electronic Drums","Piano"],"96",compactPopStructure,"Sparse low-register production, dry close vocal, deep sub bass and selective atmospheric layers.","Keep the verses restrained so the chorus can expand without becoming bright.",[{sectionType:"Verse",occurrence:1,instruction:"Keep percussion sparse and the vocal very close."},{sectionType:"Chorus",occurrence:1,instruction:"Add weight and width while preserving the dark tone."}],["moody","minimal pop"]),

  p("classic-rock","rock","Classic Rock","Classic Rock","Organic guitar-driven rock with live-band energy.","Οργανικό κιθαριστικό rock με ενέργεια ζωντανής μπάντας.","Classic rock fingerprint",["Rock"],["Powerful","Confident"],["Electric Guitar","Bass","Drums","Organ"],"118",rockStructure,"Natural drums, mid-forward guitars, audible room energy and limited modern processing.","Favor riffs, dynamic playing and a clear instrumental identity.",[{sectionType:"Solo",occurrence:1,instruction:"Feature an expressive melodic electric-guitar solo."}],["classic","70s"]),
  p("arena-rock","rock","Arena Rock","Arena Rock","Large anthemic rock built for a huge chorus.","Μεγάλο anthemic rock χτισμένο γύρω από τεράστιο ρεφρέν.","Arena-rock fingerprint",["Rock"],["Epic","Triumphant"],["Electric Guitar","Bass","Drums","Piano"],"126",rockStructure,"Big drums, layered guitars, wide chorus vocals and strong dynamic ramps.","Make the chorus easy to shout or sing with a crowd.",[{sectionType:"Chorus",occurrence:1,instruction:"Open into a wide anthemic arrangement with backing vocals."},{sectionType:"Final Chorus",occurrence:1,instruction:"Add the largest vocal stack and strongest cymbal energy."}],["anthem","stadium"]),
  p("indie-rock","rock","Indie Rock","Indie Rock","Textured guitar rock with a modern independent feel.","Textured κιθαριστικό rock με σύγχρονη indie αισθητική.","Indie-rock fingerprint",["Indie","Rock"],["Reflective","Energetic"],["Electric Guitar","Bass","Drums"],"122",rockStructure,"Dry-to-medium room drums, characterful guitars and restrained mastering.","Allow imperfect organic textures and avoid overly glossy production.",[],["alternative","indie"]),
  p("alternative-rock","rock","Alternative Rock","Alternative Rock","Dynamic alternative rock with contrast between restrained verses and heavy choruses.","Δυναμικό alternative rock με αντίθεση ανάμεσα σε συγκρατημένα κουπλέ και βαριά ρεφρέν.","Alternative-rock fingerprint",["Alternative","Rock"],["Dramatic","Powerful"],["Electric Guitar","Bass","Drums"],"112",rockStructure,"Tense verses, denser distorted chorus guitars, punchy acoustic drums and strong dynamic contrast.","Use arrangement contrast instead of constant loudness.",[{sectionType:"Verse",occurrence:1,instruction:"Hold back distortion and leave more space."},{sectionType:"Chorus",occurrence:1,instruction:"Bring in denser distorted guitars and heavier drums."}],["alt rock"]),
  p("pop-punk","rock","Pop Punk","Pop Punk","Fast melodic punk energy with a highly singable chorus.","Γρήγορη μελωδική punk ενέργεια με πολύ τραγουδίσιμο ρεφρέν.","Pop-punk fingerprint",["Punk","Pop"],["Energetic","Rebellious"],["Electric Guitar","Bass","Drums"],"174",compactPopStructure,"Fast live drums, palm-muted verse guitars, open power-chord choruses and direct vocal production.","Keep lyric phrasing punchy and rhythmically direct.",[{sectionType:"Verse",occurrence:1,instruction:"Use tight palm-muted guitar rhythm."},{sectionType:"Chorus",occurrence:1,instruction:"Open the guitars and increase cymbal energy."}],["punk","fast"]),
  p("grunge","rock","Grunge","Grunge","Raw heavy alternative rock with loud/quiet contrast.","Ωμό βαρύ alternative rock με έντονη αντίθεση loud/quiet.","1990s grunge fingerprint",["Alternative","Rock"],["Dark","Angry"],["Electric Guitar","Bass","Drums"],"102",rockStructure,"Raw guitar saturation, roomy drums and deliberately less polished vocal treatment.","Preserve rough edges and strong verse-to-chorus contrast.",[{sectionType:"Verse",occurrence:1,instruction:"Keep guitars cleaner and tense."},{sectionType:"Chorus",occurrence:1,instruction:"Explode into heavier saturated guitars."}],["90s","raw"]),

  p("house","electronic","House","House","Four-on-the-floor house with a clean club groove.","House με σταθερό four-on-the-floor και καθαρό club groove.","Modern house fingerprint",["House"],["Energetic","Party"],["Synth","Synth Bass","Electronic Drums","Piano"],"124",["Intro","Verse","Build","Chorus","Instrumental Break","Verse","Build","Final Chorus","Outro"],"Steady four-on-the-floor kick, tight bass groove, bright percussion and clean club-focused low end.","Keep the vocal sections concise and leave room for instrumental groove.",[{sectionType:"Build",occurrence:1,instruction:"Increase rhythmic tension gradually before the payoff."}],["dance","club"]),
  p("deep-house","electronic","Deep House","Deep House","Smooth deep house with warm chords and restrained energy.","Ομαλό deep house με ζεστές συγχορδίες και συγκρατημένη ενέργεια.","Deep-house fingerprint",["House"],["Chill","Hypnotic"],["Electric Piano","Synth Bass","Electronic Drums","Synth"],"120",["Intro","Verse","Chorus","Instrumental","Verse","Chorus","Outro"],"Warm chord voicings, rounded bass, soft club kick and spacious atmospheric details.","Keep transitions subtle and avoid oversized festival-style drops.",[],["deep","club"]),
  p("tech-house","electronic","Tech House","Tech House","Percussive tech-house with a tight repetitive groove.","Κρουστικό tech-house με σφιχτό επαναληπτικό groove.","Tech-house fingerprint",["House","Techno"],["Hypnotic","Party"],["Electronic Drums","Synth Bass","Percussion","Synth"],"126",["Intro","Build","Drop","Breakdown","Build","Drop","Outro"],"Dry punchy drums, rolling bass, sparse synth stabs and club-oriented transitions.","Prioritize groove and repetition over dense harmonic movement.",[],["tech","club"]),
  p("synthwave","electronic","Synthwave","Synthwave","Cinematic retro-electronic drive with analog synth colors.","Κινηματογραφικό retro-electronic ύφος με αναλογικά synth χρώματα.","Synthwave fingerprint",["Synthwave"],["Nostalgic","Atmospheric"],["Synth","Synth Bass","Electronic Drums"],"110",["Intro","Verse","Chorus","Instrumental","Verse","Chorus","Solo","Final Chorus","Outro"],"Analog-style pads and arpeggios, electronic drums, wide synth bass and cinematic ambience.","Use a recurring synth motif as part of the song identity.",[],["retro","80s"]),
  p("festival-edm","electronic","Festival EDM","Festival EDM","High-energy EDM with clear builds and large drops.","Υψηλής ενέργειας EDM με καθαρά builds και μεγάλα drops.","Festival-EDM fingerprint",["EDM"],["Euphoric","Energetic"],["Synth","Synth Bass","Electronic Drums"],"128",["Intro","Verse","Pre-Chorus","Build","Drop","Verse","Build","Drop","Outro"],"Bright supersaw-style layers, punchy kick, strong sub bass and dramatic build/drop contrast.","Keep vocal hooks short enough to survive large instrumental sections.",[{sectionType:"Build",occurrence:1,instruction:"Strip harmony back while increasing rhythmic tension."},{sectionType:"Drop",occurrence:1,instruction:"Deliver the main instrumental hook with maximum width and energy."}],["festival","edm"]),
  p("drum-bass","electronic","Drum & Bass","Drum & Bass","Fast breakbeat-driven electronic production with melodic focus.","Γρήγορη ηλεκτρονική παραγωγή με breakbeat ρυθμό και μελωδική κατεύθυνση.","Drum-and-bass fingerprint",["Drum & Bass"],["Energetic","Atmospheric"],["Electronic Drums","Synth Bass","Synth"],"174",["Intro","Verse","Build","Drop","Verse","Build","Drop","Outro"],"Fast chopped drum groove, deep bass movement, atmospheric pads and clear contrast between vocal and drop sections.","Leave enough rhythmic space for lyrics despite the fast tempo.",[],["dnb","breakbeat"]),

  p("trap","hiphop","Trap","Trap","Modern trap with deep 808-style low end and sparse melodic space.","Σύγχρονο trap με βαθύ low end και αραιό μελωδικό χώρο.","Modern trap fingerprint",["Trap"],["Dark","Confident"],["Synth Bass","Electronic Drums","Synth","Piano"],"142",["Intro","Verse","Chorus","Verse","Chorus","Bridge","Final Chorus","Outro"],"Deep sub bass, crisp hi-hat detail, sparse melodic motif and dry forward vocals.","Use rhythmic lyric phrasing and avoid overcrowding the instrumental.",[],["808","rap"]),
  p("boom-bap","hiphop","Boom Bap","Boom Bap","Classic sample-minded hip-hop groove with strong drums.","Κλασικό hip-hop groove με έμφαση σε δυνατά drums και sample αισθητική.","Boom-bap fingerprint",["Hip-Hop"],["Confident","Soulful"],["Drums","Bass","Electric Piano"],"92",["Intro","Verse","Chorus","Verse","Chorus","Verse","Outro"],"Punchy swung drums, warm bass, dusty harmonic texture and focused lead vocal.","Favor clear rhythmic flow and grounded storytelling.",[],["old school","hip hop"]),
  p("contemporary-rnb","hiphop","Contemporary R&B","Contemporary R&B","Smooth modern R&B with intimate vocals and detailed low end.","Ομαλό σύγχρονο R&B με οικεία φωνητικά και λεπτομερές low end.","Contemporary R&B fingerprint",["R&B"],["Sensual","Intimate"],["Electric Piano","Synth Bass","Electronic Drums","Synth"],"88",compactPopStructure,"Close vocal, deep controlled bass, soft transient detail and spacious chord textures.","Prioritize natural vocal phrasing and emotional nuance.",[],["rnb","smooth"]),
  p("neo-soul","hiphop","Neo Soul","Neo Soul","Warm neo-soul with rich harmony and organic groove.","Ζεστό neo-soul με πλούσια αρμονία και οργανικό groove.","Neo-soul fingerprint",["Soul","R&B"],["Soulful","Warm"],["Electric Piano","Electric Bass","Drums","Electric Guitar"],"82",compactPopStructure,"Loose pocket, warm keys, round bass and natural live-band texture.","Allow expressive phrasing and sophisticated but singable harmony.",[],["soul","groove"]),
  p("melodic-rap","hiphop","Melodic Rap","Melodic Rap","Rap-forward verses with a strongly melodic sung hook.","Rap-forward κουπλέ με έντονα μελωδικό τραγουδιστό hook.","Melodic-rap fingerprint",["Hip-Hop","Trap"],["Emotional","Confident"],["Synth","Synth Bass","Electronic Drums","Piano"],"138",compactPopStructure,"Modern low end, sparse verse bed and wider melodic chorus treatment.","Keep verses rhythmically focused and make the chorus distinctly melodic.",[],["rap","melodic"]),
  p("funk-soul","hiphop","Funk Soul","Funk Soul","Groove-first funk/soul with live rhythm-section energy.","Funk/soul με προτεραιότητα στο groove και ζωντανή rhythm section.","Funk-soul fingerprint",["Funk","Soul"],["Joyful","Confident"],["Electric Guitar","Electric Bass","Drums","Organ","Brass"],"108",rockStructure,"Tight live drums, syncopated bass, rhythmic guitar, punchy brass accents and warm analog character.","Let the rhythm section drive the arrangement.",[],["funky","soul"]),

  p("singer-songwriter","acoustic","Singer-Songwriter","Singer-Songwriter","Intimate lyric-forward acoustic songwriting.","Οικεία acoustic τραγουδοποιία με προτεραιότητα στους στίχους.","Singer-songwriter fingerprint",["Acoustic","Folk"],["Intimate","Reflective"],["Acoustic Guitar","Piano"],"86",["Intro","Verse","Chorus","Verse","Chorus","Bridge","Final Chorus","Outro"],"Natural acoustic room tone, close vocal and minimal supportive arrangement.","Keep production understated so the lyric and melody remain central.",[],["acoustic","writer"]),
  p("piano-ballad","acoustic","Piano Ballad","Piano Ballad","Emotional piano-led ballad with gradual dynamic growth.","Συναισθηματική μπαλάντα με πιάνο και σταδιακή δυναμική ανάπτυξη.","Modern piano-ballad fingerprint",["Ballad"],["Emotional","Tender"],["Piano","Strings"],"72",["Intro","Verse","Chorus","Verse","Chorus","Bridge","Final Chorus","Outro"],"Close piano and vocal at first, adding subtle strings and room depth as the song develops.","Build emotionally without making the early sections too dense.",[{sectionType:"Intro",occurrence:1,instruction:"Begin with exposed piano and very intimate vocal space."},{sectionType:"Final Chorus",occurrence:1,instruction:"Add fuller strings and the strongest vocal intensity."}],["ballad","piano"]),
  p("acoustic-folk","acoustic","Acoustic Folk","Acoustic Folk","Organic acoustic folk with natural ensemble interplay.","Οργανικό acoustic folk με φυσική αλληλεπίδραση οργάνων.","Acoustic-folk fingerprint",["Folk","Acoustic"],["Warm","Reflective"],["Acoustic Guitar","Mandolin","Upright Bass","Percussion"],"94",compactPopStructure,"Natural acoustic dynamics, woody transients, minimal processing and small-room ambience.","Keep the arrangement human and avoid overly quantized rhythm.",[],["folk","organic"]),
  p("cinematic-ballad","acoustic","Cinematic Ballad","Cinematic Ballad","Emotional ballad that grows into a cinematic final act.","Συναισθηματική μπαλάντα που εξελίσσεται σε κινηματογραφικό φινάλε.","Cinematic-ballad fingerprint",["Cinematic","Ballad"],["Dramatic","Emotional"],["Piano","Strings","Cello","Drums"],"76",["Intro","Verse","Chorus","Verse","Chorus","Bridge","Final Chorus","Outro"],"Intimate piano-led opening, gradual orchestral growth, controlled percussion and a wide final chorus.","Use cinematic scale only as the arrangement develops.",[],["cinematic","orchestral"]),
  p("orchestral-epic","acoustic","Orchestral Epic","Orchestral Epic","Large orchestral writing with dramatic builds and thematic motifs.","Μεγάλη ορχηστρική γραφή με δραματικά builds και θεματικά μοτίβα.","Epic orchestral fingerprint",["Orchestral","Cinematic"],["Epic","Triumphant"],["Strings","Brass","Percussion","Choir"],"100",["Intro","Verse","Build","Chorus","Interlude","Verse","Build","Final Chorus","Outro"],"Wide orchestral image, strong low percussion, layered strings and brass with controlled choir support.","Use recurring motifs and clear dynamic architecture.",[],["epic","score"]),
  p("ambient-dreamscape","acoustic","Ambient Dreamscape","Ambient Dreamscape","Slow atmospheric songwriting with spacious textures.","Αργή ατμοσφαιρική τραγουδοποιία με ευρύχωρες υφές.","Ambient dream-pop fingerprint",["Cinematic","Indie"],["Dreamy","Atmospheric"],["Synth","Electric Guitar","Piano"],"70",["Intro","Verse","Chorus","Instrumental","Verse","Chorus","Outro"],"Long decays, soft transients, spacious pads, textural guitar and restrained low end.","Favor atmosphere and melodic simplicity over dense rhythm.",[],["ambient","dreamy"]),

  p("reggaeton","global","Reggaeton","Reggaeton","Contemporary reggaeton with a clear dembow pulse and melodic hook.","Σύγχρονο reggaeton με καθαρό dembow pulse και μελωδικό hook.","Modern reggaeton fingerprint",["Reggaeton","Latin"],["Party","Confident"],["Electronic Drums","Synth Bass","Percussion","Synth"],"96",compactPopStructure,"Punchy dembow rhythm, deep bass, bright percussion and clean modern vocal production.","Keep the chorus simple and immediately memorable.",[],["latin","dembow"]),
  p("latin-pop","global","Latin Pop","Latin Pop","Melodic Latin pop with acoustic rhythm and polished modern production.","Μελωδική Latin pop με ακουστικό ρυθμό και σύγχρονη γυαλισμένη παραγωγή.","Latin-pop fingerprint",["Latin","Pop"],["Romantic","Energetic"],["Acoustic Guitar","Percussion","Bass","Drums","Piano"],"104",commonPopStructure,"Organic Latin percussion blended with polished pop drums, bright acoustic rhythm and clear vocals.","Use rhythmic melodic phrasing and a warm chorus.",[],["latin","pop"]),
  p("afrobeats","global","Afrobeats","Afrobeats","Light, syncopated Afrobeats groove with melodic vocal space.","Ελαφρύ syncopated Afrobeats groove με χώρο για μελωδικά φωνητικά.","Contemporary Afrobeats fingerprint",["Afrobeat","Pop"],["Joyful","Chill"],["Percussion","Electric Guitar","Bass","Electronic Drums","Synth"],"106",compactPopStructure,"Syncopated percussion, light guitar figures, rounded bass and clean spacious mix.","Let groove and repetition carry the hook without overcrowding the arrangement.",[],["afro","afrobeats"]),
  p("k-pop","global","K-Pop","K-Pop","High-detail pop arrangement with rapid section contrast and polished hooks.","Pop υψηλής λεπτομέρειας με γρήγορες αντιθέσεις ενοτήτων και γυαλισμένα hooks.","Modern K-pop fingerprint",["K-Pop","Pop"],["Energetic","Confident"],["Synth","Synth Bass","Electronic Drums","Electric Guitar"],"124",["Intro","Verse","Pre-Chorus","Chorus","Verse","Pre-Chorus","Chorus","Bridge","Breakdown","Final Chorus","Outro"],"Highly polished layered production, sharp transitions, strong low-end control and distinct section identities.","Allow clear contrast between sections while keeping one memorable central hook.",[],["korean pop"]),
  p("j-pop","global","J-Pop","J-Pop","Bright melodic J-pop with active harmony and energetic arrangement.","Φωτεινή μελωδική J-pop με ενεργή αρμονία και ζωντανή ενορχήστρωση.","Modern J-pop fingerprint",["J-Pop","Pop"],["Uplifting","Joyful"],["Piano","Electric Guitar","Bass","Drums","Synth"],"138",commonPopStructure,"Busy but clean melodic arrangement, crisp drums, bright guitars and supportive synth layers.","Use strong melodic movement while keeping the chorus immediately identifiable.",[],["japanese pop"]),
  {
    ...p("local-folk-popular","global","Local Folk / Popular","Τοπικό Folk / Popular","Adaptive local folk/popular preset. Lyrics language stays independent from cultural style.","Προσαρμοζόμενο τοπικό folk/popular preset. Η γλώσσα των στίχων παραμένει ανεξάρτητη από το πολιτισμικό ύφος.","Adaptive cultural fingerprint",["Folk"],["Emotional","Warm"],["Acoustic Guitar","Percussion"],"96",["Intro","Verse","Chorus","Verse","Chorus","Bridge","Final Chorus","Outro"],"Organic regional popular-music production with culturally appropriate instrumentation and groove.","Respect the selected cultural style without changing the selected lyrics language.",[],["folk","traditional","regional","local"]),
    cultural: true,
  },
];

export const CULTURAL_STYLES: CulturalStyle[] = [
  { id:"greek", name:{en:"Greek",el:"Ελληνικό"}, musicStyles:["Folk"], instruments:["Bouzouki","Acoustic Guitar","Accordion","Percussion"], productionStyle:"Greek popular/folk character with bouzouki-led melodic identity, organic rhythm section and warm live-room feel.", additionalInstructions:"Use authentic Greek popular/folk phrasing and instrumentation without changing the lyrics language." },
  { id:"balkan", name:{en:"Balkan",el:"Βαλκανικό"}, musicStyles:["Folk"], instruments:["Brass","Accordion","Clarinet","Percussion"], productionStyle:"Balkan folk/popular character with energetic brass or clarinet lines, accordion support and lively acoustic percussion.", additionalInstructions:"Keep the rhythmic and instrumental identity distinctly Balkan." },
  { id:"turkish", name:{en:"Turkish",el:"Τουρκικό"}, musicStyles:["Folk"], instruments:["Saz","Strings","Clarinet","Percussion"], productionStyle:"Turkish popular/folk character with saz-like plucked textures, expressive melodic ornamentation, strings and hand percussion.", additionalInstructions:"Preserve a Turkish musical fingerprint while keeping lyrics language independent." },
  { id:"arabic", name:{en:"Arabic",el:"Αραβικό"}, musicStyles:["Folk"], instruments:["Oud","Strings","Percussion","Flute"], productionStyle:"Arabic popular/folk palette with oud-style plucked lead, expressive strings, modal melodic color and hand percussion.", additionalInstructions:"Use an Arabic musical fingerprint without assuming Arabic lyrics." },
  { id:"russian", name:{en:"Russian / Slavic",el:"Ρωσικό / Σλαβικό"}, musicStyles:["Folk"], instruments:["Accordion","Acoustic Guitar","Strings","Percussion"], productionStyle:"Russian/Slavic folk-popular color with accordion, acoustic ensemble texture and broad lyrical melodic movement.", additionalInstructions:"Use a Slavic cultural musical identity without changing the lyrics language." },
  { id:"celtic", name:{en:"Celtic / Irish",el:"Κέλτικο / Ιρλανδικό"}, musicStyles:["Folk"], instruments:["Violin","Flute","Acoustic Guitar","Bodhran"], productionStyle:"Celtic/Irish folk character with fiddle, flute, acoustic strings and lively frame-drum pulse.", additionalInstructions:"Keep the melodic ornaments and acoustic ensemble recognizably Celtic." },
  { id:"nordic", name:{en:"Nordic Folk",el:"Σκανδιναβικό Folk"}, musicStyles:["Folk"], instruments:["Violin","Acoustic Guitar","Percussion","Flute"], productionStyle:"Nordic folk atmosphere with sparse acoustic textures, modal melody and spacious natural ambience.", additionalInstructions:"Favor restrained Nordic color over generic cinematic folk." },
  { id:"iberian", name:{en:"Iberian",el:"Ιβηρικό"}, musicStyles:["Folk","Latin"], instruments:["Classical Guitar","Hand Claps","Percussion","Bass"], productionStyle:"Iberian folk/popular character with nylon-string guitar, hand percussion and expressive rhythmic accents.", additionalInstructions:"Keep the musical fingerprint Iberian without forcing Spanish lyrics." },
  { id:"mexican", name:{en:"Mexican",el:"Μεξικανικό"}, musicStyles:["Latin","Folk"], instruments:["Acoustic Guitar","Trumpet","Violin","Bass"], productionStyle:"Mexican popular/folk ensemble color with acoustic strings, trumpet/violin accents and strong melodic phrasing.", additionalInstructions:"Use a recognizably Mexican musical palette while preserving the chosen lyrics language." },
  { id:"brazilian", name:{en:"Brazilian",el:"Βραζιλιάνικο"}, musicStyles:["Latin"], instruments:["Classical Guitar","Percussion","Bass","Piano"], productionStyle:"Brazilian popular groove with syncopated acoustic guitar, layered percussion and warm harmonic movement.", additionalInstructions:"Use Brazilian rhythmic character without assuming Portuguese lyrics." },
  { id:"west-african", name:{en:"West African",el:"Δυτικοαφρικανικό"}, musicStyles:["Afrobeat","Folk"], instruments:["Percussion","Electric Guitar","Bass","Drums"], productionStyle:"West African popular/folk groove with interlocking percussion, light guitar patterns and fluid bass movement.", additionalInstructions:"Keep the groove culturally grounded and do not change the selected lyrics language." },
  { id:"indian", name:{en:"Indian",el:"Ινδικό"}, musicStyles:["Folk"], instruments:["Sitar","Tabla","Strings","Flute"], productionStyle:"Indian popular/folk color with plucked lead, tabla-style percussion, drone-aware harmony and expressive melodic ornaments.", additionalInstructions:"Use Indian musical color without assuming Hindi or another specific lyrics language." },
  { id:"japanese", name:{en:"Japanese Traditional / Popular",el:"Ιαπωνικό Traditional / Popular"}, musicStyles:["Folk"], instruments:["Koto","Flute","Percussion","Strings"], productionStyle:"Japanese traditional/popular color with koto-like plucked textures, flute and restrained percussion in a clean modern mix.", additionalInstructions:"Use a Japanese cultural fingerprint without changing the selected lyrics language." },
  { id:"korean", name:{en:"Korean Traditional / Popular",el:"Κορεατικό Traditional / Popular"}, musicStyles:["Folk"], instruments:["Strings","Percussion","Flute"], productionStyle:"Korean traditional/popular color blended with modern production while preserving clear acoustic and percussive identity.", additionalInstructions:"Keep cultural style independent from the lyrics language." },
];

export function resolveSmartPreset(
  preset: SmartPreset,
  culturalStyleId?: string,
): SmartPreset {
  if (!preset.cultural) return preset;
  const culture = CULTURAL_STYLES.find((item) => item.id === culturalStyleId) ?? CULTURAL_STYLES[0];
  return {
    ...preset,
    musicStyles: culture.musicStyles,
    instruments: culture.instruments,
    productionStyle: culture.productionStyle,
    additionalInstructions: culture.additionalInstructions,
    fingerprint: `${culture.name.en} cultural fingerprint`,
  };
}

export function buildPresetBlueprint(
  structure: string[],
  preset: SmartPreset,
): SongBlueprintSection[] {
  const occurrence = new Map<string, number>();
  return structure.map((sectionType, structureIndex) => {
    const key = sectionType.toLowerCase();
    const current = (occurrence.get(key) ?? 0) + 1;
    occurrence.set(key, current);
    const match = preset.blueprint.find(
      (item) => item.sectionType === sectionType && item.occurrence === current,
    );
    return {
      structureIndex,
      sectionType,
      occurrence: current,
      instruction: match?.instruction ?? "",
    };
  });
}
