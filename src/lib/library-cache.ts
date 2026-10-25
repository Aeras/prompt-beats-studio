import type { QueryClient } from "@tanstack/react-query";

/** Update only this account's existing caches; additions use the authorized projection. */
export async function refreshFavorites(
  client: QueryClient,
  userId: string,
  trackId: string,
  favorite: boolean,
) {
  const idsKey = ["library", "favorite-ids", userId];
  const tracksKey = ["library", "favorites", userId];
  client.setQueryData<{ trackIds: string[] }>(idsKey, (old) =>
    old
      ? {
          ...old,
          trackIds: favorite
            ? [...new Set([...old.trackIds, trackId])]
            : old.trackIds.filter((id) => id !== trackId),
        }
      : old,
  );
  if (!favorite)
    client.setQueryData<{ tracks: { id: string }[] }>(tracksKey, (old) =>
      old ? { ...old, tracks: old.tracks.filter((track) => track.id !== trackId) } : old,
    );
  await Promise.all([
    client.invalidateQueries({ queryKey: idsKey }),
    client.invalidateQueries({ queryKey: tracksKey }),
  ]);
}

export async function refreshPlaylists(client: QueryClient, userId: string, playlistId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["library", "playlists", userId] }),
    client.invalidateQueries({ queryKey: ["library", "playlist", playlistId] }),
  ]);
}
