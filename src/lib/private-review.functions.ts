import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { compatibleUtcDateTimePattern } from "@/lib/validation-datetime";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  PRIVATE_REVIEW_SOURCE_TYPES,
  PRIVATE_REVIEW_VISIBILITIES,
  privateReviewLinkInfoSchema,
  privateReviewOwnerListItemSchema,
  privateReviewOwnerSessionSchema,
  privateReviewSessionSchema,
} from "@/lib/private-review.shared";

const tokenSchema = z.string().trim().min(40).max(100);
const reviewerKeySchema = z.string().trim().min(40).max(100);

const commonCreateInput = {
  creatorMessage: z.string().trim().max(1000).default(""),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  expiresAt: z.string().regex(compatibleUtcDateTimePattern),
  pin: z.string().min(4).max(20).nullable().optional(),
};

const createInput = z.object({
  projectId: z.string().guid(),
  versionPromptId: z.string().guid(),
  ...commonCreateInput,
  sharedTrackId: z.string().guid().nullable().optional(),
});

const createTrackInput = z.object({
  trackId: z.string().guid(),
  ...commonCreateInput,
  includePrompt: z.boolean().default(false),
  includeLyrics: z.boolean().default(false),
});

export const createPrivateReviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "private_review_links");
    const { data: raw, error } = await (context.supabase as any).rpc(
      "create_private_review_session",
      {
        _project_id: data.projectId,
        _version_prompt_id: data.versionPromptId,
        _creator_message: data.creatorMessage,
        _comment_visibility: data.commentVisibility,
        _expires_at: data.expiresAt,
        _pin: data.pin || null,
        _shared_track_id: data.sharedTrackId || null,
      },
    );
    if (error) throw new Error(error.message);
    return z
      .object({
        id: z.string().guid(),
        token: z.string(),
        project_id: z.string().guid(),
        version_prompt_id: z.string().guid(),
        comment_visibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
        include_audio: z.boolean(),
        shared_track_id: z.string().guid().nullable(),
        created_at: z.string(),
        expires_at: z.string(),
      })
      .parse(raw);
  });

export const createPrivateTrackReviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createTrackInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "private_review_links");
    const { data: raw, error } = await (context.supabase as any).rpc(
      "create_private_track_review_session",
      {
        _track_id: data.trackId,
        _creator_message: data.creatorMessage,
        _comment_visibility: data.commentVisibility,
        _expires_at: data.expiresAt,
        _pin: data.pin || null,
        _include_prompt: data.includePrompt,
        _include_lyrics: data.includeLyrics,
      },
    );
    if (error) throw new Error(error.message);
    return z
      .object({
        id: z.string().guid(),
        token: z.string(),
        source_type: z.enum(PRIVATE_REVIEW_SOURCE_TYPES),
        source_track_id: z.string().guid(),
        comment_visibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
        include_audio: z.boolean(),
        include_prompt: z.boolean(),
        include_lyrics: z.boolean(),
        created_at: z.string(),
        expires_at: z.string(),
      })
      .parse(raw);
  });

export const getPrivateReviewLinkInfo = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await (supabaseAdmin as any).rpc("private_review_link_info", {
      _token: data.token,
    });
    if (error) throw new Error("The review link could not be checked.");
    return privateReviewLinkInfoSchema.parse(raw);
  });

export const joinPrivateReviewSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        displayName: z.string().trim().min(1).max(80),
        pin: z.string().min(4).max(20).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Admission, PIN failure and reviewer creation share one locked transaction.
    const { data: raw, error } = await supabaseAdmin.rpc("join_private_review_session", {
      _token: data.token,
      _display_name: data.displayName,
      ...(data.pin ? { _pin: data.pin } : {}),
    });
    if (error) throw new Error("The review could not be opened.");
    const outcome = z
      .object({ state: z.enum(["joined", "invalid_pin", "rate_limited", "closed", "unavailable"]) })
      .parse(raw);
    if (outcome.state === "invalid_pin") throw new Error("Invalid PIN.");
    if (outcome.state === "rate_limited")
      throw new Error("Too many attempts. Please wait before trying again.");
    if (outcome.state === "closed") throw new Error("This review is no longer accepting feedback.");
    if (outcome.state !== "joined") throw new Error("The review could not be opened.");
    return z
      .object({
        reviewer_id: z.string().guid(),
        reviewer_key: z.string(),
        display_name: z.string(),
      })
      .parse(raw);
  });

