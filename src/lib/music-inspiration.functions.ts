import {
  inspirationUsageSchema,
  summarizeInspirationUsage,
} from "./music-inspiration-usage.shared";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "./feature-access.functions";
import { inspirationRequestSchema, inspirationResearchSchema } from "./music-inspiration.shared";

type Context = { supabase: any; userId: string };
function callerDatabase(context: Context): any {
  return context["supabase"];
}
const jobColumns = "id,status,result,error_code,model,budget_usd,reserved_usd,search_credits";
const profileColumns = "id,name,revision,result";
const idSchema = z.object({ id: z.string().uuid() }).strict();
const revisionSchema = idSchema.extend({
  revision: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER - 1),
});
const nameSchema = z.string().trim().min(1).max(120);

const publicJobSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled", "unknown"]),
  result: inspirationResearchSchema.nullable(),
  error_code: z.string().max(160).nullable(),
  model: z.string().min(1).max(240),
  budget_usd: z.number().finite().nonnegative(),
  reserved_usd: z.number().finite().nonnegative(),
  search_credits: z.number().int().min(0).max(40),
  usageReport: inspirationUsageSchema.nullable().optional(),
});
const publicProfileSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  revision: z.number().int().positive(),
  result: inspirationResearchSchema,
});
export type MusicInspirationPublicJob = z.infer<typeof publicJobSchema>;
export type MusicInspirationProfile = z.infer<typeof publicProfileSchema>;

async function admission(context: Context) {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Vary", "Cookie, Authorization");
  await requireFeatureAccess(callerDatabase(context), "ai_music_inspiration");
  await requireFeatureAccess(callerDatabase(context), "ai_generator");
}

function row(response: { data: any; error: unknown }) {
  if (response.error || !response.data)
    throw new Error("Music Inspiration record unavailable or revision conflict.");
  return response.data;
}

function publicJob(job: unknown): MusicInspirationPublicJob {
  // Object parsing strips server-only fields; the nested research stays strict.
  return publicJobSchema.parse(job);
}

async function jobWithUsage(context: Context, raw: unknown): Promise<MusicInspirationPublicJob> {
  const job = publicJob(raw);
  if (job.status === "queued" || job.status === "running") return job;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const reply = await (supabaseAdmin as any).rpc("read_music_inspiration_usage_internal", {
      _user_id: context.userId,
      _job_id: job.id,
    });
    if (
      reply.error ||
      !reply.data ||
      typeof reply.data.aiDispatched !== "boolean" ||
      !Array.isArray(reply.data.searches)
    )
      return { ...job, usageReport: null };
    return { ...job, usageReport: summarizeInspirationUsage(reply.data) };
  } catch {
    return { ...job, usageReport: null };
  }
}

function publicProfile(profile: unknown): MusicInspirationProfile {
  return publicProfileSchema.parse(profile);
}

async function modelAccess(context: Context) {
  const { getOperationDefaultModel, getInstalledRegistryModels } =
    await import("./ai-model-registry.server");
  const { getEffectiveModelAccess } = await import("./ai-provider.server");
  const role = await callerDatabase(context).rpc("current_user_is_super_admin");
  if (role.error || typeof role.data !== "boolean")
    throw new Error("Could not verify Music Inspiration role.");
  const defaultModel = await getOperationDefaultModel("generator");
  const access = await getEffectiveModelAccess(context.userId, "generator");
  const installed = await getInstalledRegistryModels();
  // Registry compatibility catalog entries have no database ID. Testing models
  // are deliberately excluded even if the existing Generator permits them.
  const allowed = installed.filter(
    (model) =>
      model.id &&
      model.status === "enabled" &&
      model.generatorCompatible &&
      model.generatorEnabled &&
      (role.data === true || access.availableModels.includes(model.providerModelId)),
  );
  if (
    !defaultModel.id ||
    !allowed.some(
      (model) =>
        model.id === defaultModel.id &&
        model.providerModelId === defaultModel.providerModelId &&
        model.provider === defaultModel.provider,
    )
  )
    throw new Error("No installed, enabled Generator default is available for this account.");
  return { superAdmin: role.data === true, defaultModel, allowed };
}

async function completedResult(context: Context, id: string) {
  const job = row(
    await callerDatabase(context)
      .from("music_inspiration_jobs")
      .select("result")
      .eq("id", id)
      .eq("user_id", context.userId)
      .eq("status", "completed")
      .maybeSingle(),
  );
  return inspirationResearchSchema.parse(job.result);
}

