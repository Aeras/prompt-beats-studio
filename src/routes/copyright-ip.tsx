import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/components/promptbeats/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { canonicalLink, robotsContent } from "@/lib/seo-policy";

export const Route = createFileRoute("/copyright-ip")({
  head: () => {
    const canonical = canonicalLink("/copyright-ip");
    return {
      meta: [
        { title: "Copyright / IP Policy — PromptBeats" },
        { name: "description", content: "PromptBeats Copyright / Intellectual Property Policy." },
        { name: "robots", content: robotsContent("index") },
      ],
      links: canonical ? [canonical] : [],
    };
  },
  component: () => <LegalDocumentPage {...LEGAL_DOCUMENTS.copyright} />,
});
