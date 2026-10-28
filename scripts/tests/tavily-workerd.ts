/** Offline Cloudflare runtime regression. No provider credentials or external dispatch. */
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "pb-tavily-workerd-"));
try {
  const fixture = join(import.meta.dir, "fixtures", "tavily-workerd");
  const build = await Bun.build({
    entrypoints: [join(fixture, "entry.ts")],
    target: "browser",
    external: ["node:*"],
    outdir: directory,
    naming: "worker.mjs",
  });
  if (!build.success)
    throw new Error("Could not bundle actual Tavily adapter: " + build.logs.join("\n"));
  for (const file of ["test.capnp", "mock.mjs"])
    copyFileSync(join(fixture, file), join(directory, file));
  // Pin the official runtime, independently of production packages/lockfile.
  // Local offline runs can use an already-installed matching binary.
  const command = process.env["PB_WORKERD_BINARY"]
    ? [process.env["PB_WORKERD_BINARY"]!]
    : [
        process.platform === "win32" ? "npx.cmd" : "npx",
        "--yes",
        "--package=workerd@1.20261012.1",
        "workerd",
      ];
  const version = Bun.spawnSync([...command, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60000,
  });
  if (version.exitCode !== 0 || !version.stdout.toString().includes("2026-10-12"))
    throw new Error("Expected workerd 2026-10-12");
  console.log(version.stdout.toString().trim());
  const result = Bun.spawnSync([...command, "test", join(directory, "test.capnp")], {
    stdout: "inherit",
    stderr: "inherit",
    timeout: 60000,
  });
  if (result.exitCode !== 0) throw new Error("Offline Tavily workerd regression failed");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
