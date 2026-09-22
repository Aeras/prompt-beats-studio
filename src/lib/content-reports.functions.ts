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

const STAFF_ROLES = ["moderator","senior_moderator","admin","super_admin"] as const;
const ADMIN_ROLES = ["admin","super_admin"] as const;

async function loadReportsForStaff(userId: string, scope: ReportScope) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roleRow, error: roleError } = await (supabaseAdmin.from("user_roles") as any)
    .select("role, moderation_status")
    .eq("user_id", userId)
    .eq("moderation_status", "active")
    .in("role", STAFF_ROLES)
    .maybeSingle();
  if (roleError) throw new Error(roleError.message);
  if (!roleRow) throw new Error("Not allowed");

  let reportsQuery = (supabaseAdmin.from("content_reports") as any)
    .select("id,target_type,target_id,target_owner_id,target_title,category,details,supporting_url,status,created_at,reviewed_at,reviewed_by,resolution,moderator_notes")
    .order("created_at", { ascending: false });
  if (scope === "open") reportsQuery = reportsQuery.eq("status", "open");
  else if (scope === "under_review") reportsQuery = reportsQuery.eq("status", "under_review");
  else if (scope === "resolved") reportsQuery = reportsQuery.in("status", ["resolved_action_taken","resolved_no_violation","dismissed_abuse"]);

  const { data: reportRows, error: reportsError } = await reportsQuery;
  if (reportsError) throw new Error(reportsError.message);
  const rows = reportRows ?? [];
  if (!rows.length) return [] as ContentReport[];

  const trackIds = [...new Set(rows.map((row: any) => row.target_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(rows.flatMap((row: any) => [row.target_owner_id, row.reporter_user_id]).filter(Boolean))] as string[];
  const reportIds = rows.map((row: any) => row.id);

  const [tracksResult, profilesResult, casesResult] = await Promise.all([
    trackIds.length
      ? (supabaseAdmin.from("tracks") as any).select("id,title,is_published,moderation_status").in("id", trackIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? (supabaseAdmin.from("profiles") as any).select("id,handle,display_name,artist_alias").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    (supabaseAdmin.from("moderation_cases") as any)
      .select("id,report_id,status,assigned_to")
      .in("report_id", reportIds),
  ]);
  if (tracksResult.error) throw new Error(tracksResult.error.message);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (casesResult.error) throw new Error(casesResult.error.message);

  const assignedIds = [...new Set((casesResult.data ?? []).map((row: any) => row.assigned_to).filter(Boolean))] as string[];
  const assignedProfiles = assignedIds.length
    ? await (supabaseAdmin.from("profiles") as any).select("id,handle,display_name,artist_alias").in("id", assignedIds)
    : { data: [], error: null };
  if (assignedProfiles.error) throw new Error(assignedProfiles.error.message);

  const trackMap = new Map((tracksResult.data ?? []).map((row: any) => [row.id, row]));
  const profileMap = new Map((profilesResult.data ?? []).map((row: any) => [row.id, row]));
  const caseMap = new Map((casesResult.data ?? []).map((row: any) => [row.report_id, row]));
  const assignedMap = new Map((assignedProfiles.data ?? []).map((row: any) => [row.id, row]));
  const isAdmin = ADMIN_ROLES.includes(roleRow.role as (typeof ADMIN_ROLES)[number]);

  return rows.map((row: any) => {
    const track = trackMap.get(row.target_id) as any;
    const owner = profileMap.get(row.target_owner_id) as any;
    const reporter = profileMap.get(row.reporter_user_id) as any;
    const moderationCase = caseMap.get(row.id) as any;
    const assignee = moderationCase?.assigned_to ? assignedMap.get(moderationCase.assigned_to) as any : null;
    return {
      ...row,
      track_title: track?.title ?? row.target_title,
      track_is_published: Boolean(track?.is_published),
      track_moderation_status: track?.moderation_status ?? "deleted",
      creator_handle: owner?.handle,
      creator_display_name: owner?.display_name,
      creator_artist_alias: owner?.artist_alias,
      reporter_user_id: isAdmin ? row.reporter_user_id : undefined,
      reporter_handle: isAdmin ? reporter?.handle : undefined,
      reporter_display_name: isAdmin ? reporter?.display_name : undefined,
      case_id: moderationCase?.id,
      case_status: moderationCase?.status,
      case_assigned_to: moderationCase?.assigned_to,
      case_assigned_label: assignee?.artist_alias ?? assignee?.display_name ?? (assignee?.handle ? `@${assignee.handle}` : undefined),
      case_unread_count: 0,
    } satisfies ContentReport;
  });
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
  .handler(async ({ data, context }) => loadReportsForStaff(context.userId, data.scope));

export const getContentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reportId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const rows = await loadReportsForStaff(context.userId, "all");
    const row = rows.find((item) => item.id === data.reportId);
    if (!row) throw new Error("Report not found");
    return row;
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
    const { error } = await (context.supabase as any).rpc("review_content_report", {
      _report_id: data.reportId,
      _status: data.status,
      _resolution: data.resolution?.trim() || null,
      _moderator_notes: data.moderatorNotes?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
