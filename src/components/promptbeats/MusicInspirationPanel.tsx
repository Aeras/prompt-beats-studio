import { decodeInspirationDiagnostic } from "@/lib/music-inspiration-diagnostics.shared";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { musicInspirationCopy } from "@/i18n/music-inspiration";
import { Button } from "@/components/ui/button";
import { CompactDropdown } from "@/components/ui/compact-dropdown";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdvancedGeneratorSetup } from "@/lib/advanced-generator-setup";
import {
  INSPIRATION_APPLY_FIELDS,
  applyInspirationProposal,
  undoInspirationProposal,
  type InspirationApplyReceipt,
  type InspirationApplyField,
} from "@/lib/music-inspiration-apply.shared";
import {
  inspirationRequestSchema,
  inspirationResearchSchema,
} from "@/lib/music-inspiration.shared";
import {
  getMusicInspirationConfig,
  startMusicInspiration,
  abandonMusicInspirationRequest,
  getMusicInspirationJob,
  cancelMusicInspiration,
  listMusicInspirationProfiles,
  saveMusicInspirationProfile,
  updateMusicInspirationProfile,
  deleteMusicInspirationProfile,
} from "@/lib/music-inspiration.functions";

const attemptSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    fingerprint: z.string().max(5000),
    request: inspirationRequestSchema,
    modelOverride: z.string().max(240).optional(),
    jobId: z.string().uuid().optional(),
  })
  .strict();
// Validate transport responses inside the query so an ancillary API failure
// stays in this panel rather than crashing the Generator route during render.
const profileResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  revision: z.number().int().positive(),
  result: inspirationResearchSchema,
});
const profilesResponseSchema = z.array(profileResponseSchema);
const configResponseSchema = z.object({
  configured: z.boolean(),
  reason: z.string().nullable(),
  superAdmin: z.boolean(),
  defaultModel: z.string().min(1).max(240),
  models: z.array(z.object({ id: z.string().min(1).max(240), label: z.string().min(1) })),
});

type PendingAttempt = z.infer<typeof attemptSchema>;
const attemptKey = (account: string) => `pb:music-inspiration-attempt:v1:${account}`;

type Job = Awaited<ReturnType<typeof getMusicInspirationJob>>;
type Profile = Awaited<ReturnType<typeof listMusicInspirationProfiles>>[number];
type Origin = { kind: "job"; id: string } | { kind: "profile"; id: string; revision: number };
const ownedKeys: Record<InspirationApplyField, readonly (keyof AdvancedGeneratorSetup)[]> = {
  selectedMusicStyles: ["selectedMusicStyles", "customMusicStyle"],
  selectedMoods: ["selectedMoods", "customMood"],
  selectedInstruments: ["selectedInstruments", "customInstruments"],
  bpm: ["bpmMode", "customBpm"],
  productionStyle: ["productionStyle"],
  additionalInstructions: ["additionalInstructions"],
  arrangement: ["songStructure", "songBlueprint"],
};
const active = (job: Job | null | undefined) =>
  job?.status === "queued" || job?.status === "running";
const completed = (job: Job | null | undefined) => job?.status === "completed";

