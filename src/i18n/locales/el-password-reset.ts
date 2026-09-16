import type { PasswordResetTranslationKey } from "@/i18n/locales/en-password-reset";

export const elPasswordReset: Record<PasswordResetTranslationKey, string> = {
  "auth.forgotPassword": "Ξέχασες τον κωδικό;",
  "auth.resetTitle": "Επαναφορά κωδικού πρόσβασης",
  "auth.resetSubtitle": "Γράψε το email σου και θα σου στείλουμε έναν ασφαλή σύνδεσμο επαναφοράς.",
  "auth.sendResetLink": "Αποστολή συνδέσμου επαναφοράς",
  "auth.resetEmailSent": "Αν υπάρχει λογαριασμός με αυτό το email, έχει σταλεί σύνδεσμος επαναφοράς κωδικού.",
  "auth.resetSendFailed": "Δεν ήταν δυνατή η αποστολή του email επαναφοράς αυτή τη στιγμή. Δοκίμασε ξανά.",
  "auth.choosePasswordTitle": "Όρισε νέο κωδικό πρόσβασης",
  "auth.choosePasswordSubtitle": "Γράψε έναν νέο κωδικό για τον λογαριασμό σου στο PromptBeats.",
  "auth.newPassword": "Νέος κωδικός πρόσβασης",
  "auth.confirmPassword": "Επιβεβαίωση νέου κωδικού",
  "auth.passwordsDoNotMatch": "Οι κωδικοί δεν ταιριάζουν.",
  "auth.passwordTooShort": "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.",
  "auth.updatePassword": "Αλλαγή κωδικού",
  "auth.passwordUpdated": "Ο κωδικός σου άλλαξε. Μπορείς τώρα να συνδεθείς με τον νέο κωδικό.",
  "auth.passwordUpdateFailed": "Δεν ήταν δυνατή η αλλαγή του κωδικού. Ζήτησε νέο σύνδεσμο επαναφοράς και δοκίμασε ξανά.",
  "auth.resetLinkInvalid": "Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει. Ζήτησε νέο σύνδεσμο.",
  "auth.backToSignIn": "Επιστροφή στη σύνδεση",
};
