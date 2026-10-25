/** Public, allowlisted messages only. Never render raw database/provider errors. */
export function libraryActionError(
  error: unknown,
  language: string,
  action: "favorite" | "create" | "add" | "load",
) {
  const message = error instanceof Error ? error.message : "";
  const el = language === "el";
  if (message.startsWith("Unauthorized:"))
    return el ? "Συνδέσου ξανά και δοκίμασε πάλι." : "Please sign in again and retry.";
  if (message === "Feature not available.")
    return el
      ? "Η λειτουργία δεν είναι διαθέσιμη για τον λογαριασμό σου."
      : "This feature is unavailable for your account.";
  if (message === "Track is unavailable")
    return el
      ? "Το τραγούδι δεν είναι πλέον διαθέσιμο για προσθήκη."
      : "This track is no longer available to add.";
  if (message === "Playlist not found")
    return el
      ? "Η λίστα δεν είναι πλέον διαθέσιμη. Ανανέωσε τις λίστες σου."
      : "This playlist is no longer available. Refresh your playlists.";
  if (message === "Only tracks played by the PromptBeats player can be added to playlists")
    return el
      ? "Στις λίστες προστίθενται μόνο τραγούδια του player του PromptBeats."
      : "Only tracks played by the PromptBeats player can be added to playlists.";
  const messages = {
    favorite: el
      ? "Δεν ενημερώθηκαν τα Αγαπημένα. Δοκίμασε ξανά."
      : "Favorites could not be updated. Please retry.",
    create: el
      ? "Δεν δημιουργήθηκε η λίστα με το τραγούδι. Δοκίμασε ξανά."
      : "The playlist with this track could not be created. Please retry.",
    add: el
      ? "Το τραγούδι δεν προστέθηκε στη λίστα. Δοκίμασε ξανά."
      : "The track could not be added to the playlist. Please retry.",
    load: el
      ? "Δεν φορτώθηκαν οι λίστες. Δοκίμασε ξανά."
      : "Playlists could not be loaded. Please retry.",
  };
  return messages[action];
}
