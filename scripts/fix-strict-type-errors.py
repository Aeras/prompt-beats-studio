from pathlib import Path


def replace(path: str, old: str, new: str, count: int | None = None) -> None:
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found == 0:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    if count is not None and found != count:
        raise SystemExit(f"unexpected match count in {path}: expected {count}, found {found}: {old[:120]!r}")
    p.write_text(text.replace(old, new))

# Small strict-mode fixes.
replace("src/components/promptbeats/AiModelsPanel.tsx", "setSelectedProvider(providers[0].id);", "setSelectedProvider(providers[0]!.id);")

replace("src/lib/ai-provider.server.ts", '''  return {\n    model: registryModel.providerModelId,\n    provider: registryModel.provider,\n    reasoningEffort: reasoningForOperation(registryModel, operation),\n  };''', '''  const reasoningEffort = reasoningForOperation(registryModel, operation);\n  return {\n    model: registryModel.providerModelId,\n    provider: registryModel.provider,\n    ...(reasoningEffort ? { reasoningEffort } : {}),\n  };''')

replace("src/lib/quality-check-core.server.ts", "obj.score", 'obj["score"]')
replace("src/lib/quality-check-core.server.ts", '''  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return typeof value;\n  return "object";''', '''  if (typeof value === "string") return "string";\n  if (typeof value === "number") return "number";\n  if (typeof value === "boolean") return "boolean";\n  return "object";''')

replace("src/lib/song-analyzer-dsp.ts", "for (let i = 0; i < source.length; i += 1) output[i] += source[i] / buffer.numberOfChannels;", "for (let i = 0; i < source.length; i += 1) output[i] = (output[i] ?? 0) + (source[i] ?? 0) / buffer.numberOfChannels;")
replace("src/lib/song-analyzer-dsp.ts", "chroma[pitchClass] += magnitude;", "chroma[pitchClass] = (chroma[pitchClass] ?? 0) + magnitude;")
replace("src/lib/song-analyzer-essentia.ts", "mono[i] += (source[i] ?? 0) / buffer.numberOfChannels;", "mono[i] = (mono[i] ?? 0) + (source[i] ?? 0) / buffer.numberOfChannels;")
replace("src/lib/song-analyzer.functions.ts", "patch.name = data.name;", 'patch["name"] = data.name;')
replace("src/lib/song-analyzer.functions.ts", "patch.project_id = data.projectId;", 'patch["project_id"] = data.projectId;')

replace("src/lib/library-folders.functions.ts", "_folder_id: folderId,", "_folder_id: folderId ?? undefined,")
replace("src/lib/library-folders.functions.ts", "_destination_folder_id: data.destinationFolderId ?? null,", "_destination_folder_id: data.destinationFolderId ?? undefined,")

replace("src/lib/project-version-history.shared.ts", "return keys.flatMap((key) => {", 'return keys.flatMap<VersionChangeMetadata["changedSections"][number]>((key) => {')
replace("src/lib/profile.functions.ts", "if (profile.id && profile.handle) creators.set(profile.id, profile);", "if (profile.id && profile.handle) creators.set(profile.id, { ...profile, id: profile.id, handle: profile.handle });")

replace("src/routes/api/public/webhooks/stripe.ts", "_customer_id: customerId,", "_customer_id: customerId!,")
replace("src/routes/api/public/webhooks/stripe.ts", "_subscription_id: subscriptionId,", "_subscription_id: subscriptionId!,")

replace("src/routes/api/upload.ts", "foundFile = { name: disposition[2], type, bytes: body.subarray(dataStart, nextDelimiter.position) };", 'foundFile = { name: disposition[2] ?? "", type, bytes: body.subarray(dataStart, nextDelimiter.position) };')
replace("src/routes/api/upload.ts", "(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));", "(bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0));")
replace("src/routes/api/upload.ts", '''        const { buildObjectKey, uploadToR2 } = await import("@/lib/r2.server");\n        const key = buildObjectKey(userId, parsed.name);\n        const { url } = await uploadToR2(key, bytes, type || (extension === "wav" ? "audio/wav" : "audio/mpeg"));''', '''        const { buildObjectKey, uploadToR2 } = await import("@/lib/r2.server");\n        const key = buildObjectKey(userId, parsed.name);\n        const uploadBytes = Uint8Array.from(bytes).buffer;\n        const { url } = await uploadToR2(key, uploadBytes, type || (extension === "wav" ? "audio/wav" : "audio/mpeg"));''')

