/**
 * Client-safe catalog of the AI provider/model options.
 * Contains only ids and labels — no keys, no prompts, no provider internals.
 * The active model is resolved server-side; this list exists so the
 * admin-only selector can render the available options.
 */
export const AI_MODELS = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "gemini" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "gemini" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "gemini" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic" },
  { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic" },
  { id: "claude-fable-5", label: "Claude Fable 5", provider: "anthropic" },
  { id: "grok-4.6", label: "Grok 4.6", provider: "xai" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: AiModelId = "gemini-3-flash-preview";

export const AI_MODEL_IDS = AI_MODELS.map((m) => m.id) as unknown as AiModelId[];

export function aiModelLabel(id: string) {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}
