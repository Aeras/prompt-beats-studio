import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiModelAdminRpc } from "./ai-model-admin-rpc.server";

const policy = z.object({
  enabled: z.boolean(),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  updated_at: z.string(),
});
export const getAdminGlobalAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await aiModelAdminRpc(
      context.supabase,
      "admin_get_global_ai_usage",
      {},
    );
    if (error) throw new Error("AI usage settings could not be read.");
    return policy.parse(data);
  });
export const setAdminGlobalAiUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await aiModelAdminRpc(
      context.supabase,
      "admin_set_global_ai_usage",
      { _enabled: data.enabled, _expected_revision: data.expectedRevision },
    );
    if (error)
      throw new Error(
        error.code === "PT409"
          ? "AI policy changed. Refresh and retry."
          : "AI usage settings were not saved.",
      );
    return policy.parse(result);
  });
