import { describe, expect, it } from 'vitest'
import type { CampaignOverview } from './overviewTypes'
import {
  fromLocalInput,
  isOverviewEmpty,
  normalizeOverview,
  overviewLimits,
  toFormValues,
  toLocalInput,
  validateOverview,
} from './overviewValidation'

const overview: CampaignOverview = {
  campaign_id: 'c1',
  announcement: 'No session next week.',
  location: 'The Sunken Library',
  in_world_date: '14th of Hammer',
  chapter: 'Act II',
  situation: 'The party is trapped.',
  objective: 'Find the key.',
  last_session: 'They fought a lich.',
  next_session_at: '2026-12-05T19:30:00.000Z',
  next_session_note: 'Bring snacks',
  ruleset: 'D&D 5e',
  house_rules: 'Crits double dice.',
  table_notes: 'Heroic fantasy.',
  updated_at: '2026-11-23T10:00:00.000Z',
}

describe('overview validation', () => {
  it('starts an empty form for a campaign without an overview', () => {
    const values = toFormValues(null)
    expect(Object.values(values).every((value) => value === '')).toBe(true)
    expect(isOverviewEmpty(null)).toBe(true)
    expect(isOverviewEmpty(overview)).toBe(false)
  })

  it('round-trips the next session through the local input', () => {
    const local = toLocalInput(overview.next_session_at)
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(fromLocalInput(local)).toBe(overview.next_session_at)
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('not a date')).toBeNull()
  })

  it('normalizes text and the session time for storage', () => {
    const values = { ...toFormValues(overview), location: '  The Library  ', situation: 'a\r\nb ' }
    const stored = normalizeOverview(values)
    expect(stored.location).toBe('The Library')
    expect(stored.situation).toBe('a\nb')
    expect(stored.next_session_at).toBe(overview.next_session_at)
    expect(normalizeOverview({ ...values, next_session_at: '' }).next_session_at).toBeNull()
  })

  it('accepts a valid form and a full empty one', () => {
    expect(validateOverview(toFormValues(overview))).toEqual({})
    expect(validateOverview(toFormValues(null))).toEqual({})
  })

  it('flags text past its limit, control characters, and a bad session time', () => {
    const values = {
      ...toFormValues(null),
      location: 'x'.repeat(overviewLimits.location + 1),
      chapter: 'bad\u0007title',
      situation: 'line one\nline two',
      next_session_at: 'garbage',
    }
    const errors = validateOverview(values)
    expect(errors.location).toMatch(/120/)
    expect(errors.chapter).toBeDefined()
    expect(errors.situation).toBeUndefined()
    expect(errors.next_session_at).toBeDefined()
  })

  it('counts a paragraph after trimming and line-ending normalization', () => {
    const atLimit = 'x'.repeat(overviewLimits.announcement)
    expect(validateOverview({ ...toFormValues(null), announcement: `  ${atLimit}  ` })).toEqual({})
  })
})
