import {
  fullEvidenceSchema,
  fullEvidenceFailureDetailSchema,
  packFullEvidence,
  readFullEvidence,
  type FullEvidenceHit,
  type FullEvidenceReport,
} from "./football-full-evidence.shared";
import {
  readFootballSearchProfileVersion,
  footballV2PlanningMessage,
} from "./football-search-profiles.shared";
import { getRequest } from "@tanstack/react-start/server";
import { planFootballSearchProfile } from "./football-forecast-planner.shared";
import {
  footballResearchBudget,
  FOOTBALL_MAX_PROMPT_BYTES,
  FOOTBALL_MODEL_OUTPUT_TOKENS,
  FOOTBALL_RUN_TIMEOUT_MS,
  FOOTBALL_SEARCH_TIMEOUT_MS,
  FOOTBALL_MODEL_TIMEOUT_MS,
  type FootballSearchReceipt,
} from "./football-research-budget.shared";
import {
  footballV2SynthesisBrief,
  footballV2EvidenceUrls,
  packFootballEvidenceV2,
  readFootballEvidenceV2,
  attachIndependentAssessment,
} from "./football-evidence-v2.shared";
import {
  buildFootballPredictionConsensus,
  extractFootballPredictionReferences,
} from "./football-prediction-consensus.shared";
import { usableOdds } from "./football-odds.shared";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCachedFootballWeek } from "@/lib/football-fixtures-cache.server";
import { footballMarketOutcome } from "@/lib/football-market-outcome.shared";
import { footballExpertDecisionSchema } from "@/lib/football-ai-research-phases.shared";
import {
  buildFootballSourceSnapshot,
  type FootballSourceSnapshot,
} from "@/lib/football-ai-source-snapshot.shared";
import {
  FOOTBALL_LEAGUES,
  FOOTBALL_ESPN_LEAGUES,
  type FootballLeagueId,
  type FootballAiDiscoveryLeagueId,
} from "@/lib/football-research.shared";
import {
  footballResearchSystemForProfile,
  footballAiAssessmentSchema,
  footballResearchEvidenceSnapshotSchema,
  footballAnalysisRequestSchema,
  validateFootballMarketProbabilities,
  filterResearchContextUrls,
} from "@/lib/football-ai-research.shared";
import { withFeatureAiDispatchAdmission } from "@/lib/global-ai-usage.server";
import type { FootballFixture } from "@/lib/football-research.shared";

async function requireFootballSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) throw new Error("Not allowed");
}

