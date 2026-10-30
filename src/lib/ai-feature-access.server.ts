import type { AuxiliaryAiOperation } from "@/lib/ai-admission.server";
import type { AiOperation } from "@/lib/ai-usage.server";

export function featureKeysForAiOperation(operation: AiOperation): readonly string[] {
  switch (operation) {
    case "generate":
    case "repair":
    case "audio_revision_intent":
      return ["ai_generator"];
    case "quality_check":
    case "post_repair_quality_check":
      return ["ai_generator", "quality_check"];
    case "song_setup_assistant":
      return ["ai_generator", "song_setup_assistant"];
    case "song_analysis":
      return ["ai_generator", "song_analyzer"];
    case "inspiration_wall_extraction":
      return ["ai_generator", "inspiration_wall"];
    case "story_map_generate":
    case "story_map_from_lyrics":
    case "story_map_analyze_lyrics":
    case "story_driven_plan":
      return ["ai_generator", "story_map"];
    case "universe_creative_bible_generate":
    case "universe_creative_bible_refine":
    case "universe_continuity_analysis":
    case "universe_project_fit":
    case "universe_next_song_plan":
      return ["ai_generator", "song_universe"];
    case "music_inspiration":
      return ["ai_generator", "ai_music_inspiration"];
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export function featureKeysForAuxiliaryAiOperation(
  operation: AuxiliaryAiOperation,
): readonly string[] {
  switch (operation) {
    case "song_setup_assistant":
      return ["ai_generator", "song_setup_assistant"];
    case "song_analyzer":
      return ["ai_generator", "song_analyzer"];
    case "inspiration_wall":
      return ["ai_generator", "inspiration_wall"];
    case "story_map":
      return ["ai_generator", "story_map"];
    case "song_universe":
      return ["ai_generator", "song_universe"];
    case "audio_revision_intent":
      return ["ai_generator"];
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}
