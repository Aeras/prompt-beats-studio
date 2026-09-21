# PromptBeats Supabase Auth Email Templates

Canonical branded templates for the hosted Supabase Auth email flows.

Current language: English.

## Subjects

- Confirm sign up: `Confirm your PromptBeats email`
- Invite user: `You’re invited to PromptBeats`
- Magic link / OTP: `Your PromptBeats sign-in link`
- Change email address: `Confirm your new PromptBeats email`
- Reset password: `Reset your PromptBeats password`
- Reauthentication: `Your PromptBeats verification code`

## Template mapping

- Confirm sign up → `confirmation.html`
- Invite user → `invite.html`
- Magic link / OTP → `magic-link.html`
- Change email address → `email-change.html`
- Reset password → `recovery.html`
- Reauthentication → `reauthentication.html`

All link-based templates use Supabase's `{{ .ConfirmationURL }}` variable. Reauthentication uses `{{ .Token }}`.

The templates use the PromptBeats production logo and include the current legal/support links:
- https://promptbeats.app/terms
- https://promptbeats.app/privacy
- https://promptbeats.app/copyright-ip
- support@promptbeats.app

Hosted Supabase projects store Auth templates in project configuration, not in SQL migrations. These files are the canonical source of truth in Git and must be copied/applied to Authentication → Email Templates (or through the Supabase Management API) when changed.
