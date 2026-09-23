import { z } from "zod";

export const PRIVATE_REVIEW_VISIBILITIES = ["shared", "private"] as const;
export type PrivateReviewVisibility = (typeof PRIVATE_REVIEW_VISIBILITIES)[number];

export const PRIVATE_REVIEW_SOURCE_TYPES = ["project_version", "track"] as const;
export type PrivateReviewSourceType = (typeof PRIVATE_REVIEW_SOURCE_TYPES)[number];

export const PRIVATE_REVIEW_STATES = ["active", "closed", "expired", "unavailable"] as const;
export type PrivateReviewState = (typeof PRIVATE_REVIEW_STATES)[number];

export const privateReviewSnapshotSchema = z.object({
  sourceType: z.enum(PRIVATE_REVIEW_SOURCE_TYPES).default("project_version"),
  projectId: z.string().uuid().nullable().default(null),
  projectName: z.string().default(""),
  versionId: z.string().uuid().nullable().default(null),
  versionNumber: z.number().int().positive().nullable().default(null),
  versionLabel: z.string().nullable().default(null),
  trackId: z.string().uuid().nullable().optional().default(null),
  title: z.string(),
  customName: z.string().nullable().default(null),
  theme: z.string().default(""),
  genre: z.string().default(""),
  mood: z.string().default(""),
  language: z.string().default(""),
  tags: z.string().default(""),
  prompt: z.string().optional().default(""),
  lyrics: z.string().default(""),
  note: z.string().default(""),
});

export type PrivateReviewSnapshot = z.infer<typeof privateReviewSnapshotSchema>;

export const privateReviewAudioSchema = z.object({
  trackId: z.string().uuid(),
  title: z.string(),
  durationSeconds: z.number().nullable(),
  coverUrl: z.string().nullable(),
  audioUrl: z.string().optional(),
});

export const privateReviewCommentSchema = z.object({
  id: z.string().uuid(),
  threadReviewerId: z.string().uuid(),
  threadReviewerName: z.string().optional(),
  authorType: z.enum(["reviewer", "creator"]),
  authorReviewerId: z.string().uuid().nullable(),
  authorName: z.string(),
  parentCommentId: z.string().uuid().nullable(),
  body: z.string(),
  createdAt: z.string(),
});

export const privateReviewReviewerSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  createdAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
  commentCount: z.number().int().nonnegative().optional(),
});

export const privateReviewLinkInfoSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable") }),
  z.object({
    state: z.enum(["active", "closed", "expired"]),
    requires_pin: z.boolean(),
    project_name: z.string(),
    source_type: z.enum(PRIVATE_REVIEW_SOURCE_TYPES).default("project_version"),
    expires_at: z.string(),
  }),
]);

export const privateReviewSessionSchema = z.object({
  state: z.enum(["active", "closed", "expired"]),
  sessionId: z.string().uuid(),
  sourceType: z.enum(PRIVATE_REVIEW_SOURCE_TYPES).default("project_version"),
  sourceTrackId: z.string().uuid().nullable().default(null),
  snapshot: privateReviewSnapshotSchema,
  creatorMessage: z.string(),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  includePrompt: z.boolean().default(true),
  includeLyrics: z.boolean().default(true),
  expiresAt: z.string(),
  reviewer: privateReviewReviewerSchema.pick({ id: true, displayName: true }),
  audio: privateReviewAudioSchema.nullable(),
  comments: z.array(privateReviewCommentSchema),
});

export const privateReviewOwnerSessionSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.enum(PRIVATE_REVIEW_SOURCE_TYPES).default("project_version"),
  sourceTrackId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable(),
  versionPromptId: z.string().uuid().nullable(),
  projectName: z.string(),
  versionNumber: z.number().int().positive().nullable(),
  versionLabel: z.string().nullable(),
  snapshot: privateReviewSnapshotSchema,
  creatorMessage: z.string(),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  includeAudio: z.boolean(),
  includePrompt: z.boolean().default(true),
  includeLyrics: z.boolean().default(true),
  audioSnapshot: privateReviewAudioSchema.omit({ audioUrl: true }).nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  closedAt: z.string().nullable(),
  state: z.enum(["active", "closed", "expired"]),
  reviewers: z.array(privateReviewReviewerSchema),
  comments: z.array(privateReviewCommentSchema),
});

export const privateReviewOwnerListItemSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.enum(PRIVATE_REVIEW_SOURCE_TYPES).default("project_version"),
  sourceTrackId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable(),
  versionPromptId: z.string().uuid().nullable(),
  projectName: z.string(),
  versionNumber: z.number().int().positive().nullable(),
  versionLabel: z.string().nullable(),
  creatorMessage: z.string(),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  includeAudio: z.boolean(),
  includePrompt: z.boolean().default(true),
  includeLyrics: z.boolean().default(true),
  audioSnapshot: privateReviewAudioSchema.omit({ audioUrl: true }).nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  closedAt: z.string().nullable(),
  state: z.enum(["active", "closed", "expired"]),
  reviewerCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
});

export function privateReviewExpiryDate(days: number) {
  const bounded = Math.max(1, Math.min(7, Math.trunc(days)));
  return new Date(Date.now() + bounded * 24 * 60 * 60 * 1000).toISOString();
}

export function privateReviewUrl(token: string, origin?: string) {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    "",
  );
  return `${base}/review/${encodeURIComponent(token)}`;
}
