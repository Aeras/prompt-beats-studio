import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, MessageSquare, RefreshCw, RotateCcw, Send, Shield, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import {
  CASE_MESSAGE_TYPES,
  CASE_OUTCOMES,
  addModerationCaseNote,
  approveInitialCaseDecision,
  finalizeModerationCaseAppeal,
  getModerationCase,
  listModerationCaseAssignees,
  markModerationCaseRead,
  proposeInitialCaseDecision,
  proposeModerationCaseAppealDecision,
  reassignModerationCase,
  reopenModerationCase,
  sendModerationCaseMessage,
  submitModerationCaseAppeal,
  type CaseMessageType,
  type CaseOutcome,
  type ModerationCaseDetail,
} from "@/lib/moderation-cases.functions";
import { cn } from "@/lib/utils";

const messageTypeLabel = (type: CaseMessageType, el: boolean) => ({
  request_information: el ? "Αίτημα πληροφοριών" : "Request Information",
  request_proof_rights: el ? "Αίτημα αποδεικτικών δικαιωμάτων" : "Request Proof of Rights",
  request_clarification: el ? "Αίτημα διευκρίνισης" : "Request Clarification",
  temporary_restriction: el ? "Ενημέρωση προσωρινού περιορισμού" : "Temporary Restriction",
  general: el ? "Γενικό μήνυμα υπόθεσης" : "General Case Message",
}[type]);

const outcomeLabel = (outcome: string | null | undefined, el: boolean) => {
  const labels: Record<string, string> = {
    action_taken: el ? "Παράβαση — ελήφθη ενέργεια" : "Violation — action taken",
    no_violation: el ? "Δεν διαπιστώθηκε παράβαση" : "No violation found",
    dismissed_abuse: el ? "Απόρριψη αναφοράς / κατάχρηση" : "Report dismissed / abuse",
  };
  return labels[outcome ?? ""] ?? outcome ?? "—";
};

const statusLabel = (status: string, el: boolean) => {
  const labels: Record<string, string> = {
    open: el ? "Ανοιχτή" : "Open",
    awaiting_creator_response: el ? "Αναμονή απάντησης δημιουργού" : "Awaiting creator response",
    under_review: el ? "Υπό εξέταση" : "Under review",
    awaiting_admin_decision: el ? "Αναμονή έγκρισης Admin" : "Awaiting Admin approval",
    decision_issued: el ? "Αρχική απόφαση εκδόθηκε" : "Initial decision issued",
    appeal_submitted: el ? "Υποβλήθηκε ένσταση" : "Appeal submitted",
    appeal_under_admin_review: el ? "Ένσταση υπό επανεξέταση Admin" : "Appeal under Admin review",
    pending_super_admin_approval: el ? "Αναμονή τελικής έγκρισης Super Admin" : "Pending Super Admin final approval",
    final_closed: el ? "Οριστικά κλειστή" : "Final closed",
  };
  return labels[status] ?? status;
};

