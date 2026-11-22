import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AuthField } from './AuthField'
import { displayNameMaxLength, validateDisplayName } from './authValidation'
import { getOwnDisplayName, updateOwnDisplayName } from './profileService'

/**
 * The account name in the header. It shows the player's display name (or the
 * given fallback) and opens a small form to set the display name other players
 * see in a campaign's Party. Leaving it blank falls back to the username.
 */
export function AccountDisplayName({
  userId,
  fallbackName,
  title,
}: {
  userId: string
  fallbackName: string
  title?: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [notice, setNotice] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getOwnDisplayName(userId),
    enabled: Boolean(userId),
  })
  const save = useMutation({
    mutationFn: (displayName: string | null) => updateOwnDisplayName(userId, displayName),
  })
  const displayName = profile.data ?? null

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const root = rootRef.current
    const onPointerDown = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle() {
    if (save.isPending) return
    if (open) {
      setOpen(false)
      return
    }
    setValue(displayName ?? '')
    setFieldError('')
    setNotice('')
    save.reset()
    setOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (save.isPending) return
    const result = validateDisplayName(value)
    if (result.error) {
      setFieldError(result.error)
      inputRef.current?.focus()
      return
    }
    setFieldError('')
    try {
      await save.mutateAsync(result.value)
    } catch {
      return
    }
    queryClient.setQueryData(['profile', userId], result.value)
    void queryClient.invalidateQueries({ queryKey: ['campaigns', 'roster'] })
    setNotice(result.value ? 'Display name saved.' : 'Display name cleared.')
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="account-name" ref={rootRef}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className="account-name__button"
        onClick={toggle}
        ref={buttonRef}
        title={title}
        type="button"
      >
        <span>{displayName || fallbackName}</span>
        <span className="visually-hidden"> (edit display name)</span>
      </button>
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      {open && (
        <form
          aria-labelledby={`${panelId}-title`}
          className="account-name__panel"
          id={panelId}
          onSubmit={submit}
        >
          <p className="account-name__title" id={`${panelId}-title`}>
            Your display name
          </p>
          <AuthField
            autoComplete="nickname"
            error={fieldError}
            hint={`Shown to other players in your campaigns. Leave blank to use ${fallbackName}.`}
            id={`${panelId}-input`}
            label="Display name"
            maxLength={displayNameMaxLength * 2}
            onChange={(event) => {
              setValue(event.target.value)
              setFieldError('')
              if (save.isError) save.reset()
            }}
            readOnly={save.isPending}
            ref={inputRef}
            spellCheck={false}
            value={value}
          />
          {save.isError && (
            <p className="auth-feedback auth-feedback--error" role="alert">
              We couldn&apos;t save your display name. Check your connection and try again.
            </p>
          )}
          <div className="account-name__actions">
            <button className="auth-button" disabled={save.isPending} type="submit">
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              className="auth-button auth-button--secondary"
              disabled={save.isPending}
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
