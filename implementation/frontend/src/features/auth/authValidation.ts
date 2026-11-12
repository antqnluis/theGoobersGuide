export type AuthMode = 'sign-in' | 'register'

export type CredentialErrors = Partial<
  Record<'identifier' | 'username' | 'email' | 'password' | 'confirmation', string>
>

export const internalEmailDomain = 'accounts.goobersguide.invalid'
const usernamePattern = /^[A-Za-z0-9_]{3,24}$/
const usernameHint = 'Use 3–24 letters, numbers, or underscores.'

export function isInternalEmail(email: string) {
  return email.toLowerCase().endsWith(`@${internalEmailDomain}`)
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isInternalEmail(email)
}

export function validateSignIn(identifierInput: string, password: string) {
  const trimmed = identifierInput.trim()
  const isEmail = trimmed.includes('@')
  const identifier = isEmail ? trimmed : trimmed.toLowerCase()
  const errors: CredentialErrors = {}

  if (!identifier) {
    errors.identifier = 'Enter your username or email address.'
  } else if (isEmail ? !isValidEmail(identifier) : !usernamePattern.test(trimmed)) {
    errors.identifier = isEmail ? 'Enter a valid email address.' : usernameHint
  }
  if (!password) errors.password = 'Enter your password.'

  return { identifier, errors }
}

export function validateRegistration(
  usernameInput: string,
  emailInput: string,
  password: string,
  confirmation: string,
) {
  const username = usernameInput.trim().toLowerCase()
  const email = emailInput.trim()
  const errors: CredentialErrors = {}

  if (!username) errors.username = 'Enter a username.'
  else if (!usernamePattern.test(usernameInput.trim())) errors.username = usernameHint
  if (email && !isValidEmail(email)) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  else if (password.length < 8) errors.password = 'Use at least 8 characters.'
  if (!confirmation) errors.confirmation = 'Confirm your password.'
  else if (confirmation !== password) errors.confirmation = 'Passwords do not match.'

  return { username, email, errors }
}
