import { useState, type ComponentProps } from 'react'

type AuthFieldProps = ComponentProps<'input'> & {
  id: string
  label: string
  error?: string
  hint?: string
  revealLabel?: string
}

export function AuthField({ id, label, error, hint, revealLabel, ...input }: AuthFieldProps) {
  const [isVisible, setIsVisible] = useState(false)
  const action = isVisible ? 'Hide' : 'Show'

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={revealLabel ? 'auth-field__with-toggle' : undefined}>
        <input
          {...input}
          id={id}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          aria-invalid={Boolean(error)}
          type={isVisible ? 'text' : input.type}
        />
        {revealLabel && (
          <button
            aria-controls={id}
            aria-label={`${action} ${revealLabel}`}
            className="auth-field__toggle"
            disabled={input.disabled}
            onClick={() => setIsVisible((visible) => !visible)}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
              width="20"
            >
              {isVisible ? (
                <path d="M3 3l18 18M10 5.2a10 10 0 0 1 2-.2c5 0 8.5 4 10 7a15 15 0 0 1-2.5 3.4M6.4 6.4A16 16 0 0 0 2 12c1.5 3 5 7 10 7a10 10 0 0 0 5.6-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              ) : (
                <>
                  <path d="M2 12c1.5-3 5-7 10-7s8.5 4 10 7c-1.5 3-5 7-10 7S3.5 15 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
      {(error || hint) && (
        <p className={error ? 'auth-field__error' : 'auth-field__hint'} id={`${id}-help`}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
