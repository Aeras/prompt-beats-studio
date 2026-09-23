export type AuxiliaryAiOperation =
  | "song_setup_assistant"
  | "ai_music_lab"
  | "song_analyzer"
  | "inspiration_wall";

const AUXILIARY_AI_LIMIT_PER_HOUR = 10;

export async function requireAuxiliaryAiAdmission(
  supabase: any,
  operation: AuxiliaryAiOperation,
): Promise<void> {
  const { data, error } = await supabase.rpc("admit_auxiliary_ai_request", {
    _operation: operation,
    _limit_per_hour: AUXILIARY_AI_LIMIT_PER_HOUR,
  });
  if (error) throw new Error("The AI request could not be admitted. Please try again.");
  if (data !== true) {
    throw new Error("Too many AI requests. Please try again later.");
  }
}