function caseError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function EventCard({ event, el }: { event: ModerationCaseDetail["events"][number]; el: boolean }) {
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
  const reason = typeof payload["reason"] === "string" ? payload["reason"] : null;
  const actionSummary = typeof payload["action_summary"] === "string" ? payload["action_summary"] : null;
  const outcome = typeof payload["outcome"] === "string" ? payload["outcome"] : null;
  const labels: Record<string,string> = {
    case_opened: el ? "Η υπόθεση άνοιξε." : "Case opened.",
    case_assigned: el ? "Η υπόθεση ανατέθηκε σε διαχειριστή." : "Case assigned to a reviewer.",
    case_reassigned: el ? "Η υπόθεση ανατέθηκε εκ νέου." : "Case reassigned.",
    case_released: el ? "Η υπόθεση επέστρεψε στην ουρά." : "Case returned to the queue.",
    creator_contacted: el ? "Η ομάδα moderation επικοινώνησε με τον δημιουργό." : "PromptBeats Moderation contacted the creator.",
    staff_message_sent: el ? "Νέο μήνυμα από την ομάδα moderation." : "New message from PromptBeats Moderation.",
    creator_reply: el ? "Ο δημιουργός απάντησε." : "Creator replied.",
    internal_note_added: el ? "Προστέθηκε εσωτερική σημείωση." : "Internal note added.",
    initial_decision_proposed: el ? "Προτάθηκε αρχική απόφαση." : "Initial decision proposed.",
    initial_decision_issued: el ? "Εκδόθηκε η αρχική απόφαση." : "Initial decision issued.",
    appeal_submitted: el ? "Υποβλήθηκε ένσταση." : "Appeal submitted.",
    appeal_decision_proposed: el ? "Ο Admin υπέβαλε προτεινόμενη απόφαση ένστασης." : "Admin submitted a proposed appeal outcome.",
    appeal_returned_for_review: el ? "Η ένσταση επέστρεψε για περαιτέρω εξέταση." : "Appeal returned for further review.",
    final_decision_issued: el ? "Εκδόθηκε η τελική απόφαση." : "Final decision issued.",
    case_closed: el ? "Η υπόθεση έκλεισε." : "Case closed.",
    case_reopened: el ? "Η υπόθεση άνοιξε ξανά κατ’ εξαίρεση." : "Case exceptionally reopened.",
  };
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
    <div className="flex items-start gap-2">
      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{labels[event.event_type] ?? event.event_type}</p>
        {outcome && <p className="mt-1 text-xs text-muted-foreground">{outcomeLabel(outcome, el)}</p>}
        {reason && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{reason}</p>}
        {actionSummary && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{actionSummary}</p>}
        <p className="mt-2 text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleString(el ? "el-GR" : "en-US")}</p>
      </div>
    </div>
  </div>;
}