/** One user-approved run. Every DB/provider operation is server-only. */
export const runPrivateFootballResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => footballAnalysisRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballSuperAdmin(context.supabase);
    if (!data.researchConsentVersion)
      throw new Error("Refresh and confirm the five-search research profile before starting.");
    data = footballAnalysisRequestSchema.parse(data);
    const FOOTBALL_RESEARCH_SYSTEM = footballResearchSystemForProfile(data.searchProfileVersion);
    if (process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true") {
      throw new Error("AI analysis is disabled by the operator.");
    }
    if (!process.env["OPENROUTER_API_KEY"]?.trim()) {
      throw new Error("OpenRouter is not configured.");
    }
    if (!data.withTavily || !process.env["TAVILY_API_KEY"]?.trim()) {
      throw new Error("Source-backed analysis requires configured Tavily research.");
    }

    const { resolveAiModelForUser, modelCaller } = await import("@/lib/ai-provider.server");
    const resolved = await resolveAiModelForUser(context.userId, "ai_tools", data.modelId);
    if (resolved.provider !== "openrouter")
      throw new Error("Select an installed OpenRouter model.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let fixture: {
      source: string;
      leagueId: string;
      homeTeam: string;
      awayTeam: string;
      kickoffUtc: string;
    };
    let claimed: unknown;
    let claimError: unknown;
    if (data.fixtureProvider === "ai-search") {
      // Only server-corroborated (verified) AI fixtures; identity comes from the DB row.
      ({ data: claimed, error: claimError } = await supabaseAdmin.rpc(
        "claim_private_football_ai_research_run" as never,
        {
          _user_id: context.userId,
          _request_key: data.requestKey,
          _fixture_id: Number(data.fixtureId),
          _model_id: resolved.model,
        } as never,
      ));
      const c = (claimed ?? {}) as Record<string, string>;
      fixture = {
        source: "ai-search",
        leagueId: c["league_id"] ?? data.leagueId,
        homeTeam: c["home_team"] ?? "",
        awayTeam: c["away_team"] ?? "",
        kickoffUtc: c["kickoff_utc"] ? new Date(c["kickoff_utc"]).toISOString() : "",
      };
      if (!claimError && (!fixture.homeTeam || !fixture.kickoffUtc) && c["status"] === "claimed") {
        throw new Error("Only verified upcoming fixtures can be analyzed.");
      }
    } else {
      if (
        !(data.fixtureProvider === "espn" ? FOOTBALL_ESPN_LEAGUES : FOOTBALL_LEAGUES).some(
          (league) => league.id === data.leagueId,
        )
      ) {
        throw new Error("Unsupported competition for this provider.");
      }
      const legacyLeague = data.leagueId as FootballLeagueId;
      if (data.fixtureProvider === "football-data" && legacyLeague === "GR-SL") {
        throw new Error("Greek Super League is unavailable on football-data.org Free.");
      }
      const fixtures =
        data.fixtureProvider === "espn"
          ? await (
              await import("@/lib/football-espn.server")
            ).fetchEspnFootballWeek(data.leagueId, data.weekDate)
          : await getCachedFootballWeek(
              legacyLeague,
              data.weekDate,
              data.fixtureProvider === "football-data"
                ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
                : (await import("@/lib/football-fixtures.server")).fetchFootballWeek,
              Date.now,
              data.fixtureProvider,
            );
      const legacy = fixtures.find((item) => item.sourceFixtureId === data.fixtureId);
      if (!legacy || legacy.state !== "scheduled" || Date.parse(legacy.kickoffUtc) <= Date.now()) {
        throw new Error("Only verified upcoming fixtures can be analyzed.");
      }
      fixture = legacy;
      ({ data: claimed, error: claimError } = await supabaseAdmin.rpc(
        "claim_private_football_research_run_v2" as never,
        {
          _user_id: context.userId,
          _request_key: data.requestKey,
          _fixture_id: Number(legacy.sourceFixtureId),
          _league_id: legacy.leagueId,
          _home_team: legacy.homeTeam,
          _away_team: legacy.awayTeam,
          _kickoff_utc: legacy.kickoffUtc,
          _model_id: resolved.model,
          _source: data.fixtureProvider,
        } as never,
      ));
    }
    if (claimError) throw new Error("Research admission failed.");

    const claim = claimed as { status?: string; id?: string } | null;
    if (!claim?.id || claim.status !== "claimed") {
      throw new Error("This research request is already recorded. View history instead.");
    }
    const runId = claim.id;
    let providerCalled = false;
    let failureCode = "research_unavailable";
    let observedUsage: {
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
    } | null = null;

    const runSignal = AbortSignal.any([
      getRequest().signal,
      AbortSignal.timeout(FOOTBALL_RUN_TIMEOUT_MS),
    ]);
    const researchAudit: {
      budget: ReturnType<typeof footballResearchBudget> | null;
      searches: FootballSearchReceipt[];
      fullEvidenceV2?: FullEvidenceReport;
      fullEvidenceFailureDetail?: import("./football-full-evidence.shared").FullEvidenceFailureDetail;
      searchProfileVersion?: typeof data.searchProfileVersion;
      sourceSummary?: {
        retainedDocs: number;
        legacyProjectionOmitted: number;
        duplicateOrigins: number;
        countablePicks: number;
        provisionalPicks: number;
        rejectedPicks: number;
        reasons: Record<string, number>;
      };
    } = { budget: null, searches: [], searchProfileVersion: data.searchProfileVersion };
    const usageSnapshot = () => ({ ...observedUsage, research: researchAudit });
    const journalSearch = async () => {
      const { data: journaled, error } = await supabaseAdmin
        .from("private_football_research_runs" as never)
        .update({ usage: usageSnapshot() } as never)
        .eq("id", runId)
        .eq("user_id", context.userId)
        .eq("status", "processing")
        .abortSignal(AbortSignal.any([runSignal, AbortSignal.timeout(5000)]))
        .select("id")
        .maybeSingle();
      if (error || !journaled)
        throw new Error("Could not journal research usage; no automatic retry.");
    };
    try {
      return await withFeatureAiDispatchAdmission(context.userId, ["ai_generator"], async () => {
        if (runSignal.aborted) throw new Error("Research request cancelled before dispatch.");
        const { collectFootballProviderEvidence } =
          await import("@/lib/football-provider-evidence.server");
        const { providerEvidenceUrls, withoutFootballSourceMetadata } =
          await import("@/lib/football-provider-evidence.shared");
        const { collectFootballBookmakerOdds } = await import("@/lib/football-odds.server");
        const identity = {
          leagueId: fixture.leagueId,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          kickoffUtc: fixture.kickoffUtc,
        };
        const plan = planFootballSearchProfile(identity, data.searchProfileVersion);
        const { getMusicInspirationPrices } =
          await import("@/lib/music-inspiration-research.server");
        researchAudit.budget = footballResearchBudget(
          data.tavilySearchDepth,
          await getMusicInspirationPrices(resolved.model, "openrouter"),
          data.searchProfileVersion,
        );
        await journalSearch();
        const [providerEvidence, bookmakerOddsSnapshot] = await Promise.all([
          collectFootballProviderEvidence(identity),
          collectFootballBookmakerOdds(identity),
        ]);
        // Legacy field remains readable; the complete authoritative snapshot is attached below.
        const { searchInspirationWeb } = await import("@/lib/music-inspiration-research.server");
        const queries = plan.queries;
        if (
          new TextEncoder().encode(JSON.stringify({ providerEvidence, bookmakerOddsSnapshot }))
            .length >
          FOOTBALL_MAX_PROMPT_BYTES - 65536
        )
          throw new Error("Provider evidence exceeds the pre-dispatch input allowance.");
        const { buildFootballClaimLedger } = await import("@/lib/football-evidence-v2.server");
        const fullHits: FullEvidenceHit[] = [];
        const fullEvidence: import("./football-evidence-v2.server").FootballEvidenceDocument[] = [];
        const sources: FootballSourceSnapshot[] = [];
        for (const queryPlan of queries) {
          if (runSignal.aborted) throw new Error("Research cancelled or deadline reached.");
          const searchReceipt: FootballSearchReceipt = {
            query: queryPlan.query,
            language: queryPlan.language,
            intent: queryPlan.intent,
            state: "unconfirmed",
            credits: null,
            requestId: null,
            crossQueryDuplicates: 0,
          };
          researchAudit.searches.push(searchReceipt);
          await journalSearch();
          const result = await searchInspirationWeb(
            queryPlan.query,
            AbortSignal.any([runSignal, AbortSignal.timeout(FOOTBALL_SEARCH_TIMEOUT_MS)]),
            undefined,
            undefined,
            data.tavilySearchDepth,
            {
              includePublicationMetadata: true,
              football: {
                ...(data.searchProfileVersion === "v2_experimental"
                  ? { fullEvidence: true as const }
                  : {}),
                textChars: 24000,
                maxResults: plan.resultsPerSearch as 5 | 10,
                format: "text",
              },
            },
          );
          if (data.searchProfileVersion === "v2_experimental")
            fullHits.push(
              ...(
                result.footballFullHits ??
                result.documents.map((doc) => ({
                  url: doc.source.url,
                  title: doc.source.title,
                  accessedAt: doc.source.accessedAt,
                  ...(doc.publishedAtUtc ? { publishedAtUtc: doc.publishedAtUtc } : {}),
                  status: "full_or_partial_raw_text" as const,
                  text: doc.text,
                  rawChars: doc.text.length,
                  cleanedChars: doc.text.length,
                  snippetChars: 0,
                }))
              ).map((h) => ({ ...h, language: queryPlan.language as "en" | "ru" })),
            );
          searchReceipt.state = "observed";
          searchReceipt.credits = result.credits;
          searchReceipt.requestId = result.requestId;
          searchReceipt.returnedSources =
            result.footballAudit?.discoveredSources.slice(0, plan.resultsPerSearch) ??
            result.documents
              .slice(0, plan.resultsPerSearch)
              .map((doc) => ({ url: doc.source.url, title: doc.source.title.slice(0, 180) }));
          if (result.footballAudit) {
            const { discoveredSources: _, ...counts } = result.footballAudit;
            searchReceipt.retrieval = counts;
          }
          for (const doc of result.documents.slice(0, plan.resultsPerSearch)) {
            if (sources.some((existing) => existing.url === doc.source.url)) {
              searchReceipt.crossQueryDuplicates!++;
              continue;
            }
            fullEvidence.push({
              title: doc.source.title,
              url: doc.source.url,
              accessedAt: doc.source.accessedAt,
              text: doc.text,
              ...(doc.publishedAtUtc ? { publishedAtUtc: doc.publishedAtUtc } : {}),
              truncated: doc.footballRetrieval?.truncated ?? false,
              queryLanguage: queryPlan.language,
            });
            sources.push({
              title: doc.source.title,
              url: doc.source.url,
              accessedAt: doc.source.accessedAt,
              ...(doc.publishedAtUtc ? { publishedAtUtc: doc.publishedAtUtc } : {}),
              excerpt: doc.text.slice(0, 2500),
              researchIntent: queryPlan.intent,
            });
          }
          await journalSearch();
        }
        const evidenceSnapshot = buildFootballSourceSnapshot([
          ...sources.filter((s) => s.researchIntent === "match_facts"),
          ...sources.filter((s) => s.researchIntent === "external_forecasts"),
        ]);
        const savedSourceSnapshot =
          data.searchProfileVersion === "v2_experimental"
            ? buildFootballSourceSnapshot(sources, 20)
            : evidenceSnapshot;
        if (
          !evidenceSnapshot.length &&
          !(data.searchProfileVersion === "v2_experimental" && fullHits.length)
        )
          throw new Error("No independently retrieved match sources were available.");
        if (Date.now() >= Date.parse(fixture.kickoffUtc)) {
          throw new Error("Match kickoff passed before research completed.");
        }
        const evidenceCutoff = new Date().toISOString();
        const onlineEvidenceV2 = buildFootballClaimLedger(
          identity,
          fullEvidence,
          evidenceCutoff,
          queries,
          plan.ledgerProfile,
          data.searchProfileVersion,
        );
        const reasons: Record<string, number> = {};
        for (const c of onlineEvidenceV2.claims)
          for (const reason of c.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
        researchAudit.sourceSummary = {
          retainedDocs: fullEvidence.length,
          legacyProjectionOmitted: Math.max(0, fullEvidence.length - evidenceSnapshot.length),
          duplicateOrigins: onlineEvidenceV2.sources.filter((s) => s.originStatus === "copy")
            .length,
          countablePicks: onlineEvidenceV2.claims.filter((c) => c.countable).length,
          provisionalPicks: onlineEvidenceV2.claims.filter(
            (c) => !c.countable && c.trace.status !== "rejected",
          ).length,
          rejectedPicks: onlineEvidenceV2.claims.filter((c) => c.trace.status === "rejected")
            .length,
          reasons,
        };
        await journalSearch();
        const predictionReferences = extractFootballPredictionReferences(
          identity,
          evidenceSnapshot,
        );
        const sourceAgreement = buildFootballPredictionConsensus(
          identity,
          evidenceSnapshot,
          { onlinePredictions: predictionReferences },
          evidenceCutoff,
          providerEvidenceUrls(providerEvidence),
        );
        const caller = modelCaller(resolved.model, "openrouter", {
          userId: context.userId,
          operation: "football_research",
          executionId: runId,
        });
        const synthesisEvidence = footballV2SynthesisBrief(onlineEvidenceV2);
        const synthesisPrompt = JSON.stringify({
          fixture: {
            source: fixture.source,
            league: fixture.leagueId,
            home: fixture.homeTeam,
            away: fixture.awayTeam,
            kickoffUtc: fixture.kickoffUtc,
          },
          ...(data.searchProfileVersion === "v2_experimental"
            ? {
                searchProfileVersion: data.searchProfileVersion,
                performedSearches: plan.queries.map((q) => ({
                  language: q.language,
                  intent: q.intent,
                })),
              }
            : {}),
          providerEvidence,
          bookmakerOddsSnapshot,
          usableBookmakerOddsSnapshot: usableOdds(bookmakerOddsSnapshot, evidenceCutoff),
          onlineEvidenceV2: synthesisEvidence,
          onlineSourceAgreement: {
            status: sourceAgreement.status,
            sourceCount: sourceAgreement.sourceCount,
            groups: sourceAgreement.groups,
            excluded: sourceAgreement.excluded,
          },
          sources: sources.map((doc, sourceIndex) => ({
            sourceIndex,
            title: doc.title,
            url: doc.url,
            excerpt: doc.excerpt.slice(0, 650),
            retrievedAt: doc.accessedAt,
            ...(doc.publishedAtUtc ? { publishedAtUtc: doc.publishedAtUtc } : {}),
            researchIntent: doc.researchIntent,
          })),
        });
        if (
          data.searchProfileVersion !== "v2_experimental" &&
          new TextEncoder().encode(FOOTBALL_RESEARCH_SYSTEM + synthesisPrompt).length >
            FOOTBALL_MAX_PROMPT_BYTES
        )
          throw new Error("Research input exceeds the pre-dispatch allowance.");
        if (runSignal.aborted) throw new Error("Research deadline reached before synthesis.");
        const { data: marked, error: markError } = await supabaseAdmin
          .from("private_football_research_runs" as never)
          .update({
            provider_started_at: evidenceCutoff,
            evidence_cutoff_at: evidenceCutoff,
          } as never)
          .eq("id", runId)
          .eq("user_id", context.userId)
          .eq("status", "processing")
          .is("provider_started_at", null)
          .abortSignal(AbortSignal.any([runSignal, AbortSignal.timeout(5000)]))
          .select("id")
          .maybeSingle();
        if (markError || !marked) throw new Error("Could not journal provider dispatch.");
        if (runSignal.aborted) throw new Error("Research cancelled before synthesis.");
        providerCalled = true;
        failureCode = "provider_failed";
        let fullReport: FullEvidenceReport | undefined;
        let receipt: Awaited<ReturnType<typeof caller>>;
        if (data.searchProfileVersion === "v2_experimental") {
          failureCode = "incomplete_coverage";
          const { runFullFootballEvidence, footballFullModelCapacity, FullCoverageError } =
            await import("./football-full-evidence.server");
          let result: Awaited<ReturnType<typeof runFullFootballEvidence>>;
          try {
            result = await runFullFootballEvidence({
              restoration: true,
              fixture: identity,
              cutoff: evidenceCutoff,
              runId,
              hits: fullHits,
              context: {
                fixture: identity,
                providerEvidence,
                bookmakerOddsSnapshot,
                usableBookmakerOddsSnapshot: usableOdds(bookmakerOddsSnapshot, evidenceCutoff),
              },
              system: FOOTBALL_RESEARCH_SYSTEM,
              providerUrls: providerEvidenceUrls(providerEvidence),
              capacity: await footballFullModelCapacity(resolved.model, runSignal),
              signal: runSignal,
              authorize: async () => {
                await requireFootballSuperAdmin(context.supabase);
                const current = await resolveAiModelForUser(
                  context.userId,
                  "ai_tools",
                  data.modelId,
                );
                if (current.provider !== resolved.provider || current.model !== resolved.model)
                  throw Error("Model authorization changed");
              },
              caller: (executionId) => {
                const stageCaller = modelCaller(resolved.model, "openrouter", {
                  userId: context.userId,
                  operation: "football_research",
                  executionId,
                });
                return (call) =>
                  stageCaller({
                    ...call,
                    ...(resolved.reasoningEffort
                      ? { reasoningEffort: resolved.reasoningEffort }
                      : {}),
                  });
              },
              journal: async (report) => {
                researchAudit.fullEvidenceV2 = report;
                const aggregate = (key: "inputTokens" | "outputTokens" | "totalTokens") =>
                  report.calls.some((c) => c.usage?.[key] == null)
                    ? null
                    : report.calls.reduce((sum, c) => sum + (c.usage?.[key] ?? 0), 0);
                observedUsage = {
                  inputTokens: aggregate("inputTokens"),
                  outputTokens: aggregate("outputTokens"),
                  totalTokens: aggregate("totalTokens"),
                };
                await journalSearch();
              },
            });
          } catch (error) {
            if (error instanceof FullCoverageError && error.failureDetail)
              researchAudit.fullEvidenceFailureDetail = error.failureDetail;
            throw error;
          }
          receipt = result.receipt;
          fullReport = result.report;
        } else {
          receipt = await caller({
            system: FOOTBALL_RESEARCH_SYSTEM,
            prompt: synthesisPrompt,
            maxTokens: FOOTBALL_MODEL_OUTPUT_TOKENS,
            abortSignal: runSignal,
            requestTimeoutMs: FOOTBALL_MODEL_TIMEOUT_MS,
            jsonObjectOutput: true,
            ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
          });
        }
        observedUsage = receipt.usage;
        if (receipt.stopReason !== "end_turn") {
          failureCode =
            receipt.stopReason === "max_tokens" ? "output_token_limit" : "incomplete_ai_output";
          throw new Error("AI response was incomplete.");
        }
        let raw: unknown;
        try {
          raw = JSON.parse(receipt.text);
        } catch {
          failureCode = "invalid_ai_json";
          throw new Error("AI response was not valid JSON.");
        }
        const interpretation =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        const externalPredictionConsensus = buildFootballPredictionConsensus(
          identity,
          evidenceSnapshot,
          {
            onlinePredictions: predictionReferences,
            ...(interpretation["onlineJudgment"] === undefined
              ? {}
              : { onlineJudgment: interpretation["onlineJudgment"] }),
          },
          evidenceCutoff,
          [...providerEvidenceUrls(providerEvidence), ...footballV2EvidenceUrls(onlineEvidenceV2)],
        );
        const wireAssessment = { ...interpretation };
        delete wireAssessment["onlinePredictions"];
        delete wireAssessment["onlineJudgment"];
        delete wireAssessment["independentAssessment"];
        delete wireAssessment["searchProfileVersion"];
        delete wireAssessment["fullEvidenceV2"];
        delete wireAssessment["evidenceCandidates"];
        failureCode = "invalid_ai_schema";
        const validated = footballAiAssessmentSchema.safeParse(
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? withoutFootballSourceMetadata(wireAssessment)
            : raw,
        );
        if (!validated.success) {
          console.error("[football-research] invalid_ai_schema", {
            runId,
            issues: validated.error.issues.slice(0, 16).map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
            })),
          });
          throw new Error("AI response did not match the football schema.");
        }
        const parsedAssessment = withoutFootballSourceMetadata(validated.data);
        const assessment = parsedAssessment.matchContext
          ? {
              ...parsedAssessment,
              matchContext: filterResearchContextUrls(parsedAssessment.matchContext, [
                ...sources.map((item) => item.url),
                ...providerEvidenceUrls(providerEvidence),
              ]),
            }
          : parsedAssessment;
        const issues = validateFootballMarketProbabilities(assessment);
        if (issues.length) {
          failureCode = "inconsistent_market_probabilities";
          throw new Error("AI market probabilities are inconsistent.");
        }
        const savedSources = savedSourceSnapshot;
        const researchBrief = footballResearchEvidenceSnapshotSchema.parse({
          collectedAtUtc: evidenceCutoff,
          matchFacts: evidenceSnapshot.filter((x) => x.researchIntent === "match_facts"),
          externalForecasts: evidenceSnapshot.filter(
            (x) => x.researchIntent === "external_forecasts",
          ),
          evidenceStatus: "unverified_source_extracts",
        });
        const completedLedger = attachIndependentAssessment(
          onlineEvidenceV2,
          interpretation["independentAssessment"],
          providerEvidenceUrls(providerEvidence),
          synthesisEvidence.claims.map((c) => c.claimId),
        );
        const savedAnalysis = footballAiAssessmentSchema.parse({
          ...assessment,
          researchBrief,
          externalPredictionConsensus,
          onlineEvidenceV2: completedLedger,
          providerEvidence,
          bookmakerOddsSnapshot,
          tavilySearchDepth: data.tavilySearchDepth,
          searchProfileVersion: data.searchProfileVersion,
          ...(fullReport ? { fullEvidenceV2: fullReport } : {}),
        });
        const legacyPacked = packFootballEvidenceV2(savedAnalysis, savedSources);
        const persisted = fullReport
          ? packFullEvidence(legacyPacked.analysis, legacyPacked.sources, fullReport)
          : legacyPacked;
        failureCode = "persistence_failed";
        const completedAt = new Date().toISOString();
        const { error: saveError } = await supabaseAdmin
          .from("private_football_research_runs" as never)
          .update({
            status: "completed",
            analysis: persisted.analysis,
            sources: persisted.sources,
            usage: usageSnapshot(),
            completed_at: completedAt,
          } as never)
          .eq("id", runId)
          .eq("user_id", context.userId)
          .eq("status", "processing")
          .abortSignal(AbortSignal.timeout(5000));
        if (saveError) throw new Error("Could not persist the AI research result.");
        return {
          id: runId,
          fixture,
          modelId: resolved.model,
          analysis: savedAnalysis,
          sources: savedSources,
          completedAt,
        };
      });
    } catch (error) {
      if (researchAudit.fullEvidenceV2?.coverage === "complete") {
        const failed = researchAudit.fullEvidenceV2;
        failed.coverage = "incomplete_coverage";
        failed.reason = "invalid_judgment";
        delete failed.judgment;
        failed.citedSourceIds = [];
        failed.providerCitations = [];
        failed.counts.cited = 0;
      }
      const planningCode =
        data.searchProfileVersion === "v2_experimental" &&
        researchAudit.budget === null &&
        error instanceof Error &&
        footballV2PlanningMessage(error.message)
          ? error.message
          : undefined;
      const planningMessage = footballV2PlanningMessage(planningCode);
      await supabaseAdmin
        .from("private_football_research_runs" as never)
        .update({
          status: "failed",
          error_code: planningCode ?? (providerCalled ? failureCode : "research_unavailable"),
          usage: usageSnapshot(),
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", runId)
        .eq("user_id", context.userId)
        .eq("status", "processing")
        .abortSignal(AbortSignal.timeout(5000));
      throw new Error(
        planningMessage ??
          "Football research failed. The request was recorded and cannot be automatically retried.",
      );
    }
  });

