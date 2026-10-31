import { setResponseHeader } from "@tanstack/react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "./feature-access.functions";
import { atlasHandoffSchema, compileAtlasSelection } from "./song-atlas.shared";

export const getSongAtlasResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.strictObject({ profileId: z.string().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Vary", "Cookie, Authorization");
    await requireFeatureAccess(context.supabase, "cultural_song_atlas");
    const { error } = await context.supabase.rpc("atlas_preview_admission" as never);
    if (error) throw new Error("Atlas research preview not available.");
    const { readAtlasResearchProfile } = await import("./atlas-research.server");
    return readAtlasResearchProfile(data.profileId);
  });

export const getSongAtlasPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Vary", "Cookie, Authorization");
    await requireFeatureAccess(context.supabase, "cultural_song_atlas");
    const { error } = await context.supabase.rpc("atlas_preview_admission" as never);
    if (error) throw new Error("Atlas research preview not available.");
    const { readAtlasCatalog } = await import("./song-atlas-data.server");
    return readAtlasCatalog();
  });
export const validateSongAtlasHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => atlasHandoffSchema.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Vary", "Cookie, Authorization");
    await requireFeatureAccess(context.supabase, "cultural_song_atlas");
    const { error } = await context.supabase.rpc("atlas_preview_admission" as never);
    if (error) throw new Error("Atlas research preview not available.");
    const { readAtlasCatalog } = await import("./song-atlas-data.server");
    if (!data.selection.optionIds.length)
      throw new Error("Choose validated Atlas options before transfer.");
    const compiled = compileAtlasSelection(data.selection, readAtlasCatalog());
    return { handoff: data, ...compiled };
  });
