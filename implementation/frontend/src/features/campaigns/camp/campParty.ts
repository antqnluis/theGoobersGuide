// Turns the real roster into the figures drawn around the fire. Pure, so seating,
// facing, and draw order can be tested without a canvas.

import { adventurerAppearance, type AdventurerAppearance } from './adventurerAppearance'
import { adventurerSize } from './adventurerSprites'
import { bedrollSeats, firePit, seatParty, wagon, bedrolls, type RosterMember } from './campLayout'

export type PartyFigure = {
  /** Profile id, the stable key for the figure and its label. */
  id: string
  /** Image id of the finished sprite; members who look alike share one. */
  spriteId: string
  look: AdventurerAppearance
  /** Where the figure sits, bottom centre, in panorama pixels. */
  x: number
  y: number
  /** Back-to-front order against props: a figure on a bedroll draws after it. */
  depth: number
  /** 0 or 1: which of the two breathing frames this member starts on. */
  phase: 0 | 1
  /** Sprites face right; those left of the fire face it, those right mirror. */
  flip: boolean
  label: string
}

/** The image id of a sprite's breathing frame: 0 is at rest, 1 is the exhale. */
export function frameSpriteId(spriteId: string, frame: number) {
  return frame === 0 ? spriteId : `${spriteId}${exhaleSuffix}`
}

export const exhaleSuffix = '~exhale'

export function baseSpriteId(id: string) {
  return id.endsWith(exhaleSuffix) ? id.slice(0, -exhaleSuffix.length) : id
}

/** A stable 0 or 1 per member, so the party never breathes in unison. */
function phaseFor(profileId: string): 0 | 1 {
  let sum = 0
  for (const character of profileId) sum += character.charCodeAt(0)
  return (sum % 2) as 0 | 1
}

export function spriteIdFor(look: AdventurerAppearance) {
  return `adventurer-${look.cloak}-${look.skin}-${look.headwear}-${look.pack}`
}

/** Up to ten real members around the fire, plus how many did not get a seat. */
export function partyFigures(roster: readonly RosterMember[]) {
  const { seated, overflow } = seatParty(roster)
  const figures: PartyFigure[] = seated.map(({ member, seat, label }, index) => {
    const look = adventurerAppearance(member.profile_id)
    return {
      id: member.profile_id,
      spriteId: spriteIdFor(look),
      look,
      phase: phaseFor(member.profile_id),
      x: seat.x,
      y: seat.y,
      // The first seats sit on bedrolls, so they draw with (and, on a tie, after) the bedroll;
      // the rest sit on bare ground behind or beside the fire.
      depth: index < bedrollSeats ? bedrolls[index].y : seat.y,
      flip: seat.x > firePit.x,
      label,
    }
  })
  return { figures, overflow }
}

export const figureSize = adventurerSize

/** Where the "+N" marker stands: between the wagon and the bedroll ring, in view at rest. */
export const overflowMarker = { x: 326, y: 250 } as const

/** Name plates need this many CSS pixels per art pixel to stay legible and apart. */
export const minNameUnit = 2

/** Image ids of the objects that make up a destination, for its outline. */
export function outlineTargets(
  location: 'overview' | 'party' | 'settings' | null,
  figures: readonly PartyFigure[],
): Set<string> {
  if (location === 'overview') return new Set([firePit.id])
  if (location === 'settings') return new Set([wagon.id])
  if (location === 'party') {
    return new Set([...bedrolls.map(({ id }) => id), ...figures.map(({ spriteId }) => spriteId)])
  }
  return new Set()
}
