import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";

const MUSIC_MEMORY_COLLECTION = "promptbeats_music_memory_v1";
const MERT_VECTOR_SIZE = 768;

function getQdrantConfig() {
  const url = process.env["QDRANT_URL"]?.trim().replace(/\/+$/, "");
  const apiKey = process.env["QDRANT_API_KEY"]?.trim();
  if (!url || !apiKey) return null;
  if (!/^https:\/\//i.test(url)) throw new Error("QDRANT_URL must use HTTPS.");
  return { url, apiKey };
}

async function qdrantRequest(path: string, init?: RequestInit) {
  const config = getQdrantConfig();
  if (!config) throw new Error("Qdrant is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(`${config.url}${path}`, {
      ...init,
      headers: {
        "api-key": config.apiKey,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const getQdrantMusicMemoryStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");

    const configured = Boolean(process.env["QDRANT_URL"]?.trim() && process.env["QDRANT_API_KEY"]?.trim());
    if (!configured) {
      return {
        configured: false,
        reachable: false,
        collectionName: MUSIC_MEMORY_COLLECTION,
        collectionExists: false,
        collectionCount: 0,
        error: "Qdrant secrets are not configured.",
      };
    }

    try {
      const response = await qdrantRequest("/collections", { method: "GET" });
      if (!response.ok) {
        return {
          configured: true,
          reachable: false,
          collectionName: MUSIC_MEMORY_COLLECTION,
          collectionExists: false,
          collectionCount: 0,
          error: `Qdrant returned HTTP ${response.status}.`,
        };
      }

      const payload = (await response.json()) as {
        result?: { collections?: Array<{ name?: string }> };
      };
      const collections = payload.result?.collections ?? [];
      const names = collections
        .map((collection) => collection.name)
        .filter((name): name is string => Boolean(name));

      return {
        configured: true,
        reachable: true,
        collectionName: MUSIC_MEMORY_COLLECTION,
        collectionExists: names.includes(MUSIC_MEMORY_COLLECTION),
        collectionCount: names.length,
        error: null,
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        collectionName: MUSIC_MEMORY_COLLECTION,
        collectionExists: false,
        collectionCount: 0,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Qdrant connection timed out."
            : error instanceof Error
              ? error.message
              : "Qdrant connection failed.",
      };
    }
  });

export const initializeQdrantMusicMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFeatureAccess(context.supabase, "song_analyzer");

    const listResponse = await qdrantRequest("/collections", { method: "GET" });
    if (!listResponse.ok) throw new Error(`Qdrant health check failed with HTTP ${listResponse.status}.`);

    const listPayload = (await listResponse.json()) as {
      result?: { collections?: Array<{ name?: string }> };
    };
    const exists = (listPayload.result?.collections ?? []).some(
      (collection) => collection.name === MUSIC_MEMORY_COLLECTION,
    );
    if (exists) {
      return {
        ok: true,
        created: false,
        collectionName: MUSIC_MEMORY_COLLECTION,
        vectorSize: MERT_VECTOR_SIZE,
        distance: "Cosine" as const,
      };
    }

    const createResponse = await qdrantRequest(`/collections/${MUSIC_MEMORY_COLLECTION}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: MERT_VECTOR_SIZE,
          distance: "Cosine",
        },
      }),
    });
    if (!createResponse.ok) {
      const detail = await createResponse.text().catch(() => "");
      throw new Error(
        `Could not initialize Qdrant collection (HTTP ${createResponse.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`,
      );
    }

    return {
      ok: true,
      created: true,
      collectionName: MUSIC_MEMORY_COLLECTION,
      vectorSize: MERT_VECTOR_SIZE,
      distance: "Cosine" as const,
    };
  });
