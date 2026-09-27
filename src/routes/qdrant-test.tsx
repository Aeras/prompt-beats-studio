import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  getQdrantMusicMemoryStatus,
  initializeQdrantMusicMemory,
} from "@/lib/qdrant-music-memory.functions";
import { getSongAnalyzerAccess } from "@/lib/song-analyzer.functions";

export const Route = createFileRoute("/qdrant-test")({
  head: () => ({
    meta: [
      { title: "Qdrant Music Memory Test — PromptBeats" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: QdrantTestPage,
});

function QdrantTestPage() {
  const { user, loading } = useAuth();
  const access = useQuery({
    queryKey: ["song-analyzer-access", user?.id],
    queryFn: () => getSongAnalyzerAccess(),
    enabled: Boolean(user),
    retry: false,
  });
  const status = useQuery({
    queryKey: ["qdrant-music-memory-status", user?.id],
    queryFn: () => getQdrantMusicMemoryStatus(),
    enabled: Boolean(user && access.data?.allowed),
    retry: false,
  });
  const [initializing, setInitializing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const header = (
    <div className="flex items-center gap-2">
      <Database className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">Qdrant Music Memory Test</span>
      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
        Admin
      </span>
    </div>
  );

  if (loading || access.isLoading) {
    return (
      <AppShell header={header}>
        <main className="p-8 text-sm text-muted-foreground">Checking access…</main>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
          <Link to="/auth" className="mt-4 inline-flex rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold">
            Sign in
          </Link>
        </main>
      </AppShell>
    );
  }

  if (access.isError || !access.data?.allowed) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-xl p-8">
          <div className="glass rounded-2xl border border-red-400/20 p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-red-300" />
            <h1 className="mt-3 font-display text-lg font-bold">Admin access required</h1>
          </div>
        </main>
      </AppShell>
    );
  }

  const data = status.data;
  const statusLabel = status.isLoading
    ? "Checking…"
    : data?.reachable
      ? "Connected"
      : data?.configured
        ? "Connection failed"
        : "Not configured";

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-2xl px-4 py-8 md:px-8">
        <div className="glass rounded-2xl p-6">
          <h1 className="font-display text-xl font-bold">Qdrant connection</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Internal proof-of-concept diagnostic. The API key is used only on the server and is never returned to this page.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="Configuration" value={data?.configured ? "Secrets detected" : "Missing secrets"} />
            <Info label="Connection" value={statusLabel} />
            <Info label="Collection" value={data?.collectionName ?? "promptbeats_music_memory_v1"} />
            <Info
              label="Collection status"
              value={data?.collectionExists ? "Ready" : data?.reachable ? "Not initialized" : "Unavailable"}
            />
            <Info
              label="Reference tracks"
              value={data?.pointCount == null ? "—" : data.pointCount.toLocaleString()}
            />
            <Info
              label="Embedding contract"
              value={data?.embeddingContract ?? "promptbeats-mert95-similarity-v1"}
            />
          </div>

          {data?.error && <p className="mt-4 text-sm text-red-300">{data.error}</p>}
          {actionError && <p className="mt-4 text-sm text-red-300">{actionError}</p>}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void status.refetch()}
              disabled={status.isFetching}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {status.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Check connection
            </button>

            <button
              type="button"
              disabled={!data?.reachable || data.collectionExists || initializing}
              onClick={async () => {
                setInitializing(true);
                setActionError(null);
                try {
                  await initializeQdrantMusicMemory();
                  await status.refetch();
                } catch (error) {
                  setActionError(error instanceof Error ? error.message : "Could not initialize collection.");
                } finally {
                  setInitializing(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {initializing && <Loader2 className="h-4 w-4 animate-spin" />}
              Initialize MERT collection
            </button>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Initialization creates only one experimental collection using 768-dimensional cosine vectors. It does not modify Supabase or enable vector retrieval in the Analyzer yet.
          </p>
        </div>
      </main>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}
