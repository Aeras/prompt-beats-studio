import { z } from "zod";
import {
  FOOTBALL_LEAGUES,
  FOOTBALL_DATA_LEAGUES,
  FOOTBALL_ESPN_LEAGUES,
  FOOTBALL_PROVIDERS,
} from "@/lib/football-research.shared";
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
      liveFixturesConfigured: true,
      fixtureProviders: FOOTBALL_PROVIDERS.map((provider) => ({
        ...provider,
        configured:
          provider.id === "espn" ||
          Boolean(
            process.env[
              provider.id === "football-data" ? "FOOTBALL_DATA_API_KEY" : "API_FOOTBALL_KEY"
            ]?.trim(),
          ),
      })),
      aiAnalysisEnabled: Boolean(
        process.env["OPENROUTER_API_KEY"]?.trim() &&
        process.env["TAVILY_API_KEY"]?.trim() &&
        true,
      ),
    };
  });

const weekInput = z.object({
  fixtureProvider: z.enum(["football-data", "api-football", "espn"]).default("football-data"),
  leagueId: z.enum(
    FOOTBALL_ESPN_LEAGUES.map((item) => item.id) as [
      (typeof FOOTBALL_ESPN_LEAGUES)[number]["id"],
      ...(typeof FOOTBALL_ESPN_LEAGUES)[number]["id"][],
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
    const apiKey =
      data.fixtureProvider === "football-data"
        ? process.env["FOOTBALL_DATA_API_KEY"]
        : process.env["API_FOOTBALL_KEY"];
    if (data.fixtureProvider !== "espn" && !apiKey?.trim()) {
      return { status: "not_configured" as const, fixtures: [] };
    }
    if (
      data.fixtureProvider !== "espn" &&
      !FOOTBALL_LEAGUES.some((league) => league.id === data.leagueId)
    ) {
      return { status: "unsupported" as const, fixtures: [] };
    }
    if (
      data.fixtureProvider === "football-data" &&
      !FOOTBALL_DATA_LEAGUES.some((league) => league === data.leagueId)
    ) {
      return { status: "unsupported" as const, fixtures: [] };
    }
    if (data.fixtureProvider === "espn") {
      const { fetchEspnFootballWeek } = await import("@/lib/football-espn.server");
      return {
        status: "ok" as const,
        fixtures: await fetchEspnFootballWeek(data.leagueId, data.weekDate),
      };
    }
    const loader =
      data.fixtureProvider === "football-data"
        ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
        : (await import("@/lib/football-fixtures.server")).fetchFootballWeek;
    return {
      status: "ok" as const,
      fixtures: await getCachedFootballWeek(
        data.leagueId as (typeof FOOTBALL_LEAGUES)[number]["id"],
        data.weekDate,
        loader,
        Date.now,
        data.fixtureProvider,
      ),
    };
  });
