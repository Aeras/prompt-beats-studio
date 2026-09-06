import * as React from 'react'

import { Button, Text } from '@react-email/components'

import { EmailLayout, button, text } from './brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <EmailLayout preview={`Your login link for ${siteName}`} heading="Your login link">
    <Text style={text}>
      Tap the button below to sign in to PromptBeats. This link expires shortly and can only be
      used once.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Sign in
    </Button>
    <Text style={{ ...text, margin: '24px 0 0', fontSize: '13px' }}>
      If you didn't request this link, you can safely ignore this email.
    </Text>
  </EmailLayout>
)

export default MagicLinkEmail