export const getPrivateReviewSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: tokenSchema, reviewerKey: reviewerKeySchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await (supabaseAdmin as any).rpc("get_private_review_session", {
      _token: data.token,
      _reviewer_key: data.reviewerKey,
    });
    if (error) throw new Error("The review session could not be loaded.");
    const state = (raw as any)?.state;
    if (state === "unavailable") return { state: "unavailable" as const };
    if (state === "closed" || state === "expired") {
      return { state: state as "closed" | "expired" };
    }

    const review = raw as any;
    const trackId = review?.audio?.trackId;
    if (typeof trackId === "string") {
      const { hydrateTrackAudioUrl } = await import("@/lib/track-audio-playback.server");
      const [hydrated] = await hydrateTrackAudioUrl(
        {
          id: trackId,
          source_type: "upload",
          audio_url: review.audio.audioUrl ?? null,
        },
        60 * 60,
      ).then((track) => [track]);
      if (hydrated?.audio_url) review.audio.audioUrl = hydrated.audio_url;
    }

    const parsed = privateReviewSessionSchema.parse(review);
    if (parsed.state !== "active") {
      return { state: parsed.state as "closed" | "expired" };
    }
    return { ...parsed, state: "active" as const };
  });

export const addPrivateReviewComment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        reviewerKey: reviewerKeySchema,
        body: z.string().trim().min(1).max(2000),
        parentCommentId: z.string().guid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await (supabaseAdmin as any).rpc("add_private_review_comment", {
      _token: data.token,
      _reviewer_key: data.reviewerKey,
      _body: data.body,
      _parent_comment_id: data.parentCommentId || null,
    });
    if (error) {
      if (error.message.includes("too many comments")) {
        throw new Error("Too many comments. Please wait a moment and try again.");
      }
      if (error.message.includes("closed")) throw new Error("This review is read-only now.");
      throw new Error("The comment could not be posted.");
    }
    return z.object({ id: z.string().guid(), created_at: z.string() }).parse(raw);
  });

export const listMyPrivateReviewSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().guid().nullable().optional(),
        trackId: z.string().guid().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await (context.supabase as any).rpc(
      "list_my_private_review_sessions",
      {
        _project_id: data.projectId || null,
      },
    );
    if (error) throw new Error(error.message);
    const rows = z.array(privateReviewOwnerListItemSchema).parse(raw ?? []);
    return data.trackId ? rows.filter((row) => row.sourceTrackId === data.trackId) : rows;
  });

export const getMyPrivateReviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().guid(),
        reviewerId: z.string().guid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await (context.supabase as any).rpc(
      "get_my_private_review_session",
      {
        _session_id: data.sessionId,
        _reviewer_id: data.reviewerId || null,
      },
    );
    if (error) throw new Error(error.message);
    return privateReviewOwnerSessionSchema.parse(raw);
  });

export const closePrivateReviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("close_private_review_session", {
      _session_id: data.sessionId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const addPrivateReviewCreatorReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().guid(),
        parentCommentId: z.string().guid(),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFeatureAccess(context.supabase, "private_review_links");
    const { data: raw, error } = await (context.supabase as any).rpc(
      "add_private_review_creator_reply",
      {
        _session_id: data.sessionId,
        _parent_comment_id: data.parentCommentId,
        _body: data.body,
      },
    );
    if (error) throw new Error(error.message);
    return z.object({ id: z.string().guid(), created_at: z.string() }).parse(raw);
  });
