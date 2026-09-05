import { AwsClient } from "aws4fetch";

export function getR2Config() {
  const endpoint = process.env["R2_ENDPOINT"]!.replace(/\/+$/, "");
  const bucket = process.env["R2_BUCKET"]!;
  const publicBase = process.env["R2_PUBLIC_BASE_URL"]!.replace(/\/+$/, "");
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

/** Uploads bytes to Cloudflare R2 and returns the public URL. */
export async function uploadToR2(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const { endpoint, bucket, publicBase } = getR2Config();
  const client = getR2Client();
  const res = await client.fetch(`${endpoint}/${bucket}/${key}`, {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
  }
  return { key, url: `${publicBase}/${key}` };
}

/** Deletes an object from R2. */
export async function deleteFromR2(key: string): Promise<void> {
  const { endpoint, bucket } = getR2Config();
  await getR2Client().fetch(`${endpoint}/${bucket}/${key}`, { method: "DELETE" });
}
