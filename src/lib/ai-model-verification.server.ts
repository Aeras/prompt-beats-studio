import type { CompatibilityResult } from "./ai-provider-registry.server";

type InstalledProbeModel = {
  id: string;
  provider: string;
  provider_model_id: string;
  admin_revision: number;
};

/** The caller authenticates the admin before dispatching probes. This audit is
 * evidence of the probe, not a claim that a settings mutation succeeded. */
export async function recordInstalledModelProbe(
  admin: any,
  userId: string,
  model: InstalledProbeModel,
  result: CompatibilityResult,
) {
  const { error: auditError } = await admin.from("admin_audit_log").insert({
    admin_user_id: userId,
    target_user_id: null,
    action: "UPDATE_AI_MODEL",
    details: {
      operation: "compatibility_probe",
      id: model.id,
      provider: model.provider,
      model: model.provider_model_id,
      expected_revision: model.admin_revision,
      result: result.status,
      generator_passed: result.generatorCompatible,
      quality_check_passed: result.qualityCheckCompatible,
    },
  });
  if (auditError) throw new Error("Could not record model compatibility probe.");

  const now = new Date().toISOString();
  // Do not copy a pre-dispatch snapshot back over concurrent admin changes.
  // Negative/inconclusive samples never downgrade an installed capability.
  const { data, error } = await admin
    .from("ai_models")
    .update({
      ...(result.generatorCompatible ? { generator_compatible: true } : {}),
      ...(result.qualityCheckCompatible ? { quality_check_compatible: true } : {}),
      last_checked_at: now,
      updated_at: now,
    })
    .eq("id", model.id)
    .eq("admin_revision", model.admin_revision)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Could not save model compatibility verification.");
  if (!data) throw new Error("Model settings changed. Refresh before verifying again.");
}
