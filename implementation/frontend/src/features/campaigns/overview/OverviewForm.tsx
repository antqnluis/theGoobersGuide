import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  normalizeOverview,
  overviewLimits,
  singleLineFields,
  toFormValues,
  validateOverview,
  type OverviewErrors,
  type OverviewFormValues,
  type OverviewTextField,
} from './overviewValidation'
import type { CampaignOverview, OverviewValues } from './overviewTypes'

type FieldSpec = { field: OverviewTextField; label: string; hint?: string; rows?: number }

const groups: { title: string; fields: (FieldSpec | 'next_session_at')[] }[] = [
  {
    title: 'Announcement',
    fields: [
      {
        field: 'announcement',
        label: 'Message to the table',
        hint: 'Shown first, to everyone: a reminder, a change of plans, a request.',
        rows: 2,
      },
    ],
  },
  {
    title: 'Where we are',
    fields: [
      { field: 'location', label: 'Current location', hint: 'Where the party is right now.' },
      {
        field: 'in_world_date',
        label: 'In-world date',
        hint: 'For example “14th of Hammer, 1492 DR”.',
      },
      { field: 'chapter', label: 'Chapter or arc' },
      {
        field: 'situation',
        label: 'Where things stand',
        hint: 'What the party knows and what is at stake.',
        rows: 6,
      },
      { field: 'objective', label: 'Current objective', rows: 3 },
    ],
  },
  {
    title: 'Sessions',
    fields: [
      'next_session_at',
      {
        field: 'next_session_note',
        label: 'About the next session',
        hint: 'Where, or what to bring.',
      },
      { field: 'last_session', label: 'Last session recap', rows: 8 },
    ],
  },
  {
    title: 'The table',
    fields: [
      { field: 'ruleset', label: 'Game system', hint: 'For example “D&D 5e (2024)”.' },
      { field: 'house_rules', label: 'House rules', rows: 5 },
      {
        field: 'table_notes',
        label: 'Tone and table expectations',
        hint: 'The feel of the game, content limits, and how the table runs.',
        rows: 5,
      },
    ],
  },
]

/**
 * The owner's form for the campaign overview. Validates on submit and keeps the owner's text
 * whatever happens, so a failed save loses nothing.
 */
export function OverviewForm({
  error,
  isPending,
  onCancel,
  onDirtyChange,
  onSubmit,
  overview,
}: {
  error: string | null
  isPending: boolean
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  /** Resolves to whether the overview was stored. */
  onSubmit: (values: OverviewValues) => Promise<boolean>
  overview: CampaignOverview | null | undefined
}) {
  const base = useId()
  const [saved] = useState(() => toFormValues(overview))
  const [values, setValues] = useState<OverviewFormValues>(saved)
  const [errors, setErrors] = useState<OverviewErrors>({})
  const submittingRef = useRef(false)
  const firstRef = useRef<HTMLTextAreaElement>(null)

  const dirty = (Object.keys(values) as (keyof OverviewFormValues)[]).some(
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

  // The form is opened on purpose, so keyboard focus goes straight to its first field.
  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  const id = (field: string) => `${base}-${field}`
  const change = (field: keyof OverviewFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    const found = validateOverview(values)
    setErrors(found)
    const first = (Object.keys(found) as (keyof OverviewFormValues)[])[0]
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    submittingRef.current = true
    try {
      await onSubmit(normalizeOverview(values))
    } finally {
      submittingRef.current = false
    }
  }

  const fieldError = (field: keyof OverviewFormValues) =>
    errors[field] && (
      <p className="journal-error" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )
  const describedBy = (field: keyof OverviewFormValues, hint: boolean) =>
    [hint ? `${id(field)}-hint` : null, errors[field] ? `${id(field)}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <form aria-label="Edit the overview" className="overview-form" noValidate onSubmit={submit}>
      {groups.map((group) => (
        <fieldset className="overview-form__group" disabled={isPending} key={group.title}>
          <legend className="journal-section-title">{group.title}</legend>
          {group.fields.map((spec) => {
            if (spec === 'next_session_at') {
              return (
                <div className="journal-field" key={spec}>
                  <label htmlFor={id(spec)}>
                    Next session <span>(optional)</span>
                  </label>
                  <input
                    aria-describedby={describedBy(spec, false)}
                    aria-invalid={errors[spec] ? 'true' : undefined}
                    className="journal-input"
                    id={id(spec)}
                    onChange={(event) => change(spec, event.target.value)}
                    type="datetime-local"
                    value={values[spec]}
                  />
                  {fieldError(spec)}
                </div>
              )
            }
            const { field, label, hint, rows } = spec
            const common = {
              'aria-describedby': describedBy(field, Boolean(hint)),
              'aria-invalid': errors[field] ? ('true' as const) : undefined,
              className: 'journal-input',
              id: id(field),
              maxLength: overviewLimits[field] + 200,
              onChange: (event: { target: { value: string } }) => change(field, event.target.value),
              value: values[field],
            }
            return (
              <div className="journal-field" key={field}>
                <label htmlFor={id(field)}>
                  {label} <span>(optional)</span>
                </label>
                {hint && (
                  <p className="overview-form__hint" id={`${id(field)}-hint`}>
                    {hint}
                  </p>
                )}
                {singleLineFields.includes(field) ? (
                  <input autoComplete="off" {...common} />
                ) : (
                  <textarea
                    {...common}
                    ref={field === 'announcement' ? firstRef : undefined}
                    rows={rows ?? 4}
                  />
                )}
                {fieldError(field)}
              </div>
            )
          })}
        </fieldset>
      ))}

      {error && (
        <p className="journal-alert" role="alert">
          {error}
        </p>
      )}

      <div className="journal-actions">
        <button
          aria-busy={isPending || undefined}
          className="journal-button"
          disabled={isPending}
          type="submit"
        >
          {isPending ? 'Saving…' : 'Save overview'}
        </button>
        <button
          className="journal-button journal-button--ghost"
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
