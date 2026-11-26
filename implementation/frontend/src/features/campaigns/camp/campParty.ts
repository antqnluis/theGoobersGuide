// Turns the real roster into the figures drawn around the fire. Pure, so seating,
// facing, and draw order can be tested without a canvas.

import { adventurerAppearance, type AdventurerAppearance } from './adventurerAppearance'
import { adventurerSize } from './adventurerSprites'
import { decodeSprite, spriteFootprint, spriteTag } from './customSprite'
import {
  bedrollSeats,
  bedrolls,
  firePit,
  journalCrates,
  shrineStone,
  mapTable,
  seatParty,
  tent,
  wagon,
  type CampLocationId,
  type RosterMember,
} from './campLayout'

export type PartyFigure = {
  /** Profile id, the stable key for the figure and its label. */
  id: string
  /** Image id of the finished sprite; members who look alike share one. */
  spriteId: string
  look: AdventurerAppearance
  /** The player's own sprite (base64 RGBA), which replaces `look` when drawing. */
  custom: string | null
  /** How many art pixels the figure stands tall and wide: 16, or 24 for a 32x32 sprite. */
  size: number
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
export function partyFigures(
  roster: readonly RosterMember[],
  characterNames?: ReadonlyMap<string, string>,
  /** Looks players saved for this campaign; anyone without one keeps their default. */
  appearances?: ReadonlyMap<string, AdventurerAppearance>,
  /** Sprites players uploaded for this campaign, by profile id. */
  customSprites?: ReadonlyMap<string, string>,
) {
  const { seated, overflow } = seatParty(roster, characterNames)
  const figures: PartyFigure[] = seated.map(({ member, seat, label }, index) => {
    const look = appearances?.get(member.profile_id) ?? adventurerAppearance(member.profile_id)
    const stored = customSprites?.get(member.profile_id)
    // A stored sprite this build cannot decode falls back to the look.
    const decoded = stored ? decodeSprite(stored) : null
    const custom = stored && decoded ? stored : null
    return {
      id: member.profile_id,
      spriteId: custom ? `custom-${member.profile_id}-${spriteTag(custom)}` : spriteIdFor(look),
      look,
      custom,
      size: decoded ? spriteFootprint(decoded.size) : figureSize.width,
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
  location: CampLocationId | null,
  figures: readonly PartyFigure[],
): Set<string> {
  if (location === 'overview') return new Set([firePit.id])
  if (location === 'characters') return new Set([tent.id])
  if (location === 'settings') return new Set([wagon.id])
  if (location === 'adventures') return new Set([mapTable.id])
  if (location === 'notes') return new Set([journalCrates.id])
  if (location === 'visions') return new Set([shrineStone.id])
  if (location === 'party') {
    return new Set([...bedrolls.map(({ id }) => id), ...figures.map(({ spriteId }) => spriteId)])
  }
  return new Set()
}
