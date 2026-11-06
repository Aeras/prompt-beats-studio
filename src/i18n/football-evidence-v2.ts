export const footballEvidenceV2Messages = {
  el: {
    title: "Τεκμήρια δημοσιευμένων επιλογών · V2",
    profile: "Έρευνα: 2 αναζητήσεις στοιχείων/ειδήσεων + 1 μικτή προβλέψεων",
    sources: "Ελεγμένες ανεξάρτητες προελεύσεις",
    reviewed: "Ελεγμένη εκδοτική προέλευση",
    urls: "Διαφορετικά έγγραφα",
    votes: "συμφωνία πηγών, όχι πιθανότητα",
    empty: "Δεν υπάρχει επαρκής τεκμηριωμένη συμφωνία.",
    claims: "Δημοσιευμένες επιλογές και έλεγχοι",
    provisional: "Προσωρινό · δεν προσμετράται",
    counted: "Επιλέξιμος ισχυρισμός",
    query: "Γλώσσα αναζήτησης",
    detected: "Εντοπισμένη γραφή άρθρου",
    unknown: "Άγνωστη",
    truncated: "Μερικό απόσπασμα, όχι πλήρες άρθρο",
    omitted: "Επιπλέον επιλογές εκτός ορίου αποσπάσματος",
    noPick: "Δεν εντοπίστηκε ρητή επιλογή συντάκτη στο διαθέσιμο κείμενο",
    access: "Πρόσβαση",
    published: "Δημοσίευση κατά πάροχο",
    noDate: "Χρόνος δημοσίευσης άγνωστος",
    conflicts: "Αντιφατικές προελεύσεις",
    reasons: "Λόγοι μη καταμέτρησης",
    limited:
      "Μόνο σύντομα ακριβή αποσπάσματα. Η ανίχνευση γραφής δεν επιβεβαιώνει γλώσσα ολόκληρου άρθρου.",
    statuses: {
      verified: "Ταυτότητα επαληθευμένη στο απόσπασμα",
      probable: "Πιθανή ταυτότητα",
      ambiguous: "Αμφίβολη ταυτότητα",
      rejected: "Ταυτότητα απορρίφθηκε",
    },
  },
  en: {
    title: "Published-pick evidence · V2",
    profile: "Research: 2 facts/news searches + 1 mixed forecast search",
    sources: "Reviewed independent origins",
    reviewed: "Reviewed publisher origin",
    urls: "Distinct documents",
    votes: "source agreement, not probability",
    empty: "Insufficient supported source agreement.",
    claims: "Published picks and checks",
    provisional: "Provisional · not counted",
    counted: "Eligible claim",
    query: "Search language",
    detected: "Detected article script",
    unknown: "Unknown",
    truncated: "Partial extract, not full article",
    omitted: "Additional picks outside excerpt limit",
    noPick: "No explicit authored pick found in the available text",
    access: "Accessed",
    published: "Publication reported by provider",
    noDate: "Publication time unknown",
    conflicts: "Conflicting origins",
    reasons: "Reasons excluded from votes",
    limited:
      "Short exact quotations only. Script detection does not verify whole-article language.",
    statuses: {
      verified: "Fixture verified in passage",
      probable: "Probable fixture",
      ambiguous: "Ambiguous fixture",
      rejected: "Rejected fixture",
    },
  },
} as const;
export const footballEvidenceReasonLabels: Record<string, { el: string; en: string }> = {
  group_limit: { el: "Όριο συγκρίσιμων ομάδων", en: "Comparable-group bound" },
  home_missing: { el: "Δεν εντοπίστηκε γηπεδούχος", en: "Home team missing" },
  away_missing: { el: "Δεν εντοπίστηκε φιλοξενούμενος", en: "Away team missing" },
  same_team: { el: "Μη διακριτές ομάδες", en: "Teams not distinct" },
  venue_unknown: { el: "Μη σαφής έδρα", en: "Venue direction unknown" },
  reversed_venue: { el: "Αντεστραμμένη έδρα", en: "Reversed venue" },
  date_missing: { el: "Δεν τεκμηριώνεται ημερομηνία", en: "Fixture date missing" },
  date_conflict: { el: "Ασυμφωνία ημερομηνίας/έτους", en: "Date/year conflict" },
  competition_missing: { el: "Άγνωστη διοργάνωση", en: "Competition missing" },
  competition_conflict: { el: "Άλλη διοργάνωση", en: "Competition conflict" },
  qualified_team: { el: "Γυναικεία/νεανική/δεύτερη ομάδα", en: "Qualified squad" },
  multi_fixture: { el: "Πολλοί αγώνες χωρίς σαφές scope", en: "Unscoped multiple fixtures" },
  timestamp_conflict: { el: "Ασυμβίβαστη ώρα", en: "Explicit kickoff conflict" },
  after_kickoff: {
    el: "Μη έγκυρος χρόνος δημοσίευσης/ανάκτησης",
    en: "Invalid publication/access cutoff",
  },
  truncated_context: { el: "Ελλιπές περιεχόμενο", en: "Truncated context" },
  unsafe_context: {
    el: "Πλαίσιο αποδόσεων/ιστορικού ή μη έμπιστων οδηγιών",
    en: "Odds/history or untrusted instruction context",
  },
  unsafe_stance: { el: "Όχι σαφής επιλογή συντάκτη", en: "Unsafe or non-authored stance" },
  unmapped_market: { el: "Μη χαρτογραφημένη αγορά", en: "Unmapped market" },
  untrusted_instruction: { el: "Μη έμπιστες οδηγίες", en: "Untrusted instructions" },
  independence_unknown: { el: "Ανεξαρτησία μη τεκμηριωμένη", en: "Independence unknown" },
  community: { el: "Γνώμη κοινότητας", en: "Community opinion" },
  attributed: { el: "Αναφορά άλλου συντάκτη", en: "Attributed opinion" },
  copy: { el: "Αντίγραφο", en: "Copy" },
  quote_mismatch: { el: "Μη ακριβές απόσπασμα", en: "Quotation mismatch" },
  window_limit: { el: "Εκτός αποθηκευμένου αποσπάσματος", en: "Outside retained window" },
};

