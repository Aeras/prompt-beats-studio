import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PERSONAL_LIBRARY_SEARCH_TYPES = [
  "track",
  "project",
  "prompt",
  "version",
  "analysis",
  "inspiration_wall",
  "story_map",
  "song_universe",
] as const;

export type PersonalLibrarySearchType = (typeof PERSONAL_LIBRARY_SEARCH_TYPES)[number];

export type PersonalLibrarySearchResult = {
  item_type: PersonalLibrarySearchType;
  item_id: string;
  title: string;
  subtitle: string | null;
  updated_at: string;
  target_path: "/library" | "/inspiration-wall" | "/story-map" | "/song-universe";
  target_tab: "tracks" | "prompts" | null;
  project_id: string | null;
  match_rank: number;
};

const searchInput = z.object({
  query: z.string().trim().min(1).max(120),
  types: z.array(z.enum(PERSONAL_LIBRARY_SEARCH_TYPES)).max(8).optional(),
  recencyDays: z.number().int().min(1).max(3650).nullable().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

export const searchPersonalLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: results, error } = await (context.supabase as any).rpc(
      "search_personal_library",
      {
        _query: data.query,
        _types: data.types?.length ? data.types : null,
        _recency_days: data.recencyDays ?? null,
        _limit: data.limit,
      },
    );

    if (error) throw new Error(error.message);
    return { results: (results ?? []) as PersonalLibrarySearchResult[] };
  });
