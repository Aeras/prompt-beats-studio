from pathlib import Path


def replace(path: str, old: str, new: str, count: int | None = None) -> None:
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found == 0:
        raise SystemExit(f"pattern not found in {path}: {old[:160]!r}")
    if count is not None and found != count:
        raise SystemExit(f"unexpected match count in {path}: expected {count}, found {found}: {old[:160]!r}")
    p.write_text(text.replace(old, new))

replace(
    "src/components/promptbeats/ModerationCaseThread.tsx",
    "  const payload = event.payload ?? {};\n",
    '''  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)\n    ? event.payload as Record<string, unknown>\n    : {};\n''',
)

replace(
    "src/lib/admin.functions.ts",
    '''    const { error } = await context.supabase.rpc("admin_set_user_banned", {\n      _target_user_id: data.userId, _banned: data.banned,\n      _reason_code: data.banned ? (data.reasonCode ?? undefined) : undefined,\n      _reason_text: data.banned ? (data.reasonText ?? undefined) : undefined,\n    });''',
    '''    const { error } = await context.supabase.rpc("admin_set_user_banned", {\n      _target_user_id: data.userId,\n      _banned: data.banned,\n      ...(data.banned && data.reasonCode ? { _reason_code: data.reasonCode } : {}),\n      ...(data.banned && data.reasonText ? { _reason_text: data.reasonText } : {}),\n    });''',
)
replace(
    "src/lib/admin.functions.ts",
    '''    const { error } = await context.supabase.rpc("admin_set_moderation_status", { _target_user_id: data.userId, _status: data.status, _reason_text: data.reasonText ?? undefined });''',
    '''    const { error } = await context.supabase.rpc("admin_set_moderation_status", {\n      _target_user_id: data.userId,\n      _status: data.status,\n      ...(data.reasonText ? { _reason_text: data.reasonText } : {}),\n    });''',
)
replace(
    "src/lib/admin.functions.ts",
    '''      const { data: reservedId, error: registrationError } = await context.supabase.rpc("admin_create_registration_block", {\n        _email: authUser.user.email ?? "",\n        _reason_code: data.registrationReasonCode!,\n        _reason_text: data.registrationReasonText ?? undefined,\n      });''',
    '''      const { data: reservedId, error: registrationError } = await context.supabase.rpc("admin_create_registration_block", {\n        _email: authUser.user.email ?? "",\n        _reason_code: data.registrationReasonCode!,\n        ...(data.registrationReasonText ? { _reason_text: data.registrationReasonText } : {}),\n      });''',
)

replace(
    "src/lib/ai.functions.ts",
    '''      quality = await runQualityCheck(call, schemas.quality, constraints, data.result, {\n        operation: "quality_check",\n        records,\n        provider,\n        model,\n        reasoningEffort,\n      });''',
    '''      quality = await runQualityCheck(call, schemas.quality, constraints, data.result, {\n        operation: "quality_check",\n        records,\n        provider,\n        model,\n        ...(reasoningEffort ? { reasoningEffort } : {}),\n      });''',
)

# The generated RPC types model these root-folder args as non-nullable even though the SQL functions accept NULL for Root.
replace("src/lib/library-folders.functions.ts", 'const { data: results, error } = await context.supabase.rpc("search_library_scope", {', 'const { data: results, error } = await (context.supabase as any).rpc("search_library_scope", {')
replace("src/lib/library-folders.functions.ts", "_folder_id: folderId ?? undefined,", "_folder_id: folderId,")
replace("src/lib/library-folders.functions.ts", 'const { data: duplicated, error } = await context.supabase.rpc("duplicate_prompt_project_to_folder", {', 'const { data: duplicated, error } = await (context.supabase as any).rpc("duplicate_prompt_project_to_folder", {')
replace("src/lib/library-folders.functions.ts", 'const { data: duplicated, error } = await context.supabase.rpc("duplicate_standalone_prompt_to_folder", {', 'const { data: duplicated, error } = await (context.supabase as any).rpc("duplicate_standalone_prompt_to_folder", {')
replace("src/lib/library-folders.functions.ts", "_destination_folder_id: data.destinationFolderId ?? undefined,", "_destination_folder_id: data.destinationFolderId ?? null,")

# SQL accepts nullable period end/price id; generated RPC typing is stricter than the migration signature.
replace("src/routes/api/public/webhooks/stripe.ts", 'const { error } = await supabaseAdmin.rpc("process_stripe_subscription_event", {', 'const { error } = await (supabaseAdmin as any).rpc("process_stripe_subscription_event", {')

replace(
    "src/routes/generate.tsx",
    '''      setGenerationId(job.generationId); setGenerationResultModel(job.model); setSongContext(job.input); setQuality(null);''',
    '''      const recoveredSongContext = job.input && job.input.operation !== "lyrics_section_edit" ? job.input : null;\n      setGenerationId(job.generationId); setGenerationResultModel(job.model); setSongContext(recoveredSongContext); setQuality(null);''',
)

print("final strict type fixes applied")
