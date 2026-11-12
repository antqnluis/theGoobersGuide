export function AuthStatus({
  error,
  isLoading,
  onRetry,
}: {
  error: string | null
  isLoading: boolean
  onRetry?: () => void
}) {
  return (
    <main className="auth-status-page" aria-live="polite">
      <section className="auth-status-page__content">
        <h1>{isLoading ? 'Checking your session' : 'Session unavailable'}</h1>
        <p role={error && !isLoading ? 'alert' : undefined}>
          {isLoading
            ? 'The account service is restoring your player session.'
            : (error ?? 'We could not confirm your account session.')}
        </p>
        {error && onRetry && (
          <button className="auth-button auth-button--secondary" onClick={onRetry} type="button">
            Try again
          </button>
        )}
      </section>
    </main>
  )
}
