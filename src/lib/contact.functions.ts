import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { contactInput, contactProof } from "./contact-admission.shared";
import { safeErrorType } from "./safe-diagnostics";

// Narrow forward-migration contract, matching the existing internal RPC adapter
// convention without reformatting/regenerating unrelated production schemas.
type ContactAdmissionRpcClient = {
  rpc(
    name: "admit_contact_request_v2",
    args: {
      _email_hash: string;
      _nonce_hash: string;
      _user_id: string | null;
    },
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

async function requireContactAdmission(
  data: ReturnType<typeof contactInput.parse> & {
    proof?: { token: string; nonce: number } | undefined;
  },
) {
  const { contactActor, verifyContactProof } = await import("./contact-admission.server");
  const actor = await contactActor(getRequest());
  const { emailHash, nonceHash } = verifyContactProof(data, actor, data.proof);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admitted, error } = await (
    supabaseAdmin as unknown as ContactAdmissionRpcClient
  ).rpc("admit_contact_request_v2", {
    _email_hash: emailHash,
    _nonce_hash: nonceHash,
    _user_id: actor,
  });
  if (error) throw new Error("Contact message could not be sent. Please try again.");
  if (admitted !== true) throw new Error("Too many contact requests. Please try again later.");
}

export const getContactChallenge = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactInput.parse(input))
  .handler(async ({ data }) => {
    const { contactActor, issueContactProof } = await import("./contact-admission.server");
    return issueContactProof(data, await contactActor(getRequest()));
  });

export const sendContactForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    contactInput.extend({ proof: contactProof.optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    // Honeypot: bots commonly fill hidden website fields. Return success without sending.
    if (data.website.trim()) return { sent: true };

    await requireContactAdmission(data);

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
      // SMTP failures may contain credentials or message content.
      console.error("[contact] email delivery failed", { errorType: safeErrorType(error) });
      throw new Error("Contact message could not be sent. Please try again.");
    }
  });
