import * as React from 'react'

import { Text } from '@react-email/components'

import { EmailLayout, code, text } from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <EmailLayout preview="Your PromptBeats verification code" heading="Confirm it's you">
    <Text style={text}>Use the code below to confirm your identity:</Text>
    <Text style={code}>{token}</Text>
    <Text style={{ ...text, margin: '24px 0 0', fontSize: '13px' }}>
      This code expires shortly. If you didn't request it, someone may be trying to access your
      account — contact us right away.
    </Text>
  </EmailLayout>
)

export default ReauthenticationEmail
