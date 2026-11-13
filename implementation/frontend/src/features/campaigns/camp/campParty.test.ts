import { describe, expect, it } from 'vitest'
import { bedrollSeats, bedrolls, firePit, partySeats, wagon, type RosterMember } from './campLayout'
import { figureSize, outlineTargets, partyFigures, spriteIdFor } from './campParty'

const member = (index: number, role = 'member', username: string | null = `player_${index}`) =>
  ({
    profile_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    role,
    username,
  }) satisfies RosterMember

describe('partyFigures', () => {
  it('draws no one for an empty roster, as while loading or after an error', () => {
    expect(partyFigures([])).toEqual({ figures: [], overflow: 0 })
  })

  it('seats the owner first with real names and a seeded look per profile', () => {
    const roster = [member(2), member(1, 'owner', 'game_master'), member(3, 'member', null)]
    const { figures, overflow } = partyFigures(roster)
    expect(overflow).toBe(0)
    expect(figures.map(({ label }) => label)).toEqual(['game_master', 'player_2', 'Player'])
    expect(figures[0].id).toBe(roster[1].profile_id)
    expect(figures.map(({ x, y }) => ({ x, y }))).toEqual(partySeats.slice(0, 3))
    expect(figures[0].spriteId).toBe(spriteIdFor(figures[0].look))
    expect(partyFigures(roster).figures).toEqual(figures)
  })

  it('labels an owner without a username as the campaign owner', () => {
    expect(partyFigures([member(1, 'owner', null)]).figures[0].label).toBe('Campaign owner')
  })

  it('seats ten of 32 members and counts the rest', () => {
    const roster = Array.from({ length: 32 }, (_, index) => member(index))
    const { figures, overflow } = partyFigures(roster)
    expect(figures).toHaveLength(partySeats.length)
    expect(new Set(figures.map(({ id }) => id)).size).toBe(partySeats.length)
    expect(overflow).toBe(32 - partySeats.length)
  })

  it('faces every figure toward the fire', () => {
    const { figures } = partyFigures(Array.from({ length: 10 }, (_, index) => member(index)))
    for (const figure of figures) expect(figure.flip).toBe(figure.x > firePit.x)
    expect(figures.some(({ flip }) => flip)).toBe(true)
    expect(figures.some(({ flip }) => !flip)).toBe(true)
  })

  it('draws figures on bedrolls after them and the rest at their own depth', () => {
    const { figures } = partyFigures(Array.from({ length: 10 }, (_, index) => member(index)))
    figures.slice(0, bedrollSeats).forEach((figure, index) => {
      expect(figure.depth).toBe(bedrolls[index].y)
    })
    for (const figure of figures.slice(bedrollSeats)) expect(figure.depth).toBe(figure.y)
  })

  it('keeps every seat clear of the fire pit so nobody is hidden behind it', () => {
    const pitHalf = 28
    for (const seat of partySeats.slice(bedrollSeats)) {
      expect(Math.abs(seat.x - firePit.x) - 8).toBeGreaterThanOrEqual(pitHalf)
    }
  })
})

describe('party seats', () => {
  it('never put two sprites on top of each other', () => {
    for (const [index, seat] of partySeats.entries()) {
      for (const other of partySeats.slice(index + 1)) {
        const apart = Math.abs(seat.x - other.x) >= figureSize.width
        const stacked = Math.abs(seat.y - other.y) >= figureSize.height
        expect(apart || stacked, `${seat.x},${seat.y} and ${other.x},${other.y}`).toBe(true)
      }
    }
  })
})

describe('outlineTargets', () => {
  const { figures } = partyFigures([member(1), member(2)])

  it('outlines the object behind each destination', () => {
    expect(outlineTargets('overview', figures)).toEqual(new Set([firePit.id]))
    expect(outlineTargets('settings', figures)).toEqual(new Set([wagon.id]))
    expect(outlineTargets(null, figures).size).toBe(0)
  })

  it('outlines every bedroll and seated figure for the party', () => {
    const targets = outlineTargets('party', figures)
    for (const roll of bedrolls) expect(targets.has(roll.id)).toBe(true)
    for (const figure of figures) expect(targets.has(figure.spriteId)).toBe(true)
  })
})
