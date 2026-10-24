import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getEligiblePublicTrack = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().guid() }).parse(input))
  .handler(async ({ data }) => {
    const { resolveEligiblePublicTrack } = await import("@/lib/public-content.server");
    return resolveEligiblePublicTrack(data.id);
  });

export const listEligiblePublicTracksFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listEligiblePublicTracks } = await import("@/lib/public-content.server");
  return { tracks: await listEligiblePublicTracks(100) };
});

export const getEligiblePublicCreatorByHandle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ handle: z.string().trim().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolvePublicCreatorByHandle } = await import("@/lib/public-content.server");
    return resolvePublicCreatorByHandle(data.handle);
  });

export const getEligiblePublicCreatorById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().guid() }).parse(input))
  .handler(async ({ data }) => {
    const { resolvePublicCreatorById } = await import("@/lib/public-content.server");
    return resolvePublicCreatorById(data.id);
  });

export const searchEligiblePublicCreatorsFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { searchEligiblePublicCreators } = await import("@/lib/public-creator-search.server");
    return { creators: await searchEligiblePublicCreators(data.query) };
  });
