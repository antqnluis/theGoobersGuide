import { describe, expect, it } from 'vitest'
import { filterNpcs, groupNpcs, npcSubtitle, sortNpcs, summarizeNpc } from './npcRules'
import { npc } from './npcTestData'

describe('npc rules', () => {
  it('sorts newest edit first with a stable tie-break', () => {
    const a = npc({ updated_at: '2026-11-24T10:00:00+00:00' })
    const b = npc({ updated_at: '2026-11-24T12:00:00+00:00' })
    expect(sortNpcs([a, b]).map((row) => row.id)).toEqual([b.id, a.id])
  })

  it('filters by name, role, or location, ignoring case', () => {
    const rows = [
      npc({ name: 'Brenna', role: 'Innkeeper', location: 'Stag' }),
      npc({ name: 'Orin', role: 'Smith', location: 'Harbor' }),
    ]
    expect(filterNpcs(rows, 'inn')).toHaveLength(1)
    expect(filterNpcs(rows, 'HARBOR')[0].name).toBe('Orin')
    expect(filterNpcs(rows, '  ')).toHaveLength(2)
    expect(filterNpcs(rows, 'nobody')).toHaveLength(0)
  })

  it('groups shared entries apart from private ones', () => {
    const shared = npc({ visibility: 'campaign' })
    const mine = npc({ visibility: 'private' })
    const groups = groupNpcs([mine, shared])
    expect(groups.shared).toEqual([shared])
    expect(groups.onlyYou).toEqual([mine])
  })

  it('joins the role and location, skipping blanks', () => {
    expect(npcSubtitle({ role: 'Innkeeper', location: 'Stag' })).toBe('Innkeeper · Stag')
    expect(npcSubtitle({ role: '', location: 'Stag' })).toBe('Stag')
    expect(npcSubtitle({ role: '', location: '' })).toBe('')
  })

  it('drops the body when summarizing', () => {
    expect(summarizeNpc(npc())).not.toHaveProperty('body')
  })
})
