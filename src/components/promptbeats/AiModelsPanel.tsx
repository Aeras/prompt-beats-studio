import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Cpu, DollarSign, Pencil, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import {
  getAdminAiModels,
  setAdminAiModelDefault,
  updateAdminAiModel,
  type AdminAiModel,
} from "@/lib/ai-model-admin.functions";
import { cn } from "@/lib/utils";

type Reasoning = AdminAiModel["generatorReasoningEffort"];

const toNullableNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

function badgeClass(kind: string) {
  if (kind === "enabled" || kind === "all_users" || kind === "verified") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (kind === "testing" || kind === "selected_users" || kind === "outdated") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  if (kind === "disabled" || kind === "deprecated" || kind === "archived") return "border-red-400/20 bg-red-400/10 text-red-200";
  return "border-white/10 bg-white/5 text-muted-foreground";
}

function Pill({ children, kind }: { children: ReactNode; kind: string }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-1 text-[11px]", badgeClass(kind))}>{children}</span>;
}

function AiModelEditor({ model, generatorDefault, qualityDefault, onClose }: {
  model: AdminAiModel;
  generatorDefault: string | null;
  qualityDefault: string | null;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(model.displayName);
  const [status, setStatus] = useState(model.status);
  const [accessPolicy, setAccessPolicy] = useState(model.accessPolicy);
  const [generatorEnabled, setGeneratorEnabled] = useState(model.generatorEnabled);
  const [qualityEnabled, setQualityEnabled] = useState(model.qualityCheckEnabled);
  const [generatorReasoning, setGeneratorReasoning] = useState<Reasoning>(model.generatorReasoningEffort);
  const [qualityReasoning, setQualityReasoning] = useState<Reasoning>(model.qualityCheckReasoningEffort);
  const [inputPrice, setInputPrice] = useState(model.inputPricePerMillion?.toString() ?? "");
  const [outputPrice, setOutputPrice] = useState(model.outputPricePerMillion?.toString() ?? "");
  const [cachedInputPrice, setCachedInputPrice] = useState(model.cachedInputPricePerMillion?.toString() ?? "");
  const [cacheWritePrice, setCacheWritePrice] = useState(model.cacheWritePricePerMillion?.toString() ?? "");
  const [pricingStatus, setPricingStatus] = useState(model.pricingStatus);
  const [notes, setNotes] = useState(model.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const parsedInputPrice = toNullableNumber(inputPrice);
      const parsedOutputPrice = toNullableNumber(outputPrice);
      if (pricingStatus === "verified" && (parsedInputPrice == null || parsedOutputPrice == null)) {
        throw new Error(t("aiModels.verifiedPricingRequired"));
      }
      return updateAdminAiModel({ data: {
      id: model.id,
      displayName,
      status,
      accessPolicy,
      generatorEnabled,
      qualityCheckEnabled: qualityEnabled,
      generatorReasoningEffort: generatorReasoning,
      qualityCheckReasoningEffort: qualityReasoning,
      inputPricePerMillion: parsedInputPrice,
      outputPricePerMillion: parsedOutputPrice,
      cachedInputPricePerMillion: toNullableNumber(cachedInputPrice),
      cacheWritePricePerMillion: toNullableNumber(cacheWritePrice),
      pricingStatus,
      notes: notes.trim() || null,
    } });
    },
    onSuccess: () => {
      toast.success(t("aiModels.saved"));
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("aiModels.saveError")),
  });

  const isGeneratorDefault = generatorDefault === model.providerModelId;
  const isQualityDefault = qualityDefault === model.providerModelId;
  const defaultRisk = (isGeneratorDefault && (!generatorEnabled || status !== "enabled")) ||
    (isQualityDefault && (!qualityEnabled || status !== "enabled"));

  const reasoningOptions: Array<[Reasoning, string]> = [
    [null, t("aiModels.providerDefault")],
    ["none", t("aiModels.none")],
    ["low", t("aiModels.low")],
    ["medium", t("aiModels.medium")],
    ["high", t("aiModels.high")],
    ["xhigh", t("aiModels.xhigh")],
    ["max", t("aiModels.max")],
  ];

  const date = model.pricingUpdatedAt
    ? new Date(model.pricingUpdatedAt).toLocaleString(language === "el" ? "el-GR" : "en-US")
    : "—";

  return <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-3 pt-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
    <div className="glass-strong flex h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 sm:h-auto sm:max-h-[92vh]">
      <div className="shrink-0 p-5 pb-0">
        <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-display text-xl font-bold">{t("aiModels.editTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{model.provider} · {model.providerModelId}</p></div>
        <button onClick={onClose} aria-label={t("aiModels.close")} className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      {defaultRisk && <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{t("aiModels.defaultProtection")}</div>}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">{t("aiModels.displayName")}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground" /></label>
        <label className="text-xs text-muted-foreground">{t("aiModels.modelId")}<input value={model.providerModelId} disabled className="mt-1 w-full rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-muted-foreground" /></label>

        <label className="text-xs text-muted-foreground">{t("aiModels.lifecycleStatus")}<select value={status} onChange={(e) => setStatus(e.target.value as AdminAiModel["status"])} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground"><option value="testing">{t("aiModels.testing")}</option><option value="enabled">{t("aiModels.enabled")}</option><option value="disabled">{t("aiModels.disabled")}</option><option value="deprecated">{t("aiModels.deprecated")}</option><option value="archived">{t("aiModels.archived")}</option></select></label>
        <label className="text-xs text-muted-foreground">{t("aiModels.accessPolicy")}<select value={accessPolicy} onChange={(e) => setAccessPolicy(e.target.value as AdminAiModel["accessPolicy"])} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground"><option value="admin_only">{t("aiModels.adminOnly")}</option><option value="selected_users">{t("aiModels.selectedUsers")}</option><option value="all_users">{t("aiModels.allUsers")}</option></select></label>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 text-sm"><input type="checkbox" checked={generatorEnabled} disabled={!model.generatorCompatible} onChange={(e) => setGeneratorEnabled(e.target.checked)} />{t("aiModels.useGenerator")}</label>
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 text-sm"><input type="checkbox" checked={qualityEnabled} disabled={!model.qualityCheckCompatible} onChange={(e) => setQualityEnabled(e.target.checked)} />{t("aiModels.useQualityCheck")}</label>

        <label className="text-xs text-muted-foreground">{t("aiModels.generatorReasoning")}<select value={generatorReasoning ?? ""} onChange={(e) => setGeneratorReasoning((e.target.value || null) as Reasoning)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground">{reasoningOptions.map(([value,label]) => <option key={value ?? "default"} value={value ?? ""}>{label}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">{t("aiModels.qualityReasoning")}<select value={qualityReasoning ?? ""} onChange={(e) => setQualityReasoning((e.target.value || null) as Reasoning)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground">{reasoningOptions.map(([value,label]) => <option key={value ?? "default"} value={value ?? ""}>{label}</option>)}</select></label>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-4">
        <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold">{t("aiModels.pricing")}</h3></div>
        <p className="mt-1 text-xs text-muted-foreground">{t("aiModels.manualPricingHint")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">{t("aiModels.inputPrice")}<input inputMode="decimal" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs text-muted-foreground">{t("aiModels.outputPrice")}<input inputMode="decimal" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs text-muted-foreground">{t("aiModels.cachedInputPrice")}<input inputMode="decimal" value={cachedInputPrice} onChange={(e) => setCachedInputPrice(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs text-muted-foreground">{t("aiModels.cacheWritePrice")}<input inputMode="decimal" value={cacheWritePrice} onChange={(e) => setCacheWritePrice(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs text-muted-foreground">{t("aiModels.pricingStatus")}<select value={pricingStatus} onChange={(e) => setPricingStatus(e.target.value as AdminAiModel["pricingStatus"])} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground"><option value="verified">{t("aiModels.verified")}</option><option value="unknown">{t("aiModels.unknown")}</option><option value="outdated">{t("aiModels.outdated")}</option></select></label>
          <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-muted-foreground">{t("aiModels.pricingUpdated")}</p><p className="mt-1 text-sm">{date}</p></div>
        </div>
      </div>

      <label className="mt-4 block text-xs text-muted-foreground">{t("aiModels.notes")}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="mt-1 min-h-24 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground" /></label>

      </div>

      <div className="shrink-0 border-t border-white/10 bg-background/95 p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:bg-transparent sm:pb-5 sm:backdrop-blur-none">
        <div className="flex flex-wrap gap-3">
          <button disabled={mutation.isPending || defaultRisk} onClick={() => mutation.mutate()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? t("aiModels.saving") : t("aiModels.save")}</button>
          <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">{t("aiModels.close")}</button>
        </div>
      </div>
    </div>
  </div>;
}

export function AiModelsPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ai-models"],
    queryFn: () => getAdminAiModels(),
    staleTime: 15_000,
  });
  const [generatorDefault, setGeneratorDefault] = useState("");
  const [qualityDefault, setQualityDefault] = useState("");
  const [editing, setEditing] = useState<AdminAiModel | null>(null);

  useEffect(() => {
    if (!data) return;
    setGeneratorDefault(data.generatorDefault ?? "");
    setQualityDefault(data.qualityDefault ?? "");
  }, [data]);

  const setDefault = useMutation({
    mutationFn: (input: { operation: "generator" | "quality_check"; model: string }) =>
      setAdminAiModelDefault({ data: input as any }),
    onSuccess: () => {
      toast.success(t("aiModels.defaultSaved"));
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("aiModels.defaultSaveError")),
  });

  const generatorOptions = useMemo(() => data?.models.filter((m) => m.status === "enabled" && m.generatorCompatible && m.generatorEnabled) ?? [], [data]);
  const qualityOptions = useMemo(() => data?.models.filter((m) => m.status === "enabled" && m.qualityCheckCompatible && m.qualityCheckEnabled) ?? [], [data]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("aiModels.loading")}</p>;
  if (error || !data) return <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("aiModels.loadError")}</div>;

  const statusLabel = (value: AdminAiModel["status"]) => {
    if (value === "enabled") return t("aiModels.enabled");
    if (value === "disabled") return t("aiModels.disabled");
    if (value === "testing") return t("aiModels.testing");
    if (value === "deprecated") return t("aiModels.deprecated");
    return t("aiModels.archived");
  };
  const accessLabel = (value: AdminAiModel["accessPolicy"]) => value === "admin_only" ? t("aiModels.adminOnly") : value === "selected_users" ? t("aiModels.selectedUsers") : t("aiModels.allUsers");
  const pricingLabel = (value: AdminAiModel["pricingStatus"]) => value === "verified" ? t("aiModels.verified") : value === "outdated" ? t("aiModels.outdated") : t("aiModels.unknown");

  return <div className="space-y-5">
    <div><h2 className="font-display text-xl font-bold">{t("aiModels.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("aiModels.subtitle")}</p></div>

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="glass rounded-2xl p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-primary" />{t("aiModels.generatorDefault")}</div><div className="mt-3 flex gap-2"><select value={generatorDefault} onChange={(e) => setGeneratorDefault(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm">{generatorOptions.map((m) => <option key={m.id} value={m.providerModelId}>{m.displayName}</option>)}</select><button disabled={!generatorDefault || setDefault.isPending} onClick={() => setDefault.mutate({ operation: "generator", model: generatorDefault })} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{t("aiModels.saveDefault")}</button></div></div>
      <div className="glass rounded-2xl p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />{t("aiModels.qualityDefault")}</div><div className="mt-3 flex gap-2"><select value={qualityDefault} onChange={(e) => setQualityDefault(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm">{qualityOptions.map((m) => <option key={m.id} value={m.providerModelId}>{m.displayName}</option>)}</select><button disabled={!qualityDefault || setDefault.isPending} onClick={() => setDefault.mutate({ operation: "quality_check", model: qualityDefault })} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{t("aiModels.saveDefault")}</button></div></div>
    </div>

    <div className="glass overflow-hidden rounded-2xl">
      <div className="border-b border-white/10 px-4 py-3"><h3 className="font-display text-sm font-semibold">{t("aiModels.installed")}</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="px-4 py-3">{t("aiModels.model")}</th><th className="px-4 py-3">{t("aiModels.provider")}</th><th className="px-4 py-3">{t("aiModels.generator")}</th><th className="px-4 py-3">{t("aiModels.qualityCheck")}</th><th className="px-4 py-3">{t("aiModels.status")}</th><th className="px-4 py-3">{t("aiModels.access")}</th><th className="px-4 py-3">{t("aiModels.pricing")}</th><th className="px-4 py-3">{t("aiModels.actions")}</th></tr></thead>
          <tbody>
            {data.models.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-muted-foreground">{t("aiModels.noModels")}</td></tr>}
            {data.models.map((model) => <tr key={model.id} className="border-t border-white/5 align-top">
              <td className="px-4 py-3"><div className="font-medium">{model.displayName}</div><div className="mt-1 text-xs text-muted-foreground">{model.providerModelId}</div><div className="mt-2 flex flex-wrap gap-1">{data.generatorDefault === model.providerModelId && <Pill kind="enabled">{t("aiModels.generator")} · {t("aiModels.defaultBadge")}</Pill>}{data.qualityDefault === model.providerModelId && <Pill kind="enabled">{t("aiModels.qualityCheck")} · {t("aiModels.defaultBadge")}</Pill>}{model.preview && <Pill kind="testing">{t("aiModels.preview")}</Pill>}</div></td>
              <td className="px-4 py-3 capitalize">{model.provider}</td>
              <td className="px-4 py-3">{model.generatorCompatible && model.generatorEnabled ? <Check className="h-4 w-4 text-emerald-300" /> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3">{model.qualityCheckCompatible && model.qualityCheckEnabled ? <Check className="h-4 w-4 text-emerald-300" /> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3"><Pill kind={model.status}>{statusLabel(model.status)}</Pill></td>
              <td className="px-4 py-3"><Pill kind={model.accessPolicy}>{accessLabel(model.accessPolicy)}</Pill></td>
              <td className="px-4 py-3"><Pill kind={model.pricingStatus}>{pricingLabel(model.pricingStatus)}</Pill>{model.pricingStatus === "verified" && <div className="mt-1 text-xs text-muted-foreground"><span>$</span>{model.inputPricePerMillion ?? "—"} {t("aiModels.inputShort")} · <span>$</span>{model.outputPricePerMillion ?? "—"} {t("aiModels.outputShort")}</div>}</td>
              <td className="px-4 py-3"><button onClick={() => setEditing(model)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs hover:border-primary/40 hover:text-primary"><Pencil className="h-3.5 w-3.5" />{t("aiModels.edit")}</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>

    {editing && <AiModelEditor model={editing} generatorDefault={data.generatorDefault} qualityDefault={data.qualityDefault} onClose={() => setEditing(null)} />}
  </div>;
}
