# Optional: Contact Us transactional email

Context: the read-only API question has been answered in chat (`sendLovableEmail` from `@lovable.dev/email-js@0.1.0`). This plan is only for the follow-up implementation if you want it — no changes have been made.

## What to build

A Contact Us flow that sends one transactional email to `support@promptbeats.app` from the existing verified sender domain (`notify.promptbeats.app`), using the installed `sendLovableEmail` API.

## Steps

1. Add `src/lib/email-templates/contact-message.tsx` — React Email template using the existing `EmailLayout` brand shell (name, sender address, message body; subject `Contact: <name>`).
2. Add `src/lib/contact.functions.ts` — a `createServerFn` (POST) that:
   - validates input with Zod (name, email, message), rejects abuse with basic length limits;
   - sends via `sendLovableEmail` with `to: support@promptbeats.app`, `from: PromptBeats <no-reply@notify.promptbeats.app>`, `sender_domain: notify.promptbeats.app`, `reply_to` set to the sender's email, `purpose: "transactional"`, and an `idempotency_key` derived from a stored submission id;
   - catches `EmailAPIError` and returns a typed failure shape (no raw provider errors to the browser).
3. Wire a Contact Us form (page or modal) that calls the server function via `useServerFn`; client code never touches the send helper directly.

## Technical details

- Env: `LOVABLE_API_KEY` (already present server-side), optional `LOVABLE_SEND_URL` — both read inside the handler only.
- No database table required unless you want stored submissions (for idempotency keys / rate limiting); if added, it gets full RLS + GRANTs in one migration.
- No unsubscribe UI, no queue, no marketing sends — one recipient per trigger only.

## Out of scope

No changes to auth email templates, the auth webhook route, pricing, or any existing send behavior.
