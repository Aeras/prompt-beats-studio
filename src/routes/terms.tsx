import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/components/promptbeats/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { canonicalLink, robotsContent } from "@/lib/seo-policy";

export const Route = createFileRoute("/terms")({
  head: () => {
    const canonical = canonicalLink("/terms");
    return {
      meta: [
        { title: "Terms of Use — PromptBeats" },
        { name: "description", content: "PromptBeats Terms of Use." },
        { name: "robots", content: robotsContent("index") },
      ],
      links: canonical ? [canonical] : [],
    };
  },
  component: () => <LegalDocumentPage {...LEGAL_DOCUMENTS.terms} />,
});
