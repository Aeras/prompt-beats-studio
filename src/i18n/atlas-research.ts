export const atlasResearchCopy = {
  el: {
    title: "Νέα ερευνητική τεκμηρίωση V4",
    load: "Προβολή έρευνας V4",
    loading: "Φόρτωση τεκμηρίωσης…",
    unavailable: "Η τεκμηρίωση δεν είναι διαθέσιμη. Δεν άλλαξε καμία επιλογή Generator.",
    retry: "Νέα προσπάθεια",
    review:
      "Απαιτείται ανεξάρτητος έλεγχος. Η τεκμηρίωση δεν αποτελεί εγκεκριμένη οδηγία Generator.",
    source_supported_bounded: "Τεκμηριωμένο με συγκεκριμένα όρια",
    supported_no_universal_rule: "Δεν τεκμηριώνεται καθολικός κανόνας",
    insufficient_evidence: "Ανεπαρκής τεκμηρίωση",
    not_applicable_with_reason: "Μη εφαρμόσιμο με αιτιολόγηση",
    scope: "Όρια ισχύος",
    exceptions: "Εξαιρέσεις και αντιπαραδείγματα",
    sources: "Πηγές και ακριβές σημείο τεκμηρίωσης",
    noStatement: "Δεν προτείνεται μουσικός κανόνας.",
    quarantined:
      "Απαιτείται διόρθωση μεταδεδομένων πηγής — ο ισχυρισμός δεν προβάλλεται ως τεκμηριωμένος.",
    sourceLanguage: "Πληροφορίες πηγής στην αρχική γλώσσα",
    noApproved:
      "Δεν υπάρχουν ακόμη ανεξάρτητα εγκεκριμένες τεχνικές ή αντιστοιχίσεις πεδίων. Η μεταφορά παραμένει απενεργοποιημένη.",
  },
  en: {
    title: "New V4 research evidence",
    load: "View V4 research",
    loading: "Loading evidence…",
    unavailable: "Evidence is unavailable. No Generator selection was changed.",
    retry: "Try again",
    review:
      "Independent review required. Research evidence is not an approved Generator instruction.",
    source_supported_bounded: "Evidence supported within stated bounds",
    supported_no_universal_rule: "No universal rule established",
    insufficient_evidence: "Insufficient evidence",
    not_applicable_with_reason: "Not applicable, with reason",
    scope: "Validity scope",
    exceptions: "Exceptions and counterexamples",
    sources: "Sources and exact evidence locator",
    noStatement: "No musical rule proposed.",
    quarantined:
      "Source metadata needs correction — the claim is not displayed as supported evidence.",
    sourceLanguage: "Source details in their original language",
    noApproved:
      "No independently approved techniques or field mappings are available yet. Transfer remains disabled.",
  },
} as const;

export const atlasEvidenceLabel: Record<string, { el: string; en: string }> = {
  "peer-reviewed": { el: "Επιστημονική δημοσίευση με κριτές", en: "Peer-reviewed publication" },
  primary_archive: { el: "Πρωτογενές αρχείο", en: "Primary archive" },
  score: { el: "Παρτιτούρα", en: "Score" },
  recording: { el: "Ηχογράφηση", en: "Recording" },
  institutional: { el: "Θεσμική πηγή", en: "Institutional source" },
  secondary: { el: "Δευτερογενής πηγή", en: "Secondary source" },
  full_text: { el: "Πλήρες κείμενο", en: "Full text" },
  extract: { el: "Απόσπασμα", en: "Extract" },
  abstract: { el: "Περίληψη", en: "Abstract" },
  catalog_record: { el: "Καταλογογραφική εγγραφή", en: "Catalog record" },
  listening: { el: "Ακρόαση", en: "Listening" },
};
