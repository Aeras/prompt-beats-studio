/** Independent PostgreSQL sessions, synthetic fixtures, local Docker only. */
import { spawn, spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
const project = process.argv[2];
if (!project || !/^[a-zA-Z0-9_-]+$/.test(project))
  throw new Error("An explicitly isolated local project is required");
const container = `supabase_db_${project}`;
// The repo's CI local project deliberately has the same name as the production
// project. A name alone is neither proof of isolation nor proof of production.
// Never accept a network Docker daemon or a non-CLI container instead.
const localEndpoint = (value: string) => /^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/.test(value);
if (process.env.DOCKER_HOST && !localEndpoint(process.env.DOCKER_HOST))
  throw new Error("Remote Docker endpoints are forbidden");
const endpoint = spawnSync(
  "docker",
  ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
  { encoding: "utf8" },
);
if (endpoint.status !== 0 || !localEndpoint(JSON.parse(endpoint.stdout.trim())))
  throw new Error("A local Docker endpoint is required");
const label = spawnSync(
  "docker",
  ["inspect", container, "--format", '{{index .Config.Labels "com.supabase.cli.project"}}'],
  { encoding: "utf8" },
);
if (label.status !== 0 || label.stdout.trim() !== project)
  throw new Error("Expected isolated Supabase CLI container");
const args = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-Atq",
];
function query(sql: string) {
  const r = spawnSync("docker", args, { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function session(sql: string) {
  const child = spawn("docker", args);
  let error = "";
  child.stderr.on("data", (d) => (error += d));
  child.stdout.resume();
  const done = new Promise<boolean>((resolve) => child.on("close", (code) => resolve(code === 0)));
  child.stdin.end(sql);
  return { done, error: () => error };
}
const admin = "af530000-0000-4000-8000-000000000001";
const other = "af530000-0000-4000-8000-000000000002";
const user = "af530000-0000-4000-8000-000000000003";
const key = "af540000-0000-4000-8000-000000000001";
const login = (id: string) =>
  `SELECT set_config('request.jwt.claim.sub','${id}',true); SET LOCAL ROLE authenticated;`;
assert.equal(
  query("SELECT count(*) FROM public.app_settings WHERE key IN ('runner_url','runner_token');"),
  "0",
  "External runners must be absent",
);
const original = query("SELECT prompt_id FROM public.generator_prompt_default;");
query(
  `INSERT INTO auth.users(id,email) VALUES ('${admin}','registry-race-admin@example.invalid'),('${other}','registry-race-other@example.invalid'),('${user}','registry-race-user@example.invalid'); INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES ('${admin}','super_admin','active'),('${other}','super_admin','active'),('${user}','user','active');`,
);
const content = query(
  "SELECT content FROM public.generator_prompt_versions WHERE family='master_v1' LIMIT 1;",
);
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const candidate = query(
  `BEGIN; ${login(admin)} SELECT public.generator_prompt_import('Race fixture',${quote(content)}); COMMIT;`,
)
  .split("\n")
  .at(-1)!;
async function waitFor(marker: string) {
  for (let i = 0; i < 100; i++) {
    if (
      query(
        `SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%${marker}%' AND pid<>pg_backend_pid();`,
      ) !== "0"
    )
      return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Race synchronization timed out: " + marker);
}
try {
  // Switch-first: a concurrent default change sees the new value, never stale overwrite.
  const first = session(
    `BEGIN; ${login(admin)} SELECT public.generator_prompt_mutate('${candidate}','default','${original}'); SELECT pg_sleep(1) /*registry-switch-first*/; COMMIT;`,
  );
  await waitFor("registry-switch-first");
  const second = session(
    `BEGIN; ${login(other)} SELECT public.generator_prompt_mutate('${original}','default','${original}'); COMMIT;`,
  );
  assert.equal(await first.done, true, first.error());
  assert.equal(await second.done, false, "Stale default CAS must fail");
  assert.equal(query("SELECT prompt_id FROM public.generator_prompt_default;"), candidate);
  query(
    `BEGIN; ${login(admin)} SELECT public.generator_prompt_mutate('${original}','default','${candidate}'); COMMIT;`,
  );
  // Admission-first: delete waits, then sees immutable usage/reference evidence.
  const admitted = session(
    `BEGIN; ${login(admin)} SELECT public.start_generation_job('${key}',jsonb_build_object('promptVersion','registry','registryPromptId','${candidate}','generationModel','offline','inputSnapshot',jsonb_build_object('generatorMode','advanced'))); SELECT pg_sleep(1) /*registry-admission-first*/; COMMIT;`,
  );
  await waitFor("registry-admission-first");
  const deletion = session(
    `BEGIN; ${login(other)} SELECT public.generator_prompt_mutate('${candidate}','delete','${original}'); COMMIT;`,
  );
  assert.equal(await admitted.done, true, admitted.error());
  assert.equal(await deletion.done, false, "Referenced prompt deletion must fail");
  assert.equal(
    query(
      `SELECT prompt_catalog_id FROM public.ai_generation_jobs WHERE idempotency_key='${key}';`,
    ),
    candidate,
  );
  // Default/archive changes cannot alter an admitted job, and duplicate submission
  // returns the same job without another generation credit or provider execution.
  query(
    `BEGIN; ${login(other)} SELECT public.generator_prompt_mutate('${candidate}','archive','${original}'); COMMIT;`,
  );
  query(
    `BEGIN; ${login(admin)} SELECT public.start_generation_job('${key}','{"promptVersion":"default"}'); COMMIT;`,
  );
  assert.equal(
    query(`SELECT count(*) FROM public.ai_generation_jobs WHERE user_id='${admin}';`),
    "1",
  );
  assert.equal(query(`SELECT count(*) FROM public.ai_generations WHERE user_id='${admin}';`), "1");
  assert.equal(
    query(`SELECT count(*) FROM public.ai_provider_executions WHERE user_id='${admin}';`),
    "0",
  );
  assert.equal(
    query(
      `SELECT input_payload#>>'{promptBinding,id}' FROM public.ai_generation_jobs WHERE idempotency_key='${key}';`,
    ),
    candidate,
  );
  console.log(
    "PASS: default CAS, independent connections, admission/delete serialization, immutable history and no duplicate paid execution",
  );
} finally {
  // Remove only synthetic fixtures in this explicitly local database.
  query(
    `UPDATE public.generator_prompt_default SET prompt_id='${original}'; DELETE FROM public.ai_generation_jobs WHERE user_id IN ('${admin}','${other}','${user}'); DELETE FROM public.ai_generations WHERE user_id IN ('${admin}','${other}','${user}'); DELETE FROM public.generator_prompt_versions WHERE id='${candidate}'; DELETE FROM public.generator_prompt_audit WHERE actor IN ('${admin}','${other}','${user}'); DELETE FROM auth.users WHERE id IN ('${admin}','${other}','${user}');`,
  );
}
