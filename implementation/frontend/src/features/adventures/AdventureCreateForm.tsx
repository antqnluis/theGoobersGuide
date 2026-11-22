import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { CharacterSummary } from '../characters/characterTypes'
import { adventureTypeLabels } from './adventureRules'
import type { AdventureCreateValues, AdventureType } from './adventureTypes'
import {
  adventureLimits,
  charactersLeft,
  normalizeAdventureCreateInput,
  validateAdventureCreateInput,
  type AdventureErrors,
} from './adventureValidation'
import type { AdventureResult } from './useAdventureActions'

type Fields = {
  title: string
  type: AdventureType
  /** '' means none chosen. */
  characterId: string
  nextStep: string
}

const typeHelp: Record<AdventureType, string> = {
  personal: 'A goal of your own. Only you can see it.',
  side: 'A side mission for one of your characters. Only you can see it.',
  main: 'The campaign’s storyline. Every member can read and edit it.',
}

const typeOrder: AdventureType[] = ['personal', 'side', 'main']

/**
 * Starts an adventure. Personal and side adventures belong to one of the writer's own
 * characters; a main adventure belongs to the whole campaign. Keeps the writer's text
 * whatever happens, and a double submit makes one adventure.
 */
export function AdventureCreateForm({
  defaultCharacterId,
  error,
  isPending,
  myCharacters,
  onCancel,
  onDirtyChange,
  onDismissError,
  onSubmit,
}: {
  /** The writer's active character, if any. */
  defaultCharacterId: string | null
  /** The last failure's copy. */
  error: string | null
  isPending: boolean
  /** The writer's own characters, whatever their status (D3). */
  myCharacters: readonly Pick<CharacterSummary, 'id' | 'name' | 'status'>[]
  onCancel: (reason: 'cancel' | 'gone') => void
  onDirtyChange?: (dirty: boolean) => void
  onDismissError?: () => void
  onSubmit: (values: AdventureCreateValues) => Promise<AdventureResult<unknown>>
}) {
  const base = useId()
  const initial: Fields = {
    title: '',
    type: 'personal',
    characterId: defaultCharacterId ?? '',
    nextStep: '',
  }
  const [values, setValues] = useState<Fields>(initial)
  const [errors, setErrors] = useState<AdventureErrors>({})
  const [gone, setGone] = useState(false)
  const submittingRef = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const dirty = values.title !== '' || values.nextStep !== ''
  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])
  useEffect(() => () => reportRef.current?.(false), [])

  // The form is opened on purpose, so keyboard focus goes straight to the title.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const id = (field: string) => `${base}-${field}`
  const change = <K extends keyof Fields>(field: K, value: Fields[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    onDismissError?.()
    if (field === 'title' || field === 'nextStep' || field === 'characterId') {
      const key = field === 'characterId' ? 'character' : field
      setErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  const needsCharacter = values.type !== 'main'
  const noCharacters = needsCharacter && myCharacters.length === 0

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (submittingRef.current || gone) return
    const input = {
      title: values.title,
      type: values.type,
      characterId: values.characterId || null,
      nextStep: values.nextStep,
    }
    const found = validateAdventureCreateInput(input)
    setErrors(found)
    const first = (['title', 'character', 'nextStep'] as const).find((field) => found[field])
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    submittingRef.current = true
    try {
      const result = await onSubmit(normalizeAdventureCreateInput(input))
      if (!result.ok && result.reason === 'unavailable') setGone(true)
    } finally {
      submittingRef.current = false
    }
  }

  const describe = (field: keyof AdventureErrors, extra?: string) =>
    [errors[field] ? `${id(field)}-error` : undefined, extra].filter(Boolean).join(' ') || undefined
  const fieldError = (field: keyof AdventureErrors) =>
    errors[field] && (
      <p className="journal-error" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )

  const sorted = myCharacters.toSorted((a, b) => a.name.localeCompare(b.name))
  const locked = isPending || gone
  const nextLeft = charactersLeft(values.nextStep, adventureLimits.nextStep)

  return (
    <form aria-label="New adventure" className="adventure-form" noValidate onSubmit={submit}>
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

      <fieldset className="adventure-form__types" disabled={isPending}>
        <legend className="journal-label">What kind of adventure</legend>
        {typeOrder.map((type) => (
          <div className="journal-check" key={type}>
            <input
              aria-describedby={`${id(type)}-help`}
              checked={values.type === type}
              id={id(type)}
              name={id('type')}
              onChange={() => change('type', type)}
              type="radio"
            />
            <label htmlFor={id(type)}>{adventureTypeLabels[type]}</label>
            <span className="adventure-form__help" id={`${id(type)}-help`}>
              {typeHelp[type]}
            </span>
          </div>
        ))}
      </fieldset>

      {needsCharacter && !noCharacters && (
        <div className="journal-field">
          <label htmlFor={id('character')}>For which character</label>
          <select
            aria-describedby={describe('character')}
            aria-invalid={errors.character ? 'true' : undefined}
            className="journal-select"
            disabled={isPending}
            id={id('character')}
            onChange={(event) => change('characterId', event.target.value)}
            value={values.characterId}
          >
            <option value="">Choose a character</option>
            {sorted.map((character) => (
              <option key={character.id} value={character.id}>
                {character.status === 'active'
                  ? character.name
                  : `${character.name} (${character.status})`}
              </option>
            ))}
          </select>
          {fieldError('character')}
        </div>
      )}

      {noCharacters && (
        <p className="journal-status">
          A personal or side adventure belongs to one of your characters, and you don’t have one in
          this campaign yet. Make one in the tent (My characters), or start a main adventure.
        </p>
      )}

      <div className="journal-field">
        <label htmlFor={id('nextStep')}>
          Next step <span>(optional)</span>
        </label>
        <input
          aria-describedby={describe(
            'nextStep',
            nextLeft !== null ? id('nextStep-count') : undefined,
          )}
          aria-invalid={errors.nextStep ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('nextStep')}
          onChange={(event) => change('nextStep', event.target.value)}
          value={values.nextStep}
        />
        {nextLeft !== null && (
          <p
            className="adventure-count"
            data-over={nextLeft < 0 || undefined}
            id={id('nextStep-count')}
          >
            {nextLeft >= 0
              ? `${nextLeft} characters left`
              : `${-nextLeft} characters over the limit`}
          </p>
        )}
        {fieldError('nextStep')}
      </div>

      {gone && (
        <p className="journal-alert" role="alert">
          You can no longer add adventures to this campaign.
        </p>
      )}
      {error && !gone && (
        <p className="journal-alert" role="alert">
          {error}
        </p>
      )}

      <div className="journal-actions">
        <button
          aria-busy={isPending || undefined}
          className="journal-button"
          disabled={locked || noCharacters}
          type="submit"
        >
          {isPending ? 'Saving…' : 'Create adventure'}
        </button>
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
