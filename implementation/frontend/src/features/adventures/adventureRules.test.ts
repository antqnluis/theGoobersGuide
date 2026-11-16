import { describe, expect, it } from 'vitest'
import {
  adventureCharacterName,
  adventureCharacterNames,
  adventureEditedLabel,
  adventureStatusLabel,
  canArchive,
  defaultCharacterId,
  filterAdventures,
  groupAdventures,
  isArchived,
  mergeAdventure,
  objectiveDoneLabel,
  objectiveProgress,
  ownCharacters,
  selectableTypes,
  sortAdventures,
  summarizeAdventure,
  updateAuthorLabel,
} from './adventureRules'
import { adventure, miraId, objective, roster, summary, userId } from './adventureTestData'

const now = new Date('2026-11-16T12:00:00Z')

describe('summarizeAdventure', () => {
  it('drops the description and reduces the children to what a row shows', () => {
    const detail = adventure({
      id: 'a1',
      objectives: [objective({ done: true }), objective()],
    })
    const row = summarizeAdventure(detail)
    expect(row).not.toHaveProperty('description')
    expect(row.objectives).toEqual([{ done: true }, { done: false }])
    expect(row.participants).toEqual([{ character_id: detail.participants[0].character_id }])
  })

  it('keeps the children a list row already had when given a bare row', () => {
    const existing = summary({ id: 'a1', objectives: [{ done: true }] })
    const { participants: _p, objectives: _o, updates: _u, ...bare } = adventure({ id: 'a1' })
    void [_p, _o, _u]
    expect(summarizeAdventure(bare, existing).objectives).toEqual([{ done: true }])
  })
})

