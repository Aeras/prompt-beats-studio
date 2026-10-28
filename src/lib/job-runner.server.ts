import { z } from "zod";
import { authenticateRunnerRequest } from "./runner-auth.server";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
const modes = [
  "jobId",
  "qualityActionId",
  "musicInspirationJobId",
  "recoveryExecutionId",
  "validationJobId",
  "maintenance",
] as const;
const bodySchema = z
  .object({
    jobId: z.string().uuid().optional(),
    qualityActionId: z.string().uuid().optional(),
    musicInspirationJobId: z.string().uuid().optional(),
    recoveryExecutionId: z.string().uuid().optional(),
    validationJobId: z.string().uuid().optional(),
    maintenance: z.literal(true).optional(),
  })
  .passthrough()
  .refine((value) => modes.filter((key) => value[key] !== undefined).length <= 1);
export type JobRunnerDependencies = {
  authenticate(request: Request): Promise<Response | null>;
  sweep(): Promise<unknown>;
  generate(id: string): Promise<unknown>;
  quality(id: string): Promise<unknown>;
  inspiration(id: string): Promise<unknown>;
  recover(id: string): Promise<unknown>;
  validate(id: string): Promise<unknown>;
  maintenance(): Promise<unknown>;
};
async function database(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (
    await database()
  )
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("Runner persistence unavailable");
  return data;
}
const production: JobRunnerDependencies = {
  authenticate: (request) =>
    request.headers.has("x-runner-token")
      ? authenticateRunnerRequest(request)
      : authenticateCronRequest(request),
  // Only queues bounded independent HTTP requests; never runs AI inline.
  sweep: () => rpc("dispatch_ai_runner_sweep_internal"),
  generate: async (id) => (await import("./generation-jobs.server")).executeGenerationJob(id),
  quality: async (id) => (await import("./quality-check-jobs.server")).executeQualityCheckJob(id),
  inspiration: async (id) =>
    (await import("./music-inspiration-jobs.server")).executeMusicInspirationJob(id),
  recover: async (id) => {
    await (await import("./ai-execution.server")).reconcileAiExecutions(id);
    return { ran: true };
  },
  validate: async (id) => {
    const { data, error } = await (
      await database()
    )
      .from("ai_generation_jobs")
      .select("user_id")
      .eq("id", id)
      .eq("status", "failed")
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();
    if (error) throw new Error("Runner persistence unavailable");
    return {
      ran: data
        ? await (
            await import("./generation-reconciliation.server")
          ).reconcileFailedGeneration(id, data.user_id)
        : false,
    };
  },
  maintenance: async () => {
    // No provider creates or remote polling in this lane.
    await rpc("reap_unjournaled_ai_jobs_internal");
    await (await import("./generation-jobs.server")).reapStaleJobs();
    await (await import("./quality-check-jobs.server")).reapStaleQualityChecks();
    await rpc("flush_ai_usage_outbox", { _limit: 5 });
    return { ran: true };
  },
};
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 4096) throw new Error("Runner body too large");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!bytes) return {};
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}
/** Auth before parsing/imports; empty legacy bodies remain sweep requests. */
export async function handleJobRunner(request: Request, deps = production): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const denied = await deps.authenticate(request);
    if (denied) {
      denied.headers.set("Cache-Control", "private, no-store");
      return denied;
    }
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readBody(request));
  } catch {
    return Response.json({ ok: false }, { status: 400, headers });
  }
  try {
    const result = body.qualityActionId
      ? await deps.quality(body.qualityActionId)
      : body.musicInspirationJobId
        ? await deps.inspiration(body.musicInspirationJobId)
        : body.jobId
          ? await deps.generate(body.jobId)
          : body.recoveryExecutionId
            ? await deps.recover(body.recoveryExecutionId)
            : body.validationJobId
              ? await deps.validate(body.validationJobId)
              : body.maintenance
                ? await deps.maintenance()
                : await deps.sweep();
    return Response.json(
      { ...(result && typeof result === "object" ? result : { result }), ok: true },
      { headers },
    );
  } catch {
    return Response.json({ ok: false, error: "runner_unavailable" }, { status: 503, headers });
  }
}
