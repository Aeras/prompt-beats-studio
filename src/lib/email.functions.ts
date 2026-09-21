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

    const [{ data: profile }, { data: priv }] = await Promise.all([
      supabase.from("profiles").select("handle").eq("id", userId).maybeSingle(),
      supabase.from("profile_private").select("welcome_email_sent_at").eq("user_id", userId).maybeSingle(),
    ]);

    if (priv?.welcome_email_sent_at) return { sent: false, reason: "already-sent" };

    const { sendWelcomeEmailViaSmtp } = await import("@/lib/welcome-email.server");
    await sendWelcomeEmailViaSmtp(
      email,
      profile?.handle ?? email.split("@")[0]!,
    );

    await supabase
      .from("profile_private")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("user_id", userId);

    return { sent: true };
  });
