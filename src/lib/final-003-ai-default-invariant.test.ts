import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260926093000_final_003_ai_default_invariant.sql",
    import.meta.url,
  ),
  "utf8",
);
const adminSource = readFileSync(new URL("./ai-model-admin.functions.ts", import.meta.url), "utf8");

describe("FINAL-003 AI default invariant", () => {
  it("enforces enabled + all_users defaults at the database boundary", () => {
    expect(migration).toContain("enforce_ai_default_model_invariant");
    expect(migration).toContain("v_model.status <> 'enabled'");
    expect(migration).toContain("v_model.access_policy <> 'all_users'");
    expect(migration).toContain("generator_compatible");
    expect(migration).toContain("generator_enabled");
    expect(migration).toContain("quality_check_compatible");
    expect(migration).toContain("quality_check_enabled");
  });

  it("guards the legacy shared key before the operation defaults can be partially rewritten", () => {
    expect(migration).toContain("'ai_model'");
    expect(migration).toContain("'ai_generator_default_model'");
    expect(migration).toContain("'ai_quality_check_default_model'");
    expect(migration).toContain("'ai_tools_default_model'");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF key, value ON public.app_settings");
  });

  it("preserves the modern server-side all_users validation", () => {
    expect(adminSource).toContain('model.status === "enabled"');
    expect(adminSource).toContain('model.access_policy !== "all_users"');
    expect(adminSource).toContain("A default AI model must be available to all users.");
  });
});
