import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Coins, Cpu, Sparkles } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useModeration } from "@/hooks/useModeration";
import { useAuth } from "@/hooks/useAuth";
import { getAiAnalytics, type Breakdown } from "@/lib/ai-analytics.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/management")({
  head: () => ({
    meta: [
      { title: "Management · AI Usage & Cost Analytics | PromptBeats" },
      {
        name: "description",
        content:
          "Super Admin dashboard for PromptBeats AI usage: token consumption, operations, models and estimated API cost.",
      },
      { property: "og:title", content: "Management · AI Usage & Cost Analytics | PromptBeats" },
      {
        property: "og:description",
        content: "Server-side visibility into PromptBeats AI token usage and estimated cost.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManagementPage,
});

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const num = (n: number) => n.toLocaleString("en-US");

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Coins; label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <h2 className="border-b border-white/10 px-4 py-3 font-display text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Requests</th>
              <th className="px-4 py-2 font-medium">Input</th>
              <th className="px-4 py-2 font-medium">Output</th>
              <th className="px-4 py-2 font-medium">Cost</th>
              <th className="px-4 py-2 font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={6}>
                  No data in this period yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-white/5">
                <td className="px-4 py-2">{r.key}</td>
                <td className="px-4 py-2">{num(r.requests)}</td>
                <td className="px-4 py-2">{num(r.inputTokens)}</td>
                <td className="px-4 py-2">{num(r.outputTokens)}</td>
                <td className="px-4 py-2">
                  {usd(r.costUsd)}
                  {r.unknownCostRequests > 0 && (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      (+{num(r.unknownCostRequests)} N/A)
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{num(r.failures)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManagementPage() {
  const { user, loading } = useAuth();
  const { isAdmin } = useModeration();
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-analytics", days],
    queryFn: () => getAiAnalytics({ data: { days } }),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const header = (
    <div className="min-w-0">
      <h1 className="truncate font-display text-lg font-bold md:text-2xl">AI Usage &amp; Cost Analytics</h1>
      <p className="truncate text-[11px] text-muted-foreground md:text-xs">
        Estimated API cost based on provider-reported tokens
      </p>
    </div>
  );

  if (!loading && (!user || !isAdmin)) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-[1600px] px-4 py-10 md:px-8">
          <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
            This area is restricted to administrators.{" "}
            <Link to="/" className="text-accent hover:underline">
              Back to feed
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 pb-40 md:px-8">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs transition-colors",
                days === r.days
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              Last {r.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="glass rounded-2xl p-4 text-sm text-red-300">
            Could not load analytics. Please try again.
          </div>
        )}
        {(isLoading || loading) && <p className="text-sm text-muted-foreground">Loading analytics…</p>}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                icon={Coins}
                label="Estimated cost"
                value={usd(data.totals.costUsd)}
                sub={
                  data.totals.unknownCostRequests > 0
                    ? `${usd(data.forecast.monthly)} / month at this pace · ${num(data.totals.unknownCostRequests)} requests with unknown pricing (N/A)`
                    : `${usd(data.forecast.monthly)} / month at this pace`
                }
              />
              <Stat
                icon={Cpu}
                label="Tokens"
                value={num(data.totals.totalTokens)}
                sub={`${num(data.totals.inputTokens)} in · ${num(data.totals.outputTokens)} out`}
              />
              <Stat
                icon={BarChart3}
                label="AI requests"
                value={num(data.totals.requests)}
                sub={`${num(data.totals.failures)} failed`}
              />
              <Stat
                icon={Sparkles}
                label="Songs generated"
                value={num(data.songs)}
                sub={`${usd(data.avgCostPerSong)} avg per song`}
              />
            </div>

            <Table title="By provider & model" rows={data.byProviderModel} />
            <Table title="By operation" rows={data.byOperation} />
            <Table title="By day" rows={data.byDay} />
          </>
        )}
      </main>
    </AppShell>
  );
}
