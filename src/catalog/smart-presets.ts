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

export type CulturalRegionId =
  | "europe"
  | "mena"
  | "subsaharan-africa"
  | "south-asia"
  | "east-asia"
  | "southeast-asia"
  | "latin-america-caribbean"
  | "north-america"
  | "oceania"
  | "other";

export type CulturalRegion = {
  id: CulturalRegionId;
  name: { en: string; el: string };
};

export type CulturalStyle = {
  id: string;
  region: CulturalRegionId;
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

const c = (
  id: string,
  region: CulturalRegionId,
  en: string,
  el: string,
  musicStyles: string[],
  instruments: string[],
  productionStyle: string,
  additionalInstructions?: string,
): CulturalStyle => ({
  id,
  region,
  name: { en, el },
  musicStyles,
  instruments,
  productionStyle,
  additionalInstructions:
    additionalInstructions ??
    `Use an authentic ${en} musical fingerprint while keeping the selected lyrics language unchanged.`,
});

export const CULTURAL_REGIONS: CulturalRegion[] = [
  { id: "europe", name: { en: "Europe", el: "Ευρώπη" } },
  { id: "mena", name: { en: "Middle East & North Africa", el: "Μέση Ανατολή & Βόρεια Αφρική" } },
  { id: "subsaharan-africa", name: { en: "Sub-Saharan Africa", el: "Υποσαχάρια Αφρική" } },
  { id: "south-asia", name: { en: "South Asia", el: "Νότια Ασία" } },
  { id: "east-asia", name: { en: "East Asia", el: "Ανατολική Ασία" } },
  { id: "southeast-asia", name: { en: "Southeast Asia", el: "Νοτιοανατολική Ασία" } },
  { id: "latin-america-caribbean", name: { en: "Latin America & Caribbean", el: "Λατινική Αμερική & Καραϊβική" } },
  { id: "north-america", name: { en: "North America", el: "Βόρεια Αμερική" } },
  { id: "oceania", name: { en: "Oceania & Pacific", el: "Ωκεανία & Ειρηνικός" } },
  { id: "other", name: { en: "Other / Custom", el: "Άλλο / Custom" } },
];

export const CULTURAL_STYLES: CulturalStyle[] = [
  // Europe
  c("greek","europe","Greek","Ελληνικό",["Folk"],["Bouzouki","Acoustic Guitar","Accordion","Percussion"],"Greek popular/folk character with bouzouki-led melodic identity, organic rhythm section, dance-derived grooves and warm live-room production."),
  c("balkan","europe","Balkan","Βαλκανικό",["Folk"],["Brass","Accordion","Clarinet","Percussion"],"Balkan folk/popular character with lively brass or clarinet, accordion support, asymmetric or driving dance rhythms and energetic acoustic production."),
  c("albanian","europe","Albanian","Αλβανικό",["Folk"],["Clarinet","Violin","Lute","Percussion"],"Albanian folk/popular character with ornamented lead melody, clarinet or strings, regional dance pulse and direct live-ensemble energy."),
  c("bulgarian","europe","Bulgarian","Βουλγαρικό",["Folk"],["Gaida","Kaval","Tambura","Percussion"],"Bulgarian folk character with gaida/kaval colors, tambura texture, asymmetric meters and strong ensemble accents."),
  c("romanian","europe","Romanian","Ρουμανικό",["Folk"],["Violin","Cimbalom","Accordion","Clarinet"],"Romanian folk/popular color with agile violin, cimbalom or accordion, ornamented melody and animated dance rhythm."),
  c("serbian","europe","Serbian / South Slavic","Σερβικό / Νοτιοσλαβικό",["Folk"],["Accordion","Brass","Clarinet","Percussion"],"Serbian and South-Slavic folk/popular character with accordion and brass, strong dance accents and festive ensemble production."),
  c("croatian-adriatic","europe","Croatian / Adriatic","Κροατικό / Αδριατικό",["Folk"],["Mandolin","Acoustic Guitar","Accordion","Strings"],"Croatian and Adriatic folk/popular color with acoustic strings, accordion, lyrical melody and coastal ensemble warmth."),
  c("italian","europe","Italian","Ιταλικό",["Folk","Pop"],["Mandolin","Acoustic Guitar","Accordion","Strings"],"Italian folk/popular character with lyrical melody, mandolin or acoustic guitar, accordion and warm song-forward production."),
  c("french","europe","French","Γαλλικό",["Folk"],["Accordion","Acoustic Guitar","Violin","Upright Bass"],"French folk/chanson-rooted character with accordion, acoustic ensemble, graceful waltz or straight-song pulse and intimate production."),
  c("german-central-european","europe","German / Central European","Γερμανικό / Κεντροευρωπαϊκό",["Folk"],["Accordion","Brass","Acoustic Guitar","Percussion"],"Central-European folk/popular character with accordion and brass, clear dance pulse, sturdy harmonic motion and polished live-band feel."),
  c("austrian-alpine","europe","Austrian / Alpine","Αυστριακό / Alpine",["Folk"],["Accordion","Brass","Acoustic Guitar","Percussion"],"Austrian Alpine folk character with accordion, brass, buoyant triple or duple dance patterns and bright acoustic production."),
  c("swiss-alpine","europe","Swiss / Alpine","Ελβετικό / Alpine",["Folk"],["Accordion","Alphorn","Acoustic Guitar","Percussion"],"Swiss Alpine folk color with accordion, alphorn-like sonority, acoustic strings and spacious mountain-ensemble character."),
  c("iberian","europe","Iberian","Ιβηρικό",["Folk","Latin"],["Classical Guitar","Hand Claps","Percussion","Bass"],"Iberian folk/popular character with nylon-string guitar, hand percussion, expressive accents and warm rhythmic production."),
  c("portuguese-fado","europe","Portuguese / Fado","Πορτογαλικό / Fado",["Folk"],["Portuguese Guitar","Classical Guitar","Upright Bass"],"Portuguese fado-rooted character with Portuguese-guitar style picking, intimate accompaniment, rubato-aware phrasing and emotionally focused production."),
  c("celtic-irish","europe","Celtic / Irish","Κέλτικο / Ιρλανδικό",["Folk"],["Violin","Flute","Acoustic Guitar","Bodhran"],"Celtic/Irish folk character with fiddle, flute, acoustic strings, bodhrán-style pulse and flowing ornamented melody."),
  c("scottish","europe","Scottish","Σκωτσέζικο",["Folk"],["Bagpipes","Violin","Acoustic Guitar","Percussion"],"Scottish folk character with pipe or fiddle colors, strong dance/march pulse and open acoustic ensemble production."),
  c("english-folk","europe","English Folk","Αγγλικό Folk",["Folk"],["Acoustic Guitar","Violin","Mandolin","Flute"],"English folk character with acoustic strings, fiddle and flute, narrative phrasing and understated natural production."),
  c("nordic","europe","Nordic Folk","Σκανδιναβικό Folk",["Folk"],["Violin","Acoustic Guitar","Percussion","Flute"],"Nordic folk atmosphere with modal melody, bowed-string focus, restrained pulse and spacious natural ambience."),
  c("finnish","europe","Finnish","Φινλανδικό",["Folk"],["Kantele","Violin","Accordion","Percussion"],"Finnish folk character with kantele-like plucked texture, fiddle or accordion, modal melody and clear acoustic space."),
  c("baltic","europe","Baltic","Βαλτικό",["Folk"],["Kankles","Violin","Flute","Percussion"],"Baltic folk character with plucked-zither colors, fiddle/flute layers, modal vocal-minded melody and organic pulse."),
  c("polish","europe","Polish","Πολωνικό",["Folk"],["Violin","Accordion","Clarinet","Percussion"],"Polish folk/popular character with violin and accordion, lively mazurka/polka-derived rhythmic energy and bright ensemble sound."),
  c("czech-slovak","europe","Czech / Slovak","Τσέχικο / Σλοβακικό",["Folk"],["Violin","Cimbalom","Accordion","Clarinet"],"Czech/Slovak folk character with violin, cimbalom or accordion, dance-driven pulse and natural ensemble interplay."),
  c("hungarian","europe","Hungarian","Ουγγρικό",["Folk"],["Violin","Cimbalom","Clarinet","Double Bass"],"Hungarian folk character with virtuosic violin, cimbalom color, elastic tempo feel and intense dance phrasing."),
  c("russian-slavic","europe","Russian / Slavic","Ρωσικό / Σλαβικό",["Folk"],["Balalaika","Accordion","Strings","Percussion"],"Russian/Slavic folk-popular color with balalaika/accordion texture, broad lyrical melody and grounded ensemble rhythm."),
  c("ukrainian","europe","Ukrainian","Ουκρανικό",["Folk"],["Bandura","Violin","Accordion","Percussion"],"Ukrainian folk character with bandura-like plucked texture, vocal-style melody, dance pulse and bright acoustic ensemble production."),
  c("georgian","europe","Georgian","Γεωργιανό",["Folk"],["Panduri","Strings","Percussion","Choir"],"Georgian folk character with panduri-like plucking, strong polyphonic-vocal influence, asymmetric accents and resonant ensemble production."),
  c("armenian","europe","Armenian","Αρμενικό",["Folk"],["Duduk","Strings","Percussion","Clarinet"],"Armenian folk character with duduk-like expressive lead, modal melody, frame percussion and warm resonant production."),

  // Middle East & North Africa
  c("turkish","mena","Turkish","Τουρκικό",["Folk"],["Saz","Strings","Clarinet","Percussion"],"Turkish popular/folk character with saz-like plucked textures, expressive ornamentation, strings, clarinet and hand percussion."),
  c("arabic","mena","Arabic","Αραβικό",["Folk"],["Oud","Qanun","Strings","Percussion"],"Arabic popular/folk palette with oud/qanun colors, modal melodic movement, ornamented strings and layered hand percussion."),
  c("levantine","mena","Levantine","Λεβαντίνικο",["Folk"],["Oud","Qanun","Violin","Darbuka"],"Levantine folk/popular character with oud, qanun, violin and darbuka, lyrical maqam-inspired phrasing and danceable percussion."),
  c("palestinian-jordanian","mena","Palestinian / Jordanian","Παλαιστινιακό / Ιορδανικό",["Folk"],["Oud","Mijwiz","Darbuka","Percussion"],"Palestinian/Jordanian folk character with dabke-rooted pulse, reed or oud colors, strong communal accents and live percussion."),
  c("lebanese","mena","Lebanese","Λιβανέζικο",["Folk","Pop"],["Oud","Violin","Darbuka","Synth"],"Lebanese folk/popular character blending Arabic melodic ornamentation, darbuka pulse and polished modern-pop arrangement."),
  c("syrian","mena","Syrian","Συριακό",["Folk"],["Oud","Qanun","Violin","Percussion"],"Syrian folk/classical-popular color with oud, qanun, violin, modal phrasing and refined hand-percussion support."),
  c("iraqi","mena","Iraqi","Ιρακινό",["Folk"],["Oud","Santur","Joza","Percussion"],"Iraqi folk/popular character with maqam-informed melody, oud/santur colors, expressive bowed texture and measured percussion."),
  c("persian","mena","Persian / Iranian","Περσικό / Ιρανικό",["Folk"],["Setar","Santur","Kamancheh","Tombak"],"Persian/Iranian folk character with setar/santur, kamancheh-like expression, intricate modal melody and tombak-style rhythmic detail."),
  c("kurdish","mena","Kurdish","Κουρδικό",["Folk"],["Saz","Duduk","Daf","Percussion"],"Kurdish folk character with saz or wind lead, daf/frame-drum drive, modal melodic contour and communal dance energy."),
  c("israeli-hebrew","mena","Israeli / Hebrew Folk","Ισραηλινό / Hebrew Folk",["Folk"],["Acoustic Guitar","Clarinet","Violin","Percussion"],"Israeli/Hebrew folk character with acoustic ensemble, clarinet/violin color, circle-dance pulse and clear melodic hooks."),
  c("klezmer","mena","Klezmer / Ashkenazi","Klezmer / Ashkenazi",["Folk"],["Clarinet","Violin","Accordion","Double Bass"],"Klezmer/Ashkenazi character with expressive clarinet and violin, accordion, elastic dance rhythm and lively ornamentation."),
  c("egyptian","mena","Egyptian","Αιγυπτιακό",["Folk","Pop"],["Oud","Strings","Darbuka","Accordion"],"Egyptian popular/folk character with oud, lush strings, darbuka, accordion color and strong melodic vocal framing."),
  c("maghreb","mena","Maghreb / North African","Maghreb / Βορειοαφρικανικό",["Folk"],["Oud","Guembri","Percussion","Violin"],"Maghreb folk/popular character with plucked strings, guembri-like low end, hand percussion and cyclical groove."),
  c("moroccan","mena","Moroccan","Μαροκινό",["Folk"],["Guembri","Oud","Qraqeb","Percussion"],"Moroccan folk/popular character with guembri, metallic qraqeb-style accents, hand percussion and hypnotic cyclical rhythm."),
  c("algerian","mena","Algerian","Αλγερινό",["Folk"],["Mandole","Accordion","Percussion","Violin"],"Algerian folk/popular character with mandole/accordion colors, rai-influenced rhythmic drive and expressive melodic phrasing."),
  c("tunisian","mena","Tunisian","Τυνησιακό",["Folk"],["Oud","Mezoued","Percussion","Violin"],"Tunisian folk/popular character with oud or mezoued-like reed color, hand percussion and North-African modal phrasing."),
  c("amazigh","mena","Amazigh / Berber","Βερβερικό / Amazigh",["Folk"],["Bendir","Flute","Lute","Percussion"],"Amazigh/Berber folk character with frame drums, reed/flute color, repetitive call-and-response energy and earthy acoustic production."),
  c("sudanese-nubian","mena","Sudanese / Nubian","Σουδανικό / Nubian",["Folk","Pop"],["Oud","Lyre","Percussion","Bass"],"Sudanese/Nubian character with pentatonic melodic color, oud or lyre textures, syncopated percussion and warm flowing groove."),

  // Sub-Saharan Africa
  c("west-african","subsaharan-africa","West African","Δυτικοαφρικανικό",["Afrobeat","Folk"],["Percussion","Electric Guitar","Bass","Kora"],"West African folk/popular groove with interlocking percussion, kora/guitar figures, fluid bass and call-and-response melodic motion."),
  c("mande","subsaharan-africa","Mandé","Mandé",["Folk"],["Kora","Balafon","Ngoni","Percussion"],"Mandé musical character with kora, balafon and ngoni-like textures, layered polyrhythm and cyclical melodic development."),
  c("griot","subsaharan-africa","Griot Tradition","Griot",["Folk"],["Kora","Ngoni","Percussion","Voice"],"Griot-rooted acoustic character with kora/ngoni accompaniment, narrative phrasing, cyclical pulse and responsive ensemble texture."),
  c("nigerian","subsaharan-africa","Nigerian / West African Popular","Νιγηριανό / West African Popular",["Afrobeat","Pop"],["Percussion","Electric Guitar","Bass","Electronic Drums"],"Nigerian popular character with syncopated percussion, light guitar, elastic bass and contemporary Afro-pop production."),
  c("ghanaian","subsaharan-africa","Ghanaian","Γκανέζικο",["Folk","Afrobeat"],["Highlife Guitar","Percussion","Brass","Bass"],"Ghanaian highlife-rooted character with interlocking guitar, brass accents, danceable percussion and buoyant bass."),
  c("ethiopian-eritrean","subsaharan-africa","Ethiopian / Eritrean","Αιθιοπικό / Ερυθραϊκό",["Folk"],["Krar","Masenqo","Percussion","Keyboard"],"Ethiopian/Eritrean character with pentatonic modal language, krar/masenqo colors, distinctive groove and spacious melodic phrasing."),
  c("east-african-swahili","subsaharan-africa","East African / Swahili","Ανατολικοαφρικανικό / Swahili",["Folk","Pop"],["Percussion","Electric Guitar","Bass","Keyboard"],"East-African/Swahili popular character with flowing guitar, layered percussion, melodic bass and warm dance-oriented production."),
  c("kenyan","subsaharan-africa","Kenyan","Κενυατικό",["Folk","Pop"],["Electric Guitar","Percussion","Bass","Drums"],"Kenyan popular/folk character with guitar-led groove, syncopated percussion, melodic bass and clean live-band production."),
  c("tanzanian","subsaharan-africa","Tanzanian","Τανζανικό",["Folk","Pop"],["Electric Guitar","Percussion","Bass","Keyboard"],"Tanzanian popular character with Swahili melodic phrasing, guitar-driven dance groove, percussion and modern rhythmic polish."),
  c("congolese","subsaharan-africa","Congolese","Κονγκολέζικο",["Folk","Pop"],["Electric Guitar","Bass","Percussion","Drums"],"Congolese popular character with interlocking soukous-style guitars, agile bass, dance percussion and forward-moving groove."),
  c("central-african","subsaharan-africa","Central African","Κεντροαφρικανικό",["Folk"],["Percussion","Thumb Piano","Guitar","Bass"],"Central-African folk/popular character with layered percussion, lamellophone or guitar figures, cyclical rhythm and communal melodic interplay."),
  c("southern-african","subsaharan-africa","Southern African","Νοτιοαφρικανικό",["Folk","Pop"],["Percussion","Guitar","Bass","Choir"],"Southern-African character with vocal harmony, guitar, layered percussion and grounded dance pulse."),
  c("south-african","subsaharan-africa","South African","Νοτιοαφρικανικό (Νότια Αφρική)",["Folk","Pop"],["Guitar","Bass","Percussion","Choir"],"South-African popular character with strong vocal harmony, guitar/bass interplay, syncopated rhythm and modern regional production."),
  c("zulu-xhosa","subsaharan-africa","Zulu / Xhosa","Zulu / Xhosa",["Folk"],["Choir","Percussion","Guitar","Bass"],"Zulu/Xhosa-rooted character with layered vocal harmony, call-and-response, percussion and grounded communal pulse."),
  c("malagasy","subsaharan-africa","Malagasy","Μαλαγασιανό",["Folk"],["Valiha","Acoustic Guitar","Percussion","Bass"],"Malagasy folk character with valiha-like plucked textures, bright guitar, buoyant rhythms and airy acoustic production."),

  // South Asia
  c("indian","south-asia","Indian","Ινδικό",["Folk"],["Sitar","Tabla","Strings","Flute"],"Indian popular/folk color with raga-informed melodic ornamentation, tabla-style percussion, drone-aware harmony and expressive lead instruments."),
  c("hindustani","south-asia","Hindustani / North Indian","Hindustani / Βόρεια Ινδία",["Folk"],["Sitar","Tabla","Sarangi","Tanpura"],"North-Indian Hindustani character with raga-oriented melodic development, sitar/sarangi color, tabla and drone texture."),
  c("carnatic","south-asia","Carnatic / South Indian","Carnatic / Νότια Ινδία",["Folk"],["Veena","Mridangam","Violin","Flute"],"South-Indian Carnatic character with ornamented melody, veena/violin color, mridangam rhythmic detail and drone-centered texture."),
  c("punjabi","south-asia","Punjabi","Punjabi",["Folk","Pop"],["Dhol","Tumbi","Algoza","Bass"],"Punjabi folk/popular character with dhol drive, tumbi hooks, energetic dance rhythm and punchy modern low end."),
  c("bengali","south-asia","Bengali","Μπενγκάλι",["Folk"],["Dotara","Flute","Tabla","Harmonium"],"Bengali folk character with dotara/flute colors, lyrical melodic phrasing, tabla or hand rhythm and warm acoustic accompaniment."),
  c("gujarati","south-asia","Gujarati","Γκουτζαρατικό",["Folk"],["Dhol","Harmonium","Flute","Percussion"],"Gujarati folk character with lively dhol/percussion, circular dance energy, bright melody and festive ensemble production."),
  c("rajasthani","south-asia","Rajasthani","Ρατζαστανικό",["Folk"],["Sarangi","Dholak","Khartal","Flute"],"Rajasthani folk character with sarangi-like lead, dholak/khartal rhythm, desert-folk ornamentation and vivid acoustic texture."),
  c("marathi","south-asia","Marathi","Μαράθι",["Folk"],["Dholki","Harmonium","Flute","Percussion"],"Marathi folk/popular character with dholki pulse, harmonium, strong lyric-driven melody and regional dance energy."),
  c("pakistani","south-asia","Pakistani","Πακιστανικό",["Folk"],["Harmonium","Tabla","Dholak","Strings"],"Pakistani folk/popular character with harmonium, tabla/dholak, ornamented vocals and warm acoustic-modern blend."),
  c("qawwali","south-asia","Qawwali / Sufi South Asian","Qawwali / Sufi Νότιας Ασίας",["Folk"],["Harmonium","Tabla","Hand Claps","Choir"],"Qawwali/Sufi South-Asian character with harmonium, hand claps, tabla, call-and-response vocals and escalating devotional intensity."),
  c("bangladeshi","south-asia","Bangladeshi","Μπανγκλαντεσιανό",["Folk"],["Dotara","Ektara","Tabla","Flute"],"Bangladeshi folk character with dotara/ektara textures, flute, hand rhythm and lyrical riverine folk sensibility."),
  c("sri-lankan","south-asia","Sri Lankan","Σριλανκέζικο",["Folk"],["Drums","Flute","Strings","Percussion"],"Sri-Lankan folk/popular character with distinctive hand-drumming patterns, melodic flute/string color and lively regional pulse."),
  c("nepali","south-asia","Nepali","Νεπαλέζικο",["Folk"],["Sarangi","Madal","Flute","Acoustic Guitar"],"Nepali folk character with sarangi, madal drum, flute and acoustic strings, lilting mountain-folk melody and natural production."),

  // East Asia
  c("chinese","east-asia","Chinese","Κινέζικο",["Folk"],["Erhu","Guzheng","Dizi","Percussion"],"Chinese traditional/popular character with erhu, guzheng and dizi colors, pentatonic melodic motion and balanced modern-acoustic production."),
  c("cantonese","east-asia","Cantonese / South Chinese","Καντονέζικο / Νότια Κίνα",["Folk"],["Gaohu","Yangqin","Dizi","Percussion"],"Cantonese/South-Chinese character with gaohu/yangqin colors, agile melodic ornamentation and light traditional percussion."),
  c("tibetan","east-asia","Tibetan","Θιβετιανό",["Folk"],["Flute","Drums","Long Horn","Drone"],"Tibetan-rooted folk atmosphere with sustained drone, ritual wind/brass color, drums and spacious highland sonority."),
  c("mongolian","east-asia","Mongolian","Μογγολικό",["Folk"],["Morin Khuur","Percussion","Flute","Drone"],"Mongolian folk character with morin-khuur-like bowed lead, open drones, spacious pulse and steppe-inspired resonance."),
  c("japanese","east-asia","Japanese Traditional / Popular","Ιαπωνικό Traditional / Popular",["Folk"],["Koto","Shakuhachi","Taiko","Strings"],"Japanese traditional/popular color with koto, shakuhachi and taiko-like accents, restrained space and clean modern production."),
  c("okinawan","east-asia","Okinawan / Ryukyuan","Okinawan / Ryukyuan",["Folk"],["Sanshin","Flute","Percussion","Strings"],"Okinawan/Ryukyuan character with sanshin-like plucking, bright pentatonic melody, hand percussion and relaxed island pulse."),
  c("korean","east-asia","Korean Traditional / Popular","Κορεατικό Traditional / Popular",["Folk"],["Gayageum","Daegeum","Janggu","Strings"],"Korean traditional/popular character with gayageum, daegeum and janggu-like colors, flexible rhythmic phrasing and modern acoustic clarity."),

  // Southeast Asia
  c("indonesian","southeast-asia","Indonesian","Ινδονησιακό",["Folk"],["Gamelan","Flute","Percussion","Strings"],"Indonesian regional character with metallophone/gamelan colors, layered cyclic rhythm, flute and spacious ensemble texture."),
  c("javanese-gamelan","southeast-asia","Javanese / Gamelan","Ιαβανέζικο / Gamelan",["Folk"],["Gamelan","Gong","Rebab","Flute"],"Javanese gamelan character with interlocking metallophones, gong cycles, rebab/flute color and gradual layered motion."),
  c("balinese","southeast-asia","Balinese","Μπαλινέζικο",["Folk"],["Gamelan","Gong","Flute","Percussion"],"Balinese character with bright interlocking gamelan patterns, gong punctuation, fast rhythmic detail and dramatic ensemble dynamics."),
  c("malaysian","southeast-asia","Malaysian","Μαλαισιανό",["Folk"],["Gambus","Gong","Flute","Percussion"],"Malaysian folk/popular character with gambus-like plucking, gong/percussion layers, flowing melody and regional dance pulse."),
  c("filipino","southeast-asia","Filipino","Φιλιππινέζικο",["Folk"],["Rondalla Strings","Acoustic Guitar","Percussion","Flute"],"Filipino folk/popular character with rondalla-style plucked strings, acoustic guitar, lyrical melody and light dance rhythm."),
  c("thai","southeast-asia","Thai","Ταϊλανδέζικο",["Folk"],["Khim","Ranat","Flute","Percussion"],"Thai traditional/popular character with khim/ranat colors, ornamented melody, tuned percussion and clear rhythmic articulation."),
  c("vietnamese","southeast-asia","Vietnamese","Βιετναμέζικο",["Folk"],["Dan Bau","Dan Tranh","Flute","Percussion"],"Vietnamese folk character with dan-bau/dan-tranh-like textures, expressive bends, flute and delicate rhythmic support."),
  c("cambodian","southeast-asia","Cambodian","Καμποτζιανό",["Folk"],["Roneat","Tro","Flute","Percussion"],"Cambodian traditional character with roneat-like tuned percussion, bowed strings, flute and cyclical ensemble rhythm."),
  c("laotian","southeast-asia","Laotian","Λαοτινό",["Folk"],["Khene","Flute","Percussion","Strings"],"Laotian folk character with khene reed-organ color, flowing melody, light percussion and spacious acoustic texture."),
  c("burmese","southeast-asia","Burmese / Myanmar","Βιρμανικό / Myanmar",["Folk"],["Saung","Pat Waing","Flute","Percussion"],"Burmese/Myanmar character with saung-harp color, pat-waing-style drum-circle rhythm, flute and ornate melodic phrasing."),

  // Latin America & Caribbean
  c("mexican","latin-america-caribbean","Mexican","Μεξικανικό",["Latin","Folk"],["Acoustic Guitar","Trumpet","Violin","Bass"],"Mexican popular/folk ensemble color with acoustic strings, trumpet/violin accents, strong melodic phrasing and regional dance pulse."),
  c("mariachi-ranchera","latin-america-caribbean","Mariachi / Ranchera","Mariachi / Ranchera",["Latin","Folk"],["Trumpet","Violin","Vihuela","Guitarron"],"Mariachi/ranchera character with trumpets, violins, vihuela and guitarrón, strong cadential accents and dramatic vocal framing."),
  c("colombian","latin-america-caribbean","Colombian","Κολομβιανό",["Latin","Folk"],["Accordion","Percussion","Bass","Acoustic Guitar"],"Colombian regional character with accordion or guitar, layered percussion, buoyant bass and dance-oriented groove."),
  c("venezuelan","latin-america-caribbean","Venezuelan","Βενεζουελάνικο",["Latin","Folk"],["Cuatro","Harp","Maracas","Bass"],"Venezuelan folk character with cuatro, harp and maracas, agile joropo-like rhythmic motion and bright acoustic energy."),
  c("brazilian","latin-america-caribbean","Brazilian","Βραζιλιάνικο",["Latin"],["Classical Guitar","Percussion","Bass","Piano"],"Brazilian popular groove with syncopated acoustic guitar, layered percussion, warm harmony and fluid bass movement."),
  c("argentine","latin-america-caribbean","Argentine","Αργεντίνικο",["Latin","Folk"],["Acoustic Guitar","Bandoneon","Violin","Bass"],"Argentine folk/popular character with guitar, bandoneon or violin colors, lyrical phrasing and regional dance-derived pulse."),
  c("tango-rio-plata","latin-america-caribbean","Tango / Río de la Plata","Tango / Río de la Plata",["Latin"],["Bandoneon","Violin","Piano","Double Bass"],"Río-de-la-Plata tango character with bandoneon, violin, piano and double bass, dramatic rubato, marcato pulse and cinematic intimacy."),
  c("chilean","latin-america-caribbean","Chilean","Χιλιανό",["Latin","Folk"],["Acoustic Guitar","Charango","Percussion","Flute"],"Chilean folk character with acoustic guitar/charango, lyrical melody, hand percussion and roots-oriented ensemble production."),
  c("peruvian","latin-america-caribbean","Peruvian","Περουβιανό",["Latin","Folk"],["Charango","Quena","Cajon","Acoustic Guitar"],"Peruvian folk/popular character with charango, quena and cajón, Andean/coastal rhythmic color and warm acoustic production."),
  c("andean","latin-america-caribbean","Andean","Ανδεων",["Latin","Folk"],["Charango","Quena","Pan Flute","Percussion"],"Andean character with charango, quena/panpipe colors, highland melodic contour and steady communal dance rhythm."),
  c("bolivian","latin-america-caribbean","Bolivian","Βολιβιανό",["Latin","Folk"],["Charango","Pan Flute","Bomobo","Percussion"],"Bolivian Andean folk character with charango, panpipes, bombo-like drum and bright highland ensemble texture."),
  c("ecuadorian","latin-america-caribbean","Ecuadorian","Εκουαδοριανό",["Latin","Folk"],["Acoustic Guitar","Pan Flute","Violin","Percussion"],"Ecuadorian folk character with guitar, panpipe/violin color, lilting Andean pulse and intimate acoustic production."),
  c("cuban","latin-america-caribbean","Cuban","Κουβανέζικο",["Latin"],["Piano","Trumpet","Congas","Bass"],"Cuban popular character with clave-aware rhythm, piano montuno, brass, congas and syncopated bass interplay."),
  c("puerto-rican","latin-america-caribbean","Puerto Rican","Πορτορικανικό",["Latin"],["Cuatro","Percussion","Bass","Brass"],"Puerto-Rican character with cuatro or brass color, layered Afro-Caribbean percussion, syncopated bass and strong dance pulse."),
  c("dominican","latin-america-caribbean","Dominican","Δομινικανό",["Latin"],["Accordion","Güira","Tambora","Bass"],"Dominican character with accordion, güira and tambora-style rhythm, fast dance energy and clean melodic bass."),
  c("caribbean","latin-america-caribbean","Caribbean","Καραϊβικό",["Latin","Folk"],["Percussion","Bass","Guitar","Keys"],"Broad Caribbean character with syncopated percussion, buoyant bass, guitar/keys and warm dance-oriented production."),
  c("jamaican","latin-america-caribbean","Jamaican","Τζαμαϊκανό",["Reggae"],["Electric Guitar","Bass","Drums","Organ"],"Jamaican roots/popular character with offbeat guitar, deep melodic bass, one-drop or dancehall-derived pulse and spacious production."),
  c("haitian","latin-america-caribbean","Haitian","Αϊτινό",["Folk"],["Percussion","Guitar","Bass","Keys"],"Haitian folk/popular character with layered hand drums, guitar/keys, call-and-response energy and syncopated dance groove."),
  c("trinidad-calypso","latin-america-caribbean","Trinidadian / Calypso","Τρινινταντιανό / Calypso",["Folk","Latin"],["Steelpan","Percussion","Bass","Brass"],"Trinidadian/calypso character with steelpan, bright percussion, buoyant bass and festive brass or melodic accents."),

  // North America
  c("american-folk","north-america","American Folk","Αμερικανικό Folk",["Folk"],["Acoustic Guitar","Banjo","Violin","Upright Bass"],"American folk character with acoustic guitar, banjo/fiddle, upright bass and direct narrative song production."),
  c("appalachian","north-america","Appalachian","Appalachian",["Folk"],["Banjo","Violin","Acoustic Guitar","Mandolin"],"Appalachian folk character with banjo, fiddle, guitar and mandolin, modal melody and driving old-time acoustic rhythm."),
  c("bluegrass","north-america","Bluegrass","Bluegrass",["Folk"],["Banjo","Mandolin","Violin","Upright Bass"],"Bluegrass character with rapid banjo/mandolin picking, fiddle, upright bass, close vocal-harmony feel and energetic acoustic pulse."),
  c("cajun-zydeco","north-america","Cajun / Zydeco","Cajun / Zydeco",["Folk"],["Accordion","Violin","WashBoard","Bass"],"Cajun/zydeco character with accordion, fiddle, washboard-style rhythm, danceable two-step pulse and lively Louisiana ensemble energy."),
  c("native-north-american","north-america","Native North American","Ιθαγενές Βορειοαμερικανικό",["Folk"],["Drum","Flute","Percussion","Voice"],"Native North-American-inspired acoustic character centered on respectful drum/flute sonorities, spacious pulse and vocal-minded melodic simplicity.","Use broad, respectful Indigenous North-American acoustic references; avoid claiming a specific tribal tradition unless the user names one."),
  c("canadian-folk","north-america","Canadian Folk","Καναδικό Folk",["Folk"],["Acoustic Guitar","Violin","Mandolin","Upright Bass"],"Canadian folk character with acoustic strings, fiddle, narrative melody and natural roots production."),
  c("quebecois","north-america","Québécois / French Canadian","Québécois / Γαλλοκαναδικό",["Folk"],["Violin","Accordion","Acoustic Guitar","Percussion"],"Québécois/French-Canadian folk character with fiddle, accordion, foot-percussion energy and lively dance tunes."),
  c("inuit-arctic","north-america","Inuit / Arctic","Inuit / Αρκτικό",["Folk"],["Frame Drum","Voice","Percussion","Drone"],"Arctic/Inuit-inspired character with frame-drum pulse, voice-centered texture, sparse drone and wide open acoustic space.","Use broad Arctic/Inuit-inspired sonic references respectfully; do not imitate sacred or community-specific material."),

  // Oceania & Pacific
  c("australian-folk","oceania","Australian Folk","Αυστραλιανό Folk",["Folk"],["Acoustic Guitar","Violin","Harmonica","Percussion"],"Australian folk character with acoustic guitar, fiddle/harmonica, narrative phrasing and earthy roots production."),
  c("aboriginal-australian","oceania","Aboriginal Australian","Aboriginal Australian",["Folk"],["Didgeridoo","Clapsticks","Percussion","Voice"],"Aboriginal-Australian-inspired character with drone, clapstick-like pulse, sparse percussion and open natural space.","Use broad respectful sonic references; do not imitate sacred, ceremonial or community-specific material."),
  c("maori","oceania","Māori","Māori",["Folk"],["Percussion","Flute","Acoustic Guitar","Choir"],"Māori-inspired popular/folk character with strong communal vocal presence, percussion, flute colors and grounded rhythmic emphasis.","Use broad respectful Māori musical references and avoid sacred or ceremonial imitation."),
  c("polynesian","oceania","Polynesian","Πολυνησιακό",["Folk"],["Ukulele","Percussion","Acoustic Guitar","Choir"],"Polynesian island character with ukulele/acoustic strings, layered percussion, warm vocal harmony and relaxed-to-festive groove."),
  c("hawaiian","oceania","Hawaiian","Χαβανέζικο",["Folk"],["Ukulele","Steel Guitar","Acoustic Guitar","Percussion"],"Hawaiian popular/folk character with ukulele, steel-guitar color, gentle syncopation and warm open-air production."),
  c("samoan","oceania","Samoan","Σαμοανικό",["Folk"],["Percussion","Ukulele","Acoustic Guitar","Choir"],"Samoan folk/popular character with communal harmony, hand percussion, acoustic strings and strong island rhythmic identity."),
  c("tongan","oceania","Tongan","Τονγκανικό",["Folk"],["Percussion","Ukulele","Acoustic Guitar","Choir"],"Tongan folk/popular character with layered voices, hand percussion, acoustic strings and stately-to-danceable island pulse."),
  c("melanesian","oceania","Melanesian","Μελανησιακό",["Folk"],["Percussion","Bamboo Flute","Guitar","Choir"],"Melanesian regional character with vocal harmony, bamboo/flute colors, guitar and layered hand percussion."),
  c("micronesian","oceania","Micronesian","Μικρονησιακό",["Folk"],["Percussion","Guitar","Ukulele","Choir"],"Micronesian island character with communal vocals, guitar/ukulele, hand percussion and light cyclical groove."),

  c("custom","other","Custom cultural style","Προσαρμοσμένο πολιτισμικό στυλ",["Folk"],["Acoustic Guitar","Percussion"],"User-defined regional folk/popular character with culturally appropriate instrumentation, groove and production."),
];

function customCultureFromId(culturalStyleId: string): CulturalStyle | null {
  if (!culturalStyleId.startsWith("custom:")) return null;
  const raw = culturalStyleId.slice("custom:".length).trim().slice(0, 60);
  if (!raw) return CULTURAL_STYLES.find((item) => item.id === "custom") ?? null;
  return {
    id: culturalStyleId,
    region: "other",
    name: { en: raw, el: raw },
    musicStyles: ["Folk"],
    instruments: ["Acoustic Guitar", "Percussion"],
    productionStyle: `${raw} regional folk/popular character with culturally appropriate instrumentation, rhythmic language and production choices.`,
    additionalInstructions: `Use an authentic ${raw} musical fingerprint while keeping the selected lyrics language unchanged. Avoid generic world-music substitutions when specific regional traits are known.`,
  };
}

export function resolveSmartPreset(
  preset: SmartPreset,
  culturalStyleId?: string,
): SmartPreset {
  if (!preset.cultural) return preset;
  const culture =
    (culturalStyleId ? customCultureFromId(culturalStyleId) : null) ??
    CULTURAL_STYLES.find((item) => item.id === culturalStyleId) ??
    CULTURAL_STYLES[0]!;
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