export const footballEvidenceMarketText = {
  el: {
    FT: "Τελικό",
    HT: "Ημίχρονο",
    dc: "Διπλή ευκαιρία",
    htft: "Ημίχρονο/Τελικό",
    score: "Ακριβές σκορ",
    yes: "GG",
    no: "NG",
    over: "Over",
    under: "Under",
    and: "και",
    other: "Μη χαρτογραφημένη αγορά",
  },
  en: {
    FT: "Full time",
    HT: "Half time",
    dc: "Double chance",
    htft: "Half time/Full time",
    score: "Correct score",
    yes: "BTTS Yes",
    no: "BTTS No",
    over: "Over",
    under: "Under",
    and: "and",
    other: "Unmapped market",
  },
} as const;
export const footballEvidenceLanguages = {
  el: { el: "Ελληνικά", en: "Αγγλικά", ru: "Ρωσικά", mixed: "Μικτή διατύπωση", unknown: "Άγνωστη" },
  en: { el: "Greek", en: "English", ru: "Russian", mixed: "Mixed wording", unknown: "Unknown" },
} as const;
export function footballEvidenceMarketLabel(
  m: import("@/lib/football-evidence-v2.shared").DescriptiveMarket,
  locale: "el" | "en",
): string {
  const t = footballEvidenceMarketText[locale];
  if (m.kind === "and")
    return m.legs.map((l) => footballEvidenceMarketLabel(l, locale)).join(` ${t.and} `);
  if (m.kind === "other") return `${t.other}: ${m.label}`;
  if (m.kind === "htft") return `${t.htft}: ${m.half}/${m.full}`;
  const prefix = t[m.period];
  if (m.kind === "score") return `${prefix} · ${t.score}: ${m.home}-${m.away}`;
  if (m.kind === "total") return `${prefix} · ${t[m.selection]} ${m.line}`;
  if (m.kind === "btts") return `${prefix} · ${t[m.selection]}`;
  return `${prefix} · ${m.kind === "dc" ? t.dc + ": " : ""}${m.selection}`;
}
