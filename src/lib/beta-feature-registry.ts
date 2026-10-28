export type BetaFeatureDefinition = {
  key: string;
  name: string;
  description: string;
  registrationMigration: string;
  entrypoints: { path: string; kind: "client" | "server" | "sql" }[];
};

/** Explicit new product features only; never backfill the 19 legacy keys.
 * The Super Admin control plane is infrastructure, not a seed product feature.
 * Atlas is an explicitly approved new Beta product feature. See the development guide.
 */
export const BETA_FEATURES = [
  {
    key: "ai_music_inspiration",
    name: "AI Music Inspiration",
    description: "Private evidence-based music research and reusable Generator profiles.",
    registrationMigration:
      "supabase/migrations/20261028060004_music_inspiration_private_jobs_profiles.sql",
    entrypoints: [
      { path: "src/components/promptbeats/MusicInspirationPanel.tsx", kind: "client" },
      { path: "src/lib/music-inspiration.functions.ts", kind: "server" },
      {
        path: "supabase/migrations/20261028060004_music_inspiration_private_jobs_profiles.sql",
        kind: "sql",
      },
    ],
  },
  {
    key: "cultural_song_atlas",
    name: "Cultural Song Atlas",
    description:
      "Internal cultural song research preview; independently validated opt-in transfer only.",
    registrationMigration: "supabase/migrations/20261027011834_register_cultural_song_atlas.sql",
    entrypoints: [
      { path: "src/routes/song-atlas.tsx", kind: "client" },
      { path: "src/components/promptbeats/Sidebar.tsx", kind: "client" },
      { path: "src/components/promptbeats/AtlasGeneratorBridge.tsx", kind: "client" },
      { path: "src/lib/generation-jobs.functions.ts", kind: "server" },
      { path: "src/lib/song-atlas.functions.ts", kind: "server" },
      { path: "supabase/migrations/20261027011834_register_cultural_song_atlas.sql", kind: "sql" },
    ],
  },
] as const satisfies readonly BetaFeatureDefinition[];
export type BetaFeatureKey = (typeof BETA_FEATURES)[number]["key"];
export function isBetaFeatureKey(key: string): key is BetaFeatureKey {
  return (BETA_FEATURES as readonly BetaFeatureDefinition[]).some((feature) => feature.key === key);
}
