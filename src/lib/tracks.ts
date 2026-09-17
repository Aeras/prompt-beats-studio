import type { CreatedWith } from "@/lib/created-with";
import type { PersistedTrackSourceType } from "@/lib/track-sources";

export type Track = {
  id: string;
  title: string;
  handle: string;
  genre: string;
  art: string;
  duration: string;
  plays: string;
  prompt: string;
  lyrics: string;
  audioUrl?: string;
  audioType?: "link" | "upload";
  isPublished?: boolean;
  sourceType?: PersistedTrackSourceType | undefined;
  sourceId?: string | null | undefined;
  createdWith?: CreatedWith | null;
  /** Present only for real database tracks (enables likes + owner controls). */
  userId?: string;
  staffBadge?: string | null;
};

export const UPLOAD_GENRES = [
  "Pop",
  "Hip-Hop / Rap",
  "Rock",
  "Metal",
  "Electronic / EDM",
  "House",
  "Techno",
  "Trance",
  "Drum & Bass",
  "Lo-Fi / Chill",
  "R&B / Soul",
  "Funk / Disco",
  "Jazz",
  "Blues",
  "Acoustic / Folk",
  "Country",
  "Reggae",
  "Latin",
  "Classical",
  "Cinematic / Soundtrack",
  "World / Traditional",
  "Experimental",
  "Custom",
];

/** Feed filters intentionally omit Custom because custom values are stored verbatim. */
export const GENRES = ["All", ...UPLOAD_GENRES.filter((genre) => genre !== "Custom")];

export const STUDIO_TAGS = ["[Intro]", "[Verse]", "[Pre]", "[Chorus]", "[Drop]", "[Bridge]", "[Outro]"];
