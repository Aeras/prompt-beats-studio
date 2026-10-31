import { expect, test } from "bun:test";
import { handleJobRunner, type JobRunnerDependencies } from "./job-runner.server";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
const id = "c4520000-0000-4000-8000-000000000001";
function fixture() {
  const calls: string[] = [];
  const invoke = (name: string) => async () => {
    calls.push(name);
    return { ran: true };
  };
  const deps: JobRunnerDependencies = {
    authenticate: async () => null,
    sweep: async () => {
      calls.push("sweep");
      return { queued: 4 };
    },
    generate: invoke("generate"),
    quality: invoke("quality"),
    inspiration: invoke("inspiration"),
    recover: invoke("recover"),
    validate: invoke("validate"),
    maintenance: invoke("maintenance"),
  };
  return { calls, deps };
}
const request = (body: unknown = {}) =>
  new Request("https://fixture.invalid/api/public/jobs/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("legacy empty sweep only enqueues; does not execute or await any provider lane", async () => {
  const f = fixture();
  f.deps.generate = () => new Promise(() => {});
  const response = await handleJobRunner(request(), f.deps);
  expect(await response.json()).toEqual({ ok: true, queued: 4 });
  expect(f.calls).toEqual(["sweep"]);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
for (const [key, lane] of [
  ["jobId", "generate"],
  ["qualityActionId", "quality"],
  ["musicInspirationJobId", "inspiration"],
  ["recoveryExecutionId", "recover"],
  ["validationJobId", "validate"],
  ["maintenance", "maintenance"],
])
  test(`one independently awaited ${lane} request`, async () => {
    const f = fixture();
    const response = await handleJobRunner(
      request({ [key!]: key === "maintenance" ? true : id }),
      f.deps,
    );
    expect(await response.json()).toEqual({ ok: true, ran: true });
    expect(f.calls).toEqual([lane!]);
  });
test("unauthenticated request cannot parse hostile body or access any scheduler/worker", async () => {
  const f = fixture();
  f.deps.authenticate = async () => new Response("Unauthorized", { status: 401 });
  expect(
    (
      await handleJobRunner(
        new Request("https://fixture.invalid", { method: "POST", body: "not json" }),
        f.deps,
      )
    ).status,
  ).toBe(401);
  expect(f.calls).toEqual([]);
});
test("authentication read failure fails closed without raw secrets", async () => {
  const f = fixture();
  f.deps.authenticate = async () => {
    throw new Error("synthetic-sensitive-token");
  };
  const response = await handleJobRunner(request(), f.deps);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("synthetic-sensitive");
  expect(f.calls).toEqual([]);
});
test("malformed, ambiguous, oversize or invalid worker IDs never become sweeps", async () => {
  for (const body of [
    { jobId: "wrong" },
    { jobId: id, qualityActionId: id },
    { maintenance: false },
    [],
    "x".repeat(5000),
  ]) {
    const f = fixture();
    expect((await handleJobRunner(request(body), f.deps)).status).toBe(400);
    expect(f.calls).toEqual([]);
  }
});
test("failed enqueue returns retryable safe status; retry remains a delivery, never a provider retry", async () => {
  const f = fixture();
  let n = 0;
  f.deps.sweep = async () => {
    if (n++ === 0) throw new Error("private token/body");
    return { queued: 1 };
  };
  const failed = await handleJobRunner(request(), f.deps);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private token");
  expect((await handleJobRunner(request(), f.deps)).status).toBe(200);
  expect(f.calls).toEqual([]);
});
test("cron bearer current/previous rotation and rejection use the actual authentication boundary", async () => {
  const current = process.env["LOVABLE_CRON_SECRET"],
    previous = process.env["LOVABLE_CRON_SECRET_PREVIOUS"];
  process.env["LOVABLE_CRON_SECRET"] = "offline-current";
  process.env["LOVABLE_CRON_SECRET_PREVIOUS"] = "offline-previous";
  try {
    for (const token of ["offline-current", "offline-previous"]) {
      expect(
        await authenticateCronRequest(
          new Request("https://fixture.invalid", { headers: { authorization: `Bearer ${token}` } }),
        ),
      ).toBeNull();
    }
    for (const authorization of [
      "Bearer wrong",
      "offline-current",
      "Bearer offline-current, injected",
    ]) {
      expect(
        (
          await authenticateCronRequest(
            new Request("https://fixture.invalid", { headers: { authorization } }),
          )
        )?.status,
      ).toBe(401);
    }
  } finally {
    if (current === undefined) delete process.env["LOVABLE_CRON_SECRET"];
    else process.env["LOVABLE_CRON_SECRET"] = current;
    if (previous === undefined) delete process.env["LOVABLE_CRON_SECRET_PREVIOUS"];
    else process.env["LOVABLE_CRON_SECRET_PREVIOUS"] = previous;
  }
});
import { authenticateRunnerRequest } from "./runner-auth.server";
test("actual runner token auth rejects missing/wrong/unreadable tokens and accepts only protected expected value", async () => {
  const req = (token?: string) =>
    new Request("https://fixture.invalid", {
      headers: token === undefined ? {} : { "x-runner-token": token },
    });
  expect((await authenticateRunnerRequest(req(), async () => "offline-expected"))?.status).toBe(
    401,
  );
  expect(
    (await authenticateRunnerRequest(req("wrong"), async () => "offline-expected"))?.status,
  ).toBe(401);
  expect(
    await authenticateRunnerRequest(req("offline-expected"), async () => "offline-expected"),
  ).toBeNull();
  expect((await authenticateRunnerRequest(req("offline-expected"), async () => null))?.status).toBe(
    500,
  );
  expect(
    (
      await authenticateRunnerRequest(req("offline-expected"), async () => {
        throw new Error("private fixture");
      })
    )?.status,
  ).toBe(503);
});
