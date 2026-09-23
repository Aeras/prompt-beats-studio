import { z } from "zod";

export const PRIVATE_REVIEW_VISIBILITIES = ["shared", "private"] as const;
export type PrivateReviewVisibility = (typeof PRIVATE_REVIEW_VISIBILITIES)[number];

export const PRIVATE_REVIEW_STATES = ["active", "closed", "expired", "unavailable"] as const;
export type PrivateReviewState = (typeof PRIVATE_REVIEW_STATES)[number];

export const privateReviewSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive().nullable(),
  versionLabel: z.string().nullable(),
  title: z.string(),
  customName: z.string().nullable(),
  theme: z.string(),
  genre: z.string(),
  mood: z.string(),
  language: z.string(),
  tags: z.string(),
  lyrics: z.string(),
  note: z.string(),
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
    expires_at: z.string(),
  }),
]);

export const privateReviewSessionSchema = z.object({
  state: z.enum(["active", "closed", "expired"]),
  sessionId: z.string().uuid(),
  snapshot: privateReviewSnapshotSchema,
  creatorMessage: z.string(),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  expiresAt: z.string(),
  reviewer: privateReviewReviewerSchema.pick({ id: true, displayName: true }),
  audio: privateReviewAudioSchema.nullable(),
  comments: z.array(privateReviewCommentSchema),
});

export const privateReviewOwnerSessionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  versionPromptId: z.string().uuid().nullable(),
  projectName: z.string(),
  versionNumber: z.number().int().positive().nullable(),
  versionLabel: z.string().nullable(),
  snapshot: privateReviewSnapshotSchema,
  creatorMessage: z.string(),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  includeAudio: z.boolean(),
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
  projectId: z.string().uuid(),
  versionPromptId: z.string().uuid().nullable(),
  projectName: z.string(),
  versionNumber: z.number().int().positive().nullable(),
  versionLabel: z.string().nullable(),
  creatorMessage: z.string(),
  commentVisibility: z.enum(PRIVATE_REVIEW_VISIBILITIES),
  includeAudio: z.boolean(),
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
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/review/${encodeURIComponent(token)}`;
}
