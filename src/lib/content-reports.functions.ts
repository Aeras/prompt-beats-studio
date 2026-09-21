import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const REPORT_CATEGORIES = [
  "copyright_ip",
  "hate_discrimination",
  "harassment_threats",
  "sexual_inappropriate",
  "impersonation",
  "privacy_personal_info",
  "illegal_content",
  "spam_platform_abuse",
  "other",
] as const;

export const REPORT_STATUSES = [
  "open",
  "under_review",
  "resolved_action_taken",
  "resolved_no_violation",
  "dismissed_abuse",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type ReportScope = "open" | "under_review" | "resolved" | "all";

export type ContentReport = {
  id: string;
  target_type: "track";
  target_id: string;
  target_owner_id: string | null;
  category: ReportCategory;
  details?: string;
  supporting_url?: string;
  status: ReportStatus;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  resolution?: string;
  moderator_notes?: string;
  track_title: string;
  track_is_published: boolean;
  track_moderation_status: string;
  creator_handle?: string;
  creator_display_name?: string;
  creator_artist_alias?: string;
  reporter_user_id?: string;
  reporter_email?: string;
  reporter_handle?: string;
  reporter_display_name?: string;
  case_id?: string;
  case_status?: string;
  case_assigned_to?: string;
  case_assigned_label?: string;
  case_unread_count?: number;
};

const categorySchema = z.enum(REPORT_CATEGORIES);
const statusSchema = z.enum(REPORT_STATUSES);

async function withReportRpcTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Report request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const submitTrackReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    trackId: z.string().uuid(),
    category: categorySchema,
    details: z.string().trim().max(2000).optional(),
    supportingUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
  }).superRefine((value, ctx) => {
    if (value.category === "other" && (value.details?.trim().length ?? 0) < 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "Details are required." });
    }
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: reportId, error } = await (context.supabase as any).rpc("submit_track_report", {
      _track_id: data.trackId,
      _category: data.category,
      _details: data.details?.trim() || null,
      _supporting_url: data.supportingUrl?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { reportId: String(reportId) };
  });

export const listContentReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    scope: z.enum(["open","under_review","resolved","all"]).default("open"),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await withReportRpcTimeout((signal) =>
      (context.supabase as any).rpc("list_content_reports", {
        _scope: data.scope,
      }).abortSignal(signal),
    );
    if (error) throw new Error(error.message);
    return (Array.isArray(rows) ? rows : []) as ContentReport[];
  });

export const getContentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reportId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await withReportRpcTimeout((signal) =>
      (context.supabase as any).rpc("get_content_report", {
        _report_id: data.reportId,
      }).abortSignal(signal),
    );
    if (error) throw new Error(error.message);
    return row as ContentReport;
  });

export const reviewContentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    reportId: z.string().uuid(),
    status: statusSchema,
    resolution: z.string().trim().max(1000).optional(),
    moderatorNotes: z.string().trim().max(2000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await withReportRpcTimeout((signal) =>
      (context.supabase as any).rpc("review_content_report", {
        _report_id: data.reportId,
        _status: data.status,
        _resolution: data.resolution?.trim() || null,
        _moderator_notes: data.moderatorNotes?.trim() || null,
      }).abortSignal(signal),
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
