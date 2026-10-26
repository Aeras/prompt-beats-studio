import { useEffect, useRef, useState } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, HeartPulse, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import {
  patchAdminAiModel,
  uninstallAdminAiModels,
  type AdminAiModel,
} from "@/lib/ai-model-admin.functions";

type ModelsData = {
  models: AdminAiModel[];
  generatorDefault: string | null;
  qualityDefault: string | null;
  aiToolsDefault: string | null;
  legacyDefault: string | null;
};
type Patch = {
  generatorEnabled?: boolean;
  qualityCheckEnabled?: boolean;
  status?: AdminAiModel["status"];
  accessPolicy?: AdminAiModel["accessPolicy"];
};
const key = ["admin-ai-models"];
const button =
  "rounded-xl border border-purple-300/20 px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 disabled:opacity-50";

function useModelLabel() {
  const { t } = useI18n();
  const labels = {
    testing: "aiModels.testing",
    enabled: "aiModels.enabled",
    disabled: "aiModels.disabled",
    deprecated: "aiModels.deprecated",
    archived: "aiModels.archived",
    all_users: "aiModels.allUsers",
    admin_only: "aiModels.adminOnly",
    selected_users: "aiModels.selectedUsers",
    healthy: "aiModels.healthy",
    degraded: "aiModels.degraded",
    failing: "aiModels.failing",
    unknown: "aiModels.unknown",
    verified: "aiModels.verified",
    outdated: "aiModels.outdated",
  } as const;
  return (value: string) =>
    Object.hasOwn(labels, value) ? t(labels[value as keyof typeof labels]) : value;
}

