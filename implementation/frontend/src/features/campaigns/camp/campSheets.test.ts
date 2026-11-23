import { describe, expect, it } from 'vitest'
import { character } from '../../characters/characterTestData'
import type { RosterMember } from './campLayout'
import { partyFigures } from './campParty'
import { partyCharacterOf, sharedSheetMarkers, sheetMarkerLabel } from './campSheets'

const member = (index: number, role = 'member') =>
  ({
    profile_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    role,
    username: `player_${index}`,
  }) satisfies RosterMember

const owner = member(1, 'owner')
const guest = member(2)
const { figures } = partyFigures([owner, guest])

const shared = (profile: RosterMember, id: string, overrides = {}) =>
  character({
    id,
    owner_id: profile.profile_id,
    name: `Hero ${id}`,
    sheet_visibility: 'campaign',
    ...overrides,
  })

describe('partyCharacterOf', () => {
  it('finds the active, in-party character of a member, and no one else', () => {
    const mine = shared(guest, 'a')
    expect(partyCharacterOf([mine], guest.profile_id)).toBe(mine)
    expect(partyCharacterOf([mine], owner.profile_id)).toBeUndefined()
    expect(partyCharacterOf([{ ...mine, in_party: false }], guest.profile_id)).toBeUndefined()
    expect(partyCharacterOf([{ ...mine, status: 'retired' }], guest.profile_id)).toBeUndefined()
  })
})

describe('sharedSheetMarkers', () => {
  it('marks only seated players whose party character shares their sheet', () => {
    const markers = sharedSheetMarkers(figures, [
      shared(owner, 'a', { sheet_visibility: 'private' }),
      shared(guest, 'b'),
    ])
    expect(markers).toEqual([
      {
        profileId: guest.profile_id,
        characterId: 'b',
        characterName: 'Hero b',
        x: figures[1].x,
        y: figures[1].y,
      },
    ])
  })

  it('shows nothing when no sheet is shared, and none comes back once it is private again', () => {
    expect(sharedSheetMarkers(figures, [])).toEqual([])
    const characters = [shared(owner, 'a'), shared(guest, 'b')]
    expect(sharedSheetMarkers(figures, characters)).toHaveLength(2)
    expect(
      sharedSheetMarkers(figures, [
        { ...characters[0], sheet_visibility: 'private' },
        { ...characters[1], sheet_visibility: 'private' },
      ]),
    ).toEqual([])
  })

  it('ignores shared sheets of characters that are not in the party or not active', () => {
    expect(
      sharedSheetMarkers(figures, [
        shared(owner, 'a', { in_party: false }),
        shared(guest, 'b', { status: 'deceased', in_party: false }),
      ]),
    ).toEqual([])
  })

  it('ignores characters of players without a seat', () => {
    expect(sharedSheetMarkers(figures, [shared(member(9), 'z')])).toEqual([])
  })
})

describe('sheetMarkerLabel', () => {
  it('names the character in words', () => {
    expect(sheetMarkerLabel({ characterName: 'Brand' })).toBe("View Brand's shared sheet")
  })
})
