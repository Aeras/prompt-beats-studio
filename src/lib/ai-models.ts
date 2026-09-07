/**
 * Client-safe catalog of the AI provider/model options.
 * Contains only ids and labels — no keys, no prompts, no provider internals.
 * The active model is resolved server-side; this list exists so the
 * admin-only selector can render the available options.
 */
export const AI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "gemini" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: AiModelId = "gemini-2.5-flash";

export const AI_MODEL_IDS = AI_MODELS.map((m) => m.id) as unknown as AiModelId[];

export function aiModelLabel(id: string) {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}
