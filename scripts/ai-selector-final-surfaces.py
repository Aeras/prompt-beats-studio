from pathlib import Path


def patch(path: str, replacements: list[tuple[str, str, str]]) -> None:
    p = Path(path)
    text = p.read_text()
    for old, new, label in replacements:
        if old not in text:
            raise SystemExit(f"{path}: missing anchor {label}")
        text = text.replace(old, new, 1)
    p.write_text(text)


patch(
    "src/routes/song-universe.tsx",
    [
        (
            'import { useFeatureAccess } from "@/hooks/useFeatureAccess";\n',
            'import { useFeatureAccess } from "@/hooks/useFeatureAccess";\nimport { useAiModelSelection } from "@/hooks/useAiModelSelection";\n',
            "universe selector import",
        ),
        (
            '  const el = language === "el";\n  const [busy, setBusy] = useState<string | null>(null);',
            '  const el = language === "el";\n  const aiModel = useAiModelSelection("aiTools");\n  const [busy, setBusy] = useState<string | null>(null);',
            "universe selector hook",
        ),
        (
            '        <button\n          disabled={busy !== null || projects.length === 0}',
            '''        <div className="flex flex-wrap items-center justify-end gap-2">
          {aiModel.showSelector && (
            <select
              aria-label={el ? "Μοντέλο AI" : "AI model"}
              value={aiModel.selectedModel}
              onChange={(event) => aiModel.setSelectedModel(event.target.value)}
              disabled={busy !== null}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
            >
              {aiModel.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          <button
          disabled={busy !== null || projects.length === 0 || aiModel.unavailable || !aiModel.selectedModel}''',
            "universe header selector",
        ),
        (
            '              await analyzeSongUniverseContinuity({ data: { universeId: universe.id } });',
            '''              await analyzeSongUniverseContinuity({
                data: { universeId: universe.id, model: aiModel.selectedModel },
              });''',
            "continuity selected model",
        ),
        (
            '        </button>\n      </div>\n\n      <div className="mt-4 grid gap-3 md:grid-cols-2">',
            '''          </button>
        </div>
      </div>

      {aiModel.unavailable && (
        <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
          {el
            ? "Δεν υπάρχει διαθέσιμο συμβατό μοντέλο AI για αυτόν τον λογαριασμό."
            : "No compatible AI model is available for this account."}
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">''',
            "universe unavailable state",
        ),
        (
            '          disabled={busy !== null}\n          onClick={() =>\n            void run("generate-bible",',
            '          disabled={busy !== null || aiModel.unavailable || !aiModel.selectedModel}\n          onClick={() =>\n            void run("generate-bible",',
            "generate disabled",
        ),
        (
            '                data: { universeId: universe.id },',
            '                data: { universeId: universe.id, model: aiModel.selectedModel },',
            "generate model",
        ),
        (
            '            disabled={busy !== null || refineInstruction.trim().length < 3}',
            '            disabled={busy !== null || refineInstruction.trim().length < 3 || aiModel.unavailable || !aiModel.selectedModel}',
            "refine disabled",
        ),
        (
            '                  data: { universeId: universe.id, instruction: refineInstruction },',
            '                  data: { universeId: universe.id, instruction: refineInstruction, model: aiModel.selectedModel },',
            "refine model",
        ),
        (
            '                disabled={busy !== null}\n                onClick={() =>\n                  void run(`fit:${project.id}`,',
            '                disabled={busy !== null || aiModel.unavailable || !aiModel.selectedModel}\n                onClick={() =>\n                  void run(`fit:${project.id}`,',
            "fit disabled",
        ),
        (
            '                      data: { universeId: universe.id, projectId: project.projectId },',
            '                      data: { universeId: universe.id, projectId: project.projectId, model: aiModel.selectedModel },',
            "fit model",
        ),
    ],
)

patch(
    "src/lib/inspiration-wall-ai.functions.ts",
    [
        (
            'import { recordAiUsage } from "@/lib/ai-usage.server";\n',
            'import { recordAiUsage } from "@/lib/ai-usage.server";\nimport { supportsPromptBeatsVisionInput } from "@/lib/ai-model-capabilities.shared";\n',
            "vision helper import",
        ),
        (
            '''async function resolveMultimodalModel(userId: string) {
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const defaultOption = access.modelOptions.find((option) => option.id === access.defaultModel);
  if (defaultOption?.provider === "gemini") return defaultOption;
  const firstGemini = access.modelOptions.find((option) => option.provider === "gemini");
  if (firstGemini) return firstGemini;
  throw new Error("No multimodal AI model is available for this account.");
}''',
            '''async function resolveMultimodalModel(userId: string, requestedModel?: string | null) {
  const access = await getEffectiveModelAccess(userId, "ai_tools");
  const compatibleOptions = access.modelOptions.filter(supportsPromptBeatsVisionInput);
  const requested = requestedModel
    ? compatibleOptions.find((option) => option.id === requestedModel)
    : null;
  if (requested) return requested;
  const defaultOption = compatibleOptions.find((option) => option.id === access.defaultModel);
  if (defaultOption) return defaultOption;
  const fallback = compatibleOptions[0];
  if (fallback) return fallback;
  throw new Error("No multimodal AI model is available for this account.");
}''',
            "multimodal resolver",
        ),
        (
            '.inputValidator((input: unknown) => z.object({ wallId: wallIdSchema }).parse(input))',
            '.inputValidator((input: unknown) =>\n    z.object({ wallId: wallIdSchema, model: z.string().trim().max(240).nullable().optional() }).parse(input),\n  )',
            "wall input model",
        ),
        (
            '    const selected = await resolveMultimodalModel(context.userId);',
            '    const selected = await resolveMultimodalModel(context.userId, data.model);',
            "wall resolve requested",
        ),
    ],
)

