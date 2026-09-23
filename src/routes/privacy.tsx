import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/components/promptbeats/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PromptBeats" },
      { name: "description", content: "PromptBeats Privacy & Personal Data Policy." },
    ],
  }),
  component: () => <LegalDocumentPage {...LEGAL_DOCUMENTS.privacy} />,
});