function Choice<T extends string>({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: T;
  options: readonly T[];
  change: (value: T) => void;
}) {
  const modelLabel = useModelLabel();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${button} flex min-h-10 min-w-0 max-w-full items-center gap-2 bg-[#21152f] px-2.5 py-1.5 text-purple-100`}
        aria-label={label}
        style={{ minHeight: "2.5rem" }}
      >
        <span className="truncate">{modelLabel(value)}</span>
        <ChevronDown size={12} className="shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={12}
        className="z-[80] min-w-40 rounded-xl border-purple-300/20 bg-[#21152f] p-1 text-purple-100"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => change(option)}
            className="min-h-11 capitalize focus:bg-purple-500/25"
          >
            {modelLabel(option)}
            {value === option && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelRow({
  model,
  selection,
  selected,
  toggle,
  onEdit,
  onHealth,
  manageAccess,
  defaults,
  template,
}: {
  model: AdminAiModel;
  selection: boolean;
  selected: boolean;
  toggle: () => void;
  onEdit: () => void;
  onHealth: () => void;
  manageAccess?: (() => void) | undefined;
  defaults: ModelsData;
  template: string;
}) {
  const qc = useQueryClient();
  const modelLabel = useModelLabel();
  const { language } = useI18n();
  const el = language === "el";
  const sequence = useRef(0);
  const [draft, setDraft] = useState<
    Partial<Record<keyof Patch, { value: boolean | string; sequence: number }>>
  >({});
  const mutation = useMutation({
    mutationKey: ["admin-model-patch", model.id],
    scope: { id: `admin-model:${model.id}` },
    mutationFn: async ({ patch }: { patch: Patch; sequence: number }) => {
      const latest = qc.getQueryData<ModelsData>(key)?.models.find((item) => item.id === model.id);
      if (!latest) throw new Error("Model no longer installed");
      return patchAdminAiModel({
        data: { id: model.id, expectedRevision: latest.adminRevision, patch },
      });
    },
    onSuccess: (result) =>
      qc.setQueryData<ModelsData>(
        key,
        (current) =>
          current && {
            ...current,
            models: current.models.map((item) => (item.id === model.id ? result.model : item)),
          },
      ),
    onError: async () => {
      toast.error(
        el
          ? "Η αλλαγή δεν αποθηκεύτηκε. Ελέγξτε προεπιλογές και δικαιώματα και δοκιμάστε ξανά."
          : "Change not saved. Check defaults and permissions, then retry.",
      );
      await qc.invalidateQueries({ queryKey: key });
    },
    onSettled: (_result, _error, input) => {
      setDraft((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, item]) => item.sequence !== input.sequence),
        ),
      );
      if (qc.isMutating({ mutationKey: ["admin-model-patch", model.id] }) === 1)
        void qc.invalidateQueries({ queryKey: key });
    },
  });
  function save(patch: Patch) {
    const seq = ++sequence.current;
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(patch).map(([field, value]) => [field, { value, sequence: seq }]),
      ),
    }));
    mutation.mutate({ patch, sequence: seq });
  }
  const current = <K extends keyof Patch>(field: K): NonNullable<Patch[K]> =>
    (draft[field]?.value ?? model[field]) as NonNullable<Patch[K]>;
  const defaultGenerator = [
    defaults.generatorDefault,
    defaults.aiToolsDefault,
    defaults.legacyDefault,
  ].includes(model.providerModelId);
  const defaultQuality = [defaults.qualityDefault, defaults.legacyDefault].includes(
    model.providerModelId,
  );
  const cell = "min-w-0 px-3 py-3";
  return (
    <div
      role="row"
      className="grid border-t border-white/5 text-sm"
      style={{ gridTemplateColumns: template }}
      data-model-id={model.id}
    >
      {selection && (
        <div role="cell" className={cell}>
          <input
            type="checkbox"
            className="h-5 w-5 accent-purple-500"
            aria-label={`${el ? "Επιλογή" : "Select"} ${model.displayName}`}
            checked={selected}
            onChange={toggle}
          />
        </div>
      )}
      <div role="cell" className={cell}>
        <div className="font-medium">{model.displayName}</div>
        <div className="mt-1 break-all text-xs text-muted-foreground">{model.providerModelId}</div>
        <div role="status" className="mt-1 text-xs text-purple-200">
          {mutation.isPending
            ? el
              ? "Αποθήκευση…"
              : "Saving…"
            : mutation.isError
              ? el
                ? "Δεν αποθηκεύτηκε"
                : "Not saved"
              : ""}
        </div>
      </div>
      <div role="cell" className={`${cell} capitalize`}>
        {model.provider}
      </div>
      {(["generatorEnabled", "qualityCheckEnabled"] as const).map((field) => {
        const compatible =
          field === "generatorEnabled" ? model.generatorCompatible : model.qualityCheckCompatible;
        const protectedDefault = field === "generatorEnabled" ? defaultGenerator : defaultQuality;
        return (
          <div role="cell" className={cell} key={field}>
            <button
              type="button"
              role="switch"
              aria-checked={current(field)}
              aria-label={`${field === "generatorEnabled" ? "Generator" : "Quality Check"}: ${model.displayName}`}
              disabled={!compatible || (protectedDefault && current(field))}
              title={
                !compatible
                  ? el
                    ? "Μη συμβατό"
                    : "Not compatible"
                  : protectedDefault
                    ? el
                      ? "Αλλάξτε πρώτα προεπιλογή"
                      : "Replace default first"
                    : undefined
              }
              onClick={() => save({ [field]: !current(field) })}
              className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 disabled:opacity-50"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border border-purple-300/60 ${current(field) ? "bg-purple-600 text-white" : "bg-transparent"}`}
              >
                {current(field) && <Check size={15} />}
              </span>
            </button>
          </div>
        );
      })}
      <div role="cell" className={cell}>
        <Choice
          label={`${el ? "Κατάσταση" : "Status"}: ${model.displayName}`}
          value={current("status")}
          options={["testing", "enabled", "disabled", "deprecated", "archived"]}
          change={(status) => save({ status })}
        />
      </div>
      <div role="cell" className={`${cell} text-xs`}>
        {modelLabel(model.healthStatus)}
      </div>
      <div role="cell" className={cell}>
        <Choice
          label={`${el ? "Πρόσβαση" : "Access"}: ${model.displayName}`}
          value={current("accessPolicy")}
          options={["all_users", "admin_only", "selected_users"]}
          change={(accessPolicy) => save({ accessPolicy })}
        />
      </div>
      <div role="cell" className={`${cell} text-xs`}>
        {modelLabel(model.pricingStatus)}
        {model.pricingStatus === "verified" && (
          <div className="mt-1 text-muted-foreground">
            ${model.inputPricePerMillion} in · ${model.outputPricePerMillion} out
          </div>
        )}
      </div>
      <div role="cell" className={`${cell} flex flex-wrap items-start gap-2`}>
        <button
          className={button}
          onClick={onEdit}
          aria-label={`${el ? "Επεξεργασία" : "Edit"}: ${model.displayName}`}
          disabled={mutation.isPending}
        >
          <Pencil size={16} />
        </button>
        <button
          className={button}
          onClick={onHealth}
          aria-label={`${el ? "Έλεγχος" : "Recheck"}: ${model.displayName}`}
        >
          <HeartPulse size={16} />
        </button>
      </div>
    </div>
  );
}

