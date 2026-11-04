export const atlasOfflineReviewCopy = {
  el: {
    title: "Atlas — offline προεπισκόπηση υποψήφιας τεχνικής",
    warning:
      "Μη εγκεκριμένη δημιουργική υπόθεση. Δεν έγινε κλήση AI, παραγωγική ενεργοποίηση ή αξιολόγηση ακουστικού οφέλους.",
    before: "Πριν",
    after: "Προτεινόμενο αποτέλεσμα",
    field: "Πεδίο",
    preserved: "Όλα τα άλλα πεδία διατηρούνται αμετάβλητα.",
    fullBefore: "Πλήρεις αρχικές ρυθμίσεις",
    fullAfter: "Πλήρεις προτεινόμενες ρυθμίσεις",
    source: "Προέλευση",
    review:
      "Πριν από τοπική επιβεβαίωση απαιτείται εξέταση του πλήρους preview και των χειροκίνητων περιορισμών. Αυτό το αρχείο δεν εισάγεται ως κανονικό setup ούτε αποτελεί έγκριση παραγωγής.",
    fields: {
      additionalInstructions: "Πρόσθετες οδηγίες",
      customInstruments: "Προσαρμοσμένα όργανα",
      productionStyle: "Ύφος παραγωγής",
    },
  },
  en: {
    title: "Atlas — offline candidate preview",
    warning:
      "Unapproved creative hypothesis. No AI call, production activation or audible-benefit assessment took place.",
    before: "Before",
    after: "Proposed result",
    field: "Field",
    preserved: "Every other field remains unchanged.",
    fullBefore: "Complete original setup",
    fullAfter: "Complete proposed setup",
    source: "Provenance",
    review:
      "Inspect the complete preview and manual constraints before local confirmation. This file is not a normal setup import or production approval.",
    fields: {
      additionalInstructions: "Additional instructions",
      customInstruments: "Custom instruments",
      productionStyle: "Production style",
    },
  },
} as const;
