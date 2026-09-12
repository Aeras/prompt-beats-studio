const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function isSafeOwnedPath(value: string, ownerId: string, prefix: string): boolean {
  if (!value || !new RegExp(`^${UUID}$`, "i").test(ownerId)) return false;
  if (value.includes("%") || value.includes("\\") || value.includes(":") || value.startsWith("/")) return false;

  const segments = value.split("/");
  const ownerSegmentIndex = prefix === "tracks" ? 1 : 0;
  if (segments.length <= ownerSegmentIndex + 1) return false;
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return false;
  if (prefix === "tracks" && segments[0] !== "tracks") return false;
  if (segments[ownerSegmentIndex] !== ownerId) return false;
  return true;
}

export function isSafeOwnedAudioKey(value: string, ownerId: string): boolean {
  return isSafeOwnedPath(value, ownerId, "tracks");
}

export function isSafeOwnedCoverPath(value: string, ownerId: string): boolean {
  return isSafeOwnedPath(value, ownerId, "");
}

export function assertSafeOwnedAudioKey(value: string, ownerId: string): void {
  if (!isSafeOwnedAudioKey(value, ownerId)) throw new Error("Unsafe owned audio storage path");
}
