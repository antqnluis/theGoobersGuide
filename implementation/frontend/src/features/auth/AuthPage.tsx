import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import './auth.css'
import { Link, useLocation, useNavigate } from 'react-router'
import { captureLoginPage } from '../arrival/captureLoginPage'
import { useArrival } from '../arrival/useArrival'
import { useAuth } from './useAuth'
import { signInWithPassword, signUpWithPassword } from './authService'
import { AuthField } from './AuthField'
import { AuthSky } from './AuthSky'
import { AuthSkySignal } from './authSkySignal'
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

function FeedbackMark({ type }: { type: Feedback['type'] }) {
  return (
    <svg
      aria-hidden="true"
      className="auth-feedback__mark"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      {type === 'error' ? (
        <path d="M12 3 2.5 20h19L12 3ZM12 10v4.5M12 17.2v.1" />
      ) : (
        <path d="M4 12.5 9.5 18 20 6.5" />
      )}
    </svg>
  )
}

function AccountForm({ mode, signal }: { mode: AuthMode; signal: AuthSkySignal }) {
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
  const route = useRef<HTMLElement>(null)
  const formId = mode === 'sign-in' ? 'sign-in' : 'register'
  const isSignIn = mode === 'sign-in'

  // The sky hurries its traveller while a request is in flight.
  useEffect(() => {
    signal.setPending(isPending)
    return () => signal.setPending(false)
  }, [isPending, signal])

  // A refusal is answered three ways: the words, the hearth dimming, and a small shake of
  // the plate. The first field to retype takes focus, so trying again is one keystroke away.
  const refuse = (message: string, retype?: { id: string; clear: () => void }) => {
    setFeedback({ type: 'error', message })
    signal.hush()
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      route.current?.animate?.(
        [
          { translate: '0 0' },
          { translate: '-7px 0' },
          { translate: '6px 0' },
          { translate: '-4px 0' },
          { translate: '2px 0' },
          { translate: '0 0' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
    if (retype) {
      retype.clear()
      requestAnimationFrame(() => {
        const field = document.getElementById(retype.id)
        if (field instanceof HTMLInputElement) {
          field.focus()
          field.select()
        }
      })
    }
  }

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
          refuse(
            error?.status === 429
              ? 'Too many sign-in attempts. Wait a moment and try again.'
              : 'Username, email, or password did not match. Check your details and try again.',
            error?.status === 429
              ? undefined
              : { id: 'sign-in-password', clear: () => setPassword('') },
          )
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
        refuse(
          "We couldn't create that account. Try a different username or email, or sign in if you already have an account.",
          { id: 'register-username', clear: () => {} },
        )
        return
      }

      if (data.session) {
        beginArrival({ userId: data.session.user.id, snapshot: captureLoginPage() })
        acceptSession(data.session)
        navigate('/app', { replace: true })
        return
      }

      // No session yet: the hearth takes to its new keeper while they go and check their mail.
      signal.kindle()
      setFeedback({
        type: 'success',
        message: 'Account created. Check your email for the next step before signing in.',
      })
    } catch {
      refuse(
        isSignIn
          ? "We couldn't sign you in. Check your connection and try again."
          : "We couldn't create your account. Check your connection and try again.",
      )
    } finally {
      setIsPending(false)
    }
  }

  const clearError = (field: keyof CredentialErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFeedback(null)
  }

  return (
    <section className="auth-route" ref={route} aria-labelledby={`${formId}-heading`}>
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
            <FeedbackMark type={feedback.type} />
            <span>{feedback.message}</span>
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
  const [signal] = useState(() => new AuthSkySignal())
  const [skyReady, setSkyReady] = useState(false)
  const handleSkyAvailability = useCallback((ready: boolean) => setSkyReady(ready), [])

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
    <main className="auth-page" data-sky={skyReady ? 'ready' : 'painted'}>
      <AuthSky onAvailabilityChange={handleSkyAvailability} signal={signal} paused={false} />
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
              <AccountForm mode={mode} signal={signal} />
            </div>
          </div>
          <aside className="auth-switch">
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
          <Link to="/dev/status">Development status</Link>
        </footer>
      </div>
    </main>
  )
}
