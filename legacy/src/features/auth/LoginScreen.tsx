import { useState, type FormEvent } from 'react';
import { authenticateDemoUser, type DemoUser } from './demoAuth';

export default function LoginScreen({
  onSignIn,
  storageError,
}: {
  onSignIn: (user: DemoUser) => void;
  storageError?: string | null;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = authenticateDemoUser(username, password);
    if (!user) {
      setError('That demo username or password is not recognized.');
      return;
    }
    setError(null);
    onSignIn(user);
  }

  return (
    <main className="login-page">
      <section className="login-sheet" aria-labelledby="login-title">
        <a
          className="login-brand"
          href="#/login"
          aria-label="The Goober's Guide"
        >
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>The Goober&apos;s Guide</span>
        </a>
        <div className="login-rule" />
        <h1 id="login-title">Return to the table</h1>
        <p className="login-intro">
          Sign in to open your campaigns and character sheets.
        </p>
        <form className="login-form" onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              autoFocus
              name="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {(error || storageError) && (
            <p className="form-error" role="alert">
              {storageError ?? error}
            </p>
          )}
          <button className="button button-primary login-submit" type="submit">
            Sign in
          </button>
        </form>
        <aside className="demo-credentials" aria-label="Demo sign-in details">
          <strong>Demo accounts</strong>
          <p>Player One: player-one / demo</p>
          <p>Player Two: player-two / demo</p>
        </aside>
        <p className="login-notice">
          This local prototype keeps data in this browser. Demo sign-in does not
          secure or encrypt it.
        </p>
      </section>
    </main>
  );
}
