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
 * Super Admin analysis now obtains Stage 0 evidence from the external GPU
 * worker (Demucs + Essentia + MERT + fusion). If that experimental worker is
 * unavailable, the existing deterministic browser DSP remains the fallback.
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
  legacy: Stage0DspEvidence,
): Promise<{
  stage0Evidence: Stage0DspEvidence;
  similarityEmbedding: AnalyzerSimilarityEmbedding | null;
}> {
  const startedAt = performance.now();
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
    return {
      stage0Evidence: {
        ...legacy,
        engine: legacy.engine ?? {
          name: "legacy",
          engineVersion: "promptbeats-legacy-v1",
          methodVersion: "stage0-dsp-v1",
          algorithms: [],
        },
        processing: {
          ...legacy.processing,
          totalMs: Math.round((performance.now() - startedAt) * 100) / 100,
        },
        limitations: [
          ...legacy.limitations,
          "External enhanced Stage 0 unavailable; legacy browser DSP fallback used.",
          `Enhanced worker failure: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}`,
        ],
      },
      similarityEmbedding: null,
    };
  }
}

export async function analyzeStage0Essentia(
  file: File,
  legacy: Stage0DspEvidence,
): Promise<Stage0DspEvidence> {
  return (await analyzeStage0EssentiaWithSimilarity(file, legacy)).stage0Evidence;
}
