/**
 * Durable runner endpoint for song generation jobs.
 *
 * This endpoint is called ONLY by the database (pg_net), either immediately
 * when a job is created or by the scheduled sweep. The browser never calls it
 * and never keeps it alive, so backgrounding, network loss, a refresh or
 * closing the tab cannot affect a generation.
 *
 * Callers must present the internal runner token (or the platform cron secret);
 * nothing here trusts the body beyond a job id, and ownership lives on the row.
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

        const { executeGenerationJob, reapStaleJobs, pendingJobIds } = await import(
          "@/lib/generation-jobs.server"
        );

        let jobId: string | null = null;
        try {
          const body = (await request.json()) as { jobId?: unknown };
          if (typeof body?.jobId === "string") jobId = body.jobId;
        } catch {
          jobId = null;
        }

        if (jobId) {
          const { ran } = await executeGenerationJob(jobId);
          return Response.json({ ok: true, ran });
        }

        // Sweep mode (recovery): starts jobs that were never picked up.
        await reapStaleJobs();
        const ids = await pendingJobIds();
        for (const id of ids) await executeGenerationJob(id);
        return Response.json({ ok: true, started: ids.length });
      },
    },
  },
});
