/**
 * Durable runner endpoint for song generation and Quality Check jobs.
 *
 * This endpoint is called ONLY by the database (pg_net), either immediately
 * when work is admitted or by the scheduled sweep. The browser never calls it
 * and never keeps it alive, so backgrounding, network loss, a refresh or
 * closing the tab cannot affect provider execution.
 *
 * Callers must present the internal runner token (or the platform cron secret);
 * nothing here trusts the body beyond a job/action id, and ownership lives on
 * the persisted database row.
 */
import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { authenticateRunnerRequest } from "@/lib/runner-auth.server";

export const Route = createFileRoute("/api/public/jobs/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = request.headers.get("x-runner-token")
          ? await authenticateRunnerRequest(request)
          : await authenticateCronRequest(request);
        if (denied) return denied;

        const { executeGenerationJob, reapStaleJobs, pendingJobIds } =
          await import("@/lib/generation-jobs.server");
        const { executeQualityCheckJob, reapStaleQualityChecks, recoverableQualityActionIds } =
          await import("@/lib/quality-check-jobs.server");

        let jobId: string | null = null;
        let qualityActionId: string | null = null;
        try {
          const body = (await request.json()) as {
            jobId?: unknown;
            qualityActionId?: unknown;
          };
          if (typeof body?.jobId === "string") jobId = body.jobId;
          if (typeof body?.qualityActionId === "string") qualityActionId = body.qualityActionId;
        } catch {
          jobId = null;
          qualityActionId = null;
        }

        if (qualityActionId) {
          const { ran } = await executeQualityCheckJob(qualityActionId);
          return Response.json({ ok: true, ran });
        }

        if (jobId) {
          const { ran } = await executeGenerationJob(jobId);
          return Response.json({ ok: true, ran });
        }

        // Sweep mode (recovery): starts work that was never picked up and
        // completes QC finalization that already has a persisted provider result.
        await reapStaleJobs();
        await reapStaleQualityChecks();

        const generationIds = await pendingJobIds();
        for (const id of generationIds) await executeGenerationJob(id);

        const qualityIds = await recoverableQualityActionIds();
        for (const id of qualityIds) await executeQualityCheckJob(id);

        return Response.json({
          ok: true,
          started: generationIds.length,
          qualityStarted: qualityIds.length,
        });
      },
    },
  },
});
