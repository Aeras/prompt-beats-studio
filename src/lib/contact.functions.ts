import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const contactInput = z.object({
  email: z.string().trim().email().max(254),
  alias: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(5).max(5000),
  website: z.string().max(200).optional().default(""),
});

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requestNetworkFingerprint(request: Request | undefined, emailHash: string) {
  if (!request) return sha256(`contact:no-request:${emailHash}`);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const candidate =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded;
  if (!candidate || candidate.length > 128) {
    return sha256(`contact:no-network:${emailHash}`);
  }
  const day = new Date().toISOString().slice(0, 10);
  return sha256(`contact:${day}:${candidate}`);
}

async function requireContactAdmission(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const emailHash = sha256(normalizedEmail);
  const networkHash = requestNetworkFingerprint(getRequest(), emailHash);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("admit_contact_request", {
    _email_hash: emailHash,
    _network_hash: networkHash,
  });
  if (error) throw new Error("Contact message could not be sent. Please try again.");
  if (data !== true) throw new Error("Too many contact requests. Please try again later.");
}

export const sendContactForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactInput.parse(input))
  .handler(async ({ data }) => {
    // Honeypot: bots commonly fill hidden website fields. Return success without sending.
    if (data.website.trim()) return { sent: true };

    await requireContactAdmission(data.email);

    try {
      const { sendContactEmailViaSmtp } = await import("@/lib/contact-email.server");
      await sendContactEmailViaSmtp({
        email: data.email,
        alias: data.alias,
        subject: data.subject,
        message: data.message,
      });
      return { sent: true };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Too many contact requests"))
        throw error;
      console.error("[contact] email delivery failed", error);
      throw new Error("Contact message could not be sent. Please try again.");
    }
  });
