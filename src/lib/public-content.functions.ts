import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  listEligiblePublicTracks,
  resolveEligiblePublicTrack,
  resolvePublicCreatorByHandle,
  resolvePublicCreatorById,
} from "@/lib/public-content.server";

export const getEligiblePublicTrack = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => resolveEligiblePublicTrack(data.id));

export const listEligiblePublicTracksFn = createServerFn({ method: "GET" }).handler(async () => ({
  tracks: await listEligiblePublicTracks(100),
}));

export const getEligiblePublicCreatorByHandle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ handle: z.string().trim().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data }) => resolvePublicCreatorByHandle(data.handle));

export const getEligiblePublicCreatorById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => resolvePublicCreatorById(data.id));