patch(
    "src/components/promptbeats/InspirationWallDirectionPanel.tsx",
    [
        (
            'import { useFeatureAccess } from "@/hooks/useFeatureAccess";\n',
            'import { useFeatureAccess } from "@/hooks/useFeatureAccess";\nimport { useAiModelSelection } from "@/hooks/useAiModelSelection";\nimport { supportsPromptBeatsVisionInput } from "@/lib/ai-model-capabilities.shared";\n',
            "wall selector imports",
        ),
        (
            '  const songSetupFeature = useFeatureAccess("song_setup_assistant");\n',
            '  const songSetupFeature = useFeatureAccess("song_setup_assistant");\n  const aiModel = useAiModelSelection("aiTools", supportsPromptBeatsVisionInput);\n',
            "wall selector hook",
        ),
        (
            '      const result = await extractInspirationWallCreativeDirection({ data: { wallId: wall.id } });',
            '''      const result = await extractInspirationWallCreativeDirection({
        data: { wallId: wall.id, model: aiModel.selectedModel },
      });''',
            "wall selected model",
        ),
        (
            '''          <button
            type="button"
            onClick={() => void extract()}
            disabled={extracting}''',
            '''          <div className="flex flex-wrap items-center justify-end gap-2">
            {aiModel.showSelector && (
              <select
                aria-label={el ? "Μοντέλο AI" : "AI model"}
                value={aiModel.selectedModel}
                onChange={(event) => aiModel.setSelectedModel(event.target.value)}
                disabled={extracting}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
              >
                {aiModel.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          <button
            type="button"
            onClick={() => void extract()}
            disabled={extracting || aiModel.unavailable || !aiModel.selectedModel}''',
            "wall selector UI",
        ),
        (
            '          </button>\n        </div>\n\n        {error &&',
            '''          </button>
          </div>
        </div>

        {aiModel.unavailable && (
          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
            {el
              ? "Δεν υπάρχει διαθέσιμο μοντέλο με υποστήριξη εικόνας για αυτόν τον λογαριασμό."
              : "No image-capable AI model is available for this account."}
          </p>
        )}

        {error &&''',
            "wall unavailable state",
        ),
    ],
)

patch(
    "src/components/promptbeats/AiModelsPanel.tsx",
    [
        (
            '''  qualityDefault,
  onClose,
}: {
  model: AdminAiModel;
  generatorDefault: string | null;
  qualityDefault: string | null;
  onClose: () => void;
}) {''',
            '''  qualityDefault,
  aiToolsDefault,
  onClose,
}: {
  model: AdminAiModel;
  generatorDefault: string | null;
  qualityDefault: string | null;
  aiToolsDefault: string | null;
  onClose: () => void;
}) {''',
            "editor ai tools prop",
        ),
        (
            '''  const isGeneratorDefault = generatorDefault === model.providerModelId;
  const isQualityDefault = qualityDefault === model.providerModelId;
  const isDefaultModel = isGeneratorDefault || isQualityDefault;''',
            '''  const isGeneratorDefault = generatorDefault === model.providerModelId;
  const isQualityDefault = qualityDefault === model.providerModelId;
  const isAiToolsDefault = aiToolsDefault === model.providerModelId;
  const isDefaultModel = isGeneratorDefault || isQualityDefault || isAiToolsDefault;''',
            "editor ai tools protection",
        ),
        (
            '''    (isGeneratorDefault && (!generatorEnabled || status !== "enabled")) ||
    (isQualityDefault && (!qualityEnabled || status !== "enabled")) ||
    (isDefaultModel && accessPolicy !== "all_users");''',
            '''    (isGeneratorDefault && (!generatorEnabled || status !== "enabled")) ||
    (isQualityDefault && (!qualityEnabled || status !== "enabled")) ||
    (isAiToolsDefault && (!generatorEnabled || status !== "enabled")) ||
    (isDefaultModel && accessPolicy !== "all_users");''',
            "editor risk ai tools",
        ),
        (
            '''  const defaultAccessMessage =
    isGeneratorDefault && isQualityDefault
      ? t("aiModels.defaultAccessProtectionBoth")
      : isGeneratorDefault
        ? t("aiModels.defaultAccessProtectionGenerator")
        : t("aiModels.defaultAccessProtectionQuality");''',
            '''  const defaultAccessMessage = isAiToolsDefault
    ? language === "el"
      ? "Το μοντέλο είναι προεπιλογή AI Tools και πρέπει να παραμένει διαθέσιμο σε όλους."
      : "This model is the AI Tools default and must remain available to all users."
    : isGeneratorDefault && isQualityDefault
      ? t("aiModels.defaultAccessProtectionBoth")
      : isGeneratorDefault
        ? t("aiModels.defaultAccessProtectionGenerator")
        : t("aiModels.defaultAccessProtectionQuality");''',
            "editor default message",
        ),
        (
            '''          qualityDefault={data.qualityDefault}
          onClose={() => setEditing(null)}''',
            '''          qualityDefault={data.qualityDefault}
          aiToolsDefault={data.aiToolsDefault}
          onClose={() => setEditing(null)}''',
            "editor call ai tools prop",
        ),
    ],
)

print("patched final selector surfaces")
