import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/components/promptbeats/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { canonicalLink, robotsContent } from "@/lib/seo-policy";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const canonical = canonicalLink("/privacy");
    return {
      meta: [
        { title: "Privacy Policy — PromptBeats" },
        { name: "description", content: "PromptBeats Privacy & Personal Data Policy." },
        { name: "robots", content: robotsContent("index") },
      ],
      links: canonical ? [canonical] : [],
    };
  },
  component: () => <LegalDocumentPage {...LEGAL_DOCUMENTS.privacy} />,
});
