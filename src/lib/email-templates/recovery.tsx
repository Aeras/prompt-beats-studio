import * as React from 'react'

import { Button, Text } from '@react-email/components'

import { EmailLayout, button, text } from './brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <EmailLayout preview={`Reset your password for ${siteName}`} heading="Reset your password">
    <Text style={text}>
      We received a request to reset the password for your PromptBeats account. Choose a new
      password with the button below.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Reset password
    </Button>
    <Text style={{ ...text, margin: '24px 0 0', fontSize: '13px' }}>
      If you didn't request this, your password stays unchanged. If you think someone else is
      trying to access your account, let us know right away.
    </Text>
  </EmailLayout>
)

export default RecoveryEmail
