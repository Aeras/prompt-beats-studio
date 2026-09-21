import termsEl from "@/content/legal/terms.el.md?raw";
import termsEn from "@/content/legal/terms.en.md?raw";
import privacyEl from "@/content/legal/privacy.el.md?raw";
import privacyEn from "@/content/legal/privacy.en.md?raw";
import copyrightEl from "@/content/legal/copyright-ip.el.md?raw";
import copyrightEn from "@/content/legal/copyright-ip.en.md?raw";

export const LEGAL_VERSION = "2026-09-21";

export const LEGAL_DOCUMENTS = {
  terms: {
    titleEl: "Όροι Χρήσης",
    titleEn: "Terms of Use",
    markdownEl: termsEl,
    markdownEn: termsEn,
  },
  privacy: {
    titleEl: "Πολιτική Απορρήτου & Προσωπικών Δεδομένων",
    titleEn: "Privacy & Personal Data Policy",
    markdownEl: privacyEl,
    markdownEn: privacyEn,
  },
  copyright: {
    titleEl: "Copyright / Πολιτική Πνευματικής Ιδιοκτησίας",
    titleEn: "Copyright / Intellectual Property Policy",
    markdownEl: copyrightEl,
    markdownEn: copyrightEn,
  },
} as const;
