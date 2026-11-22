import { describe, expect, it } from 'vitest'
import { validateDisplayName, validateRegistration, validateSignIn } from './authValidation'

describe('sign-in validation', () => {
  it('trims email and normalizes username casing', () => {
    expect(validateSignIn(' player@example.com ', 'password')).toEqual({
      identifier: 'player@example.com',
      errors: {},
    })
    expect(validateSignIn(' Player_1 ', 'password')).toEqual({
      identifier: 'player_1',
      errors: {},
    })
  })

  it('requires an identifier and password', () => {
    expect(validateSignIn('', '').errors).toEqual({
      identifier: 'Enter your username or email address.',
      password: 'Enter your password.',
    })
  })

  it.each(['player@', 'player@accounts.goobersguide.invalid'])(
    'rejects invalid or reserved addresses (%s)',
    (identifier) => {
      expect(validateSignIn(identifier, 'password').errors.identifier).toBeTruthy()
    },
  )
})

describe('registration validation', () => {
  it('allows a blank email and normalizes the username', () => {
    expect(validateRegistration(' Player_1 ', ' ', 'adventure1', 'adventure1')).toEqual({
      username: 'player_1',
      email: '',
      errors: {},
    })
  })

  it.each(['ab', 'player-name', 'ñame', 'x'.repeat(25)])('rejects username %s', (username) => {
    expect(
      validateRegistration(username, '', 'adventure1', 'adventure1').errors.username,
    ).toBeTruthy()
  })

  it('checks supplied email, minimum password length, and confirmation', () => {
    expect(validateRegistration('player', 'player@', 'short', 'different').errors).toEqual({
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
      confirmation: 'Passwords do not match.',
    })
    expect(
      validateRegistration('player', 'p@accounts.goobersguide.invalid', 'adventure1', '').errors,
    ).toEqual({ email: 'Enter a valid email address.', confirmation: 'Confirm your password.' })
  })
})

describe('validateDisplayName', () => {
  it('trims, keeps unicode, and treats blank as clearing the name', () => {
    expect(validateDisplayName('  Aria the Bold  ')).toEqual({
      value: 'Aria the Bold',
      error: null,
    })
    expect(validateDisplayName('Zoë — 日本語')).toEqual({ value: 'Zoë — 日本語', error: null })
    expect(validateDisplayName('   ')).toEqual({ value: null, error: null })
    expect(validateDisplayName('')).toEqual({ value: null, error: null })
  })

  it('allows exactly 40 characters and rejects 41, counting characters not code units', () => {
    expect(validateDisplayName('x'.repeat(40)).error).toBeNull()
    expect(validateDisplayName('x'.repeat(41)).error).toBe('Use 40 characters or fewer.')
    expect(validateDisplayName('😀'.repeat(40)).error).toBeNull()
  })

  it('rejects control characters', () => {
    expect(validateDisplayName('line\nbreak').error).toBe(
      "A display name can't contain control characters.",
    )
    expect(validateDisplayName('tab\there').error).not.toBeNull()
  })
})
