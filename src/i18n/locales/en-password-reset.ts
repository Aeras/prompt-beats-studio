export const enPasswordReset = {
  "auth.forgotPassword": "Forgot password?",
  "auth.resetTitle": "Reset your password",
  "auth.resetSubtitle": "Enter your email and we’ll send you a secure reset link.",
  "auth.sendResetLink": "Send reset link",
  "auth.resetEmailSent": "If an account exists for this email, you will receive a password reset link.",
  "auth.resetSendFailed": "We couldn’t send the reset email right now. Please try again.",
  "auth.choosePasswordTitle": "Choose a new password",
  "auth.choosePasswordSubtitle": "Enter a new password for your PromptBeats account.",
  "auth.newPassword": "New password",
  "auth.confirmPassword": "Confirm new password",
  "auth.passwordsDoNotMatch": "The passwords do not match.",
  "auth.passwordTooShort": "Password must be at least 6 characters.",
  "auth.updatePassword": "Update password",
  "auth.passwordUpdated": "Your password has been updated. You can now sign in with your new password.",
  "auth.passwordUpdateFailed": "We couldn’t update your password. Please request a new reset link and try again.",
  "auth.resetLinkInvalid": "This reset link is invalid or has expired. Please request a new one.",
  "auth.backToSignIn": "Back to sign in",
} as const;

export type PasswordResetTranslationKey = keyof typeof enPasswordReset;
