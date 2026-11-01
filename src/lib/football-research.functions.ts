import { z } from "zod";
import { FOOTBALL_LEAGUES } from "@/lib/football-research.shared";
import { getCachedFootballWeek } from "@/lib/football-fixtures-cache.server";
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
    const { data: authorized, error } = await context.supabase.rpc("current_user_is_super_admin");
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
      liveFixturesConfigured: Boolean(process.env["API_FOOTBALL_KEY"]?.trim()),
      aiAnalysisEnabled: false,
    };
  });

const weekInput = z.object({
  leagueId: z.enum(
    FOOTBALL_LEAGUES.map((item) => item.id) as [
      (typeof FOOTBALL_LEAGUES)[number]["id"],
      ...(typeof FOOTBALL_LEAGUES)[number]["id"][],
    ],
  ),
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getPrivateFootballWeek = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => weekInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: authorized, error } = await context.supabase.rpc("current_user_is_super_admin");
    if (error || authorized !== true) throw new Error("Not allowed");
    if (!process.env["API_FOOTBALL_KEY"]?.trim()) {
      return { status: "not_configured" as const, fixtures: [] };
    }
    return {
      status: "ok" as const,
      fixtures: await getCachedFootballWeek(data.leagueId, data.weekDate),
    };
  });
