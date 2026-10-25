import { readFileSync, readdirSync } from "node:fs";
import { BETA_FEATURES, type BetaFeatureDefinition } from "../src/lib/beta-feature-registry";
import {
  checkBetaRegistrations,
  legacyFeatureKeys,
  assertNoUnknownFeatureGates,
  sqlWithoutComments,
} from "../src/lib/beta-registration-check";
const read = (path: string) => readFileSync(path, "utf8");
const legacy = legacyFeatureKeys(read("src/lib/feature-access.functions.ts"));
const registry: readonly BetaFeatureDefinition[] = BETA_FEATURES;
checkBetaRegistrations(registry, legacy, read);
const keys = [...legacy, ...registry.map((feature) => feature.key)];
function walk(path: string) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const next = `${path}/${entry.name}`;
    if (entry.isDirectory()) walk(next);
    else if (/\.tsx?$/.test(next) && !/\.test\.tsx?$/.test(next))
      assertNoUnknownFeatureGates(read(next), next, keys);
  }
}
walk("src");
for (const file of readdirSync("supabase/migrations")) {
  if (!file.endsWith(".sql")) continue;
  const sql = sqlWithoutComments(read(`supabase/migrations/${file}`));
  for (const call of sql.matchAll(/SELECT\s+public\.register_beta_feature\(\s*'([a-z0-9_]+)'/gi)) {
    if (
      !registry.some(
        (feature) =>
          feature.key === call[1] &&
          feature.registrationMigration === `supabase/migrations/${file}`,
      )
    )
      throw new Error(`Unregistered SQL feature: ${call[1]}`);
  }
}
if (process.argv.includes("--sql")) {
  // Validate actual replayed rows too: a commented/fake SQL call cannot pass CI.
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  console.log("DO $$ BEGIN");
  console.log(
    `IF (SELECT count(*) FROM public.beta_features) <> ${registry.length} THEN RAISE EXCEPTION 'Replayed Beta registry contains unregistered entries'; END IF;`,
  );
  for (const feature of registry)
    console.log(
      `IF NOT EXISTS(SELECT 1 FROM public.beta_features WHERE feature_key=${literal(feature.key)} AND display_name=${literal(feature.name)} AND description=${literal(feature.description)}) THEN RAISE EXCEPTION 'Missing replayed feature registration'; END IF;`,
    );
  console.log("END $$;");
} else
  console.log(
    `Beta registration check PASS: ${registry.length} new features; ${legacy.length} legacy keys unchanged.`,
  );
