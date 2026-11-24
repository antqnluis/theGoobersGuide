import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Npc, NpcCreateValues, NpcVisibility } from './npcTypes'
import type { NpcResult } from './useNpcActions'
import {
  bodyCharactersLeft,
  normalizeNpcInput,
  npcLimits,
  validateNpcInput,
  type NpcErrors,
} from './npcValidation'

type Fields = {
  name: string
  role: string
  location: string
  body: string
  visibility: NpcVisibility
}

function toFields(npc: Npc | null): Fields {
  return {
    name: npc?.name ?? '',
    role: npc?.role ?? '',
    location: npc?.location ?? '',
    body: npc?.body ?? '',
    visibility: npc?.visibility ?? 'private',
  }
}

/**
 * Writes a new NPC or edits an existing one. Validates on submit and keeps the writer's text
 * whatever happens: a stale save offers the latest version, and an NPC that has gone keeps its
 * text on screen so it can be copied out.
 */
export function NpcEditor({
  error,
  isPending,
  mode,
  npc,
  onCancel,
  onDirtyChange,
  onDismissError,
  onSubmit,
}: {
  /** The last failure's copy; the editor shows it unless it is showing a banner of its own. */
  error: string | null
  isPending: boolean
  mode: 'new' | 'edit'
  /** The NPC being edited; null for a new one. */
  npc: Npc | null
  /** `gone` when the NPC no longer exists, so there is nothing to go back to. */
  onCancel: (reason: 'cancel' | 'gone') => void
  onDirtyChange?: (dirty: boolean) => void
  onDismissError?: () => void
  /** Saves against `base` (the version the text is based on; null for a new NPC). */
  onSubmit: (values: NpcCreateValues, base: Npc | null) => Promise<NpcResult>
}) {
  const base = useId()
  // The version the text is based on. A conflict moves it to the latest version.
  const [basis, setBasis] = useState<Npc | null>(npc)
  const [values, setValues] = useState<Fields>(() => toFields(npc))
  const [errors, setErrors] = useState<NpcErrors>({})
  const [conflicted, setConflicted] = useState(false)
  const [gone, setGone] = useState(false)
  const [discardAsked, setDiscardAsked] = useState(false)
  const submittingRef = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const saved = toFields(basis)
  const dirty = (Object.keys(values) as (keyof Fields)[]).some(
    (field) => values[field] !== saved[field],
  )
  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])
  useEffect(() => () => reportRef.current?.(false), [])

  // The editor is opened on purpose, so keyboard focus goes straight to the name.
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const id = (field: string) => `${base}-${field}`
  const change = <K extends keyof Fields>(field: K, value: Fields[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (field !== 'visibility') setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (submittingRef.current || gone) return
    const found = validateNpcInput(values)
    setErrors(found)
    const first = (['name', 'role', 'location', 'body'] as const).find((field) => found[field])
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    submittingRef.current = true
    setConflicted(false)
    try {
      const result = await onSubmit(normalizeNpcInput(values), basis)
      if (result.ok) return
      if (result.reason === 'conflict') {
        setBasis(result.latest)
        setConflicted(true)
      } else if (result.reason === 'unavailable') {
        setGone(true)
      }
    } finally {
      submittingRef.current = false
    }
  }

  function loadLatest() {
    setValues(toFields(basis))
    setErrors({})
    setConflicted(false)
    setDiscardAsked(false)
    onDismissError?.()
    nameRef.current?.focus()
  }

  const describe = (field: keyof NpcErrors) => (errors[field] ? `${id(field)}-error` : undefined)
  const fieldError = (field: keyof NpcErrors) =>
    errors[field] && (
      <p className="journal-error" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )

  const left = bodyCharactersLeft(values.body)
  const locked = isPending || gone

  const shortField = (field: 'name' | 'role' | 'location', label: string, optional = true) => (
    <div className="journal-field">
      <label htmlFor={id(field)}>
        {label} {optional && <span>(optional)</span>}
      </label>
      <input
        aria-describedby={describe(field)}
        aria-invalid={errors[field] ? 'true' : undefined}
        autoComplete="off"
        className="journal-input"
        disabled={isPending}
        id={id(field)}
        maxLength={npcLimits[field] * 2}
        onChange={(event) => change(field, event.target.value)}
        ref={field === 'name' ? nameRef : undefined}
        required={!optional}
        value={values[field]}
      />
      {fieldError(field)}
    </div>
  )

  return (
    <form
      aria-label={mode === 'new' ? 'New NPC' : `Edit ${basis?.name ?? 'NPC'}`}
      className="note-form"
      noValidate
      onSubmit={submit}
    >
      {shortField('name', 'Name', false)}
      {shortField('role', 'Who they are')}
      {shortField('location', 'Where you met them')}

      <div className="journal-field">
        <label htmlFor={id('body')}>
          What you know <span>(optional)</span>
        </label>
        <textarea
          aria-describedby={
            [describe('body'), left !== null ? id('count') : undefined].filter(Boolean).join(' ') ||
            undefined
          }
          aria-invalid={errors.body ? 'true' : undefined}
          className="journal-input note-form__body"
          disabled={isPending}
          id={id('body')}
          onChange={(event) => change('body', event.target.value)}
          rows={10}
          value={values.body}
        />
        {left !== null && (
          <p className="note-form__count" data-over={left < 0 || undefined} id={id('count')}>
            {left >= 0
              ? `${left.toLocaleString('en-US')} characters left`
              : `${(-left).toLocaleString('en-US')} characters over the ${npcLimits.body.toLocaleString('en-US')} limit`}
          </p>
        )}
        {fieldError('body')}
      </div>

      {mode === 'new' && (
        <fieldset className="note-form__visibility" disabled={isPending}>
          <legend className="journal-label">Who can see this NPC</legend>
          <div className="journal-check">
            <input
              checked={values.visibility === 'private'}
              id={id('private')}
              name={id('visibility')}
              onChange={() => change('visibility', 'private')}
              type="radio"
            />
            <label htmlFor={id('private')}>Only you</label>
          </div>
          <div className="journal-check">
            <input
              checked={values.visibility === 'campaign'}
              id={id('campaign')}
              name={id('visibility')}
              onChange={() => change('visibility', 'campaign')}
              type="radio"
            />
            <label htmlFor={id('campaign')}>Shared with the campaign</label>
          </div>
        </fieldset>
      )}

      {mode === 'new' && (
        <p className="npc-form__hint">You can add a picture once the NPC is created.</p>
      )}

      {conflicted && (
        <div className="note-form__conflict journal-alert" role="alert">
          <p>This NPC changed while you were editing. Your text is still here.</p>
          {discardAsked ? (
            <div
              aria-label="Confirm loading the latest version"
              className="journal-confirm"
              role="group"
            >
              <p>Discard your changes and load the latest version?</p>
              <div className="journal-actions">
                <button
                  autoFocus
                  className="journal-button journal-button--solid-danger"
                  onClick={loadLatest}
                  type="button"
                >
                  Yes, load latest
                </button>
                <button
                  className="journal-button journal-button--ghost"
                  onClick={() => setDiscardAsked(false)}
                  type="button"
                >
                  Keep my text
                </button>
              </div>
            </div>
          ) : (
            <div className="journal-actions">
              <button
                className="journal-button journal-button--secondary"
                disabled={isPending}
                onClick={() => setDiscardAsked(true)}
                type="button"
              >
                Load latest
              </button>
              <button
                className="journal-button"
                disabled={isPending}
                onClick={() => void submit()}
                type="button"
              >
                Save mine anyway
              </button>
            </div>
          )}
        </div>
      )}

      {gone && (
        <p className="journal-alert" role="alert">
          {mode === 'new'
            ? 'You can no longer add NPCs to this campaign.'
            : 'This NPC is no longer available. It may have been made private or deleted. Your text is still here, so you can copy it.'}
        </p>
      )}

      {error && !conflicted && !gone && (
        <p className="journal-alert" role="alert">
          {error}
        </p>
      )}

      <div className="journal-actions note-form__actions">
        {!conflicted && (
          <button
            aria-busy={isPending || undefined}
            className="journal-button"
            disabled={locked}
            type="submit"
          >
            {isPending ? 'Saving…' : mode === 'new' ? 'Create NPC' : 'Save NPC'}
          </button>
        )}
        <button
          className="journal-button journal-button--ghost"
          disabled={isPending}
          onClick={() => onCancel(gone ? 'gone' : 'cancel')}
          type="button"
        >
          {gone ? 'Back to NPCs' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}
