import { describe, expect, it } from 'vitest'
import {
  filterNotes,
  groupNotes,
  noteAuthorLabel,
  noteEditedLabel,
  relativeTime,
  sortNotes,
  summarizeNote,
} from './noteRules'
import type { Note, NoteSummary } from './noteTypes'

const me = 'user-me'
const roster = [
  { profile_id: me, username: 'me', display_name: null },
  { profile_id: 'mira', username: 'mira_1', display_name: 'Mira' },
  { profile_id: 'bo', username: 'bo', display_name: null },
]
const now = new Date('2026-11-16T12:00:00Z')

function note(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 'n1',
    campaign_id: 'c1',
    author_id: me,
    visibility: 'private',
    title: 'Note',
    character_id: null,
    updated_by: me,
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
    ...overrides,
  }
}

describe('summarizeNote', () => {
  it('drops the body and keeps every other field', () => {
    const full: Note = { ...note({ id: 'x' }), body: 'secret text' }
    const summary = summarizeNote(full)
    expect('body' in summary).toBe(false)
    expect(summary).toEqual(note({ id: 'x' }))
  })
})

describe('sortNotes and groupNotes', () => {
  const older = note({ id: 'older', updated_at: '2026-11-16T08:00:00Z' })
  const newer = note({ id: 'newer', updated_at: '2026-11-16T11:00:00+00:00' })
  const offset = note({ id: 'offset', updated_at: '2026-11-16T12:30:00+02:00' }) // 10:30 UTC

  it('orders by the instant, newest first, whatever the offset or precision', () => {
    expect(sortNotes([older, offset, newer]).map((row) => row.id)).toEqual([
      'newer',
      'offset',
      'older',
    ])
  })

  it('breaks ties by id so the order is stable', () => {
    const a = note({ id: 'a' })
    const b = note({ id: 'b' })
    expect(sortNotes([b, a]).map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('does not change the input', () => {
    const input = [older, newer]
    sortNotes(input)
    expect(input.map((row) => row.id)).toEqual(['older', 'newer'])
  })

  it('splits shared and private notes, each newest first', () => {
    const groups = groupNotes([
      note({ id: 's1', visibility: 'campaign', updated_at: '2026-11-16T09:00:00Z' }),
      note({ id: 'p1', visibility: 'private', updated_at: '2026-11-16T07:00:00Z' }),
      note({ id: 's2', visibility: 'campaign', updated_at: '2026-11-16T09:30:00Z' }),
      note({ id: 'p2', visibility: 'private', updated_at: '2026-11-16T08:00:00Z' }),
    ])
    expect(groups.shared.map((row) => row.id)).toEqual(['s2', 's1'])
    expect(groups.onlyYou.map((row) => row.id)).toEqual(['p2', 'p1'])
  })

  it('returns empty groups for no notes', () => {
    expect(groupNotes([])).toEqual({ shared: [], onlyYou: [] })
  })
})

describe('filterNotes', () => {
  const notes = [
    note({ id: 'a', title: "Thorin's debts" }),
    note({ id: 'b', title: 'Map of Landfall' }),
  ]

  it('matches titles case-insensitively and ignores surrounding spaces', () => {
    expect(filterNotes(notes, '  THORIN ').map((row) => row.id)).toEqual(['a'])
    expect(filterNotes(notes, 'fall').map((row) => row.id)).toEqual(['b'])
    expect(filterNotes(notes, 'zzz')).toEqual([])
  })

  it('keeps everything for a blank query', () => {
    expect(filterNotes(notes, '   ')).toHaveLength(2)
  })
})

describe('noteAuthorLabel', () => {
  it('says You for the viewer, the display name or username for members, and a former member otherwise', () => {
    expect(noteAuthorLabel(me, me, roster)).toBe('You')
    expect(noteAuthorLabel('mira', me, roster)).toBe('Mira')
    expect(noteAuthorLabel('bo', me, roster)).toBe('bo')
    expect(noteAuthorLabel('gone', me, roster)).toBe('A former member')
  })
})

describe('relativeTime', () => {
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

  it('reads recent stamps as just now, including future ones from clock skew', () => {
    expect(relativeTime(ago(0), now)).toBe('just now')
    expect(relativeTime(ago(59), now)).toBe('just now')
    expect(relativeTime(ago(-300), now)).toBe('just now')
  })

  it('picks the largest whole unit', () => {
    expect(relativeTime(ago(60), now)).toBe('1 minute ago')
    expect(relativeTime(ago(5 * 60), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(2 * 3600 + 120), now)).toBe('2 hours ago')
    expect(relativeTime(ago(26 * 3600), now)).toBe('1 day ago')
    expect(relativeTime(ago(8 * 86400), now)).toBe('1 week ago')
    expect(relativeTime(ago(40 * 86400), now)).toBe('1 month ago')
    expect(relativeTime(ago(800 * 86400), now)).toBe('2 years ago')
  })

  it('treats an unparseable stamp as just now', () => {
    expect(relativeTime('not a date', now)).toBe('just now')
  })
})

describe('noteEditedLabel', () => {
  const stamp = '2026-11-16T10:00:00Z'

  it('names the editor and the time', () => {
    expect(noteEditedLabel({ updated_by: 'mira', updated_at: stamp }, me, roster, now)).toBe(
      'Edited by Mira, 2 hours ago',
    )
    expect(noteEditedLabel({ updated_by: me, updated_at: stamp }, me, roster, now)).toBe(
      'Edited by you, 2 hours ago',
    )
  })

  it('reads a departed editor as a former member', () => {
    expect(noteEditedLabel({ updated_by: 'gone', updated_at: stamp }, me, roster, now)).toBe(
      'Edited by A former member, 2 hours ago',
    )
  })

  it('shows only the time when the editor’s account was deleted', () => {
    expect(noteEditedLabel({ updated_by: null, updated_at: stamp }, me, roster, now)).toBe(
      'Edited 2 hours ago',
    )
  })
})
