/**
 * Durable runner endpoint for song generation jobs.
 *
 * This is the request that actually calls the AI provider. It is deliberately
 * decoupled from the browser's Generate request, so backgrounding, network loss
 * or a refresh on mobile cannot cancel a generation.
 *
 * Callers must present the internal cron secret; nothing here trusts the body
 * beyond a job id, and job ownership is enforced by the job row itself.
 */
import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
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

        await reapStaleJobs();

        if (jobId) {
          const { ran } = await executeGenerationJob(jobId);
          return Response.json({ ok: true, ran });
        }

        // Sweep mode (cron / recovery): starts jobs that were never picked up.
        const ids = await pendingJobIds();
        for (const id of ids) await executeGenerationJob(id);
        return Response.json({ ok: true, started: ids.length });
      },
    },
  },
});
