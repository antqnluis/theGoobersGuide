import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  getAuthSession,
  signInWithPassword,
  signOutFromAuth,
  signUpWithPassword,
  subscribeToAuthState,
} from './features/auth/authService'

vi.mock('./features/auth/authService', () => ({
  getAuthSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOutFromAuth: vi.fn(),
  signUpWithPassword: vi.fn(),
  subscribeToAuthState: vi.fn(),
}))

const session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'player-1', email: 'player@example.com' },
} as Session

const noSessionResult = { data: { session: null }, error: null } as Awaited<
  ReturnType<typeof getAuthSession>
>

const authStateListeners: Array<(session: Session | null) => void> = []

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  authStateListeners.length = 0
  window.history.replaceState({}, '', '/')
  vi.mocked(getAuthSession).mockResolvedValue(noSessionResult)
  vi.mocked(subscribeToAuthState).mockImplementation((onSessionChange) => {
    authStateListeners.push(onSessionChange)
    return () => undefined
  })
})

describe('auth routes and forms', () => {
  it('shows one account form at a time and switches between them', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Keep your place in the story.' }),
    ).toBeVisible()
    expect(screen.getByRole('region', { name: 'Sign in' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Create account' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    await user.click(screen.getByRole('link', { name: 'Create an account' }))
    expect(screen.getByRole('region', { name: 'Create account' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/register')
    await user.click(screen.getByRole('link', { name: 'Sign in instead' }))
    expect(screen.getByRole('region', { name: 'Sign in' })).toBeVisible()
  })

  it('restores an existing session and redirects the root to the protected shell', async () => {
    vi.mocked(getAuthSession).mockResolvedValue({ data: { session }, error: null } as Awaited<
      ReturnType<typeof getAuthSession>
    >)

    render(<App />)

    expect(await screen.findByRole('heading', { name: "You're signed in." })).toBeVisible()
    expect(screen.getByText('player@example.com')).toBeVisible()
    expect(window.location.pathname).toBe('/app')
  })

  it('blocks direct access to the app when there is no session', async () => {
    window.history.replaceState({}, '', '/app')

    render(<App />)

    expect(await screen.findByRole('region', { name: 'Sign in' })).toBeVisible()
    expect(window.location.pathname).toBe('/login')
  })

  it('validates email and registration password before calling Supabase', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('region', { name: 'Sign in' })
    await user.click(screen.getByRole('link', { name: 'Create an account' }))
    const registration = screen.getByRole('region', { name: 'Create account' })
    await user.type(within(registration).getByLabelText('Email address (optional)'), 'not-an-email')
    await user.type(within(registration).getByLabelText('Password'), 'short')
    await user.click(within(registration).getByRole('button', { name: 'Create account' }))

    expect(within(registration).getByText('Enter a valid email address.')).toBeVisible()
    expect(within(registration).getByText('Use at least 8 characters.')).toBeVisible()
    expect(within(registration).getByText('Enter a username.')).toBeVisible()
    expect(within(registration).getByText('Confirm your password.')).toBeVisible()
    expect(signUpWithPassword).not.toHaveBeenCalled()
  })

  it('shows safe sign-in errors and does not expose service details', async () => {
    const user = userEvent.setup()
    vi.mocked(signInWithPassword).mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('database host and internal details'),
    } as never)
    render(<App />)

    const signIn = await screen.findByRole('region', { name: 'Sign in' })
    await user.type(within(signIn).getByLabelText('Username or email'), 'player@example.com')
    await user.type(within(signIn).getByLabelText('Password'), 'correct-horse')
    await user.click(within(signIn).getByRole('button', { name: 'Sign in' }))

    expect(await within(signIn).findByRole('alert')).toHaveTextContent(
      'Username, email, or password did not match. Check your details and try again.',
    )
    expect(within(signIn).queryByText(/database host/i)).not.toBeInTheDocument()
  })

  it('routes a successful registration into the authenticated shell', async () => {
    const user = userEvent.setup()
    vi.mocked(signUpWithPassword).mockImplementation(async () => {
      authStateListeners.forEach((listener) => listener(session))
      return { data: { session, user: session.user }, error: null } as never
    })
    render(<App />)

    await screen.findByRole('region', { name: 'Sign in' })
    await user.click(screen.getByRole('link', { name: 'Create an account' }))
    const registration = screen.getByRole('region', { name: 'Create account' })
    const form = within(registration)
    await user.type(form.getByLabelText('Username'), 'Player_One')
    await user.type(form.getByLabelText('Password'), 'adventure1')
    await user.type(form.getByLabelText('Confirm password'), 'adventure1')
    await user.click(within(registration).getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: "You're signed in." })).toBeVisible()
    expect(window.location.pathname).toBe('/app')
  })

  it('signs out and returns to the public account page', async () => {
    const user = userEvent.setup()
    vi.mocked(getAuthSession).mockResolvedValue({ data: { session }, error: null } as Awaited<
      ReturnType<typeof getAuthSession>
    >)
    vi.mocked(signOutFromAuth).mockImplementation(async () => {
      authStateListeners.forEach((listener) => listener(null))
      return { error: null } as never
    })
    window.history.replaceState({}, '', '/app')
    render(<App />)

    await screen.findByRole('heading', { name: "You're signed in." })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('region', { name: 'Sign in' })).toBeVisible()
    expect(window.location.pathname).toBe('/login')
  })

  it('shows a retry state if session restoration fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getAuthSession)
      .mockRejectedValueOnce(new Error('private service detail'))
      .mockResolvedValueOnce(noSessionResult)
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't check your session. Try again.",
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('region', { name: 'Sign in' })).toBeVisible()
  })

  it('keeps the development diagnostics route available', async () => {
    window.history.replaceState({}, '', '/dev/status')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Application status' })).toBeVisible()
  })

  it('holds the loading route until session initialization resolves', async () => {
    let resolveSession: (value: Awaited<ReturnType<typeof getAuthSession>>) => void = () =>
      undefined
    vi.mocked(getAuthSession).mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve
      }),
    )
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Checking your session' })).toBeVisible()
    await act(async () => {
      resolveSession(noSessionResult)
    })

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })
})
