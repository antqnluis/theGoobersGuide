import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from './useAuth'
import { signOutFromAuth } from './authService'
import { isInternalEmail } from './authValidation'

export function AuthAppShell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
      queryClient.clear()
      navigate('/login', { replace: true })
    } catch {
      setError("We couldn't sign you out. Check your connection and try again.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="workspace-page">
      <div className="workspace-page__frame">
        <a className="workspace-skip-link" href="#campaign-content">
          Skip to campaign content
        </a>
        <header className="workspace-header">
          <div className="workspace-header__primary">
            <Link className="auth-brand" to="/app/campaigns">
              The Goober&apos;s Guide
            </Link>
            <nav aria-label="Campaign navigation" className="workspace-navigation">
              <NavLink to="/app/campaigns">Campaigns</NavLink>
            </nav>
          </div>
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

        {error && (
          <p className="auth-feedback auth-feedback--error workspace-signout-error" role="alert">
            {error}
          </p>
        )}
        <main className="campaign-app-main" id="campaign-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="auth-footer">
          <span>Account session active</span>
          <Link to="/dev/status">Development status</Link>
        </footer>
      </div>
    </div>
  )
}
