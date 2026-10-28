import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { atlasResearchCopy, atlasEvidenceLabel } from "@/i18n/atlas-research";
import { atlasKnowledgeCopy } from "@/i18n/atlas-navigation";
import { getSongAtlasResearch } from "@/lib/song-atlas.functions";
import { Button } from "@/components/ui/button";

// Bibliography is text, never fetched or rendered as HTML. Reject credentialed/private links.
export function researchLink(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      !u.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(u.hostname)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Fetch one profile only after explicit expansion; never ship the entire research archive. */
export function AtlasResearchNotes({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const t = atlasResearchCopy[language];
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["atlas-v4-research", user?.id, profileId],
    queryFn: () => getSongAtlasResearch({ data: { profileId } }),
    enabled: open && !!user,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  return (
    <section className="mt-4 min-w-0 border-t border-border pt-3" data-testid="atlas-research">
      <Button
        variant="outline"
        className="h-auto min-h-11 whitespace-normal"
        type="button"
        aria-expanded={open}
        aria-controls={`research-${profileId}`}
        onClick={() => setOpen((value) => !value)}
      >
        {t.load}
      </Button>
      {open && (
        <div id={`research-${profileId}`} className="space-y-3 pt-3">
          <h3 className="font-semibold">{t.title}</h3>
          <p className="text-sm">{t.review}</p>
          {query.isPending && <p role="status">{t.loading}</p>}
          {query.isError && (
            <div role="alert">
              <p>{t.unavailable}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                {t.retry}
              </Button>
            </div>
          )}
          {!query.isError &&
            query.data?.tasks.map((entry) => (
              <article
                key={entry.gapId}
                className="min-w-0 space-y-2 break-words rounded-lg border border-border p-3"
              >
                <h4 className="font-semibold">
                  {atlasKnowledgeCopy[entry.dimension]?.[language === "el" ? 0 : 1] ??
                    entry.dimension}
                </h4>
                <p className="text-sm text-primary">
                  {entry.quarantined || !entry.researchDecision
                    ? t.quarantined
                    : t[entry.researchDecision]}
                </p>
                <p lang={language}>
                  {(language === "el" ? entry.suggestedStatementEl : entry.suggestedStatementEn) ??
                    t.noStatement}
                </p>
                <details>
                  <summary className="cursor-pointer py-2">{t.scope}</summary>
                  <p lang="el">{entry.validityScope}</p>
                  <h5 className="mt-2 font-semibold">{t.exceptions}</h5>
                  <ul className="list-disc pl-5" lang="el">
                    {entry.exceptionsAndCounterexamples.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </details>
                <h5 className="font-semibold">{t.sources}</h5>
                <p className="text-xs text-muted-foreground">{t.sourceLanguage}</p>
                {entry.citations.map((citation, i) => {
                  const href = researchLink(citation.url);
                  return (
                    <div key={i} className="space-y-1 break-words text-sm">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {citation.title}
                        </a>
                      ) : (
                        <p>{citation.title}</p>
                      )}
                      <p>
                        {Array.isArray(citation.authors)
                          ? citation.authors.join("; ")
                          : citation.authors}{" "}
                        · {citation.year ?? "—"}
                      </p>
                      <p>{citation.locator}</p>
                      <p>{citation.supports}</p>
                      <p className="text-xs text-muted-foreground">
                        {atlasEvidenceLabel[citation.sourceType]?.[language]} ·{" "}
                        {atlasEvidenceLabel[citation.accessedEvidence]?.[language]}
                      </p>
                    </div>
                  );
                })}
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
