import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FEATURE_KEYS = ["smart_presets", "export_center", "follow_creators", "notifications"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureAccessMode = "disabled" | "admins_only" | "selected_users" | "everyone";

const featureKeySchema = z.enum(FEATURE_KEYS);
const modeSchema = z.enum(["disabled","admins_only","selected_users","everyone"]);

export type FeatureAccessPolicy = {
  feature_key: FeatureKey;
  display_name: string;
  description: string;
  access_mode: FeatureAccessMode;
  selected_count: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_email: string | null;
};

export type FeatureAccessUser = {
  user_id: string;
  email: string | null;
  handle: string | null;
  display_name: string | null;
  created_at?: string;
};

export async function requireFeatureAccess(supabase: any, featureKey: FeatureKey) {
  const { data, error } = await supabase.rpc("current_user_can_use_feature", { _feature_key: featureKey });
  if (error || data !== true) throw new Error("Feature not available.");
}

async function requireSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) throw new Error("Not allowed");
}

export const getMyFeatureAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ featureKey: featureKeySchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("current_user_can_use_feature", {
      _feature_key: data.featureKey,
    });
    if (error) throw new Error(error.message);
    return { featureKey: data.featureKey, allowed: allowed === true };
  });

export const listFeatureAccessPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { data, error } = await context.supabase.rpc("feature_access_list");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as FeatureAccessPolicy[];
  });

export const listSelectedFeatureUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ featureKey: featureKeySchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: rows, error } = await context.supabase.rpc("feature_access_selected_users", {
      _feature_key: data.featureKey,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as FeatureAccessUser[];
  });

export const searchFeatureAccessUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    search: z.string().trim().max(120).default(""),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: rows, error } = await context.supabase.rpc("feature_access_search_users", {
      _search: data.search,
      _limit: 20,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as FeatureAccessUser[];
  });

export const setFeatureAccessPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    featureKey: featureKeySchema,
    accessMode: modeSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { error } = await context.supabase.rpc("feature_access_set_policy", {
      _feature_key: data.featureKey,
      _access_mode: data.accessMode,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addSelectedFeatureUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    featureKey: featureKeySchema,
    userId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: changed, error } = await context.supabase.rpc("feature_access_add_user", {
      _feature_key: data.featureKey,
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, changed: changed === true };
  });

export const removeSelectedFeatureUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    featureKey: featureKeySchema,
    userId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    const { data: changed, error } = await context.supabase.rpc("feature_access_remove_user", {
      _feature_key: data.featureKey,
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, changed: changed === true };
  });
