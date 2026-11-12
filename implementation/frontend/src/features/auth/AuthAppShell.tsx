import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from './useAuth'
import { signOutFromAuth } from './authService'
import { isInternalEmail } from './authValidation'

export function AuthAppShell() {
  const navigate = useNavigate()
  const { acceptSession, session } = useAuth()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const username = session?.user.user_metadata?.username
  const email = session?.user.email
  const accountName =
    typeof username === 'string' && username
      ? username
      : email && !isInternalEmail(email)
        ? email
        : 'Signed-in player'

  const signOut = async () => {
    setIsPending(true)
    setError(null)

    try {
      const { error: signOutError } = await signOutFromAuth()

      if (signOutError) {
        setError("We couldn't sign you out. Try again.")
        return
      }

      acceptSession(null)
      navigate('/login', { replace: true })
    } catch {
      setError("We couldn't sign you out. Check your connection and try again.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="workspace-page">
      <div className="workspace-page__frame">
        <header className="workspace-header">
          <Link className="auth-brand" to="/app">
            The Goober&apos;s Guide
          </Link>
          <div className="workspace-account">
            <span>{accountName}</span>
            <button
              className="auth-button auth-button--secondary"
              disabled={isPending}
              onClick={signOut}
              type="button"
            >
              {isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>

        <section className="workspace-welcome">
          <h1>You&apos;re signed in.</h1>
          <p>Your account is ready. The player workspace will grow in later milestones.</p>
          {error && (
            <p className="auth-feedback auth-feedback--error" role="alert">
              {error}
            </p>
          )}
        </section>
        <footer className="auth-footer">
          <span>Account session active</span>
          <Link to="/dev/status">Development status</Link>
        </footer>
      </div>
    </main>
  )
}
