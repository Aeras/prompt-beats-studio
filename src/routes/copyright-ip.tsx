import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/components/promptbeats/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const Route = createFileRoute("/copyright-ip")({
  head: () => ({
    meta: [
      { title: "Copyright / IP Policy — PromptBeats" },
      { name: "description", content: "PromptBeats Copyright / Intellectual Property Policy." },
    ],
  }),
  component: () => <LegalDocumentPage {...LEGAL_DOCUMENTS.copyright} />,
});
