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
      evidenceProviders: [
        { id: "espn", configured: true },
        { id: "api-football", configured: Boolean(process.env["API_FOOTBALL_KEY"]?.trim()) },
        { id: "football-data", configured: Boolean(process.env["FOOTBALL_DATA_API_KEY"]?.trim()) },
        { id: "pitchapi", configured: Boolean(process.env["PITCHAPI_API_KEY"]?.trim()) },
      ],
      bookmakerOddsConfigured:
        Boolean(process.env["ARBPLAY_API_KEY"]?.trim()) &&
        process.env["ARBPLAY_ENABLED"] !== "false",
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
        process.env["OPENROUTER_API_KEY"]?.trim() && process.env["TAVILY_API_KEY"]?.trim(),
      ),
    };
  });

const weekInput = z.object({
  fixtureProvider: z.enum(["football-data", "api-football", "espn"]).default("espn"),
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

const espnContextInput = z
  .object({
    leagueId: z.enum(
      FOOTBALL_ESPN_LEAGUES.map((item) => item.id) as [
        (typeof FOOTBALL_ESPN_LEAGUES)[number]["id"],
        ...(typeof FOOTBALL_ESPN_LEAGUES)[number]["id"][],
      ],
    ),
    fixtureId: z.string().regex(/^\d{1,12}$/),
    weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

/** Free, read-only ESPN provider facts preview. Requires the same Super Admin boundary. */
export const getPrivateFootballEspnContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => espnContextInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: authorized, error } = await context.supabase.rpc("current_user_is_super_admin");
    if (error || authorized !== true) throw new Error("Not allowed");
    const { fetchEspnFootballWeek } = await import("@/lib/football-espn.server");
    const { fetchEspnMatchContext } = await import("@/lib/football-espn-context.server");
    const fixtures = await fetchEspnFootballWeek(data.leagueId, data.weekDate);
    const fixture = fixtures.find((item) => item.sourceFixtureId === data.fixtureId);
    if (!fixture || fixture.state !== "scheduled" || Date.parse(fixture.kickoffUtc) <= Date.now()) {
      throw new Error("Only available pre-match ESPN fixtures can be inspected.");
    }
    return fetchEspnMatchContext(data.leagueId, fixture);
  });

/** Read-only, no AI/Tavily cost. Fixture identity is reloaded from its provider, never supplied by the browser. */
export const getPrivateFootballProviderEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    espnContextInput
      .extend({
        fixtureProvider: z.enum(["espn", "api-football", "football-data"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const authorize = async () => {
      const result = await context.supabase.rpc("current_user_is_super_admin");
      if (result.error || result.data !== true) throw new Error("Not allowed");
    };
    await authorize();
    const fixtures =
      data.fixtureProvider === "espn"
        ? await (
            await import("@/lib/football-espn.server")
          ).fetchEspnFootballWeek(data.leagueId, data.weekDate)
        : await getCachedFootballWeek(
            data.leagueId as (typeof FOOTBALL_LEAGUES)[number]["id"],
            data.weekDate,
            data.fixtureProvider === "football-data"
              ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
              : (await import("@/lib/football-fixtures.server")).fetchFootballWeek,
            Date.now,
            data.fixtureProvider,
          );
    const fixture = fixtures.find(
      (f) => f.sourceFixtureId === data.fixtureId && f.leagueId === data.leagueId,
    );
    if (!fixture || fixture.state !== "scheduled" || Date.parse(fixture.kickoffUtc) <= Date.now())
      throw new Error("Only available pre-match fixtures can be inspected.");
    const result = await (
      await import("@/lib/football-provider-evidence.server")
    ).collectFootballProviderEvidence({
      leagueId: fixture.leagueId,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      kickoffUtc: fixture.kickoffUtc,
    });
    await authorize();
    const { collectFootballBookmakerOdds } = await import("@/lib/football-odds.server");
    const bookmakerOddsSnapshot = await collectFootballBookmakerOdds(result.fixture, {
      cacheOnly: true,
    });
    await authorize();
    return { ...result, bookmakerOddsSnapshot };
  });
