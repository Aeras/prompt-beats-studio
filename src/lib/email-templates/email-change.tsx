import * as React from 'react'

import { Button, Text } from '@react-email/components'

import { EmailLayout, button, text } from './brand'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailLayout
    preview={`Confirm your email change for ${siteName}`}
    heading="Confirm your email change"
  >
    <Text style={text}>
      We received a request to change your PromptBeats account email from{' '}
      <strong style={{ color: '#ffffff' }}>{oldEmail}</strong> to{' '}
      <strong style={{ color: '#ffffff' }}>{newEmail}</strong>.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Confirm change
    </Button>
    <Text style={{ ...text, margin: '24px 0 0', fontSize: '13px' }}>
      If you didn't request this change, contact us immediately so we can secure your account.
    </Text>
  </EmailLayout>
)

export default EmailChangeEmail
