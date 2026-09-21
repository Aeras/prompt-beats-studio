import { sendSmtpEmail } from "@/lib/smtp-email.server";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type ContactEmailPayload = {
  email: string;
  alias: string;
  subject: string;
  message: string;
};

export function renderContactEmail(payload: ContactEmailPayload) {
  const email = escapeHtml(payload.email);
  const alias = escapeHtml(payload.alias);
  const subject = escapeHtml(payload.subject);
  const message = escapeHtml(payload.message).replaceAll("\n", "<br/>");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0c;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e8e8f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#121218;border:1px solid rgba(255,255,255,0.10);border-radius:24px;overflow:hidden;">
          <tr><td style="padding:32px;">
            <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#0a0a0c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">PromptBeats Contact</div>
            <h1 style="margin:22px 0 18px;font-size:24px;color:#fff;">${subject}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;color:#c8c8d6;">
              <tr><td style="padding:4px 0;width:110px;color:#85859a;">Email</td><td style="padding:4px 0;">${email}</td></tr>
              <tr><td style="padding:4px 0;color:#85859a;">Alias</td><td style="padding:4px 0;">${alias}</td></tr>
            </table>
            <div style="margin-top:22px;padding:18px 20px;border-radius:16px;border:1px solid rgba(255,255,255,0.10);background:#0d0d12;font-size:15px;line-height:1.7;color:#e5e5ef;">${message}</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendContactEmailViaSmtp(
  payload: ContactEmailPayload,
) {
  return sendSmtpEmail({
    to: "support@promptbeats.app",
    replyTo: payload.email,
    subject: `PromptBeats Contact — ${payload.subject}`,
    html: renderContactEmail(payload),
    text: [
      `Email: ${payload.email}`,
      `Alias: ${payload.alias}`,
      `Subject: ${payload.subject}`,
      "",
      payload.message,
    ].join("\n"),
  });
}
