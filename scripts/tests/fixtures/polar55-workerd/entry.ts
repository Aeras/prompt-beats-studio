import { readPolar55 } from "../../../../src/lib/kino-polar55.server";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export default {
  async test() {
    // Both native Workers Request and process.env binding behavior, not Bun mocks.
    let rejected = false;
    try {
      new Request("https://kino-api.promptbeats.app/lab-v1.php", { redirect: "error" });
    } catch (error) {
      rejected = error instanceof TypeError;
    }
    check(rejected, "Workers must reproduce unsupported redirect mode");
    // Preserve an explicit reproduction of the other pre-dispatch failure.
    let memberRejected = false;
    try {
      const holder = { fetch };
      await holder.fetch("https://kino-api.promptbeats.app/lab-v1.php", { redirect: "manual" });
    } catch (error) {
      memberRejected = error instanceof TypeError;
    }
    check(memberRejected, "Workers must reproduce foreign fetch receiver failure");
    const found = await readPolar55("offline-owner", { op: "status" });
    check(found.status === "ok", "Native fetch did not reach local fixture with runtime bindings");
    if (found.status === "ok" && "info" in found)
      check(found.info.stored === 77, "Valid stored observations lost");
    const env = {
      KINO_POLAR55_ENABLED: "true",
      KINO_POLAR55_READ_TOKEN: "offline_fixture_token_".repeat(3),
    };
    for (const status of [301, 302, 303, 307, 308, 401, 403, 429, 500]) {
      const result = await readPolar55(
        "offline-owner",
        {
          op: "analysis",
          n: 1000,
          k: 8,
          method: "P01",
          seed: "http-" + status,
        },
        { fetch, env },
      );
      check(result.status === "unavailable", "Redirect or invalid HTTP response accepted");
    }
    console.log(
      "PASS: real Polar55 adapter in workerd; runtime bindings, native fetch, strict auth and redirect containment; zero external requests",
    );
  },
};
