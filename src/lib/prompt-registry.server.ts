import { normalizeV4Platform, serializeV4Blueprint } from "./advanced-generator-prompt-v4-beta";
import { validatePromptTemplate, promptBindingSchema } from "./prompt-registry.shared";
import type { V5Beta1Input } from "./advanced-generator-prompt-v5-beta-1";

/** The browser cannot submit template text; the durable job is the authority. */
export async function resolveBoundRegistryPrompt(
  binding: unknown,
  input: V5Beta1Input,
  userId: string,
  jobId?: string,
) {
  const parsed = promptBindingSchema.parse(binding);
  if (!jobId) throw new Error("A durable prompt binding is required");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("generator_prompt_for_job_internal", {
    _job_id: jobId,
    _user_id: userId,
  });
  if (
    error ||
    !data ||
    data.id !== parsed.id ||
    data.digest !== parsed.digest ||
    typeof data.content !== "string"
  )
    throw new Error("The bound prompt is unavailable");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.content))),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== parsed.digest) throw new Error("Prompt integrity verification failed");
  return buildRegistryPrompt(data.content, input);
}

export function buildRegistryPrompt(content: string, input: V5Beta1Input) {
  validatePromptTemplate(content);
  const values: Record<string, string> = {
    CORE_IDEA: input.theme,
    GENRES: input.genre,
    MOOD: input.mood,
    LANGUAGE: input.language,
    TARGET_PLATFORM: normalizeV4Platform(input.targetPlatform),
    SONG_STRUCTURE: input.structure?.trim() || "(not provided)",
    PRODUCTION_STYLE: input.production?.trim() || "(not provided)",
    ADDITIONAL_INSTRUCTIONS: input.instructions?.trim() || "(not provided)",
    SONG_BLUEPRINT: serializeV4Blueprint(input.songBlueprint),
  };
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}
