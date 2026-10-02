export type PublicAccountEligibilityInput = {
  moderationStatus: string | null | undefined;
  isBanned: boolean | null | undefined;
  handle: string | null | undefined;
};

export type PublicTrackEligibilityInput = {
  isPublished: boolean | null | undefined;
  moderationStatus: string | null | undefined;
  creatorEligible: boolean;
};

export type CreatorPublicState = "unavailable" | "thin" | "indexable";

export function isPublicAccountEligible(input: PublicAccountEligibilityInput): boolean {
  return (
    input.moderationStatus === "active" && input.isBanned === false && Boolean(input.handle?.trim())
  );
}

export function isPublicTrackEligible(input: PublicTrackEligibilityInput): boolean {
  return input.isPublished === true && input.moderationStatus === "active" && input.creatorEligible;
}

export function creatorPublicState(
  accountEligible: boolean,
  eligiblePublicTrackCount: number,
): CreatorPublicState {
  if (!accountEligible) return "unavailable";
  return eligiblePublicTrackCount > 0 ? "indexable" : "thin";
}

export function sanitizePublicTrackText<
  T extends {
    prompt?: string | null;
    lyrics?: string | null;
    prompt_is_public?: boolean | null;
    lyrics_is_public?: boolean | null;
  },
>(track: T): T & { prompt: string; lyrics: string } {
  return {
    ...track,
    prompt: track.prompt_is_public !== false ? (track.prompt ?? "") : "",
    lyrics: track.lyrics_is_public !== false ? (track.lyrics ?? "") : "",
  };
}
