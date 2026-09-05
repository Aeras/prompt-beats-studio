import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends the styled "Welcome to PromptBeats" email once per user.
 * Called right after a successful signup; safe to call again (no-op after the first send).
 */
export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) return { sent: false, reason: "no-email" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("handle, welcome_email_sent_at")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.welcome_email_sent_at) return { sent: false, reason: "already-sent" };

    const { sendWelcomeEmailViaResend } = await import("@/lib/welcome-email.server");
    await sendWelcomeEmailViaResend(email, profile?.handle ?? email.split("@")[0]!);

    await supabase
      .from("profiles")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", userId);

    return { sent: true };
  });
