import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  avatarOwnerId,
  avatarProxyUrl,
  extractAvatarObjectPath,
  isSafeAvatarObjectPath,
} from "@/lib/avatar-reference";
import { getUserAvatarUrl } from "@/lib/user-avatar";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const avatarPath = `${ownerId}/avatar-1790412345678.webp`;
const legacySignedUrl = `https://example.supabase.co/storage/v1/object/sign/avatars/${avatarPath}?token=expired-token`;

describe("FINAL-012 private avatar access model", () => {
  test("normalizes current object paths and legacy signed URLs to one private avatar reference", () => {
    expect(isSafeAvatarObjectPath(avatarPath)).toBe(true);
    expect(avatarOwnerId(avatarPath)).toBe(ownerId);
    expect(extractAvatarObjectPath(avatarPath)).toBe(avatarPath);
    expect(extractAvatarObjectPath(legacySignedUrl)).toBe(avatarPath);
    expect(avatarProxyUrl(legacySignedUrl)).toBe(
      `/api/avatar?path=${encodeURIComponent(avatarPath)}`,
    );
  });

  test("rendering never depends on the expiry of a persisted Supabase signed avatar URL", () => {
    expect(getUserAvatarUrl(legacySignedUrl)).toBe(
      `/api/avatar?path=${encodeURIComponent(avatarPath)}`,
    );
  });

  test("rejects cross-bucket and malformed avatar paths", () => {
    expect(extractAvatarObjectPath(`${ownerId}/not-an-avatar.webp`)).toBeNull();
    expect(
      extractAvatarObjectPath(
        `https://example.supabase.co/storage/v1/object/sign/track-covers/${avatarPath}?token=x`,
      ),
    ).toBeNull();
  });

  test("public proxy verifies the current public-profile reference before issuing a short-lived URL", async () => {
    const route = await source("src/routes/api/avatar.ts");

    expect(route).toContain('.from("public_profiles")');
    expect(route).toContain('.select("id, avatar_url")');
    expect(route).toContain("extractAvatarObjectPath(profile.avatar_url) !== path");
    expect(route).toContain('.from("avatars")');
    expect(route).toContain("createSignedUrl(path, SIGNED_AVATAR_TTL_SECONDS)");
    expect(route).toContain("const SIGNED_AVATAR_TTL_SECONDS = 5 * 60");
  });

  test("keeps the avatars bucket private", async () => {
    const hardening = await source(
      "supabase/migrations/20260922120000_avatar_bucket_mime_hardening.sql",
    );
    const securityGate = await source("src/lib/security-step8.test.ts");

    expect(hardening).toContain("Canonical private avatar contract");
    expect(securityGate).toContain("UPDATE storage.buckets SET public = true WHERE id = 'avatars'");
    expect(securityGate).toContain("not.toContain");
  });
});