export function InstalledAiModelsTable({
  data,
  onEdit,
  onHealth,
  manageAccess,
}: {
  data: ModelsData;
  onEdit: (model: AdminAiModel) => void;
  onHealth: (id: string) => void;
  manageAccess?: (() => void) | undefined;
}) {
  const { language, t } = useI18n();
  const el = language === "el";
  const qc = useQueryClient();
  const [selection, setSelection] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [offset, setOffset] = useState(0);
  const [titleHeight, setTitleHeight] = useState(0);
  const titleRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  const trash = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    const header = document.querySelector("header");
    const title = titleRef.current;
    if (!header || !title) return;
    const update = () => {
      setOffset(header.getBoundingClientRect().height);
      setTitleHeight(title.getBoundingClientRect().height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    observer.observe(title);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (confirm) {
      confirmation.current?.scrollIntoView({ block: "start", behavior: "instant" });
      cancel.current?.focus({ preventScroll: true });
    }
  }, [confirm, offset, titleHeight]);
  const selected = data.models.filter((model) => ids.has(model.id));
  const busy = useIsMutating() > 0;
  const uninstall = useMutation({
    mutationFn: () =>
      uninstallAdminAiModels({
        data: {
          models: selected.map((model) => ({ id: model.id, revision: model.adminRevision })),
          confirmed: true,
        },
      }),
    onSuccess: async () => {
      restoreFocus.current = true;
      setConfirm(false);
      setIds(new Set());
      setSelection(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["admin-user"] }),
        qc.invalidateQueries({ queryKey: ["my-ai-model-access"] }),
      ]);
      trash.current?.focus();
      toast.success(el ? "Τα μοντέλα απεγκαταστάθηκαν." : "Models uninstalled.");
    },
    onError: async () => {
      toast.error(
        el
          ? "Δεν διαγράφηκε κανένα μοντέλο. Ελέγξτε τις εξαρτήσεις και δοκιμάστε ξανά."
          : "No models deleted. Check dependencies and retry.",
      );
      await qc.invalidateQueries({ queryKey: key });
    },
  });
  useEffect(() => {
    if (restoreFocus.current && !uninstall.isPending && !confirm) {
      restoreFocus.current = false;
      trash.current?.focus();
    }
  }, [uninstall.isPending, confirm]);
  const blockers = (model: AdminAiModel) =>
    model.uninstallBlockers.map((reason) => {
      if (reason.startsWith("default:"))
        return `${el ? "Ενεργή προεπιλογή" : "Active default"}: ${{ ai_generator_default_model: "Generator", ai_quality_check_default_model: "Quality Check", ai_tools_default_model: "AI Tools", ai_model: el ? "Κοινή παλαιότερη προεπιλογή" : "Legacy shared fallback" }[reason.slice(8)] ?? (el ? "Προεπιλογή" : "Default")}`;
      const messages: Record<string, string> = {
        legacy_fallback: el
          ? "Ρυθμίστε τις ενεργές προεπιλογές πριν αφαιρέσετε το τελευταίο fallback"
          : "Configure operation defaults before removing the last fallback",
        active_jobs: el ? "Ενεργές ή προγραμματισμένες εργασίες" : "Active or queued jobs",
        recovery_pending: el
          ? "Αποθηκευμένη απόκριση σε αναμονή ελέγχου/ανάκτησης"
          : "Stored response awaiting validation/recovery",
        accounting_pending: el
          ? "Εκκρεμής τελική συμφιλίωση χρήσης"
          : "Final usage reconciliation pending",
        unresolved_execution: el
          ? "Εκτέλεση σε αναμονή συμφιλίωσης/ανάκτησης"
          : "Execution awaiting reconciliation/recovery",
        usage_pending: el ? "Εκκρεμής καταγραφή χρήσης" : "Pending usage accounting",
        active_auxiliary: el
          ? "Ενεργή εργασία ή εκκρεμής χρήση αυτού του μοντέλου"
          : "This model has active work or unsettled usage",
        foreign_key: el ? "Εξάρτηση βάσης δεδομένων" : "Database dependency",
      };
      return messages[reason] ?? (el ? "Ενεργή εξάρτηση" : "Active dependency");
    });
  const template = `${selection ? "52px " : ""}minmax(190px,2fr) 80px 88px 112px 135px 75px 155px 125px 130px`;
  const width = selection ? 1142 : 1090;
  return (
    <section
      className="rounded-2xl border border-white/10 bg-[#15101e]"
      aria-label={t("aiModels.installed")}
    >
      <div
        ref={titleRef}
        className="sticky z-20 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#15101e] px-4 py-3"
        style={{ top: offset }}
        data-testid="models-sticky-toolbar"
      >
        <button
          ref={trash}
          type="button"
          aria-label={el ? "Απεγκατάσταση μοντέλων" : "Uninstall models"}
          aria-pressed={selection}
          className={`${button} min-h-11 text-rose-200`}
          disabled={uninstall.isPending}
          onClick={() => {
            if (!selection) setSelection(true);
            else if (selected.length) setConfirm(true);
          }}
        >
          <Trash2 size={18} />
        </button>
        <h3 className="font-display text-sm font-semibold">{t("aiModels.installed")}</h3>
        {selection && (
          <>
            <span className="text-xs text-purple-200" role="status">
              {selected.length
                ? `${selected.length} ${el ? "επιλεγμένα" : "selected"}`
                : el
                  ? "Επιλέξτε μοντέλα και πατήστε τον κάδο"
                  : "Select models, then press trash"}
            </span>
            <button
              className={button}
              disabled={uninstall.isPending}
              onClick={() => {
                setSelection(false);
                setConfirm(false);
                setIds(new Set());
                trash.current?.focus();
              }}
            >
              {el ? "Ακύρωση επιλογής" : "Cancel selection"}
            </button>
          </>
        )}
      </div>
      {confirm && (
        <div
          ref={confirmation}
          style={{ scrollMarginTop: offset + titleHeight + 12 }}
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="uninstall-title"
          aria-describedby="uninstall-description"
          className="m-3 rounded-2xl border border-rose-300/25 bg-[#361322] p-4 text-rose-50"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !uninstall.isPending) {
              setConfirm(false);
              trash.current?.focus();
            }
          }}
        >
          <h4 id="uninstall-title" className="font-semibold">
            {el ? "Οριστική απεγκατάσταση" : "Permanently uninstall"} ({selected.length})
          </h4>
          <p id="uninstall-description" className="mt-2 text-sm">
            {el
              ? "Θέλεις να απεγκαταστήσεις οριστικά τα επιλεγμένα μοντέλα;"
              : "Permanently uninstall the selected models?"}
          </p>
          <ul className="my-3 space-y-2 text-sm">
            {selected.map((model) => (
              <li key={model.id}>
                <strong>{model.displayName}</strong>
                {blockers(model).map((reason) => (
                  <div className="text-rose-200" key={reason}>
                    {reason}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-3">
            <button
              ref={cancel}
              className={button}
              disabled={uninstall.isPending}
              onClick={() => {
                setConfirm(false);
                trash.current?.focus();
              }}
            >
              {el ? "Ακύρωση" : "Cancel"}
            </button>
            <button
              className="min-h-11 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={
                !selected.length ||
                ids.size !== selected.length ||
                selected.some((model) => model.uninstallBlockers.length) ||
                busy ||
                uninstall.isPending
              }
              onClick={() => uninstall.mutate()}
            >
              {uninstall.isPending ? (el ? "Διαγραφή…" : "Deleting…") : el ? "Διαγραφή" : "Delete"}
            </button>
          </div>
        </div>
      )}
      <div role="table" aria-label={t("aiModels.installed")}>
        <div
          role="rowgroup"
          data-testid="models-sticky-header"
          className="sticky z-10 overflow-hidden border-b border-white/10 bg-[#21152f]"
          style={{ top: offset + titleHeight }}
        >
          <div
            role="row"
            className="grid text-[11px] uppercase text-purple-100"
            style={{
              gridTemplateColumns: template,
              minWidth: width,
              transform: `translateX(-${left}px)`,
            }}
          >
            {[
              ...(selection ? [el ? "Επιλογή" : "Select"] : []),
              ...(
                [
                  "model",
                  "provider",
                  "generator",
                  "qualityCheck",
                  "status",
                  "health",
                  "access",
                  "pricing",
                  "actions",
                ] as const
              ).map((name) => t(`aiModels.${name}`)),
            ].map((label) => (
              <div role="columnheader" key={label} className="px-3 py-3">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div
          role="rowgroup"
          className="overflow-x-auto"
          data-testid="models-horizontal-scroll"
          onScroll={(event) => setLeft(event.currentTarget.scrollLeft)}
        >
          <div style={{ minWidth: width }}>
            {data.models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                selection={selection}
                selected={ids.has(model.id)}
                toggle={() =>
                  setIds((current) => {
                    const next = new Set(current);
                    if (next.has(model.id)) next.delete(model.id);
                    else next.add(model.id);
                    return next;
                  })
                }
                defaults={data}
                template={template}
                onEdit={() => onEdit(model)}
                onHealth={() => onHealth(model.id)}
                manageAccess={manageAccess}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
