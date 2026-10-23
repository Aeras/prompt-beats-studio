import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Check,
  Cpu,
  DollarSign,
  HeartPulse,
  Pencil,
  PlugZap,
  RefreshCw,
  SearchCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import {
  addDiscoveredAiModel,
  checkAiProviderModels,
  getAdminAiModels,
  getDetectedAiProviders,
  recheckAdminAiModelHealth,
  recheckAdminAiProviderHealth,
  runAiProviderCompatibilityTests,
  setAdminAiModelDefault,
  updateAdminAiModel,
  verifyInstalledAiModelCompatibility,
  type AdminAiModel,
} from "@/lib/ai-model-admin.functions";
import {
  checkAdminAiModelData,
  checkAllAdminAiModelsForUpdates,
  saveAdminAiModelVerificationSource,
} from "@/lib/ai-model-refresh.functions";
import {
  addMusicAnalyzerModel,
  checkMusicAnalyzerProviderModels,
  getMusicAnalyzerAdminModels,
  setInstalledAnalyzerV2Enabled,
  verifyInstalledAnalyzerV2,
} from "@/lib/music-analyzer-admin.functions";
import { cn } from "@/lib/utils";

type Reasoning = AdminAiModel["generatorReasoningEffort"];
type CheckResult = Awaited<ReturnType<typeof checkAdminAiModelData>>;
type BulkResult = Awaited<ReturnType<typeof checkAllAdminAiModelsForUpdates>>;

const toNullableNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

function badgeClass(kind: string) {
  if (["enabled", "all_users", "verified", "healthy", "up_to_date"].includes(kind))
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (["testing", "selected_users", "outdated", "partial", "newer", "degraded"].includes(kind))
    return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  if (["disabled", "deprecated", "archived", "failing", "unavailable"].includes(kind))
    return "border-red-400/20 bg-red-400/10 text-red-200";
  return "border-white/10 bg-white/5 text-muted-foreground";
}

function Pill({ children, kind }: { children: ReactNode; kind: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-1 text-[11px]", badgeClass(kind))}>
      {children}
    </span>
  );
}

function successorFamily(provider: string, id: string) {
  const value = id.toLowerCase().replace(/-(preview|latest)$/g, "");
  if (provider === "openai") {
    const match = value.match(/^gpt-[0-9.]+-(luna|terra|sol|astra)(?:-|$)/);
    return match ? `gpt:${match[1]}` : null;
  }
  if (provider === "anthropic") {
    const match = value.match(/^claude-(sonnet|opus|fable|haiku)-/);
    return match ? `claude:${match[1]}` : null;
  }
  if (provider === "gemini") {
    const match = value.match(/^gemini-[0-9.]+-(flash(?:-lite)?|pro|argon)(?:-|$)/);
    return match ? `gemini:${match[1]}` : null;
  }
  if (provider === "xai") return value.startsWith("grok-") ? "grok" : null;
  return null;
}

function versionVector(id: string) {
  return (id.match(/\d+(?:\.\d+)?/g) ?? []).flatMap((part) => part.split(".").map(Number));
}

