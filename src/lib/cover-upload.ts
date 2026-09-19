export const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

const COVER_EXTENSIONS: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateCoverFile(file: File): "jpg" | "png" | "webp" {
  const extension = COVER_EXTENSIONS[file.type];
  if (!extension) throw new Error("Cover image must be JPG, PNG or WebP.");
  if (file.size > MAX_COVER_BYTES) throw new Error("Cover image must be 8 MB or smaller.");
  return extension;
}