export const getPrivateFootballResearchHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFootballSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await reconcileStaleFootballRuns(supabaseAdmin, context.userId);
    const { data, error } = await supabaseAdmin
      .from("private_football_research_runs" as never)
      .select(
        "id,source,fixture_id,league_id,home_team,away_team,kickoff_utc,model_id,created_at,evidence_cutoff_at,status,error_code,analysis,sources,usage",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Football research history is unavailable.");
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      fixture_id: number;
      source: string;
      league_id: FootballLeagueId;
      home_team: string;
      away_team: string;
      model_id: string;
      kickoff_utc: string;
      created_at: string;
      evidence_cutoff_at: string | null;
      status: string;
      error_code: string | null;
      analysis: unknown;
      sources: unknown;
      usage: unknown;
    }>;
    const { data: hiddenRows, error: hiddenError } = await supabaseAdmin
      .from("private_football_research_hidden" as never)
      .select("run_id")
      .eq("user_id", context.userId);
    if (hiddenError) throw new Error("Football history visibility unavailable.");
    const hidden = new Set(
      ((hiddenRows ?? []) as Array<{ run_id: string }>).map((item) => item.run_id),
    );
    const visibleRows = rows.filter((row) => !hidden.has(row.id)).slice(0, 40);
    const { data: reviews, error: expertError } = await supabaseAdmin
      .from("private_football_expert_reviews" as never)
      .select("run_id,status,decision,model_id,error_code")
      .eq("user_id", context.userId)
      .in(
        "run_id",
        visibleRows.length
          ? visibleRows.map((r) => r.id)
          : ["00000000-0000-0000-0000-000000000000"],
      );
    if (expertError) throw new Error("Expert review history unavailable.");
    const reviewsByRun = new Map(
      (
        (reviews ?? []) as Array<{
          run_id: string;
          status: string;
          decision: unknown;
          model_id: string;
          error_code: string | null;
        }>
      ).map((review) => [review.run_id, review]),
    );
    // At most three unique league/weeks per screen load. Reuse the fixture
    // cache: do not burn 40 calls from the free daily API quota.
    const scored = new Map<string, Awaited<ReturnType<typeof getCachedFootballWeek>>>();
    for (const row of visibleRows) {
      if (row.status !== "completed" || Date.parse(row.kickoff_utc) > Date.now()) continue;
      const day = row.kickoff_utc.slice(0, 10);
      const key = row.source + ":" + row.league_id + ":" + day;
      if (scored.has(key) || scored.size >= 3) continue;
      try {
        if (row.source === "espn") {
          const { fetchEspnFootballWeek } = await import("@/lib/football-espn.server");
          scored.set(
            key,
            await fetchEspnFootballWeek(row.league_id as FootballAiDiscoveryLeagueId, day),
          );
          continue;
        }
        const loader =
          row.source === "football-data"
            ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
            : (await import("@/lib/football-fixtures.server")).fetchFootballWeek;
        scored.set(
          key,
          await getCachedFootballWeek(
            row.league_id,
            day,
            loader,
            Date.now,
            row.source === "football-data" ? "football-data" : "api-football",
          ),
        );
      } catch {
        // Historical scoring is best effort. A provider outage must not expose
        // any third-party error or erase persisted research evidence.
      }
    }
    return visibleRows.map((row) => {
      const day = row.kickoff_utc.slice(0, 10);
      const matches = scored.get(row.source + ":" + row.league_id + ":" + day);
      const match = matches?.find((f) => f.sourceFixtureId === String(row.fixture_id));
      const checked = footballAiAssessmentSchema.safeParse(row.analysis);
      const historyEvidenceV2 = readFootballEvidenceV2(
        row.sources,
        {
          leagueId: row.league_id,
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          kickoffUtc: row.kickoff_utc,
        },
        row.evidence_cutoff_at,
      );
      const usageProfile = readFootballSearchProfileVersion(row.usage);
      const usageResearch =
        row.usage && typeof row.usage === "object" && !Array.isArray(row.usage)
          ? (row.usage as { research?: unknown }).research
          : undefined;
      const failureDetailRaw =
        usageResearch && typeof usageResearch === "object" && !Array.isArray(usageResearch)
          ? (usageResearch as { fullEvidenceFailureDetail?: unknown }).fullEvidenceFailureDetail
          : undefined;
      const checkedFailureDetail = fullEvidenceFailureDetailSchema.safeParse(failureDetailRaw);
      const eligible =
        Number.isFinite(Date.parse(row.created_at)) &&
        Date.parse(row.created_at) < Date.parse(row.kickoff_utc) &&
        !!row.evidence_cutoff_at &&
        Date.parse(row.evidence_cutoff_at) < Date.parse(row.kickoff_utc);
      const outcomes =
        eligible && match && checked.success
          ? checked.data.suggestions.map((item) => ({
              market: item.market,
              outcome: footballMarketOutcome(item.market, match),
            }))
          : [];
      return {
        id: row.id,
        source: row.source,
        fixture_id: row.fixture_id,
        league_id: row.league_id,
        home_team: row.home_team,
        away_team: row.away_team,
        model_id: row.model_id,
        kickoff_utc: row.kickoff_utc,
        created_at: row.created_at,
        evidence_cutoff_at: row.evidence_cutoff_at,
        status: row.status,
        error_code: row.status === "failed" ? row.error_code : null,
        searchProfileVersion: usageProfile
          ? usageProfile
          : checked.success
            ? checked.data.searchProfileVersion
            : undefined,
        fullEvidenceFailureDetail: checkedFailureDetail.success
          ? checkedFailureDetail.data
          : undefined,
        expertReview: (() => {
          const raw = reviewsByRun.get(row.id);
          if (!raw) return null;
          const checkedExpert = footballExpertDecisionSchema.safeParse(raw.decision);
          return {
            status: raw.status,
            modelId: raw.model_id,
            errorCode: raw.status === "failed" ? raw.error_code : null,
            decision: checkedExpert.success ? checkedExpert.data : null,
          };
        })(),
        analysis: checked.success
          ? {
              ...checked.data,
              ...(historyEvidenceV2
                ? {
                    onlineEvidenceV2: historyEvidenceV2,
                    ...(historyEvidenceV2.searchProfileVersion
                      ? { searchProfileVersion: historyEvidenceV2.searchProfileVersion }
                      : {}),
                  }
                : {}),
            }
          : null,
        fullEvidenceV2:
          readFullEvidence(
            row.sources,
            {
              leagueId: row.league_id,
              homeTeam: row.home_team,
              awayTeam: row.away_team,
              kickoffUtc: row.kickoff_utc,
            },
            row.evidence_cutoff_at,
          ) ??
          (() => {
            const value = (row.usage as { research?: { fullEvidenceV2?: unknown } } | null)
              ?.research?.fullEvidenceV2;
            return readFullEvidence(
              [
                {
                  kind: "football-full-evidence",
                  version: value && typeof value === "object" && "restoration" in value ? 2 : 1,
                  payload: value,
                },
              ],
              {
                leagueId: row.league_id,
                homeTeam: row.home_team,
                awayTeam: row.away_team,
                kickoffUtc: row.kickoff_utc,
              },
              row.evidence_cutoff_at,
            );
          })(),
        sources: Array.isArray(row.sources)
          ? row.sources
              .filter(
                (source): source is Record<string, unknown> =>
                  !!source && typeof source === "object" && !Array.isArray(source),
              )
              .map((source) => ({
                title: String(source["title"] ?? "").slice(0, 180),
                url: String(source["url"] ?? "").slice(0, 2000),
                accessedAt: String(source["accessedAt"] ?? "").slice(0, 40),
                researchIntent:
                  source["researchIntent"] === "external_forecasts"
                    ? ("external_forecasts" as const)
                    : ("match_facts" as const),
              }))
              .filter((source) => source.url.startsWith("https://"))
          : [],
        outcomes,
        quoteOutcomes:
          eligible &&
          match &&
          checked.success &&
          checked.data.bookmakerOddsSnapshot?.status === "matched" &&
          checked.data.bookmakerOddsSnapshot.fixture.leagueId === row.league_id &&
          checked.data.bookmakerOddsSnapshot.fixture.homeTeam === row.home_team &&
          checked.data.bookmakerOddsSnapshot.fixture.awayTeam === row.away_team &&
          Date.parse(checked.data.bookmakerOddsSnapshot.fixture.kickoffUtc) ===
            Date.parse(row.kickoff_utc)
            ? checked.data.bookmakerOddsSnapshot.quotes.map((q) => ({
                ...q,
                outcome: footballMarketOutcome(q.market, match),
              }))
            : [],
      };
    });
  });