function compareVersion(a: string, b: string) {
  const av = versionVector(a);
  const bv = versionVector(b);
  const n = Math.max(av.length, bv.length);
  for (let i = 0; i < n; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function AiModelEditor({
  model,
  generatorDefault,
  qualityDefault,
  aiToolsDefault,
  onClose,
}: {
  model: AdminAiModel;
  generatorDefault: string | null;
  qualityDefault: string | null;
  aiToolsDefault: string | null;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const qc = useQueryClient();
  const el = language === "el";
  const [displayName, setDisplayName] = useState(model.displayName);
  const [status, setStatus] = useState(model.status);
  const [accessPolicy, setAccessPolicy] = useState(model.accessPolicy);
  const [generatorEnabled, setGeneratorEnabled] = useState(model.generatorEnabled);
  const [qualityEnabled, setQualityEnabled] = useState(model.qualityCheckEnabled);
  const [generatorReasoning, setGeneratorReasoning] = useState<Reasoning>(
    model.generatorReasoningEffort,
  );
  const [qualityReasoning, setQualityReasoning] = useState<Reasoning>(
    model.qualityCheckReasoningEffort,
  );
  const [inputPrice, setInputPrice] = useState(model.inputPricePerMillion?.toString() ?? "");
  const [outputPrice, setOutputPrice] = useState(model.outputPricePerMillion?.toString() ?? "");
  const [cachedInputPrice, setCachedInputPrice] = useState(
    model.cachedInputPricePerMillion?.toString() ?? "",
  );
  const [cacheWritePrice, setCacheWritePrice] = useState(
    model.cacheWritePricePerMillion?.toString() ?? "",
  );
  const [pricingStatus, setPricingStatus] = useState(model.pricingStatus);
  const [notes, setNotes] = useState(model.notes ?? "");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  const checkModel = useMutation({
    mutationFn: () => checkAdminAiModelData({ data: { id: model.id } }),
    onSuccess: (result) => {
      setCheckResult(result);
      if (result.discoveredName) setDisplayName(result.discoveredName);
      if (result.deprecated) setStatus("deprecated");
      if (result.pricing.status === "verified") {
        const p = result.pricing;
        if (p.inputPricePerMillion != null) setInputPrice(String(p.inputPricePerMillion));
        if (p.outputPricePerMillion != null) setOutputPrice(String(p.outputPricePerMillion));
        setCachedInputPrice(
          p.cachedInputPricePerMillion == null ? "" : String(p.cachedInputPricePerMillion),
        );
        setCacheWritePrice(
          p.cacheWritePricePerMillion == null ? "" : String(p.cacheWritePricePerMillion),
        );
        setPricingStatus("verified");
      }
      toast.success(
        el
          ? "Ο έλεγχος ολοκληρώθηκε. Ελέγξτε τις προτεινόμενες αλλαγές."
          : "Check complete. Review the proposed changes.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : el ? "Ο έλεγχος απέτυχε." : "Check failed",
      ),
  });

  const verifyCompatibility = useMutation({
    mutationFn: () => verifyInstalledAiModelCompatibility({ data: { id: model.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
      toast.success(
        el
          ? "Η επαλήθευση ολοκληρώθηκε. Ενεργοποιήστε όποια λειτουργία πέρασε τον έλεγχο."
          : "Verification finished. Enable the features that passed.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Compatibility verification failed"),
  });

  const generatorCompatible =
    model.generatorCompatible || verifyCompatibility.data?.generatorCompatible === true;
  const qualityCompatible =
    model.qualityCheckCompatible || verifyCompatibility.data?.qualityCheckCompatible === true;

  const mutation = useMutation({
    mutationFn: async () => {
      const parsedInput = toNullableNumber(inputPrice);
      const parsedOutput = toNullableNumber(outputPrice);
      if (pricingStatus === "verified" && (parsedInput == null || parsedOutput == null))
        throw new Error(t("aiModels.verifiedPricingRequired"));

      await updateAdminAiModel({
        data: {
          id: model.id,
          displayName,
          status,
          accessPolicy,
          generatorEnabled,
          qualityCheckEnabled: qualityEnabled,
          generatorReasoningEffort: generatorReasoning,
          qualityCheckReasoningEffort: qualityReasoning,
          inputPricePerMillion: parsedInput,
          outputPricePerMillion: parsedOutput,
          cachedInputPricePerMillion: toNullableNumber(cachedInputPrice),
          cacheWritePricePerMillion: toNullableNumber(cacheWritePrice),
          pricingStatus,
          notes: notes.trim() || null,
        },
      });

      if (checkResult) {
        await saveAdminAiModelVerificationSource({
          data: {
            id: model.id,
            pricingSource:
              checkResult.pricing.source === "unverified"
                ? "unverified"
                : checkResult.pricing.source,
            pricingSourceUrl: checkResult.pricing.sourceUrl,
            pricingCheckedAt: checkResult.pricing.checkedAt,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(t("aiModels.saved"));
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("aiModels.saveError")),
  });

  const isGeneratorDefault = generatorDefault === model.providerModelId;
  const isQualityDefault = qualityDefault === model.providerModelId;
  const isAiToolsDefault = aiToolsDefault === model.providerModelId;
  const defaultRisk =
    (isGeneratorDefault && (!generatorEnabled || status !== "enabled")) ||
    (isQualityDefault && (!qualityEnabled || status !== "enabled")) ||
    (isAiToolsDefault && (!generatorEnabled || status !== "enabled"));

  const reasoningOptions: Array<[Reasoning, string]> = [
    [null, t("aiModels.providerDefault")],
    ["none", t("aiModels.none")],
    ["low", t("aiModels.low")],
    ["medium", t("aiModels.medium")],
    ["high", t("aiModels.high")],
    ["xhigh", t("aiModels.xhigh")],
    ["max", t("aiModels.max")],
  ];

  const field =
    "mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground";
  const select =
    "mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm text-foreground";

  const pricingStateLabel = (value: string) => {
    if (value === "verified") return t("aiModels.verified");
    if (value === "partial") return el ? "Μερικώς επιβεβαιωμένο" : "Partially verified";
    return t("aiModels.unknown");
  };

  const sourceLabel = (value: string) => {
    if (value === "official_docs") return el ? "Επίσημη τεκμηρίωση" : "Official documentation";
    if (value === "provider_metadata") return el ? "Metadata provider" : "Provider metadata";
    if (value === "verified_catalog")
      return el ? "Επαληθευμένο catalog PromptBeats" : "PromptBeats verified catalog";
    return el ? "Μη επιβεβαιωμένο" : "Unverified";
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-3 pt-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
      <div className="glass-strong flex h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 sm:h-auto sm:max-h-[92vh]">
        <div className="shrink-0 p-5 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold">{t("aiModels.editTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {model.provider} · {model.providerModelId}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label={t("aiModels.close")}
              className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {defaultRisk && (
            <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              {t("aiModels.defaultProtection")}
            </div>
          )}

          <div className="mb-5 rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {el ? "Επαλήθευση συμβατότητας" : "Compatibility verification"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {el
                    ? "Δοκιμάζει ξεχωριστά Generator και Quality Check με μικρές κλήσεις στον πραγματικό πάροχο. Μπορεί να υπάρξει μικρή χρέωση. Δεν ενεργοποιεί αυτόματα το μοντέλο."
                    : "Tests Generator and Quality Check separately with small real-provider calls. Small charges may apply. Does not enable the model automatically."}
                </p>
              </div>
              <button
                type="button"
                disabled={verifyCompatibility.isPending || mutation.isPending}
                onClick={() => verifyCompatibility.mutate()}
                className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
              >
                <SearchCheck className={cn("h-4 w-4", verifyCompatibility.isPending && "animate-pulse")} />
                {verifyCompatibility.isPending
                  ? el
                    ? "Επαλήθευση…"
                    : "Verifying…"
                  : el
                    ? "Επαλήθευση"
                    : "Verify"}
              </button>
            </div>
            {verifyCompatibility.data && (
              <div className="mt-3 space-y-1 text-xs">
                <p>
                  {el ? "Generator:" : "Generator:"}{" "}
                  {verifyCompatibility.data.generatorCompatible
                    ? el
                      ? "Επαληθεύτηκε"
                      : "Verified"
                    : el
                      ? "Δεν επαληθεύτηκε"
                      : "Not verified"}
                </p>
                <p>
                  Quality Check:{" "}
                  {verifyCompatibility.data.qualityCheckCompatible
                    ? el
                      ? "Επαληθεύτηκε"
                      : "Verified"
                    : el
                      ? "Δεν επαληθεύτηκε"
                      : "Not verified"}
                </p>
                {verifyCompatibility.data.generatorError && (
                  <p className="text-amber-200">
                    Generator: {verifyCompatibility.data.generatorError}
                  </p>
                )}
                {verifyCompatibility.data.qualityCheckError && (
                  <p className="text-amber-200">
                    Quality Check: {verifyCompatibility.data.qualityCheckError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-sm font-semibold">
                  {el ? "Έλεγχος & αυτόματη συμπλήρωση" : "Check & Fill"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {el
                    ? "Ελέγχει availability, metadata και pricing από επίσημες πηγές. Δεν αποθηκεύει τίποτα μέχρι να πατήσετε Αποθήκευση."
                    : "Checks availability, metadata and pricing from official sources. Nothing is saved until you press Save."}
                </p>
              </div>
              <button
                disabled={checkModel.isPending}
                onClick={() => checkModel.mutate()}
                className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
              >
                <SearchCheck className={cn("h-4 w-4", checkModel.isPending && "animate-pulse")} />
                {checkModel.isPending
                  ? el
                    ? "Έλεγχος…"
                    : "Checking…"
                  : el
                    ? "Έλεγχος & συμπλήρωση"
                    : "Check & Fill"}
              </button>
            </div>

            {checkResult && (
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Pill kind={checkResult.available ? "enabled" : "unavailable"}>
                    {checkResult.available
                      ? el
                        ? "Διαθέσιμο"
                        : "Available"
                      : el
                        ? "Δεν βρέθηκε"
                        : "Unavailable"}
                  </Pill>
                  <Pill kind={checkResult.pricing.status === "verified" ? "verified" : "unknown"}>
                    {el ? "Τιμολόγηση" : "Pricing"}: {pricingStateLabel(checkResult.pricing.status)}
                  </Pill>
                  {checkResult.contextWindow != null && (
                    <Pill kind="unknown">
                      Context: {checkResult.contextWindow.toLocaleString()}
                    </Pill>
                  )}
                </div>
                <p className="text-muted-foreground break-words">
                  {el ? "Πηγή" : "Source"}: {sourceLabel(checkResult.pricing.source)}
                  {checkResult.pricing.sourceUrl ? ` · ${checkResult.pricing.sourceUrl}` : ""}
                </p>
                {checkResult.changes.length > 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <div className="font-semibold">
                      {el ? "Προτεινόμενες αλλαγές" : "Proposed changes"}
                    </div>
                    {checkResult.changes.map((change) => (
                      <div key={change.field} className="mt-1 text-muted-foreground">
                        {change.field}: {String(change.current ?? "—")} →{" "}
                        <span className="text-foreground">{String(change.suggested ?? "—")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    {el
                      ? "Δεν βρέθηκαν αλλαγές στα επαληθεύσιμα πεδία."
                      : "No changes found in verifiable fields."}
                  </p>
                )}
                {checkResult.likelySuccessors.length > 0 && (
                  <p className="text-amber-200">
                    {el ? "Πιθανή νεότερη έκδοση:" : "Likely newer version:"}{" "}
                    {checkResult.likelySuccessors.map((x) => x.id).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              {t("aiModels.displayName")}
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={field}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("aiModels.modelId")}
              <input value={model.providerModelId} disabled className={field} />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("aiModels.lifecycleStatus")}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AdminAiModel["status"])}
                className={select}
              >
                <option value="testing">{t("aiModels.testing")}</option>
                <option value="enabled">{t("aiModels.enabled")}</option>
                <option value="disabled">{t("aiModels.disabled")}</option>
                <option value="deprecated">{t("aiModels.deprecated")}</option>
                <option value="archived">{t("aiModels.archived")}</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              {t("aiModels.accessPolicy")}
              <select
                value={accessPolicy}
                onChange={(e) => setAccessPolicy(e.target.value as AdminAiModel["accessPolicy"])}
                className={select}
              >
                <option value="admin_only">{t("aiModels.adminOnly")}</option>
                <option value="selected_users">{t("aiModels.selectedUsers")}</option>
                <option value="all_users">{t("aiModels.allUsers")}</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 text-sm">
              <input
                type="checkbox"
                checked={generatorEnabled}
                disabled={!generatorCompatible}
                onChange={(e) => setGeneratorEnabled(e.target.checked)}
              />
              {t("aiModels.useGenerator")}
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 text-sm">
              <input
                type="checkbox"
                checked={qualityEnabled}
                disabled={!qualityCompatible}
                onChange={(e) => setQualityEnabled(e.target.checked)}
              />
              {t("aiModels.useQualityCheck")}
            </label>
            <label className="text-xs text-muted-foreground">
              {t("aiModels.generatorReasoning")}
              <select
                value={generatorReasoning ?? ""}
                onChange={(e) => setGeneratorReasoning((e.target.value || null) as Reasoning)}
                className={select}
              >
                {reasoningOptions.map(([value, label]) => (
                  <option key={value ?? "default"} value={value ?? ""}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              {t("aiModels.qualityReasoning")}
              <select
                value={qualityReasoning ?? ""}
                onChange={(e) => setQualityReasoning((e.target.value || null) as Reasoning)}
                className={select}
              >
                {reasoningOptions.map(([value, label]) => (
                  <option key={value ?? "default"} value={value ?? ""}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">{t("aiModels.pricing")}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {el
                ? "Οι τιμές μπορούν να συμπληρωθούν από API metadata, επίσημη τεκμηρίωση ή το επαληθευμένο catalog του PromptBeats."
                : "Prices can be filled from API metadata, official documentation, or the PromptBeats verified catalog."}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                {t("aiModels.inputPrice")}
                <input
                  inputMode="decimal"
                  value={inputPrice}
                  onChange={(e) => setInputPrice(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("aiModels.outputPrice")}
                <input
                  inputMode="decimal"
                  value={outputPrice}
                  onChange={(e) => setOutputPrice(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("aiModels.cachedInputPrice")}
                <input
                  inputMode="decimal"
                  value={cachedInputPrice}
                  onChange={(e) => setCachedInputPrice(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("aiModels.cacheWritePrice")}
                <input
                  inputMode="decimal"
                  value={cacheWritePrice}
                  onChange={(e) => setCacheWritePrice(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("aiModels.pricingStatus")}
                <select
                  value={pricingStatus}
                  onChange={(e) =>
                    setPricingStatus(e.target.value as AdminAiModel["pricingStatus"])
                  }
                  className={select}
                >
                  <option value="verified">{t("aiModels.verified")}</option>
                  <option value="unknown">{t("aiModels.unknown")}</option>
                  <option value="outdated">{t("aiModels.outdated")}</option>
                </select>
              </label>
              <div className="rounded-xl border border-white/10 p-3">
                <p className="text-xs text-muted-foreground">{t("aiModels.pricingUpdated")}</p>
                <p className="mt-1 text-sm">
                  {model.pricingUpdatedAt
                    ? new Date(model.pricingUpdatedAt).toLocaleString(
                        language === "el" ? "el-GR" : "en-US",
                      )
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          <label className="mt-4 block text-xs text-muted-foreground">
            {t("aiModels.notes")}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              className="mt-1 min-h-24 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:bg-transparent sm:p-5 sm:backdrop-blur-none">
          <div className="flex flex-wrap gap-3">
            <button
              disabled={mutation.isPending || defaultRisk}
              onClick={() => mutation.mutate()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {mutation.isPending ? t("aiModels.saving") : t("aiModels.save")}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {t("aiModels.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiModelsPanel() {
  const { t, language } = useI18n();
  const el = language === "el";
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ai-models"],
    queryFn: () => getAdminAiModels(),
    staleTime: 15_000,
  });
  const providersQuery = useQuery({
    queryKey: ["admin-ai-providers"],
    queryFn: () => getDetectedAiProviders(),
    staleTime: 30_000,
  });
  const musicAnalyzerModelsQuery = useQuery({
    queryKey: ["admin-music-analyzer-models"],
    queryFn: () => getMusicAnalyzerAdminModels(),
    staleTime: 15_000,
  });
  const [generatorDefault, setGeneratorDefault] = useState("");
  const [qualityDefault, setQualityDefault] = useState("");
  const [aiToolsDefault, setAiToolsDefault] = useState("");
  const [editing, setEditing] = useState<AdminAiModel | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [musicAnalyzerProvider, setMusicAnalyzerProvider] = useState("");
  const [addedModelIds, setAddedModelIds] = useState<Set<string>>(() => new Set());
  const [compatibilityProgress, setCompatibilityProgress] = useState({ completed: 0, total: 0 });
  const compatibilityCancelRef = useRef(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    const providers = providersQuery.data?.providers ?? [];
    if (!providers.length) setSelectedProvider("");
    else if (!providers.some((provider) => provider.id === selectedProvider))
      setSelectedProvider(providers[0]!.id);
  }, [providersQuery.data, selectedProvider]);

  useEffect(() => {
    const providers = providersQuery.data?.providers ?? [];
    if (!providers.length) setMusicAnalyzerProvider("");
    else if (!providers.some((provider) => provider.id === musicAnalyzerProvider))
      setMusicAnalyzerProvider(providers[0]!.id);
  }, [providersQuery.data, musicAnalyzerProvider]);

  useEffect(() => {
    if (!data) return;
    setGeneratorDefault(data.generatorDefault ?? "");
    setQualityDefault(data.qualityDefault ?? "");
    setAiToolsDefault(data.aiToolsDefault ?? "");
  }, [data]);

  const providerCheck = useMutation({
    mutationFn: (providerId: string) =>
      checkAiProviderModels({ data: { providerId: providerId as any } }),
    onSuccess: () => {
      compatibilityCancelRef.current = true;
      setCompatibilityProgress({ completed: 0, total: 0 });
      setAddedModelIds(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("aiModels.providerCheckError")),
  });

  const compatibilityTest = useMutation({
    mutationFn: async (input: { providerId: string; modelIds: string[] }) => {
      const results: any[] = [];
      let provider: any = null;
      compatibilityCancelRef.current = false;
      setCompatibilityProgress({ completed: 0, total: input.modelIds.length });
      for (let index = 0; index < input.modelIds.length; index += 10) {
        if (compatibilityCancelRef.current) break;
        const batch = input.modelIds.slice(index, index + 10);
        const response = await runAiProviderCompatibilityTests({
          data: { providerId: input.providerId, modelIds: batch } as any,
        });
        provider = response.provider;
        results.push(...response.results);
        setCompatibilityProgress({
          completed: Math.min(index + batch.length, input.modelIds.length),
          total: input.modelIds.length,
        });
      }
      return { provider, results, cancelled: compatibilityCancelRef.current };
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("aiModels.compatibilityError")),
  });

  const addModel = useMutation({
    mutationFn: (modelId: string) =>
      addDiscoveredAiModel({ data: { providerId: selectedProvider as any, modelId } }),
    onSuccess: (result) => {
      setAddedModelIds((current) => new Set(current).add(result.model));
      toast.success(t("aiModels.modelAdded"));
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("aiModels.addModelError")),
  });

  const musicAnalyzerProviderCheck = useMutation({
    mutationFn: (providerId: string) =>
      checkMusicAnalyzerProviderModels({ data: { providerId: providerId as any } }),
    onError: (e) =>
      toast.error(
        e instanceof Error
          ? e.message
          : el
            ? "Ο έλεγχος Music Analyzer απέτυχε."
            : "Music Analyzer discovery failed.",
      ),
  });

  const addMusicAnalyzer = useMutation({
    mutationFn: (modelId: string) =>
      addMusicAnalyzerModel({
        data: { providerId: musicAnalyzerProvider as any, modelId },
      }),
    onSuccess: () => {
      toast.success(
        el ? "Το μοντέλο προστέθηκε στο Music Analyzer." : "Model added to Music Analyzer.",
      );
      qc.invalidateQueries({ queryKey: ["admin-music-analyzer-models"] });
      qc.invalidateQueries({ queryKey: ["song-analyzer-access"], exact: false });
      musicAnalyzerProviderCheck.reset();
    },
    onError: (e) =>
      toast.error(
        e instanceof Error
          ? e.message
          : el
            ? "Δεν ήταν δυνατή η προσθήκη."
            : "Could not add Music Analyzer model.",
      ),
  });

  const setAnalyzerV2Enabled = useMutation({
    mutationFn: (args: {
      providerId: "gemini" | "openai" | "openrouter";
      modelId: string;
      enabled: boolean;
    }) => setInstalledAnalyzerV2Enabled({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-music-analyzer-models"] });
      qc.invalidateQueries({ queryKey: ["song-analyzer-access"], exact: false });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "V2 opt-in failed."),
  });

  const verifyAnalyzerV2 = useMutation({
    mutationFn: (args: { providerId: "gemini" | "openai" | "openrouter"; modelId: string }) =>
      verifyInstalledAnalyzerV2({ data: args }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["admin-music-analyzer-models"] });
      qc.invalidateQueries({ queryKey: ["song-analyzer-access"], exact: false });
      toast[result.outcome === "passed" ? "success" : "error"](
        result.outcome === "passed"
          ? el
            ? "Ο έλεγχος audio API πέρασε. Ενεργοποιήθηκε η V2."
            : "Audio API probe passed. V2 was enabled."
          : result.outcome === "inconclusive"
            ? el
              ? "Ο έλεγχος ήταν ασαφής. Μπορείς να ενεργοποιήσεις χειροκίνητα τη V2."
              : "Probe inconclusive; you may manually opt in."
            : el
              ? "Ο έλεγχος audio API απέτυχε. Μπορείς να δοκιμάσεις χειροκίνητα."
              : "Audio API probe failed; manual opt-in remains available.",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Audio probe failed."),
  });

  const modelHealth = useMutation({
    mutationFn: (id: string) => recheckAdminAiModelHealth({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ai-models"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("aiModels.healthCheckError")),
  });
  const providerHealth = useMutation({
    mutationFn: (providerId: string) =>
      recheckAdminAiProviderHealth({ data: { providerId: providerId as any } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ai-models"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("aiModels.healthCheckError")),
  });
  const setDefault = useMutation({
    mutationFn: (input: { operation: "generator" | "quality_check" | "ai_tools"; model: string }) =>
      setAdminAiModelDefault({ data: input as any }),
    onSuccess: () => {
      toast.success(t("aiModels.defaultSaved"));
      qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("aiModels.defaultSaveError")),
  });
  const bulkCheck = useMutation({
    mutationFn: () => checkAllAdminAiModelsForUpdates(),
    onSuccess: (result) => {
      setBulkResult(result);
      toast.success(el ? "Ο μαζικός έλεγχος ολοκληρώθηκε." : "Model update scan complete.");
    },
    onError: (e) =>
      toast.error(
        e instanceof Error
          ? e.message
          : el
            ? "Ο έλεγχος ενημερώσεων απέτυχε."
            : "Update scan failed",
      ),
  });

  const generatorOptions = useMemo(
    () =>
      data?.models.filter(
        (m) => m.status === "enabled" && m.generatorCompatible && m.generatorEnabled,
      ) ?? [],
    [data],
  );
  const qualityOptions = useMemo(
    () =>
      data?.models.filter(
        (m) => m.status === "enabled" && m.qualityCheckCompatible && m.qualityCheckEnabled,
      ) ?? [],
    [data],
  );
  const aiToolsOptions = generatorOptions;

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("aiModels.loading")}</p>;
  if (error || !data)
    return (
      <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("aiModels.loadError")}</div>
    );

  const statusLabel = (value: AdminAiModel["status"]) => {
    if (value === "enabled") return t("aiModels.enabled");
    if (value === "disabled") return t("aiModels.disabled");
    if (value === "testing") return t("aiModels.testing");
    if (value === "deprecated") return t("aiModels.deprecated");
    return t("aiModels.archived");
  };
  const healthLabel = (value: AdminAiModel["healthStatus"]) => {
    if (value === "healthy") return t("aiModels.healthy");
    if (value === "degraded") return t("aiModels.degraded");
    if (value === "failing") return t("aiModels.failing");
    return t("aiModels.healthUnknown");
  };
  const accessLabel = (value: AdminAiModel["accessPolicy"]) =>
    value === "admin_only"
      ? t("aiModels.adminOnly")
      : value === "selected_users"
        ? t("aiModels.selectedUsers")
        : t("aiModels.allUsers");
  const pricingLabel = (value: AdminAiModel["pricingStatus"]) =>
    value === "verified"
      ? t("aiModels.verified")
      : value === "outdated"
        ? t("aiModels.outdated")
        : t("aiModels.unknown");
  const compatibilityLabel = (value: string) => {
    if (value === "compatible") return el ? "Συμβατό" : "Compatible";
    if (value === "generator_only") return el ? "Μόνο Generator" : "Generator only";
    if (value === "quality_check_only") return el ? "Μόνο Quality Check" : "Quality Check only";
    if (value === "inconclusive") return el ? "Ασαφές" : "Inconclusive";
    return el ? "Μη συμβατό" : "Unsupported";
  };

  const selectedDiscovery =
    providerCheck.data?.provider.id === selectedProvider ? providerCheck.data : null;
  const installedForProvider = data.models.filter((m) => m.provider === selectedProvider);
  const fastSuccessors = selectedDiscovery
    ? selectedDiscovery.models.filter((candidate) => {
        if (candidate.installed || candidate.deprecated) return false;
        return installedForProvider.some((installed) => {
          const a = successorFamily(selectedProvider, installed.providerModelId);
          const b = successorFamily(selectedProvider, candidate.id);
          return a && b && a === b && compareVersion(candidate.id, installed.providerModelId) > 0;
        });
      })
    : [];
  const normalCandidates =
    selectedDiscovery?.models.filter(
      (m) => !m.installed && !m.deprecated && !fastSuccessors.some((s) => s.id === m.id),
    ) ?? [];

  const musicDiscovery =
    musicAnalyzerProviderCheck.data?.provider.id === musicAnalyzerProvider
      ? musicAnalyzerProviderCheck.data
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{t("aiModels.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiModels.subtitle")}</p>
        </div>
        <button
          disabled={bulkCheck.isPending}
          onClick={() => bulkCheck.mutate()}
          className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
        >
          <Sparkles className={cn("h-4 w-4", bulkCheck.isPending && "animate-pulse")} />
          {bulkCheck.isPending
            ? el
              ? "Έλεγχος όλων…"
              : "Checking all…"
            : el
              ? "Έλεγχος όλων για ενημερώσεις"
              : "Check all models for updates"}
        </button>
      </div>

      {bulkResult && (
        <div className="glass rounded-2xl p-4">
          <div className="flex flex-wrap gap-2">
            <Pill kind="up_to_date">
              {el ? "Ενημερωμένα" : "Up to date"}: {bulkResult.summary.upToDate}
            </Pill>
            <Pill kind="outdated">
              {el ? "Αλλαγές" : "Changed"}: {bulkResult.summary.changed}
            </Pill>
            <Pill kind="newer">
              {el ? "Νεότερη έκδοση" : "Newer version"}: {bulkResult.summary.newerVersion}
            </Pill>
            <Pill kind="unavailable">
              {el ? "Μη διαθέσιμα" : "Unavailable"}: {bulkResult.summary.unavailable}
            </Pill>
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto">
            {bulkResult.reports
              .filter(
                (r) =>
                  r.changes.length || r.likelySuccessors.length || r.error || r.available === false,
              )
              .map((report) => (
                <div key={report.id} className="rounded-xl border border-white/10 p-3 text-xs">
                  <div className="font-semibold">
                    {report.displayName}{" "}
                    <span className="text-muted-foreground">({report.providerModelId})</span>
                  </div>
                  {report.changes.map((change: any) => (
                    <div key={change.field} className="mt-1 text-muted-foreground">
                      {change.field}: {String(change.current ?? "—")} →{" "}
                      <span className="text-foreground">{String(change.suggested ?? "—")}</span>
                    </div>
                  ))}
                  {report.likelySuccessors.length > 0 && (
                    <div className="mt-1 text-amber-200">
                      {el ? "Πιθανή νεότερη έκδοση:" : "Likely newer version:"}{" "}
                      {report.likelySuccessors.map((x: any) => x.id).join(", ")}
                    </div>
                  )}
                  {report.error && <div className="mt-1 text-red-200">{report.error}</div>}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {(
          [
            [
              "generator",
              t("aiModels.generatorDefault"),
              generatorDefault,
              setGeneratorDefault,
              generatorOptions,
            ],
            [
              "ai_tools",
              t("aiModels.aiToolsDefault"),
              aiToolsDefault,
              setAiToolsDefault,
              aiToolsOptions,
            ],
            [
              "quality_check",
              t("aiModels.qualityDefault"),
              qualityDefault,
              setQualityDefault,
              qualityOptions,
            ],
          ] as const
        ).map(([operation, label, value, setter, options]) => (
          <div key={operation} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-primary" />
              {label}
            </div>
            <div className="mt-3 flex gap-2">
              <select
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"
              >
                {options.map((m) => (
                  <option key={m.id} value={m.providerModelId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <button
                disabled={!value || setDefault.isPending}
                onClick={() => setDefault.mutate({ operation, model: value })}
                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("aiModels.saveDefault")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">{t("aiModels.providers")}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("aiModels.providersHint")}</p>
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                providerCheck.reset();
                compatibilityTest.reset();
                setAddedModelIds(new Set());
              }}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"
            >
              {providersQuery.data?.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              disabled={!selectedProvider || providerCheck.isPending}
              onClick={() => providerCheck.mutate(selectedProvider)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", providerCheck.isPending && "animate-spin")} />
              {providerCheck.isPending ? t("aiModels.checkingApi") : t("aiModels.checkApi")}
            </button>
            <button
              disabled={!selectedProvider || providerHealth.isPending}
              onClick={() => providerHealth.mutate(selectedProvider)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm"
            >
              <HeartPulse className="h-4 w-4" />
              {providerHealth.isPending
                ? t("aiModels.recheckingProvider")
                : t("aiModels.recheckProvider")}
            </button>
          </div>

          {selectedDiscovery && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  [t("aiModels.returnedCount"), selectedDiscovery.summary.returned],
                  [t("aiModels.candidateCount"), selectedDiscovery.summary.candidates],
                  [t("aiModels.installedCount"), selectedDiscovery.summary.installed],
                  [t("aiModels.excludedCount"), selectedDiscovery.summary.excluded],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/10 bg-black/15 p-3"
                  >
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="mt-1 text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>

              {fastSuccessors.length > 0 && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
                  <div className="font-display text-sm font-semibold">
                    {el
                      ? "Νέες εκδόσεις εγκατεστημένων μοντέλων"
                      : "New versions of installed models"}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {el
                      ? "Δεν χρειάζεται να περιμένετε το πλήρες compatibility test. Το Έλεγχος & Προσθήκη ελέγχει μόνο το επιλεγμένο μοντέλο πριν το προσθέσει."
                      : "No need to wait for the full compatibility test. Check & Add validates only the selected model before adding it."}
                  </p>
                  <div className="mt-3 space-y-2">
                    {fastSuccessors.map((candidate) => (
                      <div
                        key={candidate.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"
                      >
                        <div>
                          <div className="font-medium">{candidate.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {candidate.id}
                            {candidate.contextWindow
                              ? ` · ${candidate.contextWindow.toLocaleString()} context`
                              : ""}
                          </div>
                        </div>
                        <button
                          disabled={
                            addedModelIds.has(candidate.id) ||
                            (addModel.isPending && addModel.variables === candidate.id)
                          }
                          onClick={() => addModel.mutate(candidate.id)}
                          className="rounded-xl border border-amber-400/30 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50"
                        >
                          {addedModelIds.has(candidate.id)
                            ? t("aiModels.added")
                            : el
                              ? "Έλεγχος & Προσθήκη"
                              : "Check & Add"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {normalCandidates.length > 0 && (
                <div className="rounded-2xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-sm font-semibold">
                        {el ? "Όλα τα νέα μοντέλα του API" : "All new API models"}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {normalCandidates.length}{" "}
                        {el
                          ? "μοντέλα για Compatibility Test"
                          : "models to run through Compatibility Test"}
                      </p>
                    </div>
                    <button
                      disabled={compatibilityTest.isPending}
                      onClick={() =>
                        compatibilityTest.mutate({
                          providerId: selectedProvider,
                          modelIds: normalCandidates.map((m) => m.id),
                        })
                      }
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold"
                    >
                      {compatibilityTest.isPending
                        ? `${t("aiModels.runningCompatibility")} ${compatibilityProgress.completed}/${compatibilityProgress.total}`
                        : t("aiModels.runCompatibility")}
                    </button>
                  </div>
                  {compatibilityTest.isPending && (
                    <button
                      onClick={() => {
                        compatibilityCancelRef.current = true;
                      }}
                      className="mt-2 text-xs text-amber-200"
                    >
                      {t("aiModels.stopCompatibility")}
                    </button>
                  )}
                </div>
              )}

              {compatibilityTest.data && (
                <div className="max-h-80 overflow-auto rounded-2xl border border-white/10">
                  {compatibilityTest.data.results
                    .filter((r: any) =>
                      ["compatible", "generator_only", "quality_check_only"].includes(r.status),
                    )
                    .map((result: any) => (
                      <div
                        key={result.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 p-3 first:border-t-0"
                      >
                        <div>
                          <div className="font-medium">{result.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {result.id} · {compatibilityLabel(result.status)}
                          </div>
                        </div>
                        <button
                          disabled={
                            addedModelIds.has(result.id) ||
                            (addModel.isPending && addModel.variables === result.id)
                          }
                          onClick={() => addModel.mutate(result.id)}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs"
                        >
                          {addedModelIds.has(result.id)
                            ? t("aiModels.added")
                            : t("aiModels.addModel")}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="font-display text-sm font-semibold">{t("aiModels.installed")}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("aiModels.model")}</th>
                <th className="px-4 py-3">{t("aiModels.provider")}</th>
                <th className="px-4 py-3">{t("aiModels.generator")}</th>
                <th className="px-4 py-3">{t("aiModels.qualityCheck")}</th>
                <th className="px-4 py-3">{t("aiModels.status")}</th>
                <th className="px-4 py-3">{t("aiModels.health")}</th>
                <th className="px-4 py-3">{t("aiModels.access")}</th>
                <th className="px-4 py-3">{t("aiModels.pricing")}</th>
                <th className="px-4 py-3">{t("aiModels.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((model) => (
                <tr key={model.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{model.displayName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {model.providerModelId}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">{model.provider}</td>
                  <td className="px-4 py-3">
                    {model.generatorCompatible && model.generatorEnabled ? (
                      <Check className="h-4 w-4 text-emerald-300" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {model.qualityCheckCompatible && model.qualityCheckEnabled ? (
                      <Check className="h-4 w-4 text-emerald-300" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Pill kind={model.status}>{statusLabel(model.status)}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <Pill kind={model.healthStatus}>{healthLabel(model.healthStatus)}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <Pill kind={model.accessPolicy}>{accessLabel(model.accessPolicy)}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <Pill kind={model.pricingStatus}>{pricingLabel(model.pricingStatus)}</Pill>
                    {model.pricingStatus === "verified" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        ${model.inputPricePerMillion ?? "—"} {el ? "είσοδος" : "in"} · $
                        {model.outputPricePerMillion ?? "—"} {el ? "έξοδος" : "out"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setEditing(model)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("aiModels.edit")}
                      </button>
                      <button
                        disabled={modelHealth.isPending && modelHealth.variables === model.id}
                        onClick={() => modelHealth.mutate(model.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs disabled:opacity-50"
                      >
                        <HeartPulse className="h-3.5 w-3.5" />
                        {modelHealth.isPending && modelHealth.variables === model.id
                          ? t("aiModels.rechecking")
                          : t("aiModels.recheck")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl border border-cyan-400/20">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-cyan-300" />
            <h3 className="font-display text-sm font-semibold">Music Analyzer</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {el
              ? "Εμφάνιση μόνο μοντέλων Audio → Text με ελεγμένο συμβόλαιο εκτέλεσης Music Analyzer V2. Το catalog από μόνο του δεν αποδεικνύει πλήρη συμβατότητα· η πραγματική ανάλυση MP3 χρειάζεται χωριστή δοκιμή. Για Gemini/OpenAI ενδέχεται να γίνει μικρό live probe με κόστος."
              : "Show only Audio → Text models with a reviewed Music Analyzer V2 runtime contract. Catalog modalities alone do not prove full compatibility; a real MP3/full-report test is separate. Gemini/OpenAI discovery may run a small billable live probe."}
          </p>
        </div>
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={musicAnalyzerProvider}
              onChange={(e) => {
                setMusicAnalyzerProvider(e.target.value);
                musicAnalyzerProviderCheck.reset();
              }}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"
            >
              {(providersQuery.data?.providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <button
              disabled={!musicAnalyzerProvider || musicAnalyzerProviderCheck.isPending}
              onClick={() => musicAnalyzerProviderCheck.mutate(musicAnalyzerProvider)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 ring-1 ring-inset ring-cyan-400/30 disabled:opacity-50"
            >
              <SearchCheck
                className={cn("h-4 w-4", musicAnalyzerProviderCheck.isPending && "animate-pulse")}
              />
              {musicAnalyzerProviderCheck.isPending
                ? el
                  ? "Έλεγχος…"
                  : "Checking…"
                : el
                  ? "Έλεγχος για Audio → Text"
                  : "Check Audio → Text"}
            </button>
          </div>

          {musicAnalyzerModelsQuery.data?.models.some(
            (model) => model.provider === musicAnalyzerProvider,
          ) && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
              <div className="text-sm font-semibold text-amber-200">
                {el ? "Ήδη εγκατεστημένα μοντέλα" : "Previously installed models"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {el
                  ? "Η εγκατάσταση για την παλαιότερη έκδοση δεν πιστοποιεί συμβατότητα με V2. Τα μοντέλα δεν διαγράφονται. Όσα δεν έχουν ελεγμένο V2 adapter μπορούν να χρησιμοποιηθούν στη V1."
                  : "Earlier installation does not certify V2 compatibility. Models are not deleted. Those without reviewed V2 adapters remain available in V1."}
              </p>
              <p className="mt-1 text-xs text-amber-200/80">
                {el
                  ? "Η Επαλήθευση κάνει μικρή πιθανώς χρεώσιμη API κλήση και ελέγχει audio transport, όχι την ποιότητα ή την πλήρη αναφορά. Το χειροκίνητο checkbox επιτρέπει δοκιμαστική κλήση χωρίς επαλήθευση."
                  : "Verify uses a small potentially billable audio API probe, not a full report-quality test. Manual opt-in allows an experimental V2 call without verification."}
              </p>
              <div className="mt-2 space-y-1.5">
                {musicAnalyzerModelsQuery.data.models
                  .filter((model) => model.provider === musicAnalyzerProvider)
                  .map((model) => (
                    <div
                      key={model.provider + ":" + model.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span className="break-all">
                        {model.label} · {model.id}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            aria-label={el ? "Χρήση στη Version 2" : "Enable in Version 2"}
                            checked={Boolean(
                              musicAnalyzerModelsQuery.data?.v2Options?.find(
                                (option) =>
                                  option.provider === model.provider && option.id === model.id,
                              )?.enabled,
                            )}
                            disabled={setAnalyzerV2Enabled.isPending || verifyAnalyzerV2.isPending}
                            onChange={(event) =>
                              setAnalyzerV2Enabled.mutate({
                                providerId: model.provider as "gemini" | "openai" | "openrouter",
                                modelId: model.id,
                                enabled: event.target.checked,
                              })
                            }
                          />
                          {el ? "Χρήση στη V2" : "Use in V2"}
                        </label>
                        <button
                          type="button"
                          disabled={verifyAnalyzerV2.isPending || setAnalyzerV2Enabled.isPending}
                          onClick={() =>
                            verifyAnalyzerV2.mutate({
                              providerId: model.provider as "gemini" | "openai" | "openrouter",
                              modelId: model.id,
                            })
                          }
                          className="rounded-lg border border-cyan-400/30 px-2.5 py-1.5 text-cyan-200 disabled:opacity-40"
                        >
                          {verifyAnalyzerV2.isPending &&
                          verifyAnalyzerV2.variables?.modelId === model.id
                            ? el
                              ? "Έλεγχος…"
                              : "Verifying…"
                            : el
                              ? "Επαλήθευση"
                              : "Verify"}
                        </button>
                        <Pill
                          kind={
                            musicAnalyzerModelsQuery.data?.v2Options?.some(
                              (option) =>
                                option.provider === model.provider &&
                                option.id === model.id &&
                                option.verified,
                            )
                              ? "healthy"
                              : "inconclusive"
                          }
                        >
                          {musicAnalyzerModelsQuery.data?.v2Options?.some(
                            (option) =>
                              option.provider === model.provider &&
                              option.id === model.id &&
                              option.verified,
                          )
                            ? el
                              ? "Audio API ελεγμένο"
                              : "Audio API verified"
                            : el
                              ? "Μη επαληθευμένο"
                              : "Unverified"}
                        </Pill>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {musicDiscovery && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="text-xs text-muted-foreground">
                    {el ? "Μοντέλα provider" : "Provider models"}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{musicDiscovery.returned}</div>
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
                  <div className="text-xs text-muted-foreground">
                    {el ? "V2 υποψήφια" : "V2 candidates"}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-cyan-200">
                    {musicDiscovery.candidates.length}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="text-xs text-muted-foreground">
                    {el ? "Μη επαληθευμένα / μη συμβατά" : "Unverified / incompatible"}
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {musicDiscovery.excludedWithoutExplicitModalities}
                  </div>
                </div>
              </div>

              {musicDiscovery.candidates.length === 0 ? (
                <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">
                  {el
                    ? "Δεν βρέθηκε μοντέλο με ελεγμένο συμβόλαιο Music Analyzer V2. Η συμβατότητα catalog δεν αρκεί."
                    : "No model with a reviewed Music Analyzer V2 runtime contract was found. Catalog modality support alone is insufficient."}
                </div>
              ) : (
                <div className="max-h-[520px] space-y-2 overflow-auto">
                  {musicDiscovery.candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="rounded-xl border border-white/10 bg-black/15 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{candidate.name}</div>
                          <div className="mt-1 break-all text-xs text-muted-foreground">
                            {candidate.id}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Pill kind="enabled">
                              input: {candidate.inputModalities.join(", ")}
                            </Pill>
                            <Pill kind="enabled">
                              output: {candidate.outputModalities.join(", ")}
                            </Pill>
                            {candidate.contextWindow != null && (
                              <Pill kind="unknown">
                                {candidate.contextWindow.toLocaleString()} context
                              </Pill>
                            )}
                            <Pill kind={candidate.runtimeSupported ? "healthy" : "inconclusive"}>
                              {candidate.runtimeSupported
                                ? el
                                  ? "Ελεγμένο V2 adapter"
                                  : "Reviewed V2 adapter"
                                : el
                                  ? "Χρειάζεται adapter"
                                  : "Adapter required"}
                            </Pill>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {candidate.runtimeNote}
                          </p>
                        </div>
                        <button
                          disabled={
                            candidate.installed ||
                            candidate.deprecated ||
                            !candidate.runtimeSupported ||
                            (addMusicAnalyzer.isPending &&
                              addMusicAnalyzer.variables === candidate.id)
                          }
                          onClick={() => addMusicAnalyzer.mutate(candidate.id)}
                          className="shrink-0 rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40"
                        >
                          {candidate.installed
                            ? el
                              ? "Ήδη στο Music Analyzer"
                              : "Already in Music Analyzer"
                            : el
                              ? "Προσθήκη στο Music Analyzer"
                              : "Add to Music Analyzer"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {(musicAnalyzerModelsQuery.data?.models.length ?? 0) > 0 && (
            <div className="rounded-xl border border-white/10 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {el ? "Πρόσθετα ενεργά μοντέλα" : "Additional active models"}
              </div>
              <div className="mt-2 space-y-1.5">
                {musicAnalyzerModelsQuery.data!.models.map((item) => (
                  <div key={item.provider + ":" + item.id} className="text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground"> · {item.provider}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <AiModelEditor
          model={editing}
          generatorDefault={data.generatorDefault}
          qualityDefault={data.qualityDefault}
          aiToolsDefault={data.aiToolsDefault}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
