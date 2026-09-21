import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/components/promptbeats/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Use — PromptBeats" }, { name: "description", content: "PromptBeats Terms of Use." }] }),
  component: () => <LegalDocumentPage {...LEGAL_DOCUMENTS.terms} />,
});
