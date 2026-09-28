import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const refresh = readFileSync(resolve(root, "lib/ai-model-refresh.functions.ts"), "utf8");
const panel = readFileSync(resolve(root, "components/promptbeats/AiModelsPanel.tsx"), "utf8");

describe("AI model verification and update workflow", () => {
  it("keeps DB pricing authoritative while checking official sources", () => {
    expect(refresh).toContain("OFFICIAL_PRICING_URLS");
    expect(refresh).toContain("official_docs");
    expect(refresh).toContain("verified_catalog");
    expect(refresh).toContain("No reliable pricing could be verified");
    expect(panel).toContain("Check & Fill");
    expect(panel).toContain("saveAdminAiModelVerificationSource");
    expect(panel).toContain("updateAdminAiModel");
  });

  it("finds likely successors without treating them as automatic replacements", () => {
    expect(refresh).toContain("findLikelySuccessors");
    expect(refresh).toContain("providerFamily");
    expect(panel).toContain("New versions of installed models");
    expect(panel).toContain("Check & Add");
    expect(panel).toContain("addDiscoveredAiModel");
  });

  it("keeps the full compatibility scan for unrelated candidates", () => {
    expect(panel).toContain("Other new candidates");
    expect(panel).toContain("runAiProviderCompatibilityTests");
    expect(panel).toContain("compatibilityProgress");
    expect(panel).toContain("stopCompatibility");
  });

  it("provides a read-only bulk update report", () => {
    expect(refresh).toContain("checkAllAdminAiModelsForUpdates");
    expect(panel).toContain("Check all models for updates");
    expect(panel).toContain("Likely newer version:");
    expect(refresh).not.toContain("AUTO_REPLACE_MODEL");
  });
});
