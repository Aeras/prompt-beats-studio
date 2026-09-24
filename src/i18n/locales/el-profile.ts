import type { ProfileTranslationKey } from "@/i18n/locales/en-profile";

export const elProfile: Record<ProfileTranslationKey, string> = {
  "profile.share": "Κοινοποίηση προφίλ",
  "profile.copyFailed": "Δεν ήταν δυνατή η αντιγραφή του συνδέσμου",
  "profile.discography": "Δισκογραφία",
  "profile.noPublished": "Δεν υπάρχουν ακόμη δημοσιευμένα τραγούδια.",
  "profile.block": "Αποκλεισμός λογαριασμού",
  "profile.unblock": "Άρση αποκλεισμού",
  "profile.manage": "Διαχείριση λογαριασμού",
  "profile.blockTitle": "Αποκλεισμός αυτού του λογαριασμού;",
  "profile.unblockTitle": "Άρση αποκλεισμού αυτού του λογαριασμού;",
  "profile.blockBody":
    "Ο λογαριασμός θα χάσει την πρόσβαση στις προστατευμένες λειτουργίες του PromptBeats.",
  "profile.unblockBody":
    "Να αποκατασταθεί η κανονική πρόσβαση στο PromptBeats για αυτόν τον λογαριασμό;",
  "profile.selectReason": "Επίλεξε αιτία",
  "profile.enterReason": "Γράψε την αιτία",
  "profile.accountBlocked": "Ο λογαριασμός αποκλείστηκε",
  "profile.accountUnblocked": "Ο αποκλεισμός του λογαριασμού καταργήθηκε",
  "profile.accountUpdateFailed": "Δεν ήταν δυνατή η ενημέρωση αυτού του λογαριασμού",
  "profile.working": "Επεξεργασία…",
  "profile.confirmBlock": "Επιβεβαίωση αποκλεισμού",
  "profile.confirmUnblock": "Επιβεβαίωση άρσης αποκλεισμού",

  "editProfile.avatarPreview": "Προεπισκόπηση avatar",
  "editProfile.bioPlaceholder": "Σύντομο βιογραφικό (έως 500 χαρακτήρες)",
  "editProfile.websiteOptional": "Website URL (προαιρετικό)",
  "editProfile.instagramOptional": "Instagram URL (προαιρετικό)",
  "editProfile.tiktokOptional": "TikTok URL (προαιρετικό)",
  "editProfile.twitterOptional": "X (Twitter) URL (προαιρετικό)",
  "editProfile.youtubeOptional": "YouTube URL (προαιρετικό)",
  "editProfile.invalidWebsiteUrl": "Εισάγετε ένα έγκυρο URL, π.χ. https://example.com",
  "editProfile.invalidInstagramUrl":
    "Εισάγετε ένα έγκυρο Instagram URL, π.χ. https://www.instagram.com/username",
  "editProfile.invalidTiktokUrl":
    "Εισάγετε ένα έγκυρο TikTok URL, π.χ. https://www.tiktok.com/@username",
  "editProfile.invalidTwitterUrl": "Εισάγετε ένα έγκυρο X URL, π.χ. https://x.com/username",
  "editProfile.invalidYoutubeUrl":
    "Εισάγετε ένα έγκυρο YouTube URL, π.χ. https://www.youtube.com/@username",
  "editProfile.fixHighlightedFields":
    "Διορθώστε τα επισημασμένα πεδία URL πριν από την αποθήκευση.",

  "donations.loading": "Φόρτωση ρυθμίσεων δωρεών…",
  "donations.title": "Δωρεές δημιουργού",
  "donations.accessHint":
    "Επίλεξε αν οι δωρεές θα εμφανίζονται δημόσια και διαχειρίσου έως 3 μεθόδους δωρεάς.",
  "donations.publicEnabled": "Δημόσιες",
  "donations.methodEnabled": "Ενεργή",
  "donations.removeMethod": "Αφαίρεση μεθόδου δωρεάς",
  "donations.customProvider": "Πάροχος / όνομα",
  "donations.customWarning":
    "Οι πληροφορίες που καταχωρείς εδώ μπορεί να εμφανίζονται δημόσια. Μην δημοσιεύεις αριθμούς καρτών, CVV, ημερομηνίες λήξης, κωδικούς πρόσβασης ή άλλα ευαίσθητα προσωπικά ή τραπεζικά στοιχεία. Προτίμησε ασφαλή σύνδεσμο πληρωμής ή αναγνωρισμένο ηλεκτρονικό πορτοφόλι.",
  "donations.customValue": "Στοιχεία δωρεάς, URL πληρωμής, username ή IBAN",
  "donations.providerUrl": "Ασφαλές URL πληρωμής / προφίλ",
  "donations.customAcknowledge":
    "Κατανοώ ότι οι πληροφορίες που καταχωρώ εδώ μπορεί να εμφανίζονται δημόσια. Αν εισάγω IBAN, αποδέχομαι ρητά ότι μπορεί να είναι δημόσιο.",
  "donations.addMethod": "Προσθήκη μεθόδου δωρεάς",
  "donations.save": "Αποθήκευση δωρεών",
  "donations.saved": "Οι ρυθμίσεις δωρεών αποθηκεύτηκαν",
  "donations.saveFailed": "Δεν ήταν δυνατή η αποθήκευση των ρυθμίσεων δωρεών",
  "donations.supportCreator": "Στήριξε αυτόν τον δημιουργό",
  "editProfile.avatarUrlError": "Δεν ήταν δυνατή η δημιουργία δημόσιου URL για το avatar",
  "editProfile.noSavedProfile": "Η ενημέρωση προφίλ δεν επέστρεψε αποθηκευμένο προφίλ",

  "donate.support": "Υποστήριξη",

  "owner.source": "Πηγή: {provider}",
  "owner.immutable": "δεν αλλάζει",
  "owner.visibility": "Ορατότητα",
  "owner.musicGenre": "Μουσικό είδος",
  "owner.customGenre": "Προσαρμοσμένο μουσικό είδος",
  "owner.stylePrompt": "Style Prompt",
  "owner.replaceAudio": "Αντικατάσταση αρχείου ήχου (προαιρετικό)",
  "owner.replaceAudioSelected": "{name} — θα αντικαταστήσει τον τρέχοντα ήχο στην αποθήκευση",
  "owner.replaceCover": "Αντικατάσταση εξωφύλλου (προαιρετικό)",
  "owner.replaceCoverSelected": "{name} — θα αντικαταστήσει το τρέχον εξώφυλλο στην αποθήκευση",
  "owner.titleRequired": "Δώσε τίτλο στο τραγούδι.",
  "owner.genreRequired": "Επίλεξε μουσικό είδος ή γράψε προσαρμοσμένο είδος έως 60 χαρακτήρες.",
  "owner.validLink": "Βάλε έγκυρο σύνδεσμο {provider}.",
  "owner.audioUploadFailed": "Το ανέβασμα του αρχείου ήχου απέτυχε",
  "owner.coverUploadFailed": "Το ανέβασμα του εξωφύλλου απέτυχε",
  "owner.saveFailed": "Δεν ήταν δυνατή η αποθήκευση των αλλαγών.",
  "owner.deleteFailed": "Δεν ήταν δυνατή η διαγραφή του τραγουδιού.",
  "owner.deleteNamed": "Διαγραφή «{title}»;",
  "owner.deletePermanent": "Το τραγούδι και το αρχείο ήχου θα διαγραφούν οριστικά.",

  "moderation.blockReason": "Αιτία",
  "moderation.selectReason": "Επίλεξε αιτία",
  "moderation.enterReason": "Γράψε την αιτία",

  "social.website": "Ιστοσελίδα",
  "social.instagram": "Instagram",
  "social.tiktok": "TikTok",
  "social.twitter": "X (Twitter)",
  "social.youtube": "YouTube",
};
