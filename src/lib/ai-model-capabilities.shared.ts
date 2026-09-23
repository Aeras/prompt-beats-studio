export type AiModelCapabilityOption = {
  provider: string;
};

/**
 * PromptBeats' current image-input adapter is the Gemini multimodal endpoint.
 * Keep this check centralized so UI selectors and server resolution enforce the
 * same capability contract until capabilities move into the registry itself.
 */
export function supportsPromptBeatsVisionInput(model: AiModelCapabilityOption) {
  return model.provider === "gemini";
}