replace("src/lib/audio-duration.ts", "audio.src = objectUrl ?? source;", 'audio.src = source instanceof File ? objectUrl! : source;')

replace("src/routes/generate.tsx", "return item ? t(item.labelKey) : value;", "return item?.labelKey ? t(item.labelKey) : value;")
replace("src/routes/generate.tsx", "const hasAdminInputBypass = usage?.unlimited === true;", 'const hasAdminInputBypass = usage != null && "unlimited" in usage && usage.unlimited === true;')
replace("src/routes/generate.tsx", '''      structure: savedWorkspaceSnapshot?.songStructure.join(" → ") ?? "",\n      production: savedWorkspaceSnapshot?.productionStyle ?? "",''', '''      structure: savedWorkspaceSnapshot?.songStructure.join(" → ") ?? "",\n      songBlueprint: savedWorkspaceSnapshot?.songBlueprint ?? [],\n      production: savedWorkspaceSnapshot?.productionStyle ?? "",''')

replace("src/components/promptbeats/PrivateReviewManager.tsx", "mutationFn: () => {", 'mutationFn: async (): Promise<{ token: string }> => {', 1)
replace("src/components/promptbeats/PrivateReviewManager.tsx", "return createPrivateTrackReviewSession({ data: {", "return await createPrivateTrackReviewSession({ data: {")
replace("src/components/promptbeats/PrivateReviewManager.tsx", "return createPrivateReviewSession({ data: {", "return await createPrivateReviewSession({ data: {")

# Generation jobs: preserve the section-edit union through the client API and serialize RPC payloads explicitly.
replace("src/lib/generation-jobs.functions.ts", 'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";', 'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\nimport type { Json } from "@/integrations/supabase/types";')
replace("src/lib/generation-jobs.functions.ts", "input: GenerationContext | null;", "input: DurableGenerationJobInput | null;")
replace("src/lib/generation-jobs.functions.ts", "_input: payload,", "_input: payload as Json,")

# Moderation case payloads are JSON from Postgres and must be serializable through TanStack server functions.
replace("src/lib/moderation-cases.functions.ts", 'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";', 'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\nimport type { Json } from "@/integrations/supabase/types";')
replace("src/lib/moderation-cases.functions.ts", "payload: Record<string, unknown>;", "payload: Json;")

# Export-center functions return discriminated variants, not the whole union.
replace("src/lib/export-center.shared.ts", "export function buildPromptExportDocument(source: PromptExportSource, locale: ExportLocale): ExportDocument {", 'export function buildPromptExportDocument(source: PromptExportSource, locale: ExportLocale): Extract<ExportDocument, { exportType: "prompt" }> {')
replace("src/lib/export-center.shared.ts", "export function buildProjectExportDocument(source: ProjectExportSource, locale: ExportLocale): ExportDocument {", 'export function buildProjectExportDocument(source: ProjectExportSource, locale: ExportLocale): Extract<ExportDocument, { exportType: "project" }> {')
replace("src/lib/export-center.shared.ts", "export function buildProjectSummaryDocument(source: ProjectExportSource, locale: ExportLocale): ExportDocument {", 'export function buildProjectSummaryDocument(source: ProjectExportSource, locale: ExportLocale): Extract<ExportDocument, { exportType: "project-summary" }> {')
replace("src/lib/export-center.shared.ts", "export function buildProjectPromptDocuments(source: ProjectExportSource, locale: ExportLocale): ExportDocument[] {", 'export function buildProjectPromptDocuments(source: ProjectExportSource, locale: ExportLocale): Array<Extract<ExportDocument, { exportType: "prompt" }>> {')

