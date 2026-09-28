import { analyzeEnhancedStage0 } from "@/lib/song-analyzer-enhanced.functions";
import type { AnalyzerSourceStemPreview } from "@/lib/song-analyzer-enhanced.shared";
import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";

export type AnalyzerSimilarityEmbedding = {
  contract: "promptbeats-mert95-similarity-v1";
  vector: number[];
};

let pendingSourceStemPreview: AnalyzerSourceStemPreview | null = null;

export function consumeAnalyzerSourceStemPreview() {
  const preview = pendingSourceStemPreview;
  pendingSourceStemPreview = null;
  return preview;
}

/**
 * Compatibility adapter retained so the existing Song Analyzer route does not
 * duplicate transport logic. Browser-side Essentia.js/WASM has been removed;
 * Super Admin analysis obtains Stage 0 evidence from the external GPU worker
 * (Demucs + Essentia + MERT + fusion).
 *
 * Enhanced Stage 0 is authoritative for the current Analyzer experiment. We do
 * not silently continue to Stage A/Final Judge with legacy browser DSP when the
 * GPU worker is unavailable, because the same audio can then produce materially
 * different tempo, instrument and genre interpretations while looking like a
 * normal completed analysis.
 *
 * The short Demucs `other` preview is transient verifier transport. It is
 * intentionally removed from the Stage 0 object before Stage A, Final Judge,
 * debug rendering, or persistence can see it.
 */
async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read audio file"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode audio file"));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function analyzeStage0EssentiaWithSimilarity(
  file: File,
  _legacy: Stage0DspEvidence,
): Promise<{
  stage0Evidence: Stage0DspEvidence;
  similarityEmbedding: AnalyzerSimilarityEmbedding | null;
}> {
  pendingSourceStemPreview = null;

  try {
    const audioBase64 = await fileToBase64(file);
    const response = await analyzeEnhancedStage0({
      data: {
        audioBase64,
        mimeType: file.type as any,
      },
    });
    const transported = response.stage0Evidence as Stage0DspEvidence & {
      sourceStemPreview?: AnalyzerSourceStemPreview;
    };
    const { sourceStemPreview, ...cleanStage0Evidence } = transported;
    pendingSourceStemPreview = sourceStemPreview ?? null;
    return {
      stage0Evidence: cleanStage0Evidence as Stage0DspEvidence,
      similarityEmbedding: response.similarityEmbedding ?? null,
    };
  } catch (error) {
    pendingSourceStemPreview = null;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Enhanced Song Analyzer is temporarily unavailable. Analysis was stopped instead of using degraded legacy DSP. ${detail}`.slice(0, 900),
    );
  }
}

export async function analyzeStage0Essentia(
  file: File,
  legacy: Stage0DspEvidence,
): Promise<Stage0DspEvidence> {
  return (await analyzeStage0EssentiaWithSimilarity(file, legacy)).stage0Evidence;
}