/** Hide selected terminal runs without deleting immutable audit/admission records. */
export const hidePrivateFootballResearchHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(40) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFootballSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await reconcileStaleFootballRuns(supabaseAdmin, context.userId);
    const { data: runs, error } = await supabaseAdmin
      .from("private_football_research_runs" as never)
      .select("id,status")
      .eq("user_id", context.userId)
      .in("id", data.ids);
    const found = (runs ?? []) as Array<{ id: string; status: string }>;
    if (
      error ||
      found.length !== new Set(data.ids).size ||
      found.some((run) => run.status === "processing")
    ) {
      throw new Error("Only owned terminal analyses can be cleared.");
    }
    const { error: saveError } = await supabaseAdmin
      .from("private_football_research_hidden" as never)
      .upsert(data.ids.map((id) => ({ user_id: context.userId, run_id: id })) as never[], {
        onConflict: "user_id,run_id",
      });
    if (saveError) throw new Error("Could not clear selected history.");
    return { hidden: data.ids.length };
  });

/** A run still "processing" after the admission window (15 min, far beyond the 300 s run
 * deadline) lost its worker before the failure write. Mark it terminal so history and
 * clearing stop showing it as in progress. Evidence/usage journals are kept unchanged. */
const FOOTBALL_STALE_PROCESSING_MS = 15 * 60 * 1000;
async function reconcileStaleFootballRuns(
  admin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  userId: string,
) {
  await admin
    .from("private_football_research_runs" as never)
    .update({ status: "failed", error_code: "interrupted", completed_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .eq("status", "processing")
    .lt("created_at", new Date(Date.now() - FOOTBALL_STALE_PROCESSING_MS).toISOString())
    .abortSignal(AbortSignal.timeout(5000));
}
