import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { CharacterSummary } from '../characters/characterTypes'
import type { Note, NoteCreateValues, NoteVisibility } from './noteTypes'
import type { NoteResult } from './useNoteActions'
import {
  bodyCharactersLeft,
  noteLimits,
  normalizeNoteInput,
  validateNoteInput,
  type NoteErrors,
} from './noteValidation'

type Fields = {
  title: string
  body: string
  visibility: NoteVisibility
  /** '' means no link. */
  characterId: string
}

function toFields(note: Note | null): Fields {
  return {
    title: note?.title ?? '',
    body: note?.body ?? '',
    visibility: note?.visibility ?? 'private',
    characterId: note?.character_id ?? '',
  }
}

/**
 * Writes a new note or edits an existing one. Validates on submit and keeps the writer's text
 * whatever happens: a stale save offers the latest version (D6), and a note that has gone
 * keeps its text on screen so it can be copied out.
 */
export function NoteEditor({
  characters,
  error,
  isPending,
  mode,
  note,
  onCancel,
  onDirtyChange,
  onDismissError,
  onSubmit,
}: {
  /** The campaign's characters the writer can see, for the link. */
  characters: readonly CharacterSummary[]
  /** The last failure's copy; the editor shows it unless it is showing a banner of its own. */
  error: string | null
  isPending: boolean
  mode: 'new' | 'edit'
  /** The note being edited; null for a new one. */
  note: Note | null
  /** `gone` when the note no longer exists, so there is no note to go back to. */
  onCancel: (reason: 'cancel' | 'gone') => void
  onDirtyChange?: (dirty: boolean) => void
  /** Clears the failure copy the editor was shown. */
  onDismissError?: () => void
  /**
   * Saves against `base` (the version the text is based on; null for a new note).
   * Resolves to how the write ended, so the editor can offer the right next step.
   */
  onSubmit: (values: NoteCreateValues, base: Note | null) => Promise<NoteResult>
}) {
  const base = useId()
  // The version the text is based on. A conflict moves it to the latest version.
  const [basis, setBasis] = useState<Note | null>(note)
  const [values, setValues] = useState<Fields>(() => toFields(note))
  const [errors, setErrors] = useState<NoteErrors>({})
  const [conflicted, setConflicted] = useState(false)
  const [gone, setGone] = useState(false)
  const [discardAsked, setDiscardAsked] = useState(false)
  const submittingRef = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)

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

  // The editor is opened on purpose, so keyboard focus goes straight to the title.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const id = (field: string) => `${base}-${field}`
  const change = <K extends keyof Fields>(field: K, value: Fields[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (field === 'title' || field === 'body') {
      setErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (submittingRef.current || gone) return
    const found = validateNoteInput(values)
    setErrors(found)
    const first = (['title', 'body'] as const).find((field) => found[field])
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    submittingRef.current = true
    setConflicted(false)
    try {
      const result = await onSubmit(
        normalizeNoteInput({
          title: values.title,
          body: values.body,
          visibility: values.visibility,
          characterId: values.characterId || null,
        }),
        basis,
      )
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
    titleRef.current?.focus()
  }

  const describe = (field: keyof NoteErrors) => (errors[field] ? `${id(field)}-error` : undefined)
  const fieldError = (field: keyof NoteErrors) =>
    errors[field] && (
      <p className="journal-error" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )

  const left = bodyCharactersLeft(values.body)
  const linkIsHidden =
    values.characterId !== '' &&
    !characters.some((character) => character.id === values.characterId)
  const sorted = characters.toSorted((a, b) => a.name.localeCompare(b.name))
  const locked = isPending || gone

  return (
    <form
      aria-label={mode === 'new' ? 'New note' : `Edit ${basis?.title ?? 'note'}`}
      className="note-form"
      noValidate
      onSubmit={submit}
    >
      <div className="journal-field">
        <label htmlFor={id('title')}>Title</label>
        <input
          aria-describedby={describe('title')}
          aria-invalid={errors.title ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('title')}
          onChange={(event) => change('title', event.target.value)}
          ref={titleRef}
          required
          value={values.title}
        />
        {fieldError('title')}
      </div>

      <div className="journal-field">
        <label htmlFor={id('body')}>
          Note <span>(optional)</span>
        </label>
        <textarea
          aria-describedby={
            [describe('body'), left !== null ? `${id('count')}` : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={errors.body ? 'true' : undefined}
          className="journal-input note-form__body"
          disabled={isPending}
          id={id('body')}
          onChange={(event) => change('body', event.target.value)}
          rows={12}
          value={values.body}
        />
        {left !== null && (
          <p className="note-form__count" data-over={left < 0 || undefined} id={id('count')}>
            {left >= 0
              ? `${left.toLocaleString('en-US')} characters left`
              : `${(-left).toLocaleString('en-US')} characters over the ${noteLimits.body.toLocaleString('en-US')} limit`}
          </p>
        )}
        {fieldError('body')}
      </div>

      <div className="journal-field">
        <label htmlFor={id('character')}>
          About a character <span>(optional)</span>
        </label>
        <select
          className="journal-select"
          disabled={isPending}
          id={id('character')}
          onChange={(event) => change('characterId', event.target.value)}
          value={values.characterId}
        >
          <option value="">None</option>
          {linkIsHidden && <option value={values.characterId}>A character you can’t see</option>}
          {sorted.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </div>

      {mode === 'new' && (
        <fieldset className="note-form__visibility" disabled={isPending}>
          <legend className="journal-label">Who can read this note</legend>
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

      {conflicted && (
        <div className="note-form__conflict journal-alert" role="alert">
          <p>This note changed while you were editing. Your text is still here.</p>
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
            ? 'You can no longer add notes to this campaign.'
            : 'This note is no longer available. It may have been made private or deleted. Your text is still here, so you can copy it.'}
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
            {isPending ? 'Saving…' : mode === 'new' ? 'Create note' : 'Save note'}
          </button>
        )}
        <button
          className="journal-button journal-button--ghost"
          disabled={isPending}
          onClick={() => onCancel(gone ? 'gone' : 'cancel')}
          type="button"
        >
          {gone ? 'Back to notes' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}
