import * as React from "react";

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

export const SUPPORT_EMAIL = "info@promptbeats.app";
export const SITE_URL = "https://promptbeats.app";

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  margin: "0",
  padding: "24px 0",
};

const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px 28px",
  backgroundColor: "#0a0a0c",
  borderRadius: "20px",
};

const badge = {
  display: "inline-block",
  padding: "7px 14px",
  borderRadius: "999px",
  backgroundColor: "#a855f7",
  color: "#0a0a0c",
  fontSize: "11px",
  fontWeight: "bold" as const,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  margin: "0 0 20px",
};

export const h1 = {
  fontSize: "24px",
  fontWeight: "bold" as const,
  color: "#ffffff",
  margin: "0 0 16px",
};

export const text = {
  fontSize: "15px",
  color: "#a5a5b8",
  lineHeight: "1.65",
  margin: "0 0 22px",
};

export const link = { color: "#c084fc", textDecoration: "underline" };

export const button = {
  backgroundColor: "#a855f7",
  color: "#0a0a0c",
  fontSize: "15px",
  fontWeight: "bold" as const,
  borderRadius: "12px",
  padding: "14px 28px",
  textDecoration: "none",
  display: "inline-block",
};

export const code = {
  display: "inline-block",
  padding: "14px 22px",
  borderRadius: "12px",
  backgroundColor: "#16161c",
  color: "#ffffff",
  fontSize: "26px",
  letterSpacing: "0.25em",
  fontWeight: "bold" as const,
};

const hr = { borderColor: "#26262f", margin: "28px 0 18px" };

const footer = { fontSize: "12px", color: "#6b6b80", lineHeight: "1.6", margin: "0" };

export function EmailLayout({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={badge}>PromptBeats</Text>
          <Heading style={h1}>{heading}</Heading>
          {children}
          <Hr style={hr} />
          <Text style={footer}>
            Need help or want to report an account issue? Contact us at{" "}
            <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>
              {SUPPORT_EMAIL}
            </Link>
            .
            <br />
            This message was sent by PromptBeats ·{" "}
            <Link href={SITE_URL} style={link}>
              promptbeats.app
            </Link>
            <br />
            Please do not reply to this address — replies are not monitored.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
