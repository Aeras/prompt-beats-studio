import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { promptRegistryCopy } from "@/i18n/prompt-registry";
import {
  decodePromptImport,
  PROMPT_MAX_BYTES,
  type PromptCatalogItem,
} from "@/lib/prompt-registry.shared";
import {
  importGeneratorPrompt,
  listGeneratorPrompts,
  mutateGeneratorPrompt,
  readGeneratorPrompt,
} from "@/lib/prompt-registry.functions";
import { toast } from "sonner";

const button =
  "rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";
export function PromptRegistryPanel() {
  const { language } = useI18n();
  const c = promptRegistryCopy[language];
  const { user } = useAuth();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [fileData, setFileData] = useState<{ filename: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    item: PromptCatalogItem;
    action: "default" | "archive" | "restore" | "delete";
    expectedDefault: string;
  } | null>(null);
  const catalog = useQuery({
    queryKey: ["generator-prompt-catalog", user?.id],
    queryFn: () => listGeneratorPrompts(),
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["generator-prompt-catalog"] });
  };
  const change = useMutation({
    mutationFn: async () => {
      if (!pending) return;
      await mutateGeneratorPrompt({
        data: {
          id: pending.item.id,
          action: pending.action,
          expectedDefault: pending.expectedDefault,
        },
      });
    },
    onSuccess: async () => {
      setPending(null);
      await refresh();
      toast.success(c.saved);
    },
    onError: () => toast.error(c.failed),
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!fileData) throw new Error(c.invalid);
      await importGeneratorPrompt({ data: { label, ...fileData } });
    },
    onSuccess: async () => {
      setFileData(null);
      setLabel("");
      await refresh();
      toast.success(c.saved);
    },
    onError: () => toast.error(c.failed),
  });
  const view = useMutation({
    mutationFn: async ({ id, download }: { id: string; download: boolean }) => {
      const result = await readGeneratorPrompt({ data: { id } });
      if (result.content === null) {
        setPreview(c.legacy);
        return;
      }
      if (!download) {
        setPreview(result.content);
        return;
      }
      const url = URL.createObjectURL(
        new Blob([result.content], { type: "text/plain;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "prompt-template.md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: () => toast.error(c.failed),
  });
  const current = catalog.data?.find((p) => p.is_default);
  return (
    <section data-testid="prompt-registry" className="glass min-w-0 space-y-4 rounded-2xl p-4">
      <h2 className="font-display text-lg font-bold">{c.title}</h2>
      <p className="text-sm text-muted-foreground">{c.intro}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {c.label}
          <input
            value={label}
            maxLength={160}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background p-3"
          />
        </label>
        <label className="text-sm">
          {c.file}
          <input
            type="file"
            accept=".txt,.md"
            className="mt-1 block w-full min-w-0 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-primary/15 file:p-2 file:text-foreground"
            onChange={async (e) => {
              setFileData(null);
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > PROMPT_MAX_BYTES) throw new Error();
                const bytes = new Uint8Array(await file.arrayBuffer());
                const decoded = decodePromptImport(file.name, bytes);
                setFileData({
                  filename: file.name,
                  base64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")),
                });
                setPreview(decoded);
              } catch {
                toast.error(c.invalid);
              }
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{c.candidate}</p>
      <button
        className={button}
        disabled={!fileData || label.trim().length < 3 || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {c.import}
      </button>
      {catalog.isLoading && <p role="status">{c.loading}</p>}
      {catalog.isError && <p role="alert">{c.failed}</p>}
      {pending && (
        <div
          role="alertdialog"
          aria-label={c.confirm}
          className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p>{c.confirm}</p>
          <p className="break-words font-semibold">{pending.item.label}</p>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={change.isPending} onClick={() => change.mutate()}>
              {c.confirmAction}
            </button>
            <button className={button} disabled={change.isPending} onClick={() => setPending(null)}>
              {c.cancel}
            </button>
          </div>
        </div>
      )}
      {preview !== null && (
        <div className="space-y-2">
          <label htmlFor="prompt-source">{c.source}</label>
          <textarea
            id="prompt-source"
            readOnly
            value={preview}
            className="h-72 w-full resize-y rounded-xl border border-input bg-background p-3 font-mono text-xs"
          />
          <button className={button} onClick={() => setPreview(null)}>
            {c.close}
          </button>
        </div>
      )}
      <div className="space-y-3">
        {catalog.data?.map((item) => (
          <article
            key={item.id}
            className="min-w-0 space-y-2 rounded-xl border border-border bg-background/50 p-3"
          >
            <h3 className="break-words font-semibold">{item.label}</h3>
            <p className="text-xs text-primary">
              {item.is_default
                ? c.default
                : item.status === "archived"
                  ? c.archived
                  : c.experimental}{" "}
              · {item.family}
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">{item.digest}</p>
            <time className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString(language === "el" ? "el-GR" : "en-US")}
            </time>
            {item.ever_used && <p className="text-xs text-muted-foreground">{c.retained}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                className={button}
                disabled={view.isPending}
                onClick={() => view.mutate({ id: item.id, download: false })}
              >
                {c.preview}
              </button>
              <button
                className={button}
                disabled={view.isPending || item.family === "legacy"}
                onClick={() => view.mutate({ id: item.id, download: true })}
              >
                {c.download}
              </button>
              {(
                ["default", item.status === "archived" ? "restore" : "archive", "delete"] as const
              ).map((action) => (
                <button
                  key={action}
                  className={button}
                  disabled={
                    !current ||
                    change.isPending ||
                    item.is_default ||
                    (action === "default" && item.status === "archived") ||
                    (action === "delete" && (item.ever_used || item.family === "legacy"))
                  }
                  onClick={() =>
                    current && setPending({ item, action, expectedDefault: current.id })
                  }
                >
                  {action === "default"
                    ? c.activate
                    : action === "archive"
                      ? c.archive
                      : action === "restore"
                        ? c.restore
                        : c.remove}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
