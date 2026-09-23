import * as React from "react";

import { Button, Text } from "@react-email/components";

import { EmailLayout, button, text } from "./brand";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <EmailLayout preview={`You've been invited to join ${siteName}`} heading="You've been invited">
    <Text style={text}>
      You've been invited to join PromptBeats. Accept the invitation to create your account, upload
      tracks, and share the prompts behind them.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Accept invitation
    </Button>
    <Text style={{ ...text, margin: "24px 0 0", fontSize: "13px" }}>
      If you weren't expecting this invitation, you can safely ignore this email.
    </Text>
  </EmailLayout>
);

export default InviteEmail;
