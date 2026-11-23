import type { CampaignOverview, OverviewValues } from './overviewTypes'

/** Mirrors the database CHECK constraints on `campaign_overviews`. */
export const overviewLimits = {
  announcement: 500,
  location: 120,
  in_world_date: 80,
  chapter: 120,
  situation: 3000,
  objective: 1000,
  last_session: 4000,
  next_session_note: 300,
  ruleset: 80,
  house_rules: 3000,
  table_notes: 3000,
} as const

export type OverviewTextField = keyof typeof overviewLimits

/** The text fields that hold one line; the rest are paragraphs. */
export const singleLineFields: readonly OverviewTextField[] = [
  'location',
  'in_world_date',
  'chapter',
  'ruleset',
  'next_session_note',
]

/** The form's values: the same text fields, and the next session as a `datetime-local` string. */
export type OverviewFormValues = Record<OverviewTextField, string> & { next_session_at: string }

export type OverviewErrors = Partial<Record<OverviewTextField | 'next_session_at', string>>

// eslint-disable-next-line no-control-regex
const lineControls = /[\u0000-\u001f\u007f-\u009f]/
// Newlines and tabs are allowed in paragraphs; other control characters are not.
// eslint-disable-next-line no-control-regex
const paragraphControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

/** Line endings are stored as `\n`, so the count and the checks see what the database will. */
export function normalizeLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n')
}

const pad = (value: number) => String(value).padStart(2, '0')

/** An ISO timestamp as the local `YYYY-MM-DDTHH:mm` a `datetime-local` input takes. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** A `datetime-local` value as an ISO timestamp; null for empty or invalid input. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function toFormValues(overview: CampaignOverview | null | undefined): OverviewFormValues {
  const text = (field: OverviewTextField) => overview?.[field] ?? ''
  return {
    announcement: text('announcement'),
    location: text('location'),
    in_world_date: text('in_world_date'),
    chapter: text('chapter'),
    situation: text('situation'),
    objective: text('objective'),
    last_session: text('last_session'),
    next_session_note: text('next_session_note'),
    ruleset: text('ruleset'),
    house_rules: text('house_rules'),
    table_notes: text('table_notes'),
    next_session_at: toLocalInput(overview?.next_session_at ?? null),
  }
}

/** Per-field errors for the overview form; an empty object means valid. */
export function validateOverview(values: OverviewFormValues): OverviewErrors {
  const errors: OverviewErrors = {}
  for (const field of Object.keys(overviewLimits) as OverviewTextField[]) {
    const text = normalizeLineEndings(values[field]).trim()
    const controls = singleLineFields.includes(field) ? lineControls : paragraphControls
    if (text.length > overviewLimits[field]) {
      errors[field] =
        `Keep this to ${overviewLimits[field].toLocaleString('en-US')} characters or fewer.`
    } else if (controls.test(text)) {
      errors[field] = 'Remove the unsupported characters.'
    }
  }
  if (values.next_session_at && fromLocalInput(values.next_session_at) === null) {
    errors.next_session_at = 'Choose a valid date and time.'
  }
  return errors
}

/** What is stored: trimmed text, `\n` line endings, and the session time as an ISO timestamp. */
export function normalizeOverview(values: OverviewFormValues): OverviewValues {
  const text = (field: OverviewTextField) => normalizeLineEndings(values[field]).trim()
  return {
    announcement: text('announcement'),
    location: text('location'),
    in_world_date: text('in_world_date'),
    chapter: text('chapter'),
    situation: text('situation'),
    objective: text('objective'),
    last_session: text('last_session'),
    next_session_note: text('next_session_note'),
    ruleset: text('ruleset'),
    house_rules: text('house_rules'),
    table_notes: text('table_notes'),
    next_session_at: fromLocalInput(values.next_session_at),
  }
}

/** Whether the overview has anything written in it. */
export function isOverviewEmpty(overview: CampaignOverview | null | undefined): boolean {
  if (!overview) return true
  const values = toFormValues(overview)
  return Object.values(values).every((value) => value === '')
}
