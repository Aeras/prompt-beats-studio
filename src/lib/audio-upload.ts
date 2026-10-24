/** Canonical metadata from the supported audio signatures; never persist client MIME. */
export function verifiedAudioType(name: string, suppliedType: string, bytes: Uint8Array) {
  const mime = suppliedType.toLowerCase().split(";")[0]?.trim() ?? "";
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  const wav =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE";
  const mp3 =
    bytes.length >= 3 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0));
  const format = wav ? "wav" : mp3 ? "mp3" : null;
  if (!format || (extension !== undefined && extension !== format)) return null;
  const mp3Types = ["audio/mpeg", "audio/mp3"];
  const wavTypes = ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"];
  if (
    mime &&
    mime !== "application/octet-stream" &&
    !(format === "wav" ? wavTypes : mp3Types).includes(mime)
  )
    return null;
  return { extension: format, mime: format === "wav" ? "audio/wav" : "audio/mpeg" } as const;
}
