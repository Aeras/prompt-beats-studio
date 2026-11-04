import { AtlasNavigation } from "@/components/promptbeats/AtlasNavigation";
import { AtlasResearchNotes } from "@/components/promptbeats/AtlasResearchNotes";
import { atlasResearchCopy } from "@/i18n/atlas-research";
import {
  atlasNavigationCopy,
  atlasKnowledgeCopy,
  atlasOptionCopy,
  atlasTaxonLabel,
} from "@/i18n/atlas-navigation";
import { atlasProfileName, emptyAtlasFilters, matchesAtlasFilters } from "@/lib/atlas-navigation";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/promptbeats/AppShell";
import { BetaFeatureGate } from "@/components/promptbeats/BetaFeatureGate";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { atlasCopy, atlasDimensionCopy } from "@/i18n/song-atlas";
import { getSongAtlasPreview, validateSongAtlasHandoff } from "@/lib/song-atlas.functions";
import {
  ATLAS_DIMENSIONS,
  ATLAS_HANDOFF_KEY,
  atlasSelectionSchema,
  atlasHandoffSchema,
  inspectAtlasSelection,
  type AtlasSelection,
} from "@/lib/song-atlas.shared";
export const Route = createFileRoute("/song-atlas")({
  head: () => ({
    meta: [{ title: atlasCopy.en.title }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: SongAtlasPage,
});
function SongAtlasPage() {
  return (
    <AppShell>
      <BetaFeatureGate featureKey="cultural_song_atlas">
        <AtlasPreview />
      </BetaFeatureGate>
    </AppShell>
  );
}
function AtlasPreview() {
  const { user } = useAuth();
  const { language } = useI18n();
  const t = atlasCopy[language];
  const n = atlasNavigationCopy[language];
  const localeIndex = language === "el" ? 0 : 1;
  const access = useFeatureAccess("cultural_song_atlas");
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["song-atlas-preview", user?.id],
    queryFn: () => getSongAtlasPreview(),
    enabled: !!user && access.allowed,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
  });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyAtlasFilters);
  const [selection, setSelection] = useState<AtlasSelection>({ profileIds: [], optionIds: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const draftKey = "pb:atlas-selection:v1:" + user?.id;
  useEffect(() => {
    setSelection({ profileIds: [], optionIds: [] });
    setFilters(emptyAtlasFilters());
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const parsed = atlasSelectionSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setSelection(parsed.data);
      }
    } catch {
      /* A corrupt research draft never changes Generator. */
    }
  }, [draftKey]);
  const change = (next: AtlasSelection) => {
    const parsed = atlasSelectionSchema.safeParse(next);
    if (!parsed.success) {
      setMessage(n.limit);
      return;
    }
    setMessage("");
    setSelection(parsed.data);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(parsed.data));
    } catch {
      setMessage(n.draftError);
    }
  };
  if (!access.allowed || query.isError) return <p role="alert">{t.unavailable}</p>;
  if (!query.data) return <p role="status">{n.loading}</p>;
  const catalog = query.data;
  let inspected;
  try {
    inspected = inspectAtlasSelection(selection, catalog);
  } catch {
    inspected = { options: [], conflicts: ["stale_selection"], unapproved: [] };
  }
  const cards = catalog.cards.filter((c) => {
    const entry = catalog.navigation.find((e) => e.profileId === c.id);
    return (
      !!entry &&
      matchesAtlasFilters(entry, filters) &&
      [
        c.id,
        c.name,
        c.summary,
        entry.romanizedName,
        ...c.families.map((id) => atlasTaxonLabel(id, language)),
      ]
        .join(" ")
        .toLocaleLowerCase(language)
        .includes(search.toLocaleLowerCase(language))
    );
  });
  const visibleOptions = catalog.options.filter(
    (o) => !o.profileId || selection.profileIds.includes(o.profileId),
  );
  const canTransfer =
    selection.optionIds.length > 0 && !inspected.conflicts.length && !inspected.unapproved.length;
  const transfer = async () => {
    setBusy(true);
    try {
      const handoff = atlasHandoffSchema.parse({
        format: "promptbeats-atlas-handoff" as const,
        schemaVersion: 1 as const,
        id: crypto.randomUUID(),
        sourceSha:
          catalog.sourceSha as "fa363996a89fe2b475bd75330f4eaa01531c8ed4f7a32669ebe64e2e963d925a",
        selection,
      });
      const verified = await validateSongAtlasHandoff({ data: handoff });
      sessionStorage.setItem(ATLAS_HANDOFF_KEY + ":" + user!.id, JSON.stringify(verified.handoff));
      await navigate({ to: "/generate" });
    } catch {
      setMessage(t.blocked);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 pb-28"
      data-testid="song-atlas-preview"
    >
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-primary">{t.preview}</p>
      <p className="rounded-xl border border-primary/30 p-3 text-sm">{t.warning}</p>
      <p className="text-xs text-muted-foreground">{n.namesFallback}</p>
      <AtlasNavigation catalog={catalog} filters={filters} onChange={setFilters} />
      <label className="block">
        {t.search}
        <input
          className="mt-1 w-full rounded-xl border border-input bg-background p-3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <p role="status">
        {n.count(cards.length, catalog.cards.length)} · {n.excluded(catalog.candidateCount)}
      </p>
      {!cards.length && <p>{n.noProfiles}</p>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const name = atlasProfileName(
            card,
            catalog.navigation.find((e) => e.profileId === card.id)!,
          );
          return (
            <article
              key={card.id}
              className="min-w-0 break-words rounded-2xl border border-border bg-card p-4"
              data-atlas-id={card.id}
            >
              <h2 className="text-lg font-semibold" lang={name.primaryLang}>
                {name.primary}
              </h2>
              {name.secondary && (
                <p className="text-sm text-muted-foreground" lang={name.secondaryLang}>
                  {name.secondary}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {card.id} · {atlasTaxonLabel(card.entityType, language)}
              </p>
              <p className="my-2 text-sm text-muted-foreground">
                {card.contextOnly ? t.context : t.style}
              </p>
              {language !== "el" && (
                <p className="text-xs text-muted-foreground">{n.greekFallback}</p>
              )}
              <p lang="el">{card.summary}</p>
              <label className="my-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selection.profileIds.includes(card.id)}
                  onChange={(e) =>
                    change({
                      profileIds: e.target.checked
                        ? [...selection.profileIds, card.id]
                        : selection.profileIds.filter((id) => id !== card.id),
                      optionIds: selection.optionIds.filter(
                        (id) =>
                          !catalog.options.some((o) => o.id === id && o.profileId === card.id),
                      ),
                    })
                  }
                />
                {t.choose}
              </label>
              <details>
                <summary className="cursor-pointer py-2">{t.inspect}</summary>
                <dl>
                  {card.knowledge.map((k) => (
                    <div key={k.dimension} className="my-2">
                      <dt className="font-semibold">
                        {atlasKnowledgeCopy[k.dimension]?.[localeIndex] ?? t.unknown}
                      </dt>
                      <dd lang={k.text ? "el" : language}>{k.text ?? t.unknown}</dd>
                      <dd className="text-xs text-muted-foreground">
                        {atlasKnowledgeCopy[k.evidence]?.[localeIndex] ?? t.unknown}
                      </dd>
                    </div>
                  ))}
                </dl>
                <h3 className="mt-4 font-semibold">{t.sources}</h3>
                {card.claims.map((claim) => {
                  const claimLanguage = claim.localizedText[language]
                    ? language
                    : claim.localizedText.el
                      ? "el"
                      : "en";
                  const claimText = claim.localizedText[claimLanguage];
                  return (
                    <div className="my-3 text-sm" key={claim.id}>
                      {claimLanguage !== language && (
                        <p className="text-xs text-muted-foreground">
                          {claimLanguage === "el" ? n.greekFallback : n.englishFallback}
                        </p>
                      )}
                      <p lang={claimText ? claimLanguage : language}>{claimText || t.unknown}</p>
                      <p className="text-xs text-muted-foreground">
                        {atlasKnowledgeCopy[claim.review]?.[localeIndex] ?? t.unknown}
                        {claim.scopeWarning ? " · " + n.scopeLimited : ""}
                      </p>
                      {claim.sourceIds.map((id) => {
                        const s = catalog.sources.find((s) => s.id === id);
                        return (
                          <p className="break-words text-xs" key={id}>
                            {s?.url ? (
                              <a
                                className="underline"
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {id}: {s.title}
                              </a>
                            ) : (
                              id + ": " + (s?.title ?? t.unknown)
                            )}
                          </p>
                        );
                      })}
                    </div>
                  );
                })}
              </details>
              <AtlasResearchNotes profileId={card.id} />
            </article>
          );
        })}
      </div>
      <section className="space-y-3 rounded-2xl border border-primary/30 p-4">
        <h2 className="text-lg font-semibold">{t.selection}</h2>
        <p className="text-sm">{t.existing}</p>
        {ATLAS_DIMENSIONS.map((d) => (
          <fieldset className="min-w-0 rounded-xl border border-border p-3" key={d}>
            <legend>{atlasDimensionCopy[d][language === "el" ? 0 : 1]}</legend>
            {visibleOptions
              .filter((o) => o.dimension === d)
              .map((o) => (
                <label key={o.id} className="my-2 flex items-start gap-2 break-words text-sm">
                  <input
                    className="mt-1 shrink-0"
                    type="checkbox"
                    checked={selection.optionIds.includes(o.id)}
                    onChange={(e) =>
                      change({
                        ...selection,
                        optionIds: e.target.checked
                          ? [...selection.optionIds, o.id]
                          : selection.optionIds.filter((id) => id !== o.id),
                      })
                    }
                  />
                  <span>
                    <span lang={atlasOptionCopy[o.label] ? language : "en"}>
                      {atlasOptionCopy[o.label]?.[localeIndex] ?? o.label}
                    </span>
                    {!atlasOptionCopy[o.label] && (
                      <span className="block text-xs text-muted-foreground">
                        {n.techniqueFallback}
                      </span>
                    )}
                    {!o.approved && (
                      <span className="ml-2 text-xs text-muted-foreground">({t.creative})</span>
                    )}
                  </span>
                </label>
              ))}
          </fieldset>
        ))}
        {inspected.conflicts.length > 0 && (
          <p role="alert">
            {t.conflict}
            {inspected.conflicts
              .map((id) =>
                id === "stale_selection"
                  ? n.stale
                  : (atlasDimensionCopy[id as keyof typeof atlasDimensionCopy]?.[localeIndex] ??
                    t.conflict),
              )
              .join(", ")}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t.blocked}</p>
        {!catalog.options.some((option) => option.approved) && (
          <p role="status" className="text-sm">
            {atlasResearchCopy[language].noApproved}
          </p>
        )}
        <Button
          type="button"
          className="h-auto whitespace-normal rounded-xl px-4 py-3"
          disabled={!canTransfer || busy}
          onClick={() => void transfer()}
        >
          {t.transfer}
        </Button>
        <button
          type="button"
          className="ml-3 p-3"
          onClick={() => change({ profileIds: [], optionIds: [] })}
        >
          {t.clear}
        </button>
        {message && <p role="alert">{message}</p>}
      </section>
      <p className="break-all text-xs text-muted-foreground">
        {n.sourceVersion} {catalog.sourceSha}
      </p>
    </section>
  );
}
