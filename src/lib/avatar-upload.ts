export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const AVATAR_EXTENSIONS: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateAvatarFile(file: File): "jpg" | "png" | "webp" {
  const extension = AVATAR_EXTENSIONS[file.type];
  if (!extension) throw new Error("Avatar image must be JPG, PNG or WebP.");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Avatar image must be 5 MB or smaller.");
  return extension;
}