# Admin strict optional/index checks.
replace("src/lib/admin.functions.ts", "_reason_code: data.banned ? data.reasonCode : null,", "_reason_code: data.banned ? (data.reasonCode ?? undefined) : undefined,")
replace("src/lib/admin.functions.ts", "_reason_text: data.banned ? data.reasonText : null,", "_reason_text: data.banned ? (data.reasonText ?? undefined) : undefined,")
replace("src/lib/admin.functions.ts", "_reason_text: data.reasonText ?? null", "_reason_text: data.reasonText ?? undefined")
replace("src/lib/admin.functions.ts", "const prefix = prefixes[index];", "const prefix = prefixes[index]!;")
replace("src/lib/admin.functions.ts", "_reason_code: data.registrationReasonCode,", "_reason_code: data.registrationReasonCode!,")
replace("src/lib/admin.functions.ts", "_reason_text: data.registrationReasonText ?? null,", "_reason_text: data.registrationReasonText ?? undefined,")

# AI legacy path strict typing without changing runtime behavior.
replace("src/lib/ai.functions.ts", "z.enum(AI_TARGET_PLATFORMS as [AITargetPlatform, ...AITargetPlatform[]])", "z.enum([...AI_TARGET_PLATFORMS] as [AITargetPlatform, ...AITargetPlatform[]])")
replace("src/lib/ai.functions.ts", '''  return {\n    call: provider.modelCaller(resolved.model, resolved.provider),\n    model: resolved.model,\n    provider: resolved.provider,\n    reasoningEffort: resolved.reasoningEffort,\n    schemas: {''', '''  return {\n    call: provider.modelCaller(resolved.model, resolved.provider),\n    model: resolved.model,\n    provider: resolved.provider,\n    ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),\n    schemas: {''')
replace("src/lib/ai.functions.ts", '''  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {\n    return typeof value;\n  }\n  return "object";''', '''  if (typeof value === "string") return "string";\n  if (typeof value === "number") return "number";\n  if (typeof value === "boolean") return "boolean";\n  return "object";''')
replace("src/lib/ai.functions.ts", "function buildQualityPrompt(d: z.infer<typeof generateInput>, r: z.infer<typeof generationOutput>) {", '''type QualityPromptInput = Pick<\n  z.infer<typeof generateInput>,\n  "targetPlatform" | "theme" | "genre" | "mood" | "language" | "structure" | "production" | "instructions"\n>;\n\nfunction buildQualityPrompt(d: QualityPromptInput, r: z.infer<typeof generationOutput>) {''')
replace("src/lib/ai.functions.ts", "  d: z.infer<typeof generateInput>,\n  r: z.infer<typeof generationOutput>,", "  d: QualityPromptInput,\n  r: z.infer<typeof generationOutput>,")
replace("src/lib/ai.functions.ts", '''const qualityCheckInput = z.object({\n  theme: generateInput.shape.theme,''', '''const qualityCheckInput = z.object({\n  targetPlatform: generateInput.shape.targetPlatform,\n  theme: generateInput.shape.theme,''')
replace("src/lib/ai.functions.ts", '''    const constraints = {\n      theme: data.theme,''', '''    const constraints: QualityPromptInput = {\n      targetPlatform: data.targetPlatform,\n      theme: data.theme,''')
replace("src/lib/ai.functions.ts", "title: data.version_label,", "title: data.version_label ?? null,")
replace("src/lib/ai.functions.ts", '''      .insert({\n        ...data,\n        version_number: versionNumber,\n        parent_prompt_id: parentPromptId,\n        version_change_metadata: versionMetadata as Json | null,\n        user_id: context.userId,\n      })''', '''      .insert({\n        ...data,\n        version_number: versionNumber,\n        parent_prompt_id: parentPromptId,\n        version_change_metadata: versionMetadata as Json | null,\n        user_id: context.userId,\n      } as Database["public"]["Tables"]["saved_prompts"]["Insert"])''')

print("strict type fixes applied")
