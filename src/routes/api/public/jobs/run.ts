import { createFileRoute } from "@tanstack/react-router";
import { handleJobRunner } from "@/lib/job-runner.server";
// Existing authenticated route: explicit worker messages remain compatible.
// Empty periodic messages fan out instead of awaiting sequential AI jobs.
export const Route = createFileRoute("/api/public/jobs/run")({
  server: { handlers: { POST: ({ request }) => handleJobRunner(request) } },
});
