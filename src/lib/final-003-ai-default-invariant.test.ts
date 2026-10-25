import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const originalMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260926093000_final_003_ai_default_invariant.sql",
    import.meta.url,
  ),
  "utf8",
);
const supersedingMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260926101500_global_ai_default_model_semantics.sql",
    import.meta.url,
  ),
  "utf8",
);
const adminSource = readFileSync(new URL("./ai-model-admin.functions.ts", import.meta.url), "utf8");
const providerSource = readFileSync(new URL("./ai-provider.server.ts", import.meta.url), "utf8");
const panelSource = readFileSync(
  new URL("../components/promptbeats/AiModelsPanel.tsx", import.meta.url),
  "utf8",
);

describe("AI default invariant evolution", () => {
  it("keeps the applied FINAL-003 migration immutable and supersedes it forward-only", () => {
    expect(originalMigration).toContain("v_model.access_policy <> 'all_users'");
    expect(supersedingMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.enforce_ai_default_model_invariant()",
    );
    expect(supersedingMigration).not.toContain("v_model.access_policy");
  });

  it("still requires enabled, operation-compatible defaults at the database boundary", () => {
    expect(supersedingMigration).toContain("v_model.status <> 'enabled'");
    expect(supersedingMigration).toContain("generator_compatible");
    expect(supersedingMigration).toContain("generator_enabled");
    expect(supersedingMigration).toContain("quality_check_compatible");
    expect(supersedingMigration).toContain("quality_check_enabled");
  });

  it("lets admins choose an eligible default regardless of access policy", () => {
    expect(adminSource).toContain('"admin_set_ai_model_default"');
    const atomic = readFileSync(
      "supabase/migrations/20261025173752_ai_models_inline_admin_uninstall.sql",
      "utf8",
    );
    expect(atomic).toContain("row.status<>'enabled'");
    expect(atomic).toContain("row.generator_compatible");
    expect(atomic).not.toContain("row.access_policy");
    expect(adminSource).not.toContain("A default AI model must be available to all users.");
    expect(panelSource).not.toContain('m.accessPolicy === "all_users"');
    expect(panelSource).not.toContain("handleAccessPolicyChange");
  });

  it("makes the configured operation default effective for every account without widening other grants", () => {
    expect(providerSource).toContain("const effectiveModels = [");
    expect(providerSource).toContain("configuredDefault,");
    expect(providerSource).toContain("defaultModel: configuredDefault.providerModelId");
    expect(providerSource).toContain('if (model.accessPolicy === "admin_only") continue;');
    expect(providerSource).toContain('accessMode: "custom"');
    expect(providerSource).toContain('accessMode: "inherit"');
  });
});
