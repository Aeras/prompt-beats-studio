import { sendSmtpEmail } from "@/lib/smtp-email.server";

export function renderWelcomeEmail(handle: string) {
  const name = handle.startsWith("@") ? handle : `@${handle}`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0c;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e8e8f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:24px;overflow:hidden;">
          <tr><td style="padding:36px 32px 8px;">
            <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#0a0a0c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">PromptBeats</div>
            <h1 style="margin:22px 0 10px;font-size:28px;line-height:1.2;color:#ffffff;">Welcome, ${name}</h1>
            <p style="margin:0;font-size:15px;line-height:1.65;color:#a5a5b8;">
              You're in. PromptBeats is where AI-made music travels with the prompt that created it — copy it, remix it, make it yours.
            </p>
          </td></tr>
          <tr><td style="padding:24px 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(168,85,247,0.35);border-radius:16px;background:rgba(168,85,247,0.08);">
              <tr><td style="padding:18px 20px;font-size:14px;line-height:1.7;color:#d8d8e6;">
                <strong style="color:#c084fc;">Start here</strong><br/>
                • Explore the discover feed and copy any prompt<br/>
                • Open the AI Prompt Studio and shape your own sound<br/>
                • Upload your track — it goes live with your prompt attached
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding:28px 32px 36px;">
            <a href="https://promptbeats.app" style="display:inline-block;padding:14px 28px;border-radius:14px;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#0a0a0c;font-weight:700;font-size:15px;text-decoration:none;">Open PromptBeats</a>
            <p style="margin:20px 0 0;font-size:12px;color:#6b6b80;">You received this because an account was created at promptbeats.app</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendWelcomeEmailViaSmtp(
  to: string,
  handle: string,
) {
  const name = handle.startsWith("@") ? handle : `@${handle}`;

  return sendSmtpEmail({
    to,
    subject: "Welcome to PromptBeats",
    html: renderWelcomeEmail(handle),
    text: [
      `Welcome, ${name}`,
      "",
      "You're in. PromptBeats is where AI-made music travels with the prompt that created it.",
      "",
      "Start here:",
      "• Explore the discover feed and copy any prompt",
      "• Open the AI Prompt Studio and shape your own sound",
      "• Upload your track — it goes live with your prompt attached",
      "",
      "https://promptbeats.app",
    ].join("\n"),
  });
}
