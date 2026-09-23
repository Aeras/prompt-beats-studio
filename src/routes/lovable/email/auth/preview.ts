import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lovable/email/auth/preview")({
  server: {
    handlers: {
      POST: () =>
        Response.json(
          {
            error:
              "Lovable Email has been retired. PromptBeats email is delivered through the Polar55 SMTP configuration.",
          },
          { status: 410 },
        ),
    },
  },
});
