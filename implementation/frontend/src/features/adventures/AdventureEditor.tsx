import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { adventureTypeLabels, selectableTypes } from './adventureRules'
import type { AdventureDetail, AdventureType, AdventureValues } from './adventureTypes'
import {
  adventureLimits,
  charactersLeft,
  normalizeAdventureInput,
  validateAdventureInput,
  type AdventureErrors,
} from './adventureValidation'
import type { AdventureResult } from './useAdventureActions'

type Fields = {
  title: string
  type: AdventureType
  description: string
  nextStep: string
  reference: string
}

function toFields(adventure: AdventureDetail): Fields {
  return {
    title: adventure.title,
    type: adventure.type,
    description: adventure.description,
    nextStep: adventure.next_step,
    reference: adventure.reference,
  }
}

/**
 * Edits an adventure's details. Validates on submit and keeps the writer's text whatever
 * happens: a stale save offers the latest version (D11), and an adventure that has gone
 * keeps its text on screen so it can be copied out.
 */
export function AdventureEditor({
  adventure,
  error,
  isPending,
  onCancel,
  onDirtyChange,
  onDismissError,
  onSubmit,
}: {
  adventure: AdventureDetail
  /** The last failure's copy; the editor shows it unless it is showing a banner of its own. */
  error: string | null
  isPending: boolean
  /** `gone` when the adventure no longer exists, so there is nothing to go back to. */
  onCancel: (reason: 'cancel' | 'gone') => void
  onDirtyChange?: (dirty: boolean) => void
  /** Clears the failure copy the editor was shown. */
  onDismissError?: () => void
  /** Saves against `base`, the version the text is based on. */
  onSubmit: (values: AdventureValues, base: AdventureDetail) => Promise<AdventureResult<unknown>>
}) {
  const base = useId()
  // The version the text is based on. A conflict moves it to the latest version.
  const [basis, setBasis] = useState(adventure)
  const [values, setValues] = useState<Fields>(() => toFields(adventure))
  const [errors, setErrors] = useState<AdventureErrors>({})
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
    if (field !== 'type') setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (submittingRef.current || gone) return
    const found = validateAdventureInput(values)
    setErrors(found)
    const first = (['title', 'description', 'nextStep', 'reference'] as const).find(
      (field) => found[field],
    )
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    submittingRef.current = true
    setConflicted(false)
    try {
      const result = await onSubmit(normalizeAdventureInput(values), basis)
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

  const counter = (field: 'description' | 'nextStep' | 'reference', max: number) => {
    const left = charactersLeft(values[field], max)
    return left === null ? null : { left, id: id(`${field}-count`) }
  }
  const describe = (field: keyof AdventureErrors, count?: { id: string } | null) =>
    [errors[field] ? `${id(field)}-error` : undefined, count?.id].filter(Boolean).join(' ') ||
    undefined
  const fieldError = (field: keyof AdventureErrors) =>
    errors[field] && (
      <p className="journal-error" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )
  const count = (info: ReturnType<typeof counter>) =>
    info && (
      <p className="adventure-count" data-over={info.left < 0 || undefined} id={info.id}>
        {info.left >= 0
          ? `${info.left.toLocaleString('en-US')} characters left`
          : `${(-info.left).toLocaleString('en-US')} characters over the limit`}
      </p>
    )

  const descriptionCount = counter('description', adventureLimits.description)
  const nextCount = counter('nextStep', adventureLimits.nextStep)
  const referenceCount = counter('reference', adventureLimits.reference)
  const types = selectableTypes(basis.type)
  const locked = isPending || gone

  return (
    <form
      aria-label={`Edit ${basis.title}`}
      className="adventure-form"
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

      {types.length > 1 && (
        <fieldset className="adventure-form__types" disabled={isPending}>
          <legend className="journal-label">What kind of adventure</legend>
          {types.map((type) => (
            <div className="journal-check" key={type}>
              <input
                checked={values.type === type}
                id={id(type)}
                name={id('type')}
                onChange={() => change('type', type)}
                type="radio"
              />
              <label htmlFor={id(type)}>{adventureTypeLabels[type]}</label>
            </div>
          ))}
        </fieldset>
      )}

      <div className="journal-field">
        <label htmlFor={id('nextStep')}>
          Next step <span>(optional)</span>
        </label>
        <input
          aria-describedby={describe('nextStep', nextCount)}
          aria-invalid={errors.nextStep ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('nextStep')}
          onChange={(event) => change('nextStep', event.target.value)}
          value={values.nextStep}
        />
        {count(nextCount)}
        {fieldError('nextStep')}
      </div>

      <div className="journal-field">
        <label htmlFor={id('reference')}>
          Reference <span>(optional: an NPC, a place, a quest giver)</span>
        </label>
        <input
          aria-describedby={describe('reference', referenceCount)}
          aria-invalid={errors.reference ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('reference')}
          onChange={(event) => change('reference', event.target.value)}
          value={values.reference}
        />
        {count(referenceCount)}
        {fieldError('reference')}
      </div>

      <div className="journal-field">
        <label htmlFor={id('description')}>
          Description <span>(optional)</span>
        </label>
        <textarea
          aria-describedby={describe('description', descriptionCount)}
          aria-invalid={errors.description ? 'true' : undefined}
          className="journal-input adventure-form__description"
          disabled={isPending}
          id={id('description')}
          onChange={(event) => change('description', event.target.value)}
          rows={8}
          value={values.description}
        />
        {count(descriptionCount)}
        {fieldError('description')}
      </div>

      {conflicted && (
        <div className="adventure-form__conflict journal-alert" role="alert">
          <p>This adventure changed while you were editing. Your text is still here.</p>
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
          This adventure is no longer available. It may have been archived. Your text is still here,
          so you can copy it.
        </p>
      )}

      {error && !conflicted && !gone && (
        <p className="journal-alert" role="alert">
          {error}
        </p>
      )}

      <div className="journal-actions">
        {!conflicted && (
          <button
            aria-busy={isPending || undefined}
            className="journal-button"
            disabled={locked}
            type="submit"
          >
            {isPending ? 'Saving…' : 'Save adventure'}
          </button>
        )}
        <button
          className="journal-button journal-button--ghost"
          disabled={isPending}
          onClick={() => onCancel(gone ? 'gone' : 'cancel')}
          type="button"
        >
          {gone ? 'Back to adventures' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}