/** Only server-returned job/profile IDs are accepted; there is no JSON import path. */
export function MusicInspirationPanel({
  setup,
  onApply,
}: {
  setup: AdvancedGeneratorSetup;
  onApply: (next: AdvancedGeneratorSetup) => void;
}) {
  const { user } = useAuth();
  const access = useFeatureAccess("ai_music_inspiration");
  const { language } = useI18n();
  const t = musicInspirationCopy[language];
  const uid = user?.id;
  const enabled = Boolean(uid) && access.allowed;
  const latest = useRef({ uid, enabled, setup, onApply });
  latest.current = { uid, enabled, setup, onApply };
  const lifecycle = useRef({ serial: 0 });
  const lock = useRef(false);
  const id = useId();
  const [owner, setOwner] = useState(uid);
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState("");
  const [kind, setKind] = useState<"artist" | "description">("artist");
  const [artist, setArtist] = useState("");
  const [song, setSong] = useState("");
  const [description, setDescription] = useState("");
  const [depth, setDepth] = useState<"standard" | "extended">("standard");
  const [modelOverride, setModelOverride] = useState("");
  const [attempt, setAttempt] = useState<PendingAttempt | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [recoveredPrevious, setRecoveredPrevious] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [profileId, setProfileId] = useState("");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState<"replace" | "delete" | null>(null);
  // Mobile keyboards may resize/pan visualViewport without changing layout/dvh.
  // Keep both dialogs in the visible area; the existing CSS is the fallback.
  const [dialogViewport, setDialogViewport] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  }>();
  const dialogVisible = open || confirm !== null;
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!dialogVisible || !viewport) return;
    const update = () =>
      setDialogViewport({
        top: viewport.offsetTop + viewport.height / 2,
        left: viewport.offsetLeft + viewport.width / 2,
        width: Math.max(0, viewport.width - 16),
        maxHeight: Math.max(0, viewport.height - 16),
      });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [dialogVisible]);
  const [fields, setFields] = useState<InspirationApplyField[]>([...INSPIRATION_APPLY_FIELDS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [failedStage, setFailedStage] = useState<"start" | "status" | "action" | null>(null);
  const [receipt, setReceipt] = useState<InspirationApplyReceipt | null>(null);
  const invalidatedOwnership = useRef(new Set<InspirationApplyField>());
  const [ambiguous, setAmbiguous] = useState<InspirationApplyField[]>([]);
  const [summary, setSummary] = useState<{
    appliedFields: InspirationApplyField[];
    skippedFields: InspirationApplyField[];
  } | null>(null);
  // Ownership is lost permanently after an observed manual change, even if a
  // later edit restores the same value (ABA). A value comparison at Undo is not enough.
  useEffect(() => {
    if (!receipt) return;
    for (const field of receipt.appliedFields) {
      if (
        ownedKeys[field].some(
          (key) => JSON.stringify(setup[key]) !== JSON.stringify(receipt.after[key]),
        )
      )
        invalidatedOwnership.current.add(field);
    }
  }, [setup, receipt]);
  const config = useQuery({
    queryKey: ["music-inspiration-config", uid],
    queryFn: async () => configResponseSchema.parse(await getMusicInspirationConfig()),
    enabled,
    retry: false,
    staleTime: 0,
  });
  const profiles = useQuery({
    queryKey: ["music-inspiration-profiles", uid],
    queryFn: async () => profilesResponseSchema.parse(await listMusicInspirationProfiles()),
    enabled,
    retry: false,
    staleTime: 0,
  });
  const selectedProfile = profiles.data?.find((p) => p.id === profileId);
  const sameOwner = owner === uid;
  const poll = useQuery({
    queryKey: ["music-inspiration-job", uid, sameOwner ? job?.id : null],
    queryFn: () => getMusicInspirationJob({ data: { id: job!.id } }),
    enabled: enabled && sameOwner && active(job) && !busy,
    retry: false,
    refetchInterval: (query) => (active(query.state.data ?? job) ? 1500 : false),
  });
  useEffect(() => {
    const scope = lifecycle.current;
    scope.serial++;
    lock.current = false;
    setOwner(uid);
    setRecoveredPrevious(false);
    setJob(null);
    setProfileId("");
    setOrigin(null);
    setOpen(false);
    setPreview(false);
    setConfirm(null);
    setArtist("");
    setSong("");
    setDescription("");
    setName("");
    setModelOverride("");
    setDepth("standard");
    setBusy(false);
    setError(false);
    setFailedStage(null);
    setSummary(null);
    setReceipt(null);
    setAmbiguous([]);
    setDropdown("");
    setAttempt(null);
    setStorageError(false);
    if (uid && enabled) {
      try {
        const raw = localStorage.getItem(attemptKey(uid));
        if (raw) {
          const saved = attemptSchema.parse(JSON.parse(raw));
          setAttempt(saved);
          setKind(saved.request.kind);
          setDepth(saved.request.depth);
          if (saved.request.kind === "artist") {
            setArtist(saved.request.artist);
            setSong(saved.request.song ?? "");
          } else setDescription(saved.request.description);
          setModelOverride(saved.modelOverride ?? "");
          // Reload recovery only reads a known server job. Never start paid work from an effect.
          if (saved.jobId) {
            const epoch = scope.serial;
            lock.current = true;
            setBusy(true);
            const valid = () =>
              scope.serial === epoch && latest.current.uid === uid && latest.current.enabled;
            void getMusicInspirationJob({ data: { id: saved.jobId } })
              .then((stored) => {
                if (!valid()) return;
                setJob(stored);
                if (completed(stored) && stored.result) setOrigin({ kind: "job", id: stored.id });
              })
              .catch(() => {
                if (valid()) setError(true);
              })
              .finally(() => {
                if (valid()) {
                  lock.current = false;
                  setBusy(false);
                }
              });
          }
        }
      } catch {
        setStorageError(true);
        setError(true);
      }
    }
    return () => {
      scope.serial++;
    };
  }, [uid, enabled]);
  useEffect(() => {
    const next = poll.data;
    if (!next || !sameOwner || !enabled || busy || next.id !== job?.id || !active(job)) return;
    setJob(next);
    if (completed(next) && next.result) {
      setOrigin({ kind: "job", id: next.id });
      setPreview(false);
    }
  }, [poll.data, sameOwner, enabled, busy, job]);

  // Account and operation epochs guard all async side effects, including after unmount.
  async function run(
    action: (valid: () => boolean) => Promise<void>,
    stage: "start" | "status" | "action" = "action",
  ) {
    if (lock.current || !enabled || !sameOwner) return;
    lock.current = true;
    const epoch = ++lifecycle.current.serial;
    const account = uid;
    const valid = () =>
      latest.current.uid === account &&
      latest.current.enabled &&
      lifecycle.current.serial === epoch;
    setBusy(true);
    setError(false);
    setFailedStage(null);
    try {
      await action(valid);
    } catch {
      if (valid()) {
        setFailedStage(stage);
        setError(true);
      }
    } finally {
      if (valid()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const request = inspirationRequestSchema.safeParse(
    kind === "artist"
      ? { kind, artist, song, depth: config.data?.superAdmin ? depth : "standard" }
      : { kind, description, depth: config.data?.superAdmin ? depth : "standard" },
  );
  function refreshJob() {
    const jobId = job?.id ?? attempt?.jobId;
    if (!jobId) return;
    void run(async (valid) => {
      const stored = await getMusicInspirationJob({ data: { id: jobId } });
      if (!valid()) return;
      setJob(stored);
      if (completed(stored) && stored.result) setOrigin({ kind: "job", id: stored.id });
    }, "status");
  }
  function discardPendingAttempt() {
    if (!uid || busy || !attempt || attempt.jobId) return;
    // Discarding the local request does not cancel any server-side work or refund
    // a possible provider charge. Never automatically retry an uncertain request.
    const pending = attempt;
    void run(async (valid) => {
      const { job: existing } = await abandonMusicInspirationRequest({
        data: { requestId: pending.requestId },
      });
      if (existing) {
        const acknowledged = { ...pending, jobId: existing.id };
        localStorage.setItem(attemptKey(uid), JSON.stringify(acknowledged));
        if (valid()) {
          setAttempt(acknowledged);
          setJob(existing);
          setOrigin(
            completed(existing) && existing.result ? { kind: "job", id: existing.id } : null,
          );
          setPreview(false);
          setOpen(false);
          setRecoveredPrevious(true);
        }
        return;
      }
      localStorage.removeItem(attemptKey(uid));
      if (valid()) {
        setAttempt(null);
        setError(false);
        setFailedStage(null);
      }
    });
  }

  function start() {
    if (
      !request.success ||
      !config.data?.configured ||
      config.isError ||
      storageError ||
      !uid ||
      job?.status === "unknown"
    )
      return;
    // An unacknowledged start retains its exact request and idempotency key,
    // including across reload. Retrying it is an explicit user action.
    const pending = attempt && !attempt.jobId ? attempt : null;
    const override = config.data?.superAdmin && modelOverride ? modelOverride : undefined;
    const fingerprint = JSON.stringify({
      request: request.data,
      model: override ?? config.data.defaultModel,
    });
    const candidate: PendingAttempt =
      pending?.fingerprint === fingerprint
        ? pending
        : {
            version: 1,
            requestId: crypto.randomUUID(),
            fingerprint,
            request: request.data,
            ...(override ? { modelOverride: override } : {}),
          };
    const account = uid;
    void run(async (valid) => {
      // Reconcile an edited unacknowledged request before creating a new identity.
      // A late old POST is fenced by a durable tombstone, not a local guess.
      if (pending && candidate.requestId !== pending.requestId) {
        const { job: existing } = await abandonMusicInspirationRequest({
          data: { requestId: pending.requestId },
        });
        if (existing) {
          const acknowledged = { ...pending, jobId: existing.id };
          localStorage.setItem(attemptKey(account), JSON.stringify(acknowledged));
          if (valid()) {
            setAttempt(acknowledged);
            setJob(existing);
            setOrigin(
              completed(existing) && existing.result ? { kind: "job", id: existing.id } : null,
            );
            setPreview(false);
            setOpen(false);
            setRecoveredPrevious(true);
          }
          return;
        }
      }
      // Reconciliation awaited a server response; account/feature/unmount may have changed.
      if (!valid()) return;
      // Fail closed if durable idempotency cannot be recorded before dispatch.
      localStorage.setItem(attemptKey(account), JSON.stringify(candidate));
      setAttempt(candidate);
      setRecoveredPrevious(false);
      setOrigin(null);
      setPreview(false);
      setSummary(null);
      setJob(null);
      const next = await startMusicInspiration({
        data: {
          requestId: candidate.requestId,
          request: candidate.request,
          ...(candidate.modelOverride ? { modelOverride: candidate.modelOverride } : {}),
        },
      });
      const acknowledged = { ...candidate, jobId: next.id };
      // Preserve the ID under its original account even if the user switched while waiting.
      try {
        localStorage.setItem(attemptKey(account), JSON.stringify(acknowledged));
      } catch {
        if (valid()) setStorageError(true);
      }
      if (!valid()) return;
      setAttempt(acknowledged);
      setJob(next);
      if (completed(next) && next.result) setOrigin({ kind: "job", id: next.id });
    }, "start");
  }
  function cancel() {
    if (!job || (!active(job) && job.status !== "unknown")) return;
    const jobId = job.id;
    void run(async (valid) => {
      const next = await cancelMusicInspiration({ data: { id: jobId } });
      if (!valid()) return;
      setJob(next);
      setOrigin(null);
      setPreview(false);
    });
  }
  const research =
    origin?.kind === "profile"
      ? selectedProfile?.result
      : origin?.id === job?.id && completed(job)
        ? job?.result
        : null;
  const parsed = inspirationResearchSchema.safeParse(research);
  const result = parsed.success ? parsed.data : null;
  async function verifiedResearch(source: Origin) {
    if (source.kind === "job") {
      const stored = await getMusicInspirationJob({ data: { id: source.id } });
      if (!completed(stored)) throw new Error("Result unavailable");
      return inspirationResearchSchema.parse(stored.result);
    }
    const stored = profilesResponseSchema
      .parse(await listMusicInspirationProfiles())
      .find((p) => p.id === source.id && p.revision === source.revision);
    if (!stored) throw new Error("Profile changed");
    return inspirationResearchSchema.parse(stored.result);
  }
  function apply(replace = false) {
    if (!origin || !fields.length) return;
    const source = origin;
    const selected = [...fields];
    setConfirm(null);
    void run(async (valid) => {
      const stored = await verifiedResearch(source);
      if (!valid()) return;
      const applied = applyInspirationProposal(
        latest.current.setup,
        stored.proposal,
        selected,
        replace ? "replace_selected" : "fill_empty",
      );
      latest.current.setup = applied.setup;
      latest.current.onApply(applied.setup);
      setSummary(applied);
      if (applied.appliedFields.length) {
        invalidatedOwnership.current.clear();
        setReceipt(applied.receipt ?? null);
      }
      setAmbiguous([]);
    });
  }
  function undo() {
    if (!receipt || busy || !latest.current.enabled) return;
    const invalidated = receipt.appliedFields.filter((field) =>
      invalidatedOwnership.current.has(field),
    );
    const undone = undoInspirationProposal(latest.current.setup, {
      ...receipt,
      appliedFields: receipt.appliedFields.filter(
        (field) => !invalidatedOwnership.current.has(field),
      ),
    });
    latest.current.setup = undone.setup;
    latest.current.onApply(undone.setup);
    setAmbiguous([...new Set([...invalidated, ...undone.ambiguousFields])]);
    setReceipt(null);
    setSummary(null);
  }
  function mutateProfile(action: "save" | "rename" | "update" | "delete") {
    const profile = selectedProfile;
    const jobId = job?.status === "completed" && job.result ? job.id : null;
    if ((action !== "save" && !profile) || (action === "save" && !jobId)) return;
    setConfirm(null);
    void run(async (valid) => {
      let changed: Profile | null = null;
      if (action === "save" && jobId)
        changed = await saveMusicInspirationProfile({ data: { jobId, name: name.trim() } });
      else if (action === "delete" && profile)
        await deleteMusicInspirationProfile({
          data: { id: profile.id, revision: profile.revision },
        });
      else if (profile)
        changed = await updateMusicInspirationProfile({
          data: {
            id: profile.id,
            revision: profile.revision,
            ...(action === "rename" ? { name: name.trim() } : { jobId: jobId! }),
          },
        });
      if (!valid()) return;
      if (action === "delete") {
        setProfileId("");
        if (origin?.kind === "profile") setOrigin(null);
      }
      if (changed) {
        setProfileId(changed.id);
        setName(changed.name);
        setOrigin({ kind: "profile", id: changed.id, revision: changed.revision });
      }
      await profiles.refetch();
    });
  }
  function chooseProfile(value: string) {
    const p = profiles.data?.find((entry) => entry.id === value);
    if (!p || busy) return;
    setProfileId(p.id);
    setName(p.name);
    setOrigin({ kind: "profile", id: p.id, revision: p.revision });
    setPreview(false);
    setSummary(null);
    setFields([...INSPIRATION_APPLY_FIELDS]);
  }
  const dropdownProps = (key: string) => ({
    open: dropdown === key,
    onOpenChange: (value: boolean) => setDropdown(value ? key : ""),
    searchPlaceholder: t.search,
    emptyText: t.empty,
  });
  const failureText = config.isError
    ? t.failedConfig
    : profiles.isError
      ? t.failedProfiles
      : poll.isError || failedStage === "status"
        ? t.failedStatus
        : failedStage === "start"
          ? t.failedStart
          : t.failed;
  const diagnostic = decodeInspirationDiagnostic(job?.error_code);
  const formatCost = (amount: number | null | undefined) =>
    amount == null
      ? t.usageUnknown
      : new Intl.NumberFormat(language === "el" ? "el-GR" : "en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 8,
        }).format(amount);
  const buttons = "flex flex-wrap gap-2";
  const previewValues = result
    ? {
        selectedMusicStyles: result.proposal.musicStyles.join(", "),
        selectedMoods: result.proposal.moods.join(", "),
        selectedInstruments: result.proposal.instruments.join(", "),
        bpm: result.proposal.bpm?.toString() ?? "",
        productionStyle: result.proposal.productionStyle,
        additionalInstructions: result.proposal.additionalInstructions,
        arrangement: result.proposal.blueprint
          .map(
            (s) =>
              `${s.sectionType} · ${s.energy == null ? t.unknown : `${s.energy}/5`} · ${s.instruction}`,
          )
          .join("\n"),
      }
    : null;
  if (!enabled || !sameOwner) return <p role="status">{access.isLoading ? t.loading : t.denied}</p>;
  return (
    <section
      aria-label={t.title}
      data-testid="music-inspiration-panel"
      className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-xl border p-3 [overflow-wrap:anywhere]"
    >
      <h2 className="font-semibold">{t.title}</h2>
      <CompactDropdown
        {...dropdownProps("profiles")}
        placeholder={t.profiles}
        options={(profiles.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        value={profileId}
        onValueChange={chooseProfile}
        disabled={busy || profiles.isPending || profiles.isError}
      />
      {(error || config.isError || profiles.isError || poll.isError) && (
        <div role="alert">
          <p>{failureText}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void config.refetch();
              void profiles.refetch();
              if (job) void poll.refetch();
              setError(false);
              setFailedStage(null);
            }}
          >
            {t.retry}
          </Button>
        </div>
      )}
      {config.isPending && <p role="status">{t.loading}</p>}
      {config.data && !config.data.configured && <p role="status">{t.unavailable}</p>}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          setDropdown("");
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            {t.open}
          </Button>
        </DialogTrigger>
        <DialogContent
          style={dialogViewport}
          className="flex max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] min-w-0 max-w-xl flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg p-3 [overflow-wrap:anywhere] sm:max-h-[90dvh] sm:gap-3 sm:p-5 [&>button:last-child]:hidden"
          aria-label={t.title}
        >
          <DialogTitle className="text-base leading-tight sm:text-lg">{t.title}</DialogTitle>
          <form
            className="min-w-0 max-w-full space-y-2 [&>button]:h-auto [&>button]:min-h-11 [&>button]:w-full [&>button]:max-w-full [&>button]:whitespace-normal [&>button]:break-words [&>button]:py-3 [&_input]:min-w-0 [&_textarea]:min-w-0 sm:space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            <select
              aria-label={t.mode}
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              disabled={busy || active(job)}
              className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-foreground"
            >
              <option value="artist">{t.artistMode}</option>
              <option value="description">{t.descriptionMode}</option>
            </select>
            {kind === "artist" ? (
              <>
                <label className="block" htmlFor={id + "artist"}>
                  {t.artist}
                </label>
                <Input
                  id={id + "artist"}
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  maxLength={180}
                  required
                  disabled={busy || active(job)}
                />
                <label className="block" htmlFor={id + "song"}>
                  {t.song}
                </label>
                <Input
                  id={id + "song"}
                  value={song}
                  onChange={(e) => setSong(e.target.value)}
                  maxLength={180}
                  disabled={busy || active(job)}
                />
              </>
            ) : (
              <>
                <label className="block" htmlFor={id + "description"}>
                  {t.freeform}
                </label>
                <Textarea
                  id={id + "description"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  minLength={10}
                  maxLength={1500}
                  required
                  disabled={busy || active(job)}
                />
              </>
            )}
            {config.data?.superAdmin && (
              <>
                <select
                  aria-label={t.depth}
                  value={depth}
                  onChange={(event) => setDepth(event.target.value as typeof depth)}
                  disabled={busy || active(job)}
                  className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-foreground"
                >
                  <option value="standard">{t.standard}</option>
                  <option value="extended">{t.extended}</option>
                </select>
                <select
                  aria-label={t.model}
                  value={modelOverride || "__default"}
                  onChange={(event) =>
                    setModelOverride(event.target.value === "__default" ? "" : event.target.value)
                  }
                  disabled={busy || active(job)}
                  className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-foreground"
                >
                  <option value="__default">{t.serverDefault}</option>
                  {config.data.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            {!config.data?.configured && <p role="status">{t.unavailable}</p>}
            {attempt && !attempt.jobId && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-9 w-full whitespace-normal break-words py-2 text-center"
                disabled={busy}
                onClick={discardPendingAttempt}
              >
                {t.discardPending}
              </Button>
            )}
            <Button
              variant="outline"
              type="submit"
              disabled={
                !request.success ||
                !config.data?.configured ||
                config.isError ||
                busy ||
                active(job) ||
                storageError ||
                job?.status === "unknown" ||
                (!!attempt?.jobId && !job)
              }
            >
              {busy
                ? t.loading
                : attempt && !attempt.jobId
                  ? request.success &&
                    attempt.fingerprint !==
                      JSON.stringify({
                        request: request.data,
                        model:
                          config.data?.superAdmin && modelOverride
                            ? modelOverride
                            : config.data?.defaultModel,
                      })
                    ? t.newResearch
                    : t.retryAttempt
                  : job
                    ? t.newResearch
                    : t.research}
            </Button>
          </form>
          {(active(job) || job?.status === "unknown") && (
            <div>
              <Button variant="outline" type="button" disabled={busy} onClick={cancel}>
                {job?.status === "unknown" ? t.closeUnknown : t.cancel}
              </Button>
              {job?.status === "unknown" && <p className="text-sm">{t.closeUnknownNote}</p>}
            </div>
          )}
          {(error || poll.isError) && (
            <p role="alert" className="min-w-0 break-words">
              {failureText}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.close}
          </Button>
        </DialogContent>
      </Dialog>
      {storageError && <p role="alert">{t.persistenceError}</p>}
      {recoveredPrevious && <p role="status">{t.previousRecovered}</p>}
      {(job || attempt?.jobId) && (
        <Button type="button" variant="outline" disabled={busy} onClick={refreshJob}>
          {t.refreshStatus}
        </Button>
      )}
      {job && (
        <div role="status" aria-label={t.status} className="space-y-1 break-words">
          <p>
            {completed(job)
              ? t.complete
              : job.status === "cancelled"
                ? t.cancelled
                : job.status === "unknown"
                  ? t.outcomeUnknown
                  : job.status === "failed"
                    ? t.failed
                    : job.status === "queued"
                      ? t.queued
                      : t.running}
          </p>
          {diagnostic && (
            <div
              role="alert"
              data-testid="inspiration-diagnostic"
              className="rounded border p-2 text-sm break-words"
            >
              <p>
                {t.diagnosticStage}: {t.diagnosticStages[diagnostic.stage]}
              </p>
              <p>
                {t.diagnosticCodes[diagnostic.code]}
                {diagnostic.httpStatus ? " · HTTP " + diagnostic.httpStatus : ""}
                {diagnostic.dbCode
                  ? " · " + t.diagnosticDatabaseCode + ": " + diagnostic.dbCode
                  : ""}
                {diagnostic.field ? " · " + t.diagnosticField + ": " + diagnostic.field : ""}
              </p>
              <p>
                {t.diagnosticReference}: {job.id}
              </p>
            </div>
          )}
          {completed(job) && !!job.result?.unresolvedQuestions.length && <p>{t.partial}</p>}
          <p>
            {t.model}: {job.model}
          </p>
          {!active(job) && (
            <div data-testid="inspiration-usage" className="space-y-1 rounded border p-2 text-sm">
              <p className="font-medium">{t.usageTitle}</p>
              <p>
                {t.inputTokens}: {job.usageReport?.inputTokens ?? t.usageUnknown} · {t.outputTokens}
                : {job.usageReport?.outputTokens ?? t.usageUnknown}
              </p>
              <p>
                {t.reasoningTokens}: {job.usageReport?.reasoningTokens ?? t.usageUnknown} ·{" "}
                {t.cachedTokens}: {job.usageReport?.cachedInputTokens ?? t.usageUnknown} ·{" "}
                {t.cacheWriteTokens}: {job.usageReport?.cacheWriteTokens ?? t.usageUnknown}
              </p>
              <p>
                {t.aiCost}: {formatCost(job.usageReport?.aiCostUsd)} · {t.searchCost}:{" "}
                {formatCost(job.usageReport?.searchCostUsd)} (
                {job.usageReport?.searchCredits ?? t.usageUnknown} {t.searchCredits})
              </p>
              <p className="font-medium">
                {t.totalCost}: {formatCost(job.usageReport?.totalCostUsd)}
              </p>
              {job.usageReport?.providerReportedCostUsd != null && (
                <p>
                  {t.providerCost}: {formatCost(job.usageReport.providerReportedCostUsd)}
                </p>
              )}
              <p>{t.costEstimateNote}</p>
            </div>
          )}
          {(active(job) || job.status === "unknown") && (
            <div>
              <Button variant="outline" type="button" disabled={busy} onClick={cancel}>
                {job.status === "unknown" ? t.closeUnknown : t.cancel}
              </Button>
              {job.status === "unknown" && <p className="text-sm">{t.closeUnknownNote}</p>}
            </div>
          )}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <div className={buttons}>
            <Button
              variant="outline"
              type="button"
              disabled={busy || !fields.length}
              onClick={() => apply()}
            >
              {t.apply}
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-expanded={preview}
              onClick={() => setPreview(!preview)}
            >
              {t.preview}
            </Button>
          </div>
          {preview && (
            <div className="space-y-4 break-words" data-testid="music-inspiration-preview">
              <h3 className="font-semibold">{t.evidence}</h3>
              {result.evidence.map((claim) => (
                <article key={claim.id} className="rounded border p-2">
                  <p>
                    {t[claim.classification]} · {claim.claim}
                  </p>
                  <p>{claim.limitation}</p>
                  <ul>
                    {claim.sourceIds.map((sid) => {
                      const source = result.sources.find((s) => s.id === sid);
                      return (
                        source && (
                          <li key={sid}>
                            <a
                              className="underline"
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {source.title}
                            </a>
                          </li>
                        )
                      );
                    })}
                  </ul>
                </article>
              ))}
              <h3 className="font-semibold">{t.sources}</h3>
              <ul>
                {result.sources.map((s) => (
                  <li key={s.id}>
                    <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>{" "}
                    · {s.publisher} · {s.locator} ·{" "}
                    <time dateTime={s.accessedAt}>
                      {new Date(s.accessedAt).toLocaleDateString(language)}
                    </time>
                  </li>
                ))}
              </ul>
              <h3 className="font-semibold">{t.unknown}</h3>
              <ul>
                {result.unresolvedQuestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <h3 className="font-semibold">{t.creative}</h3>
              <ul>
                {result.proposal.creativeChoices.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <fieldset className="space-y-2">
                <legend>{t.fields}</legend>
                {INSPIRATION_APPLY_FIELDS.map((field) => (
                  <label key={field} className="block rounded border p-2">
                    <span className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={t[field]}
                        checked={fields.includes(field)}
                        disabled={busy}
                        onChange={(e) =>
                          setFields((current) =>
                            e.target.checked
                              ? [...current, field]
                              : current.filter((f) => f !== field),
                          )
                        }
                      />
                      {t[field]}
                    </span>
                    <span className="block whitespace-pre-wrap text-sm">
                      {previewValues?.[field]}
                    </span>
                  </label>
                ))}
              </fieldset>
              {!fields.length && <p role="status">{t.noSelection}</p>}
              <Button
                type="button"
                variant="outline"
                disabled={busy || !fields.length}
                onClick={() => setConfirm("replace")}
              >
                {t.replace}
              </Button>
            </div>
          )}
        </div>
      )}
      {receipt && (
        <Button type="button" variant="outline" disabled={busy} onClick={undo}>
          {t.undo}
        </Button>
      )}
      {ambiguous.length > 0 && (
        <p role="status">
          {t.undoPreserved}: {ambiguous.map((f) => t[f]).join(", ")}
        </p>
      )}
      {summary && (
        <div role="status">
          <p>
            {t.applied}: {summary.appliedFields.map((f) => t[f]).join(", ")}
          </p>
          <p>
            {t.skipped}: {summary.skippedFields.map((f) => t[f]).join(", ")}
          </p>
        </div>
      )}
      {(result || selectedProfile || completed(job)) && (
        <div className="space-y-2">
          <label htmlFor={id + "name"}>{t.name}</label>
          <Input
            id={id + "name"}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <div className={buttons}>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !name.trim() || job?.status !== "completed" || !job?.result}
              onClick={() => mutateProfile("save")}
            >
              {t.save}
            </Button>
            {selectedProfile && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !name.trim()}
                  onClick={() => mutateProfile("rename")}
                >
                  {t.rename}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || job?.status !== "completed" || !job?.result}
                  onClick={() => mutateProfile("update")}
                >
                  {t.update}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm("delete")}
                >
                  {t.delete}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(value) => {
          if (!value) setConfirm(null);
        }}
      >
        <DialogContent
          style={dialogViewport}
          className="[&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:break-words max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] min-w-0 max-w-lg overflow-x-hidden overflow-y-auto overscroll-contain p-3 [overflow-wrap:anywhere] sm:p-6 [&>button:last-child]:hidden"
        >
          <DialogTitle>{confirm === "delete" ? t.deleteTitle : t.replaceTitle}</DialogTitle>
          <DialogDescription>
            {confirm === "delete" ? t.deleteDescription : t.replaceDescription}
          </DialogDescription>
          <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
            {t.back}
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => (confirm === "delete" ? mutateProfile("delete") : apply(true))}
          >
            {confirm === "delete" ? t.confirmDelete : t.confirm}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
