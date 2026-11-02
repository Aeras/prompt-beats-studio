import {
  aiFixtureCodeCountsTowardQuota,
  type AiFixtureErrorCode,
} from "@/lib/football-ai-fixture-errors.shared";

type Lang = "el" | "en";

const TEXT: Record<AiFixtureErrorCode, Record<Lang, string>> = {
  dispatch_admission_failed: {
    el: "Η άδεια εκτέλεσης AI δεν ολοκληρώθηκε και δεν στάλθηκε αίτημα στον πάροχο.",
    en: "AI dispatch authorization did not complete and no provider request was sent.",
  },
  beta_disabled: {
    el: "Η AI Αναζήτηση BETA είναι απενεργοποιημένη από τον διαχειριστή.",
    en: "AI Search BETA is disabled by the operator.",
  },
  dispatch_disabled: {
    el: "Οι κλήσεις AI είναι προσωρινά απενεργοποιημένες.",
    en: "AI calls are temporarily disabled.",
  },
  spend_not_approved: {
    el: "Δεν έχει εγκριθεί ακόμη η χρεώσιμη ανανέωση από τον διαχειριστή.",
    en: "Paid refresh has not been approved by the operator yet.",
  },
  provider_key_missing: {
    el: "Ο πάροχος AI δεν είναι ρυθμισμένος.",
    en: "The AI provider is not configured.",
  },
  model_pricing_unavailable: {
    el: "Το μοντέλο δεν είναι εγκατεστημένο με επαληθευμένη τιμολόγηση.",
    en: "Model is not installed with verified pricing.",
  },
  cost_changed: {
    el: "Το εκτιμώμενο κόστος άλλαξε· ελέγξτε ξανά και επιβεβαιώστε.",
    en: "The estimated cost changed; review and confirm again.",
  },
  quota_exceeded_hour: {
    el: "Συμπληρώθηκε το όριο των 3 ανανεώσεων ανά ώρα.",
    en: "The limit of 3 refreshes per hour has been reached.",
  },
  quota_exceeded_day: {
    el: "Συμπληρώθηκε το όριο των 10 ανανεώσεων ανά ημέρα.",
    en: "The limit of 10 refreshes per day has been reached.",
  },
  already_running: {
    el: "Εκτελείται ήδη μια ανανέωση. Περιμένετε να ολοκληρωθεί.",
    en: "A refresh is already running. Wait for it to finish.",
  },
  admission_unavailable: {
    el: "Η ανανέωση δεν ξεκίνησε προσωρινά.",
    en: "The refresh could not start right now.",
  },
  provider_http_4xx: {
    el: "Ο πάροχος AI απέρριψε το αίτημα (HTTP 4xx).",
    en: "The AI provider rejected the request (HTTP 4xx).",
  },
  provider_http_5xx: {
    el: "Ο πάροχος AI παρουσίασε σφάλμα διακομιστή (HTTP 5xx).",
    en: "The AI provider returned a server error (HTTP 5xx).",
  },
  provider_network_failed: {
    el: "Η σύνδεση με τον πάροχο AI απέτυχε ή έληξε το χρονικό όριο.",
    en: "Connection to the AI provider failed or timed out.",
  },
  provider_response_invalid: {
    el: "Η τεχνική απόκριση του παρόχου AI δεν ήταν έγκυρη.",
    en: "The AI provider response was not valid.",
  },
  provider_failed: {
    el: "Ο πάροχος AI δεν απάντησε σωστά.",
    en: "The AI provider did not respond successfully.",
  },
  invalid_ai_output: {
    el: "Η απάντηση της AI δεν ήταν έγκυρη.",
    en: "The AI response was not valid.",
  },
  corroboration_failed: {
    el: "Η ανεξάρτητη επαλήθευση των αγώνων απέτυχε.",
    en: "Independent fixture verification failed.",
  },
  persistence_failed: {
    el: "Η αποθήκευση των αγώνων απέτυχε.",
    en: "Saving the fixtures failed.",
  },
};

const NOT_COUNTED: Record<Lang, string> = {
  el: "Δεν έγινε χρέωση και η προσπάθεια δεν μετράει στο όριο.",
  en: "Nothing was charged and the attempt does not count toward your limit.",
};
const COUNTED: Record<Lang, string> = {
  el: "Η προσπάθεια μετράει στο όριο.",
  en: "The attempt counts toward your limit.",
};
const UNKNOWN: Record<Lang, string> = {
  el: "Η ενημέρωση δεν ολοκληρώθηκε. Ελέγξτε το υπόλοιπο ορίου.",
  en: "Refresh did not complete. Check your remaining limit.",
};

export function aiFixtureFailureText(code: AiFixtureErrorCode | null, lang: Lang): string {
  if (!code) return UNKNOWN[lang];
  const tail = aiFixtureCodeCountsTowardQuota(code) ? COUNTED[lang] : NOT_COUNTED[lang];
  return `${TEXT[code][lang]} ${tail}`;
}
