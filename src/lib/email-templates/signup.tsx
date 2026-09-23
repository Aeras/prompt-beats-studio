import * as React from "react";

import { Button, Link, Text } from "@react-email/components";

import { EmailLayout, button, link, text } from "./brand";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({ siteName, recipient, confirmationUrl }: SignupEmailProps) => (
  <EmailLayout preview={`Confirm your email for ${siteName}`} heading="Confirm your email">
    <Text style={text}>
      Welcome to PromptBeats — where AI-made music travels with the prompt that created it.
    </Text>
    <Text style={text}>
      Confirm{" "}
      <Link href={`mailto:${recipient}`} style={link}>
        {recipient}
      </Link>{" "}
      to activate your account and start uploading tracks.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Verify email
    </Button>
    <Text style={{ ...text, margin: "24px 0 0", fontSize: "13px" }}>
      If you didn't create an account, you can safely ignore this email.
    </Text>
  </EmailLayout>
);

export default SignupEmail;
