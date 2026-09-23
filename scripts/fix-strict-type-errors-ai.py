from pathlib import Path

p = Path("src/lib/ai.functions.ts")
text = p.read_text()

def rep(old: str, new: str, count: int | None = None) -> None:
    global text
    found = text.count(old)
    if found == 0:
        raise SystemExit(f"pattern not found: {old[:160]!r}")
    if count is not None and found != count:
        raise SystemExit(f"unexpected match count: expected {count}, found {found}: {old[:160]!r}")
    text = text.replace(old, new)

rep('''targetPlatform: z
    .enum(AI_TARGET_PLATFORMS as [AITargetPlatform, ...AITargetPlatform[]])''', '''targetPlatform: z
    .enum([...AI_TARGET_PLATFORMS] as [AITargetPlatform, ...AITargetPlatform[]])''')
rep('''  return {
    call: provider.modelCaller(resolved.model, resolved.provider),
    model: resolved.model,
    provider: resolved.provider,
    reasoningEffort: resolved.reasoningEffort,
    schemas: {''', '''  return {
    call: provider.modelCaller(resolved.model, resolved.provider),
    model: resolved.model,
    provider: resolved.provider,
    ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
    schemas: {''')
rep('''  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value;
  }
  return "object";''', '''  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";''')
rep('''function buildQualityPrompt(d: z.infer<typeof generateInput>, r: z.infer<typeof generationOutput>) {''', '''type QualityPromptInput = Pick<
  z.infer<typeof generateInput>,
  "targetPlatform" | "theme" | "genre" | "mood" | "language" | "structure" | "production" | "instructions"
>;

function buildQualityPrompt(d: QualityPromptInput, r: z.infer<typeof generationOutput>) {''')
rep('''  d: z.infer<typeof generateInput>,
  r: z.infer<typeof generationOutput>,''', '''  d: QualityPromptInput,
  r: z.infer<typeof generationOutput>,''')
rep('''const qualityCheckInput = z.object({
  theme: generateInput.shape.theme,''', '''const qualityCheckInput = z.object({
  targetPlatform: generateInput.shape.targetPlatform,
  theme: generateInput.shape.theme,''')
rep('''    const constraints = {
      theme: data.theme,''', '''    const constraints: QualityPromptInput = {
      targetPlatform: data.targetPlatform,
      theme: data.theme,''')
rep("title: data.version_label,", "title: data.version_label ?? null,")
rep('''      .insert({
        ...data,
        version_number: versionNumber,
        parent_prompt_id: parentPromptId,
        version_change_metadata: versionMetadata as Json | null,
        user_id: context.userId,
      })''', '''      .insert({
        ...data,
        version_number: versionNumber,
        parent_prompt_id: parentPromptId,
        version_change_metadata: versionMetadata as Json | null,
        user_id: context.userId,
      } as Database["public"]["Tables"]["saved_prompts"]["Insert"])''')

p.write_text(text)
print("AI strict type fixes applied")
