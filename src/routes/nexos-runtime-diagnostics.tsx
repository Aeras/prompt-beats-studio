import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  getNexosDiagnosticModels,
  runNexosRuntimeDiagnostic,
} from "@/lib/nexos-runtime-diagnostics.functions";

export const Route = createFileRoute("/nexos-runtime-diagnostics")({
  head: () => ({
    meta: [
      { title: "Nexos Runtime Diagnostics — PromptBeats" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NexosRuntimeDiagnosticsPage,
});

type DiagnosticResult = Awaited<ReturnType<typeof runNexosRuntimeDiagnostic>>;

function NexosRuntimeDiagnosticsPage() {
  const { user, loading } = useAuth();
  const models = useQuery({
    queryKey: ["nexos-runtime-diagnostic-models", user?.id],
    queryFn: () => getNexosDiagnosticModels(),
    enabled: Boolean(user),
    retry: false,
  });
  const [selectedModel, setSelectedModel] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveModel = selectedModel || models.data?.[0]?.id || "";

  const run = async () => {
    if (!effectiveModel || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const next = await runNexosRuntimeDiagnostic({ data: { model: effectiveModel } });
      setResult(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostic failed.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Sign in required.</div>
      </AppShell>
    );
  }

  if (models.isError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl p-6">
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Nexos diagnostics are restricted to administrators.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Nexos Runtime Diagnostics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin-only synthetic probe using the same Nexos Chat Completions endpoint and payload shape as PromptBeats runtime generation. No user lyrics or prompts are sent.
          </p>
        </div>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Nexos model</span>
            <select
              value={effectiveModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              disabled={running || models.isLoading}
            >
              {(models.data ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} — {model.id}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={run}
            disabled={!effectiveModel || running}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : "Run diagnostic"}
          </button>
        </section>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {result ? (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{result.label}</span>
              <span className="rounded-full border border-border px-2 py-0.5">HTTP {result.status}</span>
              <span className="text-muted-foreground">{result.durationMs} ms</span>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-3 text-xs leading-5">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
