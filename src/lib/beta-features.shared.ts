import { z } from "zod";
export const betaFeatureKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const betaActionSchema = z.enum(["beta", "stable", "archive", "restore", "promote"]);
export type BetaAction = z.infer<typeof betaActionSchema>;
export const betaFeatureSchema = z.object({
  feature_key: betaFeatureKeySchema,
  display_name: z.string(),
  description: z.string(),
  stage: z.enum(["beta", "stable", "archived", "feature_access"]),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  registered_at: z.string(),
  updated_at: z.string(),
  updated_by: z.string().guid().nullable(),
});
export type BetaFeature = z.infer<typeof betaFeatureSchema>;
export const betaEventSchema = z.object({
  id: z.number().int(),
  actor_id: z.string().guid().nullable(),
  target_user_id: z.string().guid().nullable(),
  feature_key: z.string().nullable(),
  action: z.enum([
    "register",
    "beta",
    "stable",
    "archive",
    "restore",
    "promote",
    "tester_grant",
    "tester_revoke",
  ]),
  previous_state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  new_state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  created_at: z.string(),
});
export const BETA_CONFLICT = "Beta settings changed. Refresh and retry.";
export function betaPublicFailure(error: unknown): string {
  return error && typeof error === "object" && "code" in error && error.code === "PT409"
    ? BETA_CONFLICT
    : "Beta settings could not be updated. Please retry.";
}
