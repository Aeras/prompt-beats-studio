import type { AppLanguage } from "./index";
import { atlasCategoryKind } from "@/lib/atlas-navigation";
export const atlasCategoryKindCopy = {
  subgenre: ["Μουσικό υποείδος", "Musical subgenre"],
  form: ["Φόρμα / μορφή εκτέλεσης", "Form / performance format"],
  scene: ["Ιστορική σκηνή", "Historical scene"],
  context: ["Πολιτισμικό / θεματικό πλαίσιο", "Cultural / thematic context"],
  style: [
    "Αναφορά ύφους — όχι ορισμένο υποείδος",
    "Style reference — no distinct subgenre specified",
  ],
  general: ["Χωρίς ειδικότερο τεκμηριωμένο υποείδος", "No finer subgenre documented"],
} as const;
// Names are translated from the exact cited RC1 profile names, not inferred from entity_type.
export const atlasMusicalCategoryNames: Record<string, readonly [string, string]> = {
  "form.protyazhnaya-song": ["Παρατεταμένο τραγούδι Protyazhnaya", "Protyazhnaya song"],
  "form.chastushka": ["Chastushka", "Chastushka"],
  "form.khorovod-song": ["Χορευτικό τραγούδι Khorovod", "Khorovod dance song"],
  "context.wedding-ritual": ["Γαμήλια τελετουργικά τραγούδια", "Wedding ritual songs"],
  "context.calendar-ritual": ["Ημερολογιακά τελετουργικά τραγούδια", "Calendar ritual songs"],
  "form.bylina-epic-singing": ["Bylina / επικό τραγούδι", "Bylina / epic singing"],
  "general.lyrical-folk": ["Λυρικό παραδοσιακό ρεπερτόριο", "Lyrical folk repertoire"],
  "context.cossack-repertoire": ["Κοζάκικο ρεπερτόριο", "Cossack repertoire"],
  "subgenre.folk-rock": ["Φολκ ροκ", "Folk rock"],
  "style.urban-romance": ["Αστικό ρομάντσο", "Urban romance"],
  "subgenre.chamber-romance": ["Ρομάντσο μουσικής δωματίου", "Chamber romance"],
  "form.cruel-romance": ["Zhestokiy romans", "Zhestokiy romans"],
  "general.bard": ["Τραγούδι δημιουργού / βάρδων", "Author / bard song"],
  "context.satirical-bard": ["Σατιρικό τραγούδι δημιουργού", "Satirical author song"],
  "context.hiking-song": ["Εκδρομικό / πεζοπορικό τραγούδι", "Hiking / trekking song"],
  "context.blatnaya-repertoire": ["Blatnaya pesnya", "Blatnaya song"],
  "context.camp-song": ["Τραγούδια στρατοπέδων", "Camp songs"],
  "context.odessa-repertoire": ["Αστικό ρεπερτόριο Οδησσού", "Odessa urban repertoire"],
  "context.emigre-repertoire": ["Μεταναστευτικό ρεπερτόριο", "Émigré repertoire"],
  "style.lyrical-chanson": ["Λυρικό ρωσικό chanson", "Lyrical Russian chanson"],
  "style.post-chanson-critical-label": [
    "Post-chanson / υβριδικό chanson — κριτικός όρος",
    "Post-chanson / hybrid chanson — critical label",
  ],
  "scene.estrada-1950s-1960s": ["Εστράντα 1950–1960", "Estrada of the 1950s–1960s"],
  "scene.estrada-1970s": ["Εστράντα της δεκαετίας 1970", "Estrada of the 1970s"],
  "scene.estrada-1980s": ["Εστράντα της δεκαετίας 1980", "Estrada of the 1980s"],
  "form.via-ensemble": ["Φωνητικά-οργανικά σύνολα VIA", "VIA vocal-instrumental ensembles"],
  "style.folk-influenced-estrada": [
    "Εστράντα με παραδοσιακά στοιχεία",
    "Estrada with folk elements",
  ],
  "scene.russian-pop-1990s": ["Ρωσική ποπ της δεκαετίας 1990", "Russian pop of the 1990s"],
  "subgenre.dance-pop": ["Χορευτική ποπ", "Dance pop"],
  "scene.russian-dance-pop-2000s": [
    "Ρωσική dance pop της δεκαετίας 2000",
    "Russian dance pop of the 2000s",
  ],
  "form.pop-ballad": ["Ποπ μπαλάντα", "Pop ballad"],
  "general.pop": ["Γενική ποπ", "General pop"],
  "subgenre.indie-pop": ["Ίντι ποπ", "Indie pop"],
  "subgenre.synth-pop": ["Synth-pop", "Synth-pop"],
  "scene.soviet-rock-1970s": ["Σοβιετικό ροκ της δεκαετίας 1970", "Soviet rock of the 1970s"],
  "scene.russian-rock-1980s": ["Ρωσικό ροκ της δεκαετίας 1980", "Russian rock of the 1980s"],
  "subgenre.post-punk": ["Ποστ πανκ", "Post-punk"],
  "subgenre.new-wave": ["Νιου γουέιβ", "New wave"],
  "scene.soviet-post-punk-new-wave": [
    "Σοβιετικό post-punk / new wave",
    "Soviet post-punk / new wave",
  ],
  "subgenre.art-rock": ["Αρτ ροκ", "Art rock"],
  "subgenre.experimental-rock": ["Πειραματικό ροκ", "Experimental rock"],
  "context.social-rock": ["Κοινωνικά προσανατολισμένο ροκ", "Socially oriented rock"],
  "form.rock-ballad": ["Ροκ μπαλάντα", "Rock ballad"],
  "subgenre.punk-rock": ["Πανκ ροκ", "Punk rock"],
  "subgenre.alternative-rock": ["Εναλλακτικό ροκ", "Alternative rock"],
  "subgenre.indie-rock": ["Ίντι ροκ", "Indie rock"],
  "subgenre.shoegaze": ["Σούγκεϊζ", "Shoegaze"],
  "subgenre.dream-pop": ["Ντριμ ποπ", "Dream pop"],
  "subgenre.folk-metal": ["Φολκ μέταλ", "Folk metal"],
  "scene.russian-rap-1990s": ["Ρωσική ραπ της δεκαετίας 1990", "Russian rap of the 1990s"],
  "scene.russian-hip-hop-2000s": [
    "Ρωσικό χιπ χοπ της δεκαετίας 2000",
    "Russian hip-hop of the 2000s",
  ],
  "context.social-conceptual-rap": ["Κοινωνική / εννοιολογική ραπ", "Social / conceptual rap"],
  "form.battle-rap": ["Μπατλ ραπ", "Battle rap"],
  "subgenre.trap": ["Τραπ", "Trap"],
  "subgenre.melodic-rap": ["Μελωδική ραπ", "Melodic rap"],
  "subgenre.pop-rap": ["Ποπ ραπ", "Pop rap"],
  "subgenre.drill": ["Ντριλ", "Drill"],
  "subgenre.cloud-rap": ["Κλάουντ ραπ", "Cloud rap"],
  "style.phonk-drift-scenes": [
    "Phonk / drift phonk — ευρεία αναφορά",
    "Phonk / drift phonk — broad reference",
  ],
  "subgenre.hyperpop": ["Χάιπερποπ", "Hyperpop"],
  "subgenre.electropop": ["Ηλεκτροπόπ", "Electropop"],
  "subgenre.downtempo": ["Ντάουντεμπο", "Downtempo"],
  "subgenre.trip-hop": ["Τριπ χοπ", "Trip-hop"],
  "subgenre.electro-folk": ["Ηλεκτρο-φολκ", "Electro-folk"],
  "subgenre.folktronica": ["Φολκτρόνικα", "Folktronica"],
  "subgenre.pop-chanson": ["Ποπ chanson", "Pop chanson"],
  "subgenre.rap-rock": ["Ραπ ροκ", "Rap rock"],
};
export function atlasMusicalCategoryLabel(id: string, language: AppLanguage): string {
  const index = language === "el" ? 0 : 1;
  const name = atlasMusicalCategoryNames[id]?.[index];
  const kind = atlasCategoryKind(id);
  if (!name || !kind) return atlasCategoryKindCopy.general[index];
  return kind === "subgenre" ? name : atlasCategoryKindCopy[kind][index] + " · " + name;
}
export function atlasMusicalCategoryDescription(id: string, language: AppLanguage): string {
  const kind = atlasCategoryKind(id);
  return atlasCategoryKindCopy[kind ?? "general"][language === "el" ? 0 : 1];
}
