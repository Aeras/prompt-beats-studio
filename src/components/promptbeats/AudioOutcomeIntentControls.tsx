import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import {
  saveAudioOutcomeEvaluation,
  type AudioOutcomeEvaluation,
} from "@/lib/audio-outcome.functions";
import {
  createAudioRevisionIntent,
  getAudioRevisionIntent,
  updateAudioRevisionIntent,
} from "@/lib/audio-revision-intent.functions";
import { translateAudioRevisionIntent } from "@/lib/audio-revision-intent-ai.functions";
import type { UnresolvedRevisionSuggestion } from "@/lib/audio-revision-intent.shared";

type Props = {
  projectId: string;
  versionId: string;
  trackId: string;
  language: string;
  unavailable: boolean;
  evaluation: AudioOutcomeEvaluation | null;
  onOutcomeSaved: () => Promise<void>;
};

const outcomeOptions = [
  ["not_met", "Not matched", "Δεν ταίριαξε"],
  ["partially_met", "Partly matched", "Ταίριαξε εν μέρει"],
  ["mostly_met", "Mostly matched", "Ταίριαξε αρκετά"],
  ["met", "Matched", "Ταίριαξε"],
] as const;

export function AudioOutcomeIntentControls({
  projectId,
  versionId,
  trackId,
  language,
  unavailable,
  evaluation,
  onOutcomeSaved,
}: Props) {
  const el = language === "el";
  const [outcomeOpen, setOutcomeOpen] = useState(Boolean(evaluation));
  const [outcomeLevel, setOutcomeLevel] = useState(evaluation?.level ?? "mostly_met");
  const [outcomeNote, setOutcomeNote] = useState(evaluation?.note ?? "");
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [intentOpen, setIntentOpen] = useState(false);
  const [intentBusy, setIntentBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRequest, setDraftRequest] = useState("");
  const [keep, setKeep] = useState("");
  const [change, setChange] = useState("");
  const [brief, setBrief] = useState("");
  const [unresolved, setUnresolved] = useState<UnresolvedRevisionSuggestion[]>([]);
  const [proposal, setProposal] = useState<Awaited<ReturnType<typeof translateAudioRevisionIntent>> | null>(
    null,
  );
  const hydratedIntentId = useRef<string | null>(null);

  useEffect(() => {
    setOutcomeLevel(evaluation?.level ?? "mostly_met");
    setOutcomeNote(evaluation?.note ?? "");
  }, [evaluation]);

  const intentQuery = useQuery({
    queryKey: ["audio-revision-intent", projectId, versionId, trackId],
    queryFn: () => getAudioRevisionIntent({ data: { projectId, versionId, trackId } }),
    enabled: intentOpen,
  });
  const intent = intentQuery.data?.intent ?? null;

  useEffect(() => {
    if (!intent || hydratedIntentId.current === intent.id) return;
    hydratedIntentId.current = intent.id;
    setDraftRequest(intent.userRequest);
    setKeep(intent.acceptedKeep);
    setChange(intent.acceptedChange);
    setBrief(intent.acceptedRevisionBrief);
    setUnresolved(intent.unresolvedSuggestions);
  }, [intent]);

  const saveOutcome = async () => {
    if (outcomeBusy || unavailable) return;
    setOutcomeBusy(true);
    setError(null);
    try {
      await saveAudioOutcomeEvaluation({
        data: {
          projectId,
          versionId,
          trackId,
          level: outcomeLevel,
          note: outcomeNote,
          expectedLockVersion: evaluation?.lockVersion ?? null,
        },
      });
      await onOutcomeSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Outcome could not be saved.");
    } finally {
      setOutcomeBusy(false);
    }
  };

  const ensureIntent = async () => {
    if (intent || intentBusy || unavailable) return intent?.id ?? null;
    setIntentBusy(true);
    setError(null);
    try {
      const created = await createAudioRevisionIntent({
        data: { projectId, versionId, trackId, userRequest: draftRequest },
      });
      await intentQuery.refetch();
      return created.intentId;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revision draft could not be created.");
      return null;
    } finally {
      setIntentBusy(false);
    }
  };

  const saveIntent = async () => {
    const intentId = intent?.id ?? (await ensureIntent());
    const current = intent ?? (await intentQuery.refetch()).data?.intent ?? null;
    if (!intentId || !current || intentBusy || unavailable) return null;
    setIntentBusy(true);
    setError(null);
    try {
      const saved = await updateAudioRevisionIntent({
        data: {
          projectId,
          versionId,
          trackId,
          intentId,
          expectedLockVersion: current.lockVersion,
          userRequest: draftRequest,
          acceptedKeep: keep,
          acceptedChange: change,
          acceptedRevisionBrief: brief,
          unresolvedSuggestions: unresolved,
        },
      });
      await intentQuery.refetch();
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revision draft could not be saved.");
      return null;
    } finally {
      setIntentBusy(false);
    }
  };

  const askAi = async () => {
    if (aiBusy || unavailable) return;
    const saved = await saveIntent();
    const current = (await intentQuery.refetch()).data?.intent ?? intent;
    if (!saved || !current || !draftRequest.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const result = await translateAudioRevisionIntent({
        data: {
          projectId,
          versionId,
          trackId,
          intentId: current.id,
          requestKey: crypto.randomUUID(),
        },
      });
      setProposal(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI interpretation failed.");
    } finally {
      setAiBusy(false);
    }
  };

  const acceptProposal = () => {
    if (!proposal) return;
    setKeep(proposal.proposal.keep);
    setChange(proposal.proposal.change);
    setBrief(proposal.proposal.revisionBrief);
    setUnresolved(proposal.unresolvedSections);
  };

  return (
    <div className="w-full border-t border-white/10 pt-2.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOutcomeOpen((value) => !value)}
          disabled={unavailable}
          className="min-h-10 rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          {evaluation ? (el ? "Αξιολόγηση αποτελέσματος" : "Outcome evaluation") : el ? "Πώς πέτυχε;" : "How did it land?"}
        </button>
        <button
          type="button"
          onClick={() => setIntentOpen((value) => !value)}
          disabled={unavailable}
          className="min-h-10 rounded-lg border border-accent/25 px-3 text-[10px] font-semibold text-accent disabled:opacity-40"
        >
          {el ? "Σχεδίασε αλλαγή" : "Plan a revision"}
        </button>
        <Link
          to="/audio-revision"
          search={{ project: projectId, version: versionId, track: trackId }}
          className="inline-flex min-h-10 items-center rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-muted-foreground hover:text-accent"
        >
          {el ? "Χειροκίνητο Audio Revision" : "Manual Audio Revision"}
        </Link>
      </div>

      {outcomeOpen && (
        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="block text-[10px] font-semibold text-muted-foreground">
            {el ? "Ταίριαξε με την πρόθεσή σου;" : "Did it match your intent?"}
            <select
              value={outcomeLevel}
              onChange={(event) => setOutcomeLevel(event.target.value as typeof outcomeLevel)}
              disabled={unavailable || outcomeBusy}
              className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-foreground"
            >
              {outcomeOptions.map(([value, en, gr]) => (
                <option key={value} value={value}>
                  {el ? gr : en}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-semibold text-muted-foreground">
            {el ? "Ιδιωτική σημείωση (προαιρετική)" : "Private note (optional)"}
            <textarea
              value={outcomeNote}
              onChange={(event) => setOutcomeNote(event.target.value)}
              maxLength={1000}
              rows={2}
              disabled={unavailable || outcomeBusy}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={saveOutcome}
            disabled={unavailable || outcomeBusy}
            className="min-h-10 rounded-lg bg-accent/15 px-3 text-xs font-semibold text-accent disabled:opacity-40"
          >
            {outcomeBusy ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : el ? "Αποθήκευση" : "Save outcome"}
          </button>
        </div>
      )}

      {intentOpen && (
        <div className="mt-2 space-y-3 rounded-xl border border-accent/20 bg-accent/[0.025] p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              {el ? "Revision Intent Draft" : "Revision Intent Draft"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {el
                ? "Γράψε με δικά σου λόγια τι θέλεις να αλλάξει. Το AI είναι προαιρετικό και προτείνει μόνο."
                : "Describe what you want changed. AI is optional and only proposes."}
            </p>
          </div>
          <textarea
            value={draftRequest}
            onChange={(event) => setDraftRequest(event.target.value)}
            maxLength={4000}
            rows={3}
            disabled={unavailable || intentBusy || intent?.status === "completed"}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs text-foreground"
            aria-label={el ? "Τι θέλεις να αλλάξει" : "What should change"}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveIntent}
              disabled={unavailable || intentBusy || intent?.status === "completed"}
              className="min-h-10 rounded-lg border border-white/10 px-3 text-[10px] font-semibold disabled:opacity-40"
            >
              {intentBusy ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : el ? "Αποθήκευση Draft" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={askAi}
              disabled={unavailable || aiBusy || !draftRequest.trim() || intent?.status === "completed"}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent/25 px-3 text-[10px] font-semibold text-accent disabled:opacity-40"
            >
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {el ? "Ερμηνεία με AI" : "Interpret with AI"}
            </button>
          </div>

          {proposal && (
            <div className="space-y-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.03] p-3">
              <p className="text-[10px] font-semibold text-cyan-200">
                {el ? "Πρόταση AI — δεν έχει εφαρμοστεί" : "AI proposal — not applied"}
              </p>
              <p className="text-[10px] text-muted-foreground"><strong>Keep:</strong> {proposal.proposal.keep || "—"}</p>
              <p className="text-[10px] text-muted-foreground"><strong>Change:</strong> {proposal.proposal.change || "—"}</p>
              <p className="text-[10px] text-muted-foreground"><strong>Brief:</strong> {proposal.proposal.revisionBrief || "—"}</p>
              {proposal.resolvedSections.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  {proposal.resolvedSections.map((item) => (
                    <p key={`${item.structureIndex}:${item.instruction}`}>
                      {item.sectionLabel} #{item.occurrence}: {item.instruction}
                    </p>
                  ))}
                </div>
              )}
              {proposal.unresolvedSections.length > 0 && (
                <p className="text-[10px] text-amber-300">
                  {el ? "Υπάρχουν προτάσεις section που χρειάζονται χειροκίνητη επίλυση." : "Some section suggestions need manual resolution."}
                </p>
              )}
              <button
                type="button"
                onClick={acceptProposal}
                className="min-h-10 rounded-lg border border-cyan-300/20 px-3 text-[10px] font-semibold text-cyan-200"
              >
                {el ? "Χρήση πρότασης για επεξεργασία" : "Use proposal for editing"}
              </button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-semibold text-muted-foreground">
              Keep
              <textarea value={keep} onChange={(event) => setKeep(event.target.value)} maxLength={900} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-foreground" />
            </label>
            <label className="text-[10px] font-semibold text-muted-foreground">
              Change
              <textarea value={change} onChange={(event) => setChange(event.target.value)} maxLength={1200} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-foreground" />
            </label>
          </div>
          <label className="block text-[10px] font-semibold text-muted-foreground">
            Revision Brief
            <textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-foreground" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveIntent}
              disabled={unavailable || intentBusy || intent?.status === "completed"}
              className="min-h-10 rounded-lg bg-accent/15 px-3 text-[10px] font-semibold text-accent disabled:opacity-40"
            >
              {el ? "Αποθήκευση αποδεκτής κατεύθυνσης" : "Save accepted direction"}
            </button>
            {intent && intent.status === "draft" && (keep.trim() || change.trim()) && (
              <Link
                to="/audio-revision"
                search={{ project: projectId, version: versionId, track: trackId, intent: intent.id }}
                className="inline-flex min-h-10 items-center rounded-lg bg-gradient-neon px-3 text-[10px] font-semibold text-primary-foreground"
              >
                {el ? "Συνέχεια στο Audio Revision" : "Continue to Audio Revision"}
              </Link>
            )}
            {intent?.createdRevisionPromptId && (
              <span className="inline-flex min-h-10 items-center rounded-lg border border-emerald-400/20 px-3 text-[10px] text-emerald-300">
                {el ? "Η revision έκδοση έχει ήδη δημιουργηθεί." : "The revision version already exists."}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[10px] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
