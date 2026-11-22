import { describe, expect, it } from 'vitest'
import { buildGalaxy, minPlanets } from './galaxyModel'
import type { CampaignListItem } from './campaignTypes'

function campaign(index: number): CampaignListItem {
  return {
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    owner_id: '00000000-0000-4000-8000-0000000000aa',
    name: `Campaign ${index + 1}`,
    description: null,
    // Oldest first by index.
    created_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    role: 'owner',
  }
}

const campaigns = (count: number) => Array.from({ length: count }, (_, index) => campaign(index))
const assignedInOrder = (list: CampaignListItem[]) =>
  list.map((item, slot) => ({ campaign_id: item.id, slot }))
const claimed = (galaxy: ReturnType<typeof buildGalaxy>) =>
  galaxy.filter(({ campaign: occupant }) => occupant !== null).length
const layout = (galaxy: ReturnType<typeof buildGalaxy>) =>
  galaxy.map(({ campaign: occupant }) => occupant?.name ?? null)

describe('buildGalaxy', () => {
  it('always has at least six planets, and one per campaign beyond that', () => {
    for (const [count, planets] of [
      [0, 6],
      [1, 6],
      [3, 6],
      [6, 6],
      [7, 7],
      [10, 10],
    ] as const) {
      const list = campaigns(count)
      const galaxy = buildGalaxy(list, assignedInOrder(list))
      expect(galaxy, `${count} campaigns`).toHaveLength(planets)
      expect(claimed(galaxy)).toBe(count)
      expect(galaxy.map(({ slot }) => slot)).toEqual(Array.from({ length: planets }, (_, i) => i))
    }
    expect(minPlanets).toBe(6)
  })

  it('puts each campaign on the planet its assignment names', () => {
    const [first, second, third] = campaigns(3)
    const galaxy = buildGalaxy(
      [third, first, second],
      [
        { campaign_id: first.id, slot: 4 },
        { campaign_id: second.id, slot: 0 },
        { campaign_id: third.id, slot: 2 },
      ],
    )
    expect(layout(galaxy)).toEqual(['Campaign 2', null, 'Campaign 3', null, 'Campaign 1', null])
  })

  it('keeps gaps, and grows to the outermost planet in use', () => {
    const [first, second] = campaigns(2)
    const galaxy = buildGalaxy(
      [first, second],
      [
        { campaign_id: first.id, slot: 1 },
        { campaign_id: second.id, slot: 8 },
      ],
    )
    expect(galaxy).toHaveLength(9)
    expect(layout(galaxy)).toEqual([
      null,
      'Campaign 1',
      null,
      null,
      null,
      null,
      null,
      null,
      'Campaign 2',
    ])
  })

  it('shrinks back when the outermost planet is released', () => {
    const [first, second] = campaigns(2)
    const both = [
      { campaign_id: first.id, slot: 0 },
      { campaign_id: second.id, slot: 8 },
    ]
    expect(buildGalaxy([first, second], both)).toHaveLength(9)
    expect(buildGalaxy([first], both)).toHaveLength(6)
  })

  it('ignores assignments for campaigns that are no longer listed', () => {
    const [first] = campaigns(1)
    const galaxy = buildGalaxy(
      [first],
      [
        { campaign_id: first.id, slot: 2 },
        { campaign_id: 'a-departed-campaign', slot: 3 },
        { campaign_id: 'another-departed-campaign', slot: 12 },
      ],
    )
    expect(galaxy).toHaveLength(6)
    expect(claimed(galaxy)).toBe(1)
    expect(galaxy[2].campaign?.id).toBe(first.id)
  })

  it('places a listed campaign without an assignment on the lowest free planet', () => {
    const [first, second, third] = campaigns(3)
    const galaxy = buildGalaxy(
      [first, second, third],
      [
        { campaign_id: first.id, slot: 0 },
        { campaign_id: third.id, slot: 2 },
      ],
    )
    expect(layout(galaxy).slice(0, 4)).toEqual(['Campaign 1', 'Campaign 2', 'Campaign 3', null])
  })

  it('places several unassigned campaigns oldest first, after the assigned ones', () => {
    const list = campaigns(4)
    const galaxy = buildGalaxy(list, [{ campaign_id: list[3].id, slot: 0 }])
    expect(layout(galaxy).slice(0, 5)).toEqual([
      'Campaign 4',
      'Campaign 1',
      'Campaign 2',
      'Campaign 3',
      null,
    ])
  })

  it('falls back to oldest-first slots when assignments are missing or failed to load', () => {
    const list = campaigns(4)
    const expected = ['Campaign 1', 'Campaign 2', 'Campaign 3', 'Campaign 4', null, null]
    expect(layout(buildGalaxy([...list].reverse(), undefined))).toEqual(expected)
    expect(layout(buildGalaxy([...list].reverse(), null))).toEqual(expected)
    expect(layout(buildGalaxy([...list].reverse(), []))).toEqual(expected)
  })

  it('keeps the older campaign in place when two claim one planet, and never drops either', () => {
    const [older, newer] = campaigns(2)
    const galaxy = buildGalaxy(
      [newer, older],
      [
        { campaign_id: newer.id, slot: 1 },
        { campaign_id: older.id, slot: 1 },
      ],
    )
    expect(layout(galaxy).slice(0, 3)).toEqual(['Campaign 2', 'Campaign 1', null])
    expect(claimed(galaxy)).toBe(2)
  })

  it('treats a negative or fractional slot as unassigned', () => {
    const [first, second] = campaigns(2)
    const galaxy = buildGalaxy(
      [first, second],
      [
        { campaign_id: first.id, slot: -1 },
        { campaign_id: second.id, slot: 1.5 },
      ],
    )
    expect(layout(galaxy).slice(0, 3)).toEqual(['Campaign 1', 'Campaign 2', null])
  })

  it('handles an account with no campaign data yet', () => {
    expect(buildGalaxy(undefined, undefined)).toHaveLength(6)
    expect(claimed(buildGalaxy(undefined, undefined))).toBe(0)
  })
})
