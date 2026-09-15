export const enCreatorPage = {
  "creator.backToFeed": "Back to the feed",
  "creator.loading": "Loading…",
  "creator.notFound": "No creator found for @{handle}.",
  "creator.tracks": "My Tracks",
  "creator.noPublished": "No published tracks yet.",
  "creator.listenOnPlatform": "Listen on Platform",
} as const;

export type CreatorPageTranslationKey = keyof typeof enCreatorPage;