export const getMusicInspirationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await admission(context);
    const models = await modelAccess(context);
    const { inspectMusicInspirationConfiguration } =
      await import("./music-inspiration-research.server");
    const configuration = await inspectMusicInspirationConfiguration();
    const reason = configuration.reason;
    return {
      configured: configuration.configured,
      reason,
      superAdmin: models.superAdmin,
      defaultModel: models.defaultModel.providerModelId,
      models: (models.superAdmin ? models.allowed : [models.defaultModel]).map((model) => ({
        id: model.providerModelId,
        label: model.displayName,
      })),
    };
  });

export const startMusicInspiration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        request: inspirationRequestSchema,
        modelOverride: z.string().trim().min(1).max(240).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await admission(context);
    const access = await modelAccess(context);
    if (
      !access.superAdmin &&
      (data.modelOverride !== undefined || data.request.depth === "extended")
    )
      throw new Error("Super Admin access required for model override or extended research.");
    const model = access.allowed.find(
      (entry) =>
        entry.providerModelId === (data.modelOverride ?? access.defaultModel.providerModelId),
    );
    if (!model) throw new Error("Research model is not available for this account.");
    const { inspectMusicInspirationConfiguration, getMusicInspirationPrices } =
      await import("./music-inspiration-research.server");
    const configuration = await inspectMusicInspirationConfiguration();
    if (!configuration.configured)
      throw new Error(configuration.reason ?? "Music Inspiration research is not configured.");
    const prices = await getMusicInspirationPrices(model.providerModelId, model.provider);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Service-only admission records the request atomically; SQL pg_net schedules
    // the worker. Never synchronously dispatch paid research in this request.
    const response = await (supabaseAdmin as any).rpc("start_music_inspiration_job_v2", {
      _user_id: context.userId,
      _request_id: data.requestId,
      _request: data.request,
      _model: model.providerModelId,
      _provider: model.provider,
      _pricing: prices,
    });
    const result = row(response);
    return jobWithUsage(
      context,
      Array.isArray(result) ? row({ data: result[0], error: null }) : result,
    );
  });

export const abandonMusicInspirationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ context, data }) => {
    await admission(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const reply = await (supabaseAdmin as any).rpc("abandon_music_inspiration_request_internal", {
      _user_id: context.userId,
      _request_id: data.requestId,
    });
    if (reply.error) throw new Error("Research request could not be reconciled.");
    return { job: reply.data ? await jobWithUsage(context, reply.data) : null };
  });

export const getMusicInspirationJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await admission(context);
    return jobWithUsage(
      context,
      row(
        await callerDatabase(context)
          .from("music_inspiration_jobs")
          .select(jobColumns)
          .eq("id", data.id)
          .eq("user_id", context.userId)
          .maybeSingle(),
      ),
    );
  });

export const cancelMusicInspiration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await admission(context);
    row(
      await (callerDatabase(context) as any).rpc("cancel_music_inspiration_job", {
        _job_id: data.id,
      }),
    );
    return jobWithUsage(
      context,
      row(
        await callerDatabase(context)
          .from("music_inspiration_jobs")
          .select(jobColumns)
          .eq("id", data.id)
          .eq("user_id", context.userId)
          .maybeSingle(),
      ),
    );
  });

export const listMusicInspirationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MusicInspirationProfile[]> => {
    await admission(context);
    const response = await callerDatabase(context)
      .from("music_inspiration_profiles")
      .select(profileColumns)
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (response.error) throw new Error("Music Inspiration profiles unavailable.");
    const profiles: unknown[] = response.data ?? [];
    return profiles.map(publicProfile);
  });

export const saveMusicInspirationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid(), name: nameSchema }).strict().parse(input),
  )
  .handler(async ({ context, data }) => {
    await admission(context);
    await completedResult(context, data.jobId);
    return publicProfile(
      row(
        await callerDatabase(context).rpc("save_music_inspiration_profile", {
          _id: null,
          _expected_revision: null,
          _name: data.name,
          _job_id: data.jobId,
        }),
      ),
    );
  });

export const updateMusicInspirationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    revisionSchema
      .extend({ name: nameSchema.optional(), jobId: z.string().uuid().optional() })
      .refine(
        (data) => data.name !== undefined || data.jobId !== undefined,
        "An update is required",
      )
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await admission(context);
    if (data.jobId !== undefined) await completedResult(context, data.jobId);
    return publicProfile(
      row(
        await callerDatabase(context).rpc("save_music_inspiration_profile", {
          _id: data.id,
          _expected_revision: data.revision,
          _name: data.name ?? null,
          _job_id: data.jobId ?? null,
        }),
      ),
    );
  });

export const deleteMusicInspirationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revisionSchema.parse(input))
  .handler(async ({ context, data }) => {
    await admission(context);
    const response = await callerDatabase(context).rpc("delete_music_inspiration_profile", {
      _id: data.id,
      _expected_revision: data.revision,
    });
    if (response.error || response.data !== true)
      throw new Error("Music Inspiration record unavailable or revision conflict.");
    return { deleted: true as const };
  });
