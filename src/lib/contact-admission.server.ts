import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerSupabaseAdminConfig } from "@/integrations/supabase/config.server";
import { createPublicServerClient } from "@/lib/supabase-public.server";
import { contactWorkInput, validContactWork, type ContactInput } from "./contact-admission.shared";

const lifetime = 5 * 60_000;
const envelopeSchema = z
  .object({
    v: z.literal(1),
    nonce: z.string().regex(/^[0-9a-f]{48}$/),
    expires: z.number().int(),
    payload: z.string().regex(/^[0-9a-f]{64}$/),
    actor: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

function mac(value: string, secret: string) {
  return createHmac("sha256", secret).update(`pb-contact-v1:${value}`).digest("hex");
}

function payloadHash(data: ContactInput, secret: string) {
  return mac(
    JSON.stringify([data.email.toLowerCase(), data.alias, data.subject, data.message]),
    secret,
  );
}

export async function contactActor(request: Request | undefined) {
  const token = /^Bearer\s+(\S+)$/i.exec(request?.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const client = createPublicServerClient(token);
  const { data, error } = await client.auth.getUser(token);
  const user = data.user;
  // Public Contact remains available to unconfirmed/anonymous-auth users as
  // guests; only a verified real account receives its independent allowance.
  if (error || !user || user.is_anonymous || !user.email_confirmed_at) return null;
  const { data: profile, error: profileError } = await client
    .from("profile_private")
    .select("is_banned")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("Contact verification is unavailable. Please retry.");
  return profile && profile.is_banned !== true ? user.id : null;
}

export function issueContactProof(
  data: ContactInput,
  actor: string | null,
  now = Date.now(),
  secret = getServerSupabaseAdminConfig().secretKey,
) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      nonce: randomBytes(24).toString("hex"),
      expires: now + lifetime,
      payload: payloadHash(data, secret),
      actor: mac(`actor:${actor ?? "guest"}`, secret),
    }),
  ).toString("base64url");
  return { token: `${payload}.${mac(payload, secret)}` };
}

export function verifyContactProof(
  data: ContactInput,
  actor: string | null,
  proof: { token: string; nonce: number } | undefined,
  now = Date.now(),
  secret = getServerSupabaseAdminConfig().secretKey,
) {
  const invalid = () => new Error("Contact verification expired or invalid. Please retry.");
  if (
    !proof ||
    proof.token.length > 1000 ||
    !Number.isSafeInteger(proof.nonce) ||
    proof.nonce < 0 ||
    proof.nonce > 0xffffffff
  )
    throw invalid();
  const [encoded, signature, extra] = proof.token.split(".");
  if (!encoded || !signature || extra !== undefined || !/^[0-9a-f]{64}$/.test(signature))
    throw invalid();
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(encoded, secret), "hex")))
    throw invalid();
  let parsed: z.infer<typeof envelopeSchema>;
  try {
    parsed = envelopeSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  } catch {
    throw invalid();
  }
  if (
    parsed.expires <= now ||
    parsed.expires > now + lifetime ||
    parsed.payload !== payloadHash(data, secret) ||
    parsed.actor !== mac(`actor:${actor ?? "guest"}`, secret)
  )
    throw invalid();
  if (
    !validContactWork(
      createHash("sha256").update(contactWorkInput(proof.token, proof.nonce)).digest(),
    )
  )
    throw invalid();
  return {
    emailHash: mac(`email:${data.email.toLowerCase()}`, secret),
    nonceHash: mac(`nonce:${parsed.nonce}`, secret),
  };
}