describe('sortAdventures and filterAdventures', () => {
  it('orders by instant, newest first, and breaks ties by id', () => {
    const rows = [
      summary({ id: 'b', updated_at: '2026-11-16T10:00:00+00:00' }),
      summary({ id: 'a', updated_at: '2026-11-16T10:00:00+00:00' }),
      summary({ id: 'c', updated_at: '2026-11-16T18:00:00+08:00' }),
      summary({ id: 'd', updated_at: '2026-11-16T12:00:00+00:00' }),
    ]
    expect(sortAdventures(rows).map((row) => row.id)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('filters by title, ignoring case and blanks', () => {
    const rows = [summary({ title: 'Find the Heir' }), summary({ title: 'Burn the map' })]
    expect(filterAdventures(rows, ' HEIR ')).toHaveLength(1)
    expect(filterAdventures(rows, '  ')).toHaveLength(2)
    expect(filterAdventures(rows, 'zzz')).toHaveLength(0)
  })
})

describe('groupAdventures', () => {
  const at = (hour: number) => `2026-11-16T${String(hour).padStart(2, '0')}:00:00+00:00`

  it('splits Main story, Your adventures, Completed, and Archived (D12)', () => {
    const rows = [
      summary({ id: 'main-old', type: 'main', visibility: 'campaign', updated_at: at(1) }),
      summary({ id: 'main-new', type: 'main', visibility: 'campaign', updated_at: at(9) }),
      summary({ id: 'main-done', type: 'main', status: 'completed', updated_at: at(5) }),
      summary({ id: 'hold', status: 'on_hold', updated_at: at(8) }),
      summary({ id: 'pending-new', type: 'side', status: 'pending', updated_at: at(7) }),
      summary({ id: 'pending-old', status: 'pending', updated_at: at(2) }),
      summary({ id: 'going', status: 'in_progress', updated_at: at(3) }),
      summary({ id: 'done', status: 'completed', updated_at: at(6) }),
      summary({ id: 'archived', archived_at: at(4), status: 'in_progress', updated_at: at(4) }),
    ]
    const groups = groupAdventures(rows, userId)
    expect(groups.mainStory.map((row) => row.id)).toEqual(['main-new', 'main-old'])
    expect(groups.yours.map((row) => row.id)).toEqual([
      'going',
      'pending-new',
      'pending-old',
      'hold',
    ])
    expect(groups.completed.map((row) => row.id)).toEqual(['done', 'main-done'])
    expect(groups.archived.map((row) => row.id)).toEqual(['archived'])
  })

  it('shows archived adventures only to their creator', () => {
    const theirs = summary({ id: 'x', created_by: miraId, archived_at: '2026-11-16T10:00:00Z' })
    expect(groupAdventures([theirs], userId).archived).toEqual([])
    expect(groupAdventures([theirs], miraId).archived).toHaveLength(1)
  })

  it('returns four empty groups for no adventures', () => {
    expect(groupAdventures([], userId)).toEqual({
      mainStory: [],
      yours: [],
      completed: [],
      archived: [],
    })
  })
})

describe('small helpers', () => {
  it('counts objectives done out of total', () => {
    expect(objectiveProgress([])).toEqual({ done: 0, total: 0 })
    expect(objectiveProgress([{ done: true }, { done: false }, { done: true }])).toEqual({
      done: 2,
      total: 3,
    })
  })

  it('lets only the creator archive, and only personal and side adventures change type', () => {
    expect(canArchive({ created_by: userId }, userId)).toBe(true)
    expect(canArchive({ created_by: miraId }, userId)).toBe(false)
    expect(isArchived({ archived_at: null })).toBe(false)
    expect(isArchived({ archived_at: '2026-11-16T10:00:00Z' })).toBe(true)
    expect(selectableTypes('main')).toEqual(['main'])
    expect(selectableTypes('personal')).toEqual(['personal', 'side'])
    expect(selectableTypes('side')).toEqual(['personal', 'side'])
  })

  it('merges a written row onto a detail without touching its children', () => {
    const detail = adventure({ id: 'a1', objectives: [objective()] })
    const { participants: _p, objectives: _o, updates: _u, ...row } = detail
    void [_p, _o, _u]
    const merged = mergeAdventure(detail, { ...row, status: 'completed' })
    expect(merged.status).toBe('completed')
    expect(merged.objectives).toBe(detail.objectives)
  })
})

describe('characters', () => {
  const characters = [
    { id: 'c1', name: 'Brindle', owner_id: userId, status: 'retired' as const },
    { id: 'c2', name: 'Tess', owner_id: userId, status: 'active' as const },
    { id: 'c3', name: 'Orrin', owner_id: miraId, status: 'active' as const },
  ]

  it('offers only the viewer’s own characters, whatever their status', () => {
    expect(ownCharacters(characters, userId).map((row) => row.id)).toEqual(['c1', 'c2'])
  })

  it('defaults to the viewer’s active character, else to nothing', () => {
    expect(defaultCharacterId(characters, userId)).toBe('c2')
    expect(defaultCharacterId(characters.slice(0, 1), userId)).toBeNull()
    expect(defaultCharacterId([], userId)).toBeNull()
  })

  it('names a participant’s character, or "A character" when it cannot be seen', () => {
    expect(adventureCharacterName('c2', characters)).toBe('Tess')
    expect(adventureCharacterName('unknown', characters)).toBe('A character')
    expect(
      adventureCharacterNames(
        { participants: [{ character_id: 'c1' }, { character_id: 'zz' }] },
        characters,
      ),
    ).toEqual(['Brindle', 'A character'])
  })
})

describe('attribution', () => {
  it('says who last edited an adventure', () => {
    const base = { updated_at: '2026-11-16T10:00:00Z' }
    expect(adventureEditedLabel({ ...base, updated_by: userId }, userId, roster, now)).toBe(
      'Edited by you, 2 hours ago',
    )
    expect(adventureEditedLabel({ ...base, updated_by: miraId }, userId, roster, now)).toBe(
      'Edited by Mira, 2 hours ago',
    )
    expect(adventureEditedLabel({ ...base, updated_by: 'gone' }, userId, roster, now)).toBe(
      'Edited by A former member, 2 hours ago',
    )
    expect(adventureEditedLabel({ ...base, updated_by: null }, userId, roster, now)).toBe(
      'Edited 2 hours ago',
    )
  })

  it('says who last changed the status, and nothing before the first change', () => {
    const base = { status: 'completed' as const, status_changed_at: '2026-11-14T12:00:00Z' }
    expect(adventureStatusLabel({ ...base, status_changed_by: miraId }, userId, roster, now)).toBe(
      'Completed by Mira, 2 days ago',
    )
    expect(
      adventureStatusLabel(
        { ...base, status: 'on_hold', status_changed_by: userId },
        userId,
        roster,
        now,
      ),
    ).toBe('Put on hold by you, 2 days ago')
    expect(adventureStatusLabel({ ...base, status_changed_by: null }, userId, roster, now)).toBe(
      'Completed 2 days ago',
    )
    expect(
      adventureStatusLabel(
        { status: 'pending', status_changed_at: null, status_changed_by: null },
        userId,
        roster,
        now,
      ),
    ).toBeNull()
  })

  it('says who ticked an objective', () => {
    const done = { done: true, completed_at: '2026-11-16T11:00:00Z' }
    expect(objectiveDoneLabel({ ...done, completed_by: miraId }, userId, roster, now)).toBe(
      'Done by Mira, 1 hour ago',
    )
    expect(objectiveDoneLabel({ ...done, completed_by: null }, userId, roster, now)).toBe(
      'Done 1 hour ago',
    )
    expect(
      objectiveDoneLabel(
        { done: false, completed_by: null, completed_at: null },
        userId,
        roster,
        now,
      ),
    ).toBeNull()
  })

  it('names an update’s author', () => {
    expect(updateAuthorLabel(userId, userId, roster)).toBe('You')
    expect(updateAuthorLabel(miraId, userId, roster)).toBe('Mira')
    expect(updateAuthorLabel('gone', userId, roster)).toBe('A former member')
  })
})
