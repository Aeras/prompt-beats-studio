import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const refresh = readFileSync(resolve(root, "lib/ai-model-refresh.functions.ts"), "utf8");
const panel = readFileSync(resolve(root, "components/promptbeats/AiModelsPanel.tsx"), "utf8");
const providerRegistry = readFileSync(resolve(root, "lib/ai-provider-registry.server.ts"), "utf8");

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

  it("supports the current xAI Grok pricing page and a reviewed Grok 4.7 fallback", () => {
    expect(refresh).toContain("officialPricingUrl");
    expect(refresh).toContain("docs.x.ai/developers/models/${encodeURIComponent(modelId)}");
    expect(refresh).toContain('"grok-4.7"');
    expect(refresh).toContain("labelledDollar");
    expect(refresh).toContain("Cached");
  });

  it("finds likely successors without treating them as automatic replacements", () => {
    expect(refresh).toContain("findLikelySuccessors");
    expect(refresh).toContain("providerFamily");
    expect(panel).toContain("New versions of installed models");
    expect(panel).toContain("Check & Add");
    expect(panel).toContain("addDiscoveredAiModel");
  });

  it("keeps the full compatibility scan for every new provider-catalog model", () => {
    expect(panel).toContain("All new API models");
    expect(panel).toContain("runAiProviderCompatibilityTests");
    expect(panel).toContain("compatibilityProgress");
    expect(panel).toContain("stopCompatibility");
    expect(providerRegistry).toContain("Normalize every model returned by the provider catalog.");
    expect(providerRegistry).not.toContain("looksLikeGenerativeTextModel");
    // Gemini generateContent is legitimately checked by the separate audio-to-text compatibility probe.
    expect(providerRegistry).toContain("liveCompatible = await probeAudioTextCompatibility");
  });

  it("recognizes future Argon versions as Gemini family successors", () => {
    expect(panel).toContain("flash(?:-lite)?|pro|argon");
  });

  it("provides a read-only bulk update report", () => {
    expect(refresh).toContain("checkAllAdminAiModelsForUpdates");
    expect(panel).toContain("Check all models for updates");
    expect(panel).toContain("Likely newer version:");
    expect(refresh).not.toContain("AUTO_REPLACE_MODEL");
  });

  it("keeps edit actions visible above the mobile bottom navigation", () => {
    expect(panel).toContain("pb-[calc(5.75rem+env(safe-area-inset-bottom))]");
    expect(panel).toContain("h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))]");
    expect(panel).toContain("shrink-0 border-t border-white/10 bg-background/95");
    expect(panel).toContain("pb-[calc(1rem+env(safe-area-inset-bottom))]");
  });

  it("renders localized status, health, access, pricing, and compatibility labels", () => {
    const installed = readFileSync("src/components/promptbeats/InstalledAiModelsTable.tsx", "utf8");
    for (const key of [
      "aiModels.testing",
      "aiModels.healthy",
      "aiModels.adminOnly",
      "aiModels.verified",
    ])
      expect(installed).toContain(key);
    expect(installed).toContain("modelLabel(model.healthStatus)");
    expect(installed).toContain("modelLabel(model.pricingStatus)");
    expect(panel).toContain("compatibilityLabel(result.status)");
    expect(panel).not.toContain(">{model.status}</Pill>");
    expect(panel).not.toContain(">{model.healthStatus}</Pill>");
    expect(panel).not.toContain(">{model.accessPolicy}</Pill>");
  });
});
