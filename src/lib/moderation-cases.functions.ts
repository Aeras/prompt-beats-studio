import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export const CASE_MESSAGE_TYPES = [
  "request_information",
  "request_proof_rights",
  "request_clarification",
  "temporary_restriction",
  "general",
] as const;

export const CASE_OUTCOMES = ["action_taken","no_violation","dismissed_abuse"] as const;
export const CASE_FINAL_ACTIONS = ["approve","override","return"] as const;

export type CaseMessageType = (typeof CASE_MESSAGE_TYPES)[number];
export type CaseOutcome = (typeof CASE_OUTCOMES)[number];
export type CaseFinalAction = (typeof CASE_FINAL_ACTIONS)[number];

export type ModerationCaseListItem = {
  id: string;
  report_id: string;
  status: string;
  updated_at: string;
  track_title: string;
  category: string;
  assigned_label?: string | null;
  unread_count: number;
};

export type ModerationCaseMessage = {
  id: string;
  sender_user_id?: string | null;
  sender_side: "creator" | "staff";
  message_type: CaseMessageType;
  body: string;
  created_at: string;
  sender_label?: string | null;
};

export type ModerationCaseEvent = {
  id: string;
  event_type: string;
  actor_role?: string | null;
  creator_visible: boolean;
  payload: Json;
  created_at: string;
};

export type ModerationCaseNote = {
  id: string;
  author_user_id?: string | null;
  body: string;
  created_at: string;
  author_label?: string | null;
};

export type ModerationCaseAppeal = {
  id: string;
  statement: string;
  status: string;
  submitted_at: string;
  admin_proposed_outcome?: CaseOutcome | null;
  admin_proposed_reason?: string | null;
  admin_action_summary?: string | null;
  final_outcome?: CaseOutcome | null;
  final_reason?: string | null;
  final_action_summary?: string | null;
  finalized_at?: string | null;
};

export type ModerationCasePermissions = {
  is_staff: boolean;
  actor_role: string;
  can_write: boolean;
  can_add_note: boolean;
  can_reassign: boolean;
  can_propose_initial: boolean;
  can_approve_initial: boolean;
  can_appeal: boolean;
  can_propose_appeal: boolean;
  can_finalize_appeal: boolean;
  can_reopen: boolean;
};

export type ModerationCaseDetail = {
  id: string;
  report_id: string;
  target_owner_id?: string | null;
  assigned_to?: string | null;
  assigned_label?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  track_id: string;
  track_title: string;
  report_category: string;
  report_details?: string | null;
  supporting_url?: string | null;
  creator_label?: string | null;
  reporter_user_id?: string | null;
  initial_decision_outcome?: CaseOutcome | null;
  initial_decision_reason?: string | null;
  initial_action_summary?: string | null;
  initial_appeal_eligible: boolean;
  initial_proposed_by?: string | null;
  initial_approved_by?: string | null;
  appeal?: ModerationCaseAppeal | null;
  messages: ModerationCaseMessage[];
  events: ModerationCaseEvent[];
  notes: ModerationCaseNote[];
  permissions: ModerationCasePermissions;
};

const caseIdSchema = z.object({ caseId: z.string().uuid() });
const reportIdSchema = z.object({ reportId: z.string().uuid() });
const messageSchema = z.object({
  caseId: z.string().uuid(),
  messageType: z.enum(CASE_MESSAGE_TYPES),
  body: z.string().trim().min(1).max(5000),
});
const noteSchema = z.object({
  caseId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});
const decisionSchema = z.object({
  caseId: z.string().uuid(),
  outcome: z.enum(CASE_OUTCOMES),
  reason: z.string().trim().min(1).max(2000),
  actionSummary: z.string().trim().max(2000).optional(),
  appealEligible: z.boolean().default(true),
});
const appealSchema = z.object({
  caseId: z.string().uuid(),
  statement: z.string().trim().min(1).max(5000),
});
const reassignSchema = z.object({
  caseId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});
const finalSchema = z.object({
  caseId: z.string().uuid(),
  action: z.enum(CASE_FINAL_ACTIONS),
  overrideOutcome: z.enum(CASE_OUTCOMES).optional(),
  overrideReason: z.string().trim().max(2000).optional(),
  overrideActionSummary: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.action === "override") {
    if (!value.overrideOutcome) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["overrideOutcome"], message: "Outcome is required." });
    if (!value.overrideReason?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["overrideReason"], message: "Reason is required." });
  }
});

export const takeModerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: caseId, error } = await (context.supabase as any).rpc("take_moderation_case", {
      _report_id: data.reportId,
    });
    if (error) throw new Error(error.message);
    return { caseId: String(caseId) };
  });

export const getModerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => caseIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as any).rpc("get_moderation_case", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);
    return result as ModerationCaseDetail;
  });

export const listMyModerationCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("list_my_moderation_cases");
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []) as ModerationCaseListItem[];
  });

export const getModerationCaseUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("get_moderation_case_unread_count");
    if (error) throw new Error(error.message);
    return { count: Number(data ?? 0) };
  });

export const markModerationCaseRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => caseIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("mark_moderation_case_read", { _case_id: data.caseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendModerationCaseMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => messageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("send_moderation_case_message", {
      _case_id: data.caseId,
      _message_type: data.messageType,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { id: String(id) };
  });

export const addModerationCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => noteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("add_moderation_case_note", {
      _case_id: data.caseId,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { id: String(id) };
  });

export const reassignModerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reassignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("reassign_moderation_case", {
      _case_id: data.caseId,
      _new_assignee: data.assigneeId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const proposeInitialCaseDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("propose_initial_case_decision", {
      _case_id: data.caseId,
      _outcome: data.outcome,
      _reason: data.reason,
      _action_summary: data.actionSummary?.trim() || null,
      _appeal_eligible: data.appealEligible,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveInitialCaseDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => caseIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("approve_initial_case_decision", { _case_id: data.caseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitModerationCaseAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => appealSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("submit_moderation_case_appeal", {
      _case_id: data.caseId,
      _statement: data.statement,
    });
    if (error) throw new Error(error.message);
    return { id: String(id) };
  });

export const proposeModerationCaseAppealDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.omit({ appealEligible: true }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("propose_moderation_case_appeal_decision", {
      _case_id: data.caseId,
      _outcome: data.outcome,
      _reason: data.reason,
      _action_summary: data.actionSummary?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeModerationCaseAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => finalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("finalize_moderation_case_appeal", {
      _case_id: data.caseId,
      _action: data.action,
      _override_outcome: data.overrideOutcome ?? null,
      _override_reason: data.overrideReason?.trim() || null,
      _override_action_summary: data.overrideActionSummary?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenModerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => caseIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("reopen_moderation_case", { _case_id: data.caseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export type ModerationCaseAssignee = { user_id: string; role: string; label: string };

export const listModerationCaseAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("list_moderation_case_assignees");
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []) as ModerationCaseAssignee[];
  });
