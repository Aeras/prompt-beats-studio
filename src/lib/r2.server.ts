import { AwsClient } from "aws4fetch";

import { assertSafeOwnedAudioKey } from "@/lib/storage-paths";

export function getR2Config() {
  const endpoint = process.env["R2_ENDPOINT"]!.replace(/\/+$/, "");
  const bucket = process.env["R2_BUCKET"]!;
  const publicBase = process.env["R2_PUBLIC_BASE_URL"]?.replace(/\/+$/, "") ?? null;
  return { endpoint, bucket, publicBase };
}

export function getR2Client() {
  return new AwsClient({
    accessKeyId: process.env["R2_ACCESS_KEY_ID"]!,
    secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"]!,
    service: "s3",
    region: "auto",
  });
}

export function buildObjectKey(userId: string, fileName: string) {
  const clean = fileName.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
  return `tracks/${userId}/${Date.now()}-${clean}`;
}

/** Canonical private R2 object URL. It is not intended for browser playback. */
export function buildR2ObjectUrl(key: string) {
  const { endpoint, bucket } = getR2Config();
  return `${endpoint}/${bucket}/${key}`;
}

/** Creates a time-limited R2 GET URL using AWS SigV4 query signing. */
export async function createSignedR2GetUrl(key: string, expiresSeconds = 6 * 60 * 60) {
  const boundedExpiry = Math.max(60, Math.min(7 * 24 * 60 * 60, Math.trunc(expiresSeconds)));
  const unsignedUrl = new URL(buildR2ObjectUrl(key));
  unsignedUrl.searchParams.set("X-Amz-Expires", String(boundedExpiry));
  const request = await getR2Client().sign(new Request(unsignedUrl, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return request.url;
}

/** Uploads bytes to Cloudflare R2 and returns the canonical private object URL. */
export async function uploadToR2(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const { endpoint, bucket } = getR2Config();
  const client = getR2Client();
  const res = await client.fetch(`${endpoint}/${bucket}/${key}`, {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
  }
  return { key, url: buildR2ObjectUrl(key) };
}

/** Deletes an object from R2. */
export async function deleteFromR2(key: string): Promise<void> {
  const { endpoint, bucket } = getR2Config();
  const response = await getR2Client().fetch(`${endpoint}/${bucket}/${key}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed (${response.status}): ${await response.text()}`);
  }
}

/** Deletes only an audio object in the exact owning user's R2 namespace. */
export async function deleteOwnedR2Object(key: string, ownerId: string): Promise<void> {
  assertSafeOwnedAudioKey(key, ownerId);
  await deleteFromR2(key);
}
