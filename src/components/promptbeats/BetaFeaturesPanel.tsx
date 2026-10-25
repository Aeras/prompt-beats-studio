import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { betaCopy } from "@/i18n/beta";
import {
  listBetaFeatures,
  transitionBetaFeature,
  getBetaTester,
  setBetaTester,
} from "@/lib/beta-features.functions";
import { BETA_CONFLICT, type BetaFeature, type BetaAction } from "@/lib/beta-features.shared";

export function BetaFeaturesPanel() {
  const { user } = useAuth();
  const { language } = useI18n();
  const copy = betaCopy[language];
  const client = useQueryClient();
  const [tab, setTab] = useState<"beta" | "stable" | "archived">("beta");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["beta-features", user?.id],
    queryFn: () => listBetaFeatures(),
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  const update = useMutation({
    mutationFn: (input: {
      featureKey: string;
      action: BetaAction;
      expectedRevision: number;
      confirmed: boolean;
    }) => transitionBetaFeature({ data: input }),
    onSuccess: () => toast.success(copy.saved),
    onError: (error) => toast.error(error.message === BETA_CONFLICT ? copy.conflict : copy.failed),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["beta-features"] }),
        client.invalidateQueries({ queryKey: ["feature-access-policies"] }),
        client.invalidateQueries({ queryKey: ["feature-access"] }),
      ]);
    },
  });
  const change = (feature: BetaFeature, action: BetaAction) => {
    if (action === "promote" && !window.confirm(copy.confirmPromote)) return;
    if (action === "archive" && !window.confirm(copy.confirmArchive)) return;
    update.mutate({
      featureKey: feature.feature_key,
      action,
      expectedRevision: feature.revision,
      confirmed: action === "promote",
    });
  };
  const rows =
    query.data?.features.filter(
      (feature) =>
        feature.stage === tab &&
        `${feature.display_name} ${feature.feature_key} ${feature.description}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    ) ?? [];
  return (
    <section className="space-y-4" aria-label={copy.title}>
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold">{copy.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{copy.intro}</p>
      </div>
      <input
        aria-label={copy.search}
        placeholder={copy.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/20 p-3"
      />
      <div role="tablist" aria-label={copy.title} className="flex gap-2">
        {(["beta", "stable", "archived"] as const).map((value) => (
          <button
            role="tab"
            id={`beta-tab-${value}`}
            aria-controls="beta-feature-panel"
            tabIndex={tab === value ? 0 : -1}
            key={value}
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const tabs = ["beta", "stable", "archived"] as const;
              const index = tabs.indexOf(value);
              const next =
                event.key === "Home"
                  ? tabs[0]
                  : event.key === "End"
                    ? tabs[2]
                    : event.key === "ArrowRight"
                      ? tabs[(index + 1) % tabs.length]
                      : event.key === "ArrowLeft"
                        ? tabs[(index + tabs.length - 1) % tabs.length]
                        : undefined;
              if (next) {
                event.preventDefault();
                setTab(next);
                document.getElementById(`beta-tab-${next}`)?.focus();
              }
            }}
            className={`rounded-xl border px-4 py-2 ${tab === value ? "border-primary text-primary" : "border-white/10"}`}
          >
            {copy[value]}
          </button>
        ))}
      </div>
      {query.isLoading && <p role="status">{copy.loading}</p>}
      {query.isError && (
        <div role="alert">
          <p>{copy.failed}</p>
          <button onClick={() => void query.refetch()} className="text-accent underline">
            {copy.retry}
          </button>
        </div>
      )}
      <div
        role="tabpanel"
        id="beta-feature-panel"
        aria-labelledby={`beta-tab-${tab}`}
        tabIndex={0}
        className="space-y-4"
      >
        {tab === "archived" && <p className="text-sm text-muted-foreground">{copy.archiveInfo}</p>}
        {!query.isLoading && !query.isError && rows.length === 0 && <p>{copy.empty}</p>}
        {rows.map((feature) => (
          <article key={feature.feature_key} className="glass space-y-3 rounded-2xl p-4">
            <h3 className="font-semibold">{feature.display_name}</h3>
            <p className="text-sm text-muted-foreground">{feature.description}</p>
            <code className="break-all text-xs">{feature.feature_key}</code>
            <div className="flex flex-wrap items-center gap-3">
              {feature.stage !== "archived" && (
                <label className="text-sm">
                  {copy.lifecycle}
                  <select
                    aria-label={`${copy.lifecycle}: ${feature.display_name}`}
                    value={feature.stage}
                    disabled={update.isPending}
                    onChange={(e) => change(feature, e.target.value === "beta" ? "beta" : "stable")}
                    className="ml-2 rounded-lg border border-white/10 bg-[#17131f] p-2"
                  >
                    <option value="beta">Beta</option>
                    <option value="stable">Stable</option>
                  </select>
                </label>
              )}
              {feature.stage === "stable" && (
                <>
                  <button
                    disabled={update.isPending}
                    onClick={() => change(feature, "archive")}
                    className="rounded-lg border border-white/10 px-3 py-2"
                  >
                    {copy.archive}
                  </button>
                  <button
                    disabled={update.isPending}
                    onClick={() => change(feature, "promote")}
                    className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                  >
                    {copy.promote}
                  </button>
                </>
              )}
              {feature.stage === "archived" && (
                <button
                  disabled={update.isPending}
                  onClick={() => change(feature, "restore")}
                  className="rounded-lg border border-white/10 px-3 py-2"
                >
                  {copy.restore}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <details className="glass rounded-2xl p-4">
        <summary>{copy.history}</summary>
        <ul className="mt-3 space-y-2 text-xs">
          {(query.data?.events ?? []).map((event) => (
            <li key={event.id} className="break-words border-t border-white/10 pt-2">
              {new Date(event.created_at).toLocaleString(language === "el" ? "el-GR" : "en-US")} ·{" "}
              {copy.actions[event.action]} ·{" "}
              {event.feature_key ?? event.target_user_id?.slice(0, 8)} ·{" "}
              <span title={event.actor_id ?? undefined}>
                {event.actor_id?.slice(0, 8) ?? copy.registration}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Parent renders this separately from role management, for Super Admin only. */
export function BetaTesterControl({ userId }: { userId: string }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const copy = betaCopy[language];
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["beta-tester", userId, user?.id],
    queryFn: () => getBetaTester({ data: { userId } }),
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      setBetaTester({ data: { userId, enabled, expectedEnabled: query.data?.enabled ?? false } }),
    onSuccess: () => toast.success(copy.saved),
    onError: (error) => toast.error(error.message === BETA_CONFLICT ? copy.conflict : copy.failed),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["beta-tester", userId] }),
        client.invalidateQueries({ queryKey: ["feature-access"] }),
        client.invalidateQueries({ queryKey: ["beta-features"] }),
      ]);
    },
  });
  return (
    <section className="mt-5 rounded-2xl border border-white/10 p-4" aria-label={copy.tester}>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          aria-label={copy.tester}
          checked={query.data?.enabled ?? false}
          disabled={
            !query.data || update.isPending || (!query.data.eligible && !query.data.enabled)
          }
          onChange={(e) => {
            if (window.confirm(copy.confirmTester)) update.mutate(e.target.checked);
          }}
        />
        {copy.tester}
      </label>
      <p className="mt-2 text-xs text-muted-foreground">{copy.testerHelp}</p>
      {query.data?.role_access && (
        <p className="mt-2 text-xs text-muted-foreground">{copy.staffHelp}</p>
      )}
      {query.data && !query.data.eligible && (
        <p className="mt-2 text-xs text-amber-200">{copy.inactive}</p>
      )}
      {query.isError && (
        <p role="alert">
          {copy.failed} <button onClick={() => void query.refetch()}>{copy.retry}</button>
        </p>
      )}
    </section>
  );
}
