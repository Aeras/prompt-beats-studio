import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getInstalledRegistryModels } from "@/lib/ai-model-registry.server";

/**
 * Private research feature: server-revalidated access. Listing installed models
 * is read-only and does not trigger a paid provider call.
 */
export const getPrivateFootballResearchSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: authorized, error } = await context.supabase.rpc(
      "current_user_is_super_admin",
    );
    if (error || authorized !== true) throw new Error("Not allowed");

    const models = await getInstalledRegistryModels();
    return {
      provider: "openrouter" as const,
      models: models
        .filter(
          (model) =>
            model.provider.toLowerCase() === "openrouter" &&
            (model.status === "enabled" || model.status === "testing") &&
            model.generatorEnabled &&
            model.generatorCompatible,
        )
        .map((model) => ({
          id: model.providerModelId,
          label: model.displayName,
          status: model.status,
        })),
      tavilyConfigured: Boolean(process.env["TAVILY_API_KEY"]?.trim()),
      liveFixturesConfigured: false,
      aiAnalysisEnabled: false,
    };
  });
