import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { captureLoginPage } from '../arrival/captureLoginPage'
import { useArrival } from '../arrival/useArrival'
import { useAuth } from './useAuth'
import { signInWithPassword, signUpWithPassword } from './authService'
import { AuthField } from './AuthField'
import {
  validateRegistration,
  validateSignIn,
  type AuthMode,
  type CredentialErrors,
} from './authValidation'

type Feedback = {
  type: 'error' | 'success'
  message: string
}

function AccountForm({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const { acceptSession } = useAuth()
  const { begin: beginArrival } = useArrival()
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<CredentialErrors>({})
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isPending, setIsPending] = useState(false)
  const formId = mode === 'sign-in' ? 'sign-in' : 'register'
  const isSignIn = mode === 'sign-in'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)

    const validated = isSignIn
      ? validateSignIn(identifier, password)
      : validateRegistration(username, email, password, confirmation)
    if ('identifier' in validated) {
      setIdentifier(validated.identifier)
    } else {
      setUsername(validated.username)
      setEmail(validated.email)
    }
    setErrors(validated.errors)

    if (Object.keys(validated.errors).length > 0) {
      return
    }

    setIsPending(true)

    try {
      if ('identifier' in validated) {
        const { data, error } = await signInWithPassword(validated.identifier, password)

        if (error || !data.session) {
          setFeedback({
            type: 'error',
            message:
              error?.status === 429
                ? 'Too many sign-in attempts. Wait a moment and try again.'
                : 'Username, email, or password did not match. Check your details and try again.',
          })
          return
        }

        beginArrival({ userId: data.session.user.id, snapshot: captureLoginPage() })
        acceptSession(data.session)
        navigate('/app', { replace: true })
        return
      }

      const { data, error } = await signUpWithPassword(
        validated.username,
        validated.email,
        password,
      )

      if (error) {
        setFeedback({
          type: 'error',
          message:
            "We couldn't create that account. Try a different username or email, or sign in if you already have an account.",
        })
        return
      }

      if (data.session) {
        beginArrival({ userId: data.session.user.id, snapshot: captureLoginPage() })
        acceptSession(data.session)
        navigate('/app', { replace: true })
        return
      }

      setFeedback({
        type: 'success',
        message: 'Account created. Check your email for the next step before signing in.',
      })
    } catch {
      setFeedback({
        type: 'error',
        message: isSignIn
          ? "We couldn't sign you in. Check your connection and try again."
          : "We couldn't create your account. Check your connection and try again.",
      })
    } finally {
      setIsPending(false)
    }
  }

  const clearError = (field: keyof CredentialErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFeedback(null)
  }

  return (
    <section className="auth-route" aria-labelledby={`${formId}-heading`}>
      <div className="auth-route__heading">
        <h2 id={`${formId}-heading`} tabIndex={-1}>
          {isSignIn ? 'Sign in' : 'Create account'}
        </h2>
        <span>{isSignIn ? 'Return' : 'Begin'}</span>
      </div>
      <p className="auth-route__description">
        {isSignIn ? 'Open your player account.' : 'Make a player account for your table.'}
      </p>
      <form noValidate onSubmit={submit} aria-busy={isPending}>
        {isSignIn ? (
          <AuthField
            autoComplete="username"
            autoCapitalize="none"
            disabled={isPending}
            error={errors.identifier}
            id="sign-in-identifier"
            label="Username or email"
            maxLength={254}
            name="identifier"
            onChange={(event) => {
              setIdentifier(event.currentTarget.value)
              clearError('identifier')
            }}
            required
            spellCheck={false}
            type="text"
            value={identifier}
          />
        ) : (
          <>
            <AuthField
              autoComplete="username"
              autoCapitalize="none"
              disabled={isPending}
              error={errors.username}
              hint="Use 3–24 letters, numbers, or underscores."
              id="register-username"
              label="Username"
              name="username"
              onChange={(event) => {
                setUsername(event.currentTarget.value)
                clearError('username')
              }}
              required
              spellCheck={false}
              type="text"
              value={username}
            />
            <AuthField
              autoComplete="email"
              disabled={isPending}
              error={errors.email}
              id="register-email"
              label="Email address (optional)"
              maxLength={254}
              name="email"
              onChange={(event) => {
                setEmail(event.currentTarget.value)
                clearError('email')
              }}
              type="email"
              value={email}
            />
          </>
        )}
        <AuthField
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          disabled={isPending}
          error={errors.password}
          hint={isSignIn ? undefined : 'At least 8 characters.'}
          id={`${formId}-password`}
          label="Password"
          name="password"
          onChange={(event) => {
            setPassword(event.currentTarget.value)
            clearError('password')
            if (!isSignIn) clearError('confirmation')
          }}
          required
          revealLabel="password"
          type="password"
          value={password}
        />
        {!isSignIn && (
          <AuthField
            autoComplete="new-password"
            disabled={isPending}
            error={errors.confirmation}
            id="register-confirmation"
            label="Confirm password"
            name="confirmation"
            onChange={(event) => {
              setConfirmation(event.currentTarget.value)
              clearError('confirmation')
            }}
            required
            revealLabel="password confirmation"
            type="password"
            value={confirmation}
          />
        )}
        {feedback && (
          <p
            className={`auth-feedback auth-feedback--${feedback.type}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        )}
        <button className="auth-button" disabled={isPending} type="submit">
          {isPending
            ? isSignIn
              ? 'Signing in…'
              : 'Creating account…'
            : isSignIn
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
    </section>
  )
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const isSignIn = mode === 'sign-in'
  const { hash } = useLocation()

  useEffect(() => {
    const targetId = hash.slice(1)
    const target = targetId ? document.getElementById(targetId) : null

    if (!(target instanceof HTMLElement)) {
      return
    }

    target.focus({ preventScroll: true })
    if (window.innerWidth <= 680) {
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    }
  }, [hash])

  return (
    <main className="auth-page">
      <div className="auth-page__frame">
        <header className="auth-header">
          <Link className="auth-brand" to="/" aria-label="The Goober's Guide home">
            The Goober&apos;s Guide
          </Link>
          <nav className="auth-navigation" aria-label="Account access">
            <Link to="/login#sign-in-heading" aria-current={isSignIn ? 'page' : undefined}>
              Sign in
            </Link>
            <Link to="/register#register-heading" aria-current={!isSignIn ? 'page' : undefined}>
              Create account
            </Link>
          </nav>
          <p className="auth-header__folio">Player companion · {isSignIn ? 'Return' : 'Begin'}</p>
        </header>

        <section className="auth-intro">
          <h1>Keep your place in the story.</h1>
          <p>A D&amp;D companion in progress. Account access is the first live feature.</p>
        </section>

        <div className="auth-routes" aria-label="Account options" data-mode={mode}>
          <div className="auth-routes__panel">
            <div
              key={mode}
              className={`auth-routes__page${hash ? ' auth-routes__page--transition' : ''}`}
            >
              <AccountForm mode={mode} />
            </div>
          </div>
          <aside className="auth-switch">
            <svg
              key={`${mode}-map`}
              aria-hidden="true"
              className="auth-map"
              preserveAspectRatio="none"
              viewBox="0 0 600 360"
            >
              <path
                className="auth-map__contour"
                d="M-30 114C58 77 102 87 160 111s89 30 149-1 100-45 157-13 95 31 164-8M-26 154c87-33 123-15 180 9s94 23 151-4 101-39 154-6 102 36 169 1M-22 194c76-26 128-4 182 16s92 11 145-11 98-29 152 1 102 39 170 12"
              />
              <path
                className="auth-map__route"
                pathLength="1"
                d="M72 314c54 0 46-24 106-24s69 36 122 20 57-22 110-10 62 28 118 28"
              />
              <circle className="auth-map__waypoint" cx="178" cy="290" r="4" />
              <circle className="auth-map__waypoint" cx="300" cy="310" r="4" />
              <circle className="auth-map__waypoint" cx="410" cy="300" r="4" />
              <text className="auth-map__label" textAnchor="start" x="68" y="345">
                RETURN
              </text>
              <text className="auth-map__label" textAnchor="end" x="532" y="345">
                BEGIN
              </text>
            </svg>
            <span className="auth-map__marker" aria-hidden="true">
              <span />
            </span>
            <div
              key={mode}
              className={`auth-switch__content${hash ? ' auth-switch__content--transition' : ''}`}
            >
              <h2>{isSignIn ? 'New to the Guide?' : 'Already have an account?'}</h2>
              <p>
                {isSignIn ? 'Make a player account for your table.' : 'Open your player account.'}
              </p>
              <Link to={isSignIn ? '/register#register-heading' : '/login#sign-in-heading'}>
                {isSignIn ? 'Create an account' : 'Sign in instead'}
              </Link>
            </div>
          </aside>
        </div>

        <footer className="auth-footer">
          <span>Local account access</span>
          <Link to="/dev/status">Development status</Link>
        </footer>
      </div>
    </main>
  )
}
