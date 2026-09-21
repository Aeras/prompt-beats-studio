import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const contactInput = z.object({
  email: z.string().trim().email().max(254),
  alias: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(5).max(5000),
  website: z.string().max(200).optional().default(""),
});

const WINDOW_MS = 30 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;
const attempts = new Map<string, { count: number; resetAt: number }>();

function consumeRateLimit(email: string) {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= MAX_SENDS_PER_WINDOW) {
    throw new Error("Too many contact requests. Please try again later.");
  }
  current.count += 1;
  attempts.set(key, current);
}

export const sendContactForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactInput.parse(input))
  .handler(async ({ data }) => {
    // Honeypot: bots commonly fill hidden website fields. Return success without sending.
    if (data.website.trim()) return { sent: true };

    consumeRateLimit(data.email);

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
      if (error instanceof Error && error.message.startsWith("Too many contact requests")) throw error;
      console.error("[contact] email delivery failed", error);
      throw new Error("Contact message could not be sent. Please try again.");
    }
  });
