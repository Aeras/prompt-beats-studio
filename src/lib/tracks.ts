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
  /** Present only for real database tracks (enables likes + owner controls). */
  userId?: string;
};

export const GENRES = [
  "All",
  "Pop",
  "Hip-Hop / Rap",
  "Rock / Metal",
  "Electronic / EDM",
  "Lo-Fi / Chill",
  "Cinematic / Soundtrack",
  "Latin",
  "R&B / Soul",
  "Jazz / Blues",
  "Acoustic / Folk",
  "World / Traditional",
  "Other / Experimental",
];

export const STUDIO_TAGS = ["[Intro]", "[Verse]", "[Pre]", "[Chorus]", "[Drop]", "[Bridge]", "[Outro]"];
