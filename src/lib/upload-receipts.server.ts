import { createHash } from "node:crypto";
import { z } from "zod";
import { compatibleOffsetDateTimePattern } from "@/lib/validation-datetime";
import { buildR2ObjectUrl, headR2Object } from "./r2.server";
import { assertSafeOwnedAudioKey } from "./storage-paths";

const receiptSchema = z.object({
  key: z.string(),
  owner_id: z.string().guid(),
  size: z.number().int().positive(),
  mime: z.enum(["audio/mpeg", "audio/wav"]),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  canonical_url: z.string().url(),
  status: z.enum(["pending", "finalized", "discarded"]),
  expires_at: z.string().regex(compatibleOffsetDateTimePattern),
  consumed_at: z.string().nullable(),
  etag: z.string().nullable(),
});
export type UploadReceipt = z.infer<typeof receiptSchema>;

export function verifyUploadedObject(
  receipt: Pick<UploadReceipt, "size" | "mime" | "sha256" | "etag">,
  object: Awaited<ReturnType<typeof headR2Object>>,
) {
  if (
    object.size !== receipt.size ||
    object.mime !== receipt.mime ||
    object.sha256 !== receipt.sha256 ||
    !object.etag ||
    (receipt.etag && receipt.etag !== object.etag)
  )
    throw new Error("Uploaded audio object does not match its finalized receipt.");
}

export async function beginAudioUpload(
  userId: string,
  key: string,
  bytes: Uint8Array,
  mime: string,
) {
  assertSafeOwnedAudioKey(key, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabaseAdmin
    .from("audio_upload_receipts" as never)
    .insert({
      key,
      owner_id: userId,
      size: bytes.byteLength,
      mime,
      sha256,
      canonical_url: buildR2ObjectUrl(key),
    } as never)
    .select("*")
    .single();
  if (error) throw new Error("The upload could not be registered safely.");
  return receiptSchema.parse(data);
}

export async function finalizeAudioUpload(receipt: UploadReceipt) {
  const object = await headR2Object(receipt.key);
  verifyUploadedObject(receipt, object);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("audio_upload_receipts" as never)
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      etag: object.etag,
    } as never)
    .eq("key", receipt.key)
    .eq("owner_id", receipt.owner_id)
    .eq("status", "pending")
    .select("key")
    .single();
  if (error || !data) throw new Error("The upload could not be finalized safely.");
}

/** Called by every application creation/replacement path. The DB consumes atomically. */
export async function requireFinalizedAudio(key: string, userId: string) {
  assertSafeOwnedAudioKey(key, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("audio_upload_receipts" as never)
    .select("*")
    .eq("key", key)
    .eq("owner_id", userId)
    .single();
  if (error) throw new Error("The uploaded audio reference is unavailable.");
  const receipt = receiptSchema.parse(data);
  if (
    receipt.status !== "finalized" ||
    receipt.consumed_at ||
    Date.parse(receipt.expires_at) <= Date.now()
  )
    throw new Error("The upload receipt is invalid or expired.");
  verifyUploadedObject(receipt, await headR2Object(key));
  if (receipt.canonical_url !== buildR2ObjectUrl(key))
    throw new Error("The upload origin has changed. Upload the file again.");
  return receipt;
}

/** Failure cleanup uses the existing durable ledger, never an unreserved DELETE. */
export async function queueFailedAudioUpload(key: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("track_storage_cleanup")
    .insert({
      audio_key: key,
      owner_id: userId,
      created_by: userId,
      cleanup_type: "abandoned_upload",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[upload] cleanup ledger unavailable");
    return;
  }
  try {
    const { cleanTrackStorage } = await import("./track-moderation.functions");
    await cleanTrackStorage(supabaseAdmin, data.id);
  } catch {
    console.warn("[upload] storage cleanup remains pending");
  }
}
