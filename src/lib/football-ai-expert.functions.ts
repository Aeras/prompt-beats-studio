import { validateFootballExpertV2 } from "./football-expert-v2.shared";
import { usableOdds } from "./football-odds.shared";
import { FOOTBALL_EXPERT_CANONICAL_CONTRACT } from "./football-ai-research-phases.shared";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withFeatureAiDispatchAdmission } from "@/lib/global-ai-usage.server";
import {
  FOOTBALL_EXPERT_ANALYST_SYSTEM,
  footballExpertDecisionSchema,
} from "@/lib/football-ai-research-phases.shared";
import { footballAiAssessmentSchema } from "@/lib/football-ai-research.shared";
import { buildFootballExpertPayload } from "@/lib/football-ai-expert-payload.shared";

const expertRequestSchema = z
  .object({
    runId: z.string().uuid(),
    modelId: z.string().trim().min(1).max(240),
    approvePaidRequest: z.literal(true),
  })
  .strict();

export const runPrivateFootballExpertReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => expertRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin, error: roleError } = await context.supabase.rpc(
      "current_user_is_super_admin",
    );
    if (roleError || isSuperAdmin !== true) throw new Error("Not allowed");
    if (process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true") throw new Error("AI disabled");
    if (!process.env["OPENROUTER_API_KEY"]?.trim()) throw new Error("OpenRouter unavailable");
    const { resolveAiModelForUser, modelCaller } = await import("@/lib/ai-provider.server");
    const resolved = await resolveAiModelForUser(context.userId, "ai_tools", data.modelId);
    if (resolved.provider !== "openrouter") throw new Error("Select an installed OpenRouter model");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: rowError } = await supabaseAdmin
      .from("private_football_research_runs" as never)
      .select("id,user_id,status,kickoff_utc,analysis")
      .eq("id", data.runId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const base = row as unknown as {
      id: string;
      user_id: string;
      status: string;
      kickoff_utc: string;
      analysis: unknown;
    } | null;
    if (
      rowError ||
      !base ||
      base.status !== "completed" ||
      Date.parse(base.kickoff_utc) <= Date.now()
    )
      throw new Error("Only your completed pre-match analyses can be reviewed");
    const assessment = footballAiAssessmentSchema.parse(base.analysis);
    if (!assessment.researchBrief)
      throw new Error("This analysis has no reusable evidence snapshot. No paid call attempted.");

    // Unique run_id enforces at most one optional billable expert attempt per base analysis.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("private_football_expert_reviews" as never)
      .insert({ run_id: base.id, user_id: context.userId, model_id: resolved.model } as never)
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error("Expert review already requested or unavailable");
    const reviewId = (inserted as { id: string }).id;
    let sent = false;
    let observedUsage: unknown = null;
    let failureCode = "dispatch_unavailable";
    try {
      return await withFeatureAiDispatchAdmission(context.userId, ["ai_generator"], async () => {
        if (Date.parse(base.kickoff_utc) <= Date.now())
          throw new Error("Match started before expert review.");
        const { data: marked, error: markError } = await supabaseAdmin
          .from("private_football_expert_reviews" as never)
          .update({ provider_started_at: new Date().toISOString() } as never)
          .eq("id", reviewId)
          .eq("user_id", context.userId)
          .eq("status", "processing")
          .is("provider_started_at", null)
          .select("id")
          .maybeSingle();
        if (markError || !marked) throw new Error("Could not journal expert provider dispatch.");
        const caller = modelCaller(resolved.model, "openrouter", {
          userId: context.userId,
          operation: "football_research",
          executionId: reviewId,
        });
        const oddsCutoff = new Date().toISOString();
        sent = true;
        failureCode = "provider_failed";
        const receipt = await caller({
          system: FOOTBALL_EXPERT_ANALYST_SYSTEM + FOOTBALL_EXPERT_CANONICAL_CONTRACT,
          prompt: JSON.stringify({
            ...buildFootballExpertPayload(assessment),
            usableBookmakerOddsSnapshot: usableOdds(assessment.bookmakerOddsSnapshot, oddsCutoff),
          }),
          maxTokens: 4096,
          requestTimeoutMs: 180000,
          jsonObjectOutput: true,
          ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
        });
        observedUsage = receipt.usage;
        if (receipt.stopReason !== "end_turn") {
          failureCode =
            receipt.stopReason === "max_tokens" ? "output_token_limit" : "incomplete_ai_output";
          throw new Error("Incomplete expert response");
        }
        let raw: unknown;
        try {
          raw = JSON.parse(receipt.text);
        } catch {
          failureCode = "invalid_ai_json";
          throw new Error("Invalid expert JSON");
        }
        failureCode = "invalid_ai_schema";
        const parsed = footballExpertDecisionSchema.safeParse(raw);
        if (!parsed.success) {
          console.error("[football-expert] invalid_ai_schema", {
            reviewId,
            issues: parsed.error.issues.slice(0, 12).map((issue) => ({
              field: issue.path.join(".").slice(0, 120),
              code: issue.code,
            })),
          });
          throw new Error("Invalid expert decision");
        }
        const decision = parsed.data;
        if (!validateFootballExpertV2(decision, assessment.bookmakerOddsSnapshot, oddsCutoff))
          throw new Error("Unsupported expert market/quote");
        failureCode = "persistence_failed";
        const { error: saveError } = await supabaseAdmin
          .from("private_football_expert_reviews" as never)
          .update({
            status: "completed",
            decision,
            usage: receipt.usage,
            completed_at: new Date().toISOString(),
          } as never)
          .eq("id", reviewId)
          .eq("user_id", context.userId)
          .eq("status", "processing");
        if (saveError) throw new Error("Expert review was not saved");
        return { id: reviewId, decision };
      });
    } catch {
      await supabaseAdmin
        .from("private_football_expert_reviews" as never)
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_code: sent ? failureCode : "dispatch_unavailable",
          ...(observedUsage ? { usage: observedUsage } : {}),
        } as never)
        .eq("id", reviewId)
        .eq("user_id", context.userId)
        .eq("status", "processing");
      throw new Error("Expert review failed and was recorded; no automatic retry.");
    }
  });
