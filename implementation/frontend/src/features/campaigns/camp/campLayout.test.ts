import { describe, expect, it } from 'vitest'
import {
  availableLocations,
  campLocations,
  bedrolls,
  dormantProps,
  firePit,
  memberLabel,
  panorama,
  parkedLocations,
  partySeats,
  resolveLocation,
  seatParty,
  tent,
  wagon,
  waystone,
  type RosterMember,
} from './campLayout'

const member = (
  index: number,
  role = 'member',
  username: string | null = `p${index}`,
): RosterMember => ({
  profile_id: `profile-${String(index).padStart(3, '0')}`,
  role,
  username,
})

describe('owner gating', () => {
  it('offers the wagon to owners only', () => {
    expect(availableLocations(true).map(({ id }) => id)).toEqual([
      'overview',
      'party',
      'characters',
      'settings',
    ])
    expect(availableLocations(false).map(({ id }) => id)).toEqual([
      'overview',
      'party',
      'characters',
    ])
    expect(parkedLocations(false).map(({ id }) => id)).toEqual(['settings'])
    expect(parkedLocations(true)).toEqual([])
  })

  it('refuses to resolve an owner-only destination for a member', () => {
    expect(resolveLocation('settings', false)).toBeNull()
    expect(resolveLocation('settings', true)?.id).toBe('settings')
    expect(resolveLocation(null, true)).toBeNull()
  })
})

describe('layout table', () => {
  it('places every destination, seat, and prop inside the panorama', () => {
    const points = [
      ...campLocations.map(({ world }) => world),
      ...partySeats,
      ...[wagon, tent, firePit, waystone, ...bedrolls, ...dormantProps],
    ]
    for (const { x, y } of points) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(panorama.width)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(panorama.height)
    }
  })

  it('swaps the tent and the wagon: the tent stands where the wagon did, and the wagon where the tent did', () => {
    expect([tent.x, tent.y]).toEqual([280, 244])
    expect([wagon.x, wagon.y]).toEqual([170, 240])
    expect(campLocations.find(({ id }) => id === 'settings')?.world).toEqual({
      x: wagon.x,
      y: wagon.y,
    })
  })

  it('has unique seats and no dormant prop that is a destination', () => {
    expect(new Set(partySeats.map(({ x, y }) => `${x},${y}`)).size).toBe(partySeats.length)
    expect(dormantProps.map(({ id }) => id)).not.toContain('settings')
  })

  it('makes the tent a destination for everyone, with a target that covers its larger sprite', () => {
    const location = campLocations.find(({ id }) => id === 'characters')
    expect(location).toMatchObject({
      label: 'My characters',
      place: 'Tent',
      world: { x: tent.x, y: tent.y },
      hit: { width: Math.round(50 * tent.scale!), height: Math.round(35 * tent.scale!) },
      ownerOnly: false,
    })
    expect(tent.scale).toBeGreaterThan(1)
    expect(tent.id).toBe('empty-tent')
    expect(dormantProps.map(({ id }) => id)).not.toContain('empty-tent')
    expect(resolveLocation('characters', false)?.id).toBe('characters')
  })
})

describe('seatParty', () => {
  it('seats nobody for an empty roster', () => {
    expect(seatParty([])).toEqual({ seated: [], overflow: 0 })
  })

  it('seats the owner first, then members in profile order', () => {
    const { seated } = seatParty([member(3), member(1), member(2, 'owner'), member(0)])
    expect(seated.map(({ member: { profile_id } }) => profile_id)).toEqual([
      'profile-002',
      'profile-000',
      'profile-001',
      'profile-003',
    ])
    expect(seated[0].seat).toEqual(partySeats[0])
  })

  it('caps at ten seats and counts the overflow of a 32-member roster', () => {
    const roster = Array.from({ length: 32 }, (_, index) => member(index))
    const { seated, overflow } = seatParty(roster)
    expect(seated).toHaveLength(10)
    expect(overflow).toBe(22)
    expect(new Set(seated.map(({ seat }) => seat)).size).toBe(10)
  })

  it('does not mutate its input', () => {
    const roster = [member(2), member(1)]
    seatParty(roster)
    expect(roster.map(({ profile_id }) => profile_id)).toEqual(['profile-002', 'profile-001'])
  })

  it('labels members the way the Party panel does', () => {
    expect(memberLabel(member(1, 'member', 'ada'))).toBe('ada')
    expect(memberLabel(member(1, 'member', null))).toBe('Player')
    expect(memberLabel(member(1, 'owner', null))).toBe('Campaign owner')
    expect(memberLabel(member(1, 'member', ''))).toBe('Player')
  })
})
