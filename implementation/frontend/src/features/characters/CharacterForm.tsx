import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CharacterDetails, CharacterDetailsInput } from './characterTypes'
import {
  toCharacterDetails,
  validateCharacterDetails,
  type DetailsErrors,
} from './characterValidation'

type CharacterFormProps = {
  mode: 'create' | 'edit'
  initial?: CharacterDetailsInput
  isPending: boolean
  /** Resolves to whether the save took effect; the form keeps its input when it did not. */
  onSubmit: (details: CharacterDetails, inParty: boolean) => Promise<boolean>
  /** Without one, there is no Cancel button (the screen has its own way back). */
  onCancel?: () => void
  /** Focus the name field on mount; off when the form sits inside a longer screen. */
  autoFocus?: boolean
  /** Reports whether the fields differ from where they started, so leaving can ask first. */
  onDirtyChange?: (dirty: boolean) => void
}

const emptyInput: CharacterDetailsInput = {
  name: '',
  species: '',
  class_name: '',
  subclass: '',
  background: '',
  level: 1,
}

const textFields = [
  ['species', 'Species'],
  ['class_name', 'Class'],
  ['subclass', 'Subclass'],
  ['background', 'Background'],
] as const

/** Create and edit the summary fields. Validation runs on submit, like CampaignForm. */
export function CharacterForm({
  mode,
  initial = emptyInput,
  isPending,
  onSubmit,
  onCancel,
  onDirtyChange,
  autoFocus = true,
}: CharacterFormProps) {
  const [values, setValues] = useState({
    name: initial.name,
    species: initial.species,
    class_name: initial.class_name,
    subclass: initial.subclass,
    background: initial.background,
    level: String(initial.level),
  })
  const [inParty, setInParty] = useState(true)
  const [errors, setErrors] = useState<DetailsErrors>({})
  const submittingRef = useRef(false)

  const dirty =
    (Object.keys(values) as (keyof typeof values)[]).some(
      (field) => values[field] !== String(initial[field]),
    ) ||
    (mode === 'create' && !inParty)
  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])
  useEffect(() => () => reportRef.current?.(false), [])

  const change = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) return

    const input: CharacterDetailsInput = {
      ...values,
      level: values.level.trim() === '' ? Number.NaN : Number(values.level),
    }
    const found = validateCharacterDetails(input)
    setErrors(found)
    const first = (
      ['name', 'species', 'class_name', 'subclass', 'background', 'level'] as const
    ).find((field) => found[field])
    if (first) {
      document.getElementById(`character-${first}`)?.focus()
      return
    }

    submittingRef.current = true
    try {
      await onSubmit(toCharacterDetails(input), inParty)
    } finally {
      submittingRef.current = false
    }
  }

  const describe = (field: keyof DetailsErrors, hint?: string) => {
    const ids = [errors[field] && `character-${field}-error`, hint].filter(Boolean)
    return ids.length ? ids.join(' ') : undefined
  }

  const error = (field: keyof DetailsErrors) =>
    errors[field] && (
      <p className="journal-error" id={`character-${field}-error`}>
        {errors[field]}
      </p>
    )

  return (
    <form
      aria-label={mode === 'create' ? 'Create a character' : 'Edit character details'}
      className="character-form"
      noValidate
      onSubmit={submit}
    >
      <div className="journal-field">
        <label htmlFor="character-name">Name</label>
        <input
          className="journal-input"
          aria-describedby={describe('name')}
          aria-invalid={errors.name ? 'true' : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={isPending}
          id="character-name"
          onChange={(event) => change('name', event.target.value)}
          required
          value={values.name}
        />
        {error('name')}
      </div>

      <div className="character-form__grid">
        {textFields.map(([field, label]) => (
          <div className="journal-field" key={field}>
            <label htmlFor={`character-${field}`}>
              {label} <span>(optional)</span>
            </label>
            <input
              className="journal-input"
              aria-describedby={describe(field)}
              aria-invalid={errors[field] ? 'true' : undefined}
              autoComplete="off"
              disabled={isPending}
              id={`character-${field}`}
              onChange={(event) => change(field, event.target.value)}
              value={values[field]}
            />
            {error(field)}
          </div>
        ))}
        <div className="journal-field">
          <label htmlFor="character-level">Level</label>
          <input
            className="journal-input"
            aria-describedby={describe('level')}
            aria-invalid={errors.level ? 'true' : undefined}
            disabled={isPending}
            id="character-level"
            inputMode="numeric"
            max={20}
            min={1}
            onChange={(event) => change('level', event.target.value)}
            type="number"
            value={values.level}
          />
          {error('level')}
        </div>
      </div>

      {mode === 'create' && (
        <div className="journal-check">
          <input
            checked={inParty}
            disabled={isPending}
            id="character-in-party"
            onChange={(event) => setInParty(event.target.checked)}
            type="checkbox"
          />
          <label htmlFor="character-in-party">Join the party</label>
        </div>
      )}

      <div className="journal-actions">
        <button
          aria-busy={isPending || undefined}
          className="journal-button"
          disabled={isPending}
          type="submit"
        >
          {mode === 'create'
            ? isPending
              ? 'Creating character…'
              : 'Create character'
            : isPending
              ? 'Saving character…'
              : 'Save details'}
        </button>
        {onCancel && (
          <button
            className="journal-button journal-button--ghost"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
