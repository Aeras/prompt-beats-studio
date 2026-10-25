import { z } from "zod";

export const contactInput = z.object({
  email: z.string().trim().email().max(254),
  alias: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(5).max(5000),
  website: z.string().max(200).optional().default(""),
});

export const contactProof = z.object({
  token: z.string().min(100).max(1000),
  nonce: z.number().int().min(0).max(0xffffffff),
});

export type ContactInput = z.infer<typeof contactInput>;

export function contactWorkInput(token: string, nonce: number) {
  return `pb-contact-work-v1:${token}:${nonce}`;
}

/** Fixed 16-bit work factor; neither caller nor challenge can lower it. */
export function validContactWork(digest: Uint8Array) {
  return digest.length === 32 && digest[0] === 0 && digest[1] === 0;
}

/** WebCrypto yields to the browser, so the form remains responsive. No third party. */
export async function solveContactProof(token: string) {
  const encoder = new TextEncoder();
  const deadline = performance.now() + 20_000;
  for (let nonce = 0; nonce <= 0xffffffff; nonce++) {
    if (performance.now() > deadline)
      throw new Error("Contact verification timed out. Please retry.");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(contactWorkInput(token, nonce)),
    );
    if (validContactWork(new Uint8Array(digest))) return { token, nonce };
  }
  throw new Error("Contact verification could not be completed.");
}