export function ModerationCaseThread({
  caseId,
  staffView = false,
  onChanged,
}: {
  caseId: string;
  staffView?: boolean | undefined;
  onChanged?: (() => void) | undefined;
}) {
  const { language } = useI18n();
  const el = language === "el";
  const qc = useQueryClient();
  const [messageType, setMessageType] = useState<CaseMessageType>("request_information");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<CaseOutcome>("action_taken");
  const [reason, setReason] = useState("");
  const [actionSummary, setActionSummary] = useState("");
  const [appealEligible, setAppealEligible] = useState(true);
  const [appeal, setAppeal] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [overrideMode, setOverrideMode] = useState(false);

  const detail = useQuery({
    queryKey: ["moderation-case", caseId],
    queryFn: () => getModerationCase({ data: { caseId } }),
    refetchInterval: 10_000,
  });
  const item = detail.data as ModerationCaseDetail | undefined;
  const effectiveStaffView = staffView || item?.permissions.is_staff === true;
  const assignees = useQuery({
    queryKey: ["moderation-case-assignees"],
    queryFn: () => listModerationCaseAssignees(),
    enabled: Boolean(item?.permissions.can_reassign),
  });

  useEffect(() => {
    if (!item) return;
    setAssigneeId(item.assigned_to ?? "");
    void markModerationCaseRead({ data: { caseId } }).then(() => {
      void qc.invalidateQueries({ queryKey: ["moderation-case-unread-count"] });
      void qc.invalidateQueries({ queryKey: ["my-moderation-cases"] });
      void qc.invalidateQueries({ queryKey: ["content-reports"] });
    }).catch(() => undefined);
  }, [caseId, item?.updated_at]);

  const timeline = useMemo(() => {
    if (!item) return [];
    return [
      ...item.messages.map((value) => ({ kind: "message" as const, at: value.created_at, value })),
      ...item.events
        .filter((event) => !["staff_message_sent","creator_reply","creator_contacted"].includes(event.event_type))
        .map((value) => ({ kind: "event" as const, at: value.created_at, value })),
    ].sort((a,b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [item]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["moderation-case", caseId] }),
      qc.invalidateQueries({ queryKey: ["content-reports"] }),
      qc.invalidateQueries({ queryKey: ["my-moderation-cases"] }),
      qc.invalidateQueries({ queryKey: ["moderation-case-unread-count"] }),
    ]);
    onChanged?.();
  };

  const send = useMutation({
    mutationFn: () => sendModerationCaseMessage({ data: { caseId, messageType, body: message } }),
    onSuccess: async () => { setMessage(""); await refresh(); toast.success(el ? "Το μήνυμα στάλθηκε." : "Message sent."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν στάλθηκε το μήνυμα." : "Could not send message.")),
  });
  const addNote = useMutation({
    mutationFn: () => addModerationCaseNote({ data: { caseId, body: note } }),
    onSuccess: async () => { setNote(""); await refresh(); toast.success(el ? "Η σημείωση προστέθηκε." : "Internal note added."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν προστέθηκε η σημείωση." : "Could not add note.")),
  });
  const propose = useMutation({
    mutationFn: () => proposeInitialCaseDecision({ data: {
      caseId,
      outcome,
      reason,
      ...(actionSummary ? { actionSummary } : {}),
      appealEligible,
    } }),
    onSuccess: async () => { setReason(""); setActionSummary(""); await refresh(); toast.success(el ? "Η απόφαση στάλθηκε για έγκριση." : "Decision sent for approval."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν αποθηκεύτηκε η πρόταση." : "Could not save proposal.")),
  });
  const approve = useMutation({
    mutationFn: () => approveInitialCaseDecision({ data: { caseId } }),
    onSuccess: async () => { await refresh(); toast.success(el ? "Η αρχική απόφαση εγκρίθηκε." : "Initial decision approved."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν εγκρίθηκε η απόφαση." : "Could not approve decision.")),
  });
  const appealMutation = useMutation({
    mutationFn: () => submitModerationCaseAppeal({ data: { caseId, statement: appeal } }),
    onSuccess: async () => { setAppeal(""); await refresh(); toast.success(el ? "Η ένσταση υποβλήθηκε." : "Appeal submitted."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν υποβλήθηκε η ένσταση." : "Could not submit appeal.")),
  });
  const appealProposal = useMutation({
    mutationFn: () => proposeModerationCaseAppealDecision({ data: {
      caseId,
      outcome,
      reason,
      ...(actionSummary ? { actionSummary } : {}),
    } }),
    onSuccess: async () => { setReason(""); setActionSummary(""); await refresh(); toast.success(el ? "Η πρόταση ένστασης στάλθηκε στον Super Admin." : "Appeal proposal sent to Super Admin."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν αποθηκεύτηκε η πρόταση." : "Could not save appeal proposal.")),
  });
  const finalize = useMutation({
    mutationFn: (action: "approve"|"override"|"return") => finalizeModerationCaseAppeal({ data: {
      caseId,
      action,
      ...(action === "override" ? {
        overrideOutcome: outcome,
        overrideReason: reason,
        ...(actionSummary ? { overrideActionSummary: actionSummary } : {}),
      } : {}),
    } }),
    onSuccess: async () => { setReason(""); setActionSummary(""); setOverrideMode(false); await refresh(); toast.success(el ? "Η τελική ενέργεια καταχωρήθηκε." : "Final action saved."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν ολοκληρώθηκε η ενέργεια." : "Could not complete action.")),
  });
  const reassign = useMutation({
    mutationFn: () => reassignModerationCase({ data: { caseId, assigneeId: assigneeId || null } }),
    onSuccess: async () => { await refresh(); toast.success(el ? "Η ανάθεση ενημερώθηκε." : "Assignment updated."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν άλλαξε η ανάθεση." : "Could not update assignment.")),
  });
  const reopen = useMutation({
    mutationFn: () => reopenModerationCase({ data: { caseId } }),
    onSuccess: async () => { await refresh(); toast.success(el ? "Η υπόθεση άνοιξε ξανά." : "Case reopened."); },
    onError: (e) => toast.error(caseError(e, el ? "Δεν άνοιξε ξανά η υπόθεση." : "Could not reopen case.")),
  });

  if (detail.isLoading) return <div className="grid min-h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>;
  if (detail.isError || !item) return <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{el ? "Δεν ήταν δυνατή η φόρτωση της υπόθεσης." : "Could not load this case."}</div>;

  return <div className="space-y-4">
    <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary">{el ? "Υπόθεση moderation" : "Moderation Case"}</p>
          <h3 className="mt-1 font-display text-lg font-bold">{item.track_title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">#{item.id.slice(0,8)} · {statusLabel(item.status, el)}</p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">{statusLabel(item.status, el)}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{el ? "Λόγος αναφοράς" : "Report reason"}</p>
          <p className="mt-1 text-sm">{item.report_category}</p>
          {item.report_details && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.report_details}</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{el ? "Χειριστής" : "Handler"}</p>
          <p className="mt-1 text-sm">{item.assigned_label || (el ? "Δεν έχει ανατεθεί" : "Unassigned")}</p>
          {effectiveStaffView && item.creator_label && <p className="mt-2 text-xs text-muted-foreground">{el ? "Δημιουργός:" : "Creator:"} {item.creator_label}</p>}
        </div>
      </div>
    </section>

    {effectiveStaffView && item.permissions.can_reassign && <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
      <p className="text-xs font-semibold">{el ? "Ανάθεση υπόθεσης" : "Case assignment"}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-10 flex-1 rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm">
          <option value="">{el ? "Επιστροφή στην ουρά" : "Release to queue"}</option>
          {(assignees.data ?? []).map((a) => <option key={a.user_id} value={a.user_id}>{a.label} · {a.role}</option>)}
        </select>
        <button type="button" disabled={reassign.isPending} onClick={() => reassign.mutate()} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-accent disabled:opacity-50">
          {reassign.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (el ? "Ενημέρωση ανάθεσης" : "Update assignment")}
        </button>
      </div>
    </section>}

    <section className="space-y-2">
      <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-accent" /><p className="text-xs font-semibold">{el ? "Ιστορικό υπόθεσης" : "Case history"}</p></div>
      {timeline.length === 0 && <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-muted-foreground">{el ? "Δεν υπάρχει ακόμη επικοινωνία." : "No communication yet."}</div>}
      {timeline.map((entry) => entry.kind === "event"
        ? <EventCard key={`event-${entry.value.id}`} event={entry.value} el={el} />
        : <div key={`message-${entry.value.id}`} className={cn("rounded-xl border p-3", entry.value.sender_side === "staff" ? "border-primary/20 bg-primary/5" : "border-white/10 bg-black/20")}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold">{entry.value.sender_side === "staff" ? (el ? "PromptBeats Moderation" : "PromptBeats Moderation") : (effectiveStaffView ? (entry.value.sender_label || (el ? "Δημιουργός" : "Creator")) : (el ? "Εσείς" : "You"))}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(entry.value.created_at).toLocaleString(el ? "el-GR" : "en-US")}</p>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{messageTypeLabel(entry.value.message_type, el)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{entry.value.body}</p>
          </div>
      )}
    </section>

    {item.permissions.can_write && <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
      <p className="text-xs font-semibold">{effectiveStaffView ? (el ? "Μήνυμα προς δημιουργό" : "Message creator") : (el ? "Απάντηση στην υπόθεση" : "Reply to case")}</p>
      {effectiveStaffView && <select value={messageType} onChange={(e) => setMessageType(e.target.value as CaseMessageType)} className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm">
        {CASE_MESSAGE_TYPES.map((type) => <option key={type} value={type}>{messageTypeLabel(type, el)}</option>)}
      </select>}
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={4} placeholder={effectiveStaffView ? (el ? "Γράψτε μόνο το συγκεκριμένο αίτημα ή την ενημέρωση για την υπόθεση…" : "Write only the case-specific request or update…") : (el ? "Γράψτε την απάντησή σας…" : "Write your reply…")} className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
      <button type="button" disabled={send.isPending || !message.trim()} onClick={() => send.mutate()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{el ? "Αποστολή" : "Send"}
      </button>
    </section>}

    {effectiveStaffView && item.permissions.can_add_note && <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
      <div className="flex items-center gap-2"><StickyNote className="h-4 w-4 text-amber-200" /><p className="text-xs font-semibold">{el ? "Εσωτερική σημείωση" : "Internal moderation note"}</p></div>
      <p className="mt-1 text-[11px] text-muted-foreground">{el ? "Δεν είναι ορατή στον δημιουργό." : "Never visible to the creator."}</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} rows={3} className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
      <button type="button" disabled={addNote.isPending || !note.trim()} onClick={() => addNote.mutate()} className="mt-3 rounded-xl border border-amber-300/25 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">{el ? "Προσθήκη σημείωσης" : "Add note"}</button>
      {item.notes.length > 0 && <div className="mt-4 space-y-2">{item.notes.map((n) => <div key={n.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] font-semibold">{n.author_label || "Staff"}</p><p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</p><p className="mt-2 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString(el ? "el-GR" : "en-US")}</p></div>)}</div>}
    </section>}

    {effectiveStaffView && item.permissions.can_propose_initial && item.status !== "pending_super_admin_approval" && !item.appeal && <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><p className="text-xs font-semibold">{el ? "Πρόταση αρχικής απόφασης" : "Propose initial decision"}</p></div>
      <select value={outcome} onChange={(e) => setOutcome(e.target.value as CaseOutcome)} className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm">{CASE_OUTCOMES.map((o) => <option key={o} value={o}>{outcomeLabel(o, el)}</option>)}</select>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} placeholder={el ? "Βασικός λόγος απόφασης" : "Decision reason"} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
      <textarea value={actionSummary} onChange={(e) => setActionSummary(e.target.value)} maxLength={2000} rows={2} placeholder={el ? "Ενέργεια που ελήφθη (προαιρετικό)" : "Action taken (optional)"} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={appealEligible} onChange={(e) => setAppealEligible(e.target.checked)} />{el ? "Επιτρέπεται ένσταση" : "Appeal available"}</label>
      <button type="button" disabled={propose.isPending || !reason.trim()} onClick={() => propose.mutate()} className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{el ? "Αποστολή για έγκριση Admin" : "Send for Admin approval"}</button>
    </section>}

    {effectiveStaffView && item.status === "awaiting_admin_decision" && <section className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4">
      <p className="text-xs font-semibold">{el ? "Αρχική απόφαση σε αναμονή έγκρισης" : "Initial decision awaiting approval"}</p>
      <p className="mt-2 text-sm">{outcomeLabel(item.initial_decision_outcome, el)}</p>
      {item.initial_decision_reason && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.initial_decision_reason}</p>}
      {item.permissions.can_approve_initial ? <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{el ? "Έγκριση αρχικής απόφασης" : "Approve initial decision"}</button> : <p className="mt-3 text-xs text-amber-200">{el ? "Απαιτείται έγκριση από άλλον Admin ή Super Admin." : "Approval by another Admin or a Super Admin is required."}</p>}
    </section>}

    {!effectiveStaffView && item.permissions.can_appeal && <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
      <p className="text-xs font-semibold">{el ? "Υποβολή ένστασης" : "Appeal Decision"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{el ? "Η ένσταση θα επανεξεταστεί σε επίπεδο Admin και η τελική απόφαση θα εγκριθεί μόνο από Super Admin." : "An Admin will re-review the appeal and only a Super Admin can give final approval."}</p>
      <textarea value={appeal} onChange={(e) => setAppeal(e.target.value)} maxLength={5000} rows={5} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
      <button type="button" disabled={appealMutation.isPending || !appeal.trim()} onClick={() => appealMutation.mutate()} className="mt-3 rounded-xl border border-amber-300/30 px-4 py-2.5 text-xs font-semibold text-amber-100 disabled:opacity-50">{el ? "Υποβολή ένστασης" : "Submit appeal"}</button>
    </section>}

    {effectiveStaffView && item.appeal && <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
      <p className="text-xs font-semibold">{el ? "Ένσταση δημιουργού" : "Creator appeal"}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.appeal.statement}</p>
      {item.permissions.can_propose_appeal && <>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as CaseOutcome)} className="mt-4 h-10 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm">{CASE_OUTCOMES.map((o) => <option key={o} value={o}>{outcomeLabel(o, el)}</option>)}</select>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} placeholder={el ? "Πρόταση Admin για την ένσταση" : "Admin appeal decision reason"} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
        <textarea value={actionSummary} onChange={(e) => setActionSummary(e.target.value)} maxLength={2000} rows={2} placeholder={el ? "Ενέργεια (προαιρετικό)" : "Action (optional)"} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
        <button type="button" disabled={appealProposal.isPending || !reason.trim()} onClick={() => appealProposal.mutate()} className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{el ? "Υποβολή στον Super Admin" : "Submit to Super Admin"}</button>
      </>}
      {item.permissions.can_finalize_appeal && <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-semibold">{el ? "Τελική έγκριση Super Admin" : "Super Admin final approval"}</p>
        {item.appeal.admin_proposed_outcome && <p className="mt-2 text-sm">{outcomeLabel(item.appeal.admin_proposed_outcome, el)}</p>}
        {item.appeal.admin_proposed_reason && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.appeal.admin_proposed_reason}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={finalize.isPending} onClick={() => finalize.mutate("approve")} className="rounded-xl bg-gradient-neon px-4 py-2 text-xs font-semibold text-primary-foreground">{el ? "Έγκριση" : "Approve"}</button>
          <button type="button" disabled={finalize.isPending} onClick={() => finalize.mutate("return")} className="rounded-xl border border-white/10 px-4 py-2 text-xs">{el ? "Επιστροφή για επανεξέταση" : "Return for review"}</button>
          <button type="button" onClick={() => setOverrideMode((v) => !v)} className="rounded-xl border border-amber-300/20 px-4 py-2 text-xs text-amber-100">{el ? "Override" : "Override"}</button>
        </div>
        {overrideMode && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.03] p-3">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as CaseOutcome)} className="h-10 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 text-sm">{CASE_OUTCOMES.map((o) => <option key={o} value={o}>{outcomeLabel(o, el)}</option>)}</select>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} placeholder={el ? "Τελικός λόγος override" : "Final override reason"} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
          <textarea value={actionSummary} onChange={(e) => setActionSummary(e.target.value)} maxLength={2000} rows={2} placeholder={el ? "Τελική ενέργεια" : "Final action"} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm" />
          <button type="button" disabled={finalize.isPending || !reason.trim()} onClick={() => finalize.mutate("override")} className="mt-3 rounded-xl border border-amber-300/30 px-4 py-2 text-xs font-semibold text-amber-100">{el ? "Οριστικοποίηση override" : "Finalize override"}</button>
        </div>}
      </div>}
    </section>}

    {effectiveStaffView && item.permissions.can_reopen && <button type="button" disabled={reopen.isPending} onClick={() => reopen.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs text-muted-foreground hover:text-foreground"><RotateCcw className="h-4 w-4" />{el ? "Εξαιρετικό άνοιγμα υπόθεσης" : "Exceptionally reopen case"}</button>}

    <button type="button" onClick={() => void detail.refetch()} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-accent"><RefreshCw className="h-3.5 w-3.5" />{el ? "Ανανέωση" : "Refresh"}</button>
  </div>;
}
