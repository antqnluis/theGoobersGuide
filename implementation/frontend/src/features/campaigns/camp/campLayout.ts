/** Size of the authored panorama in base art pixels. */
export const panorama = { width: 960, height: 270 } as const

export type CampLocationId = 'overview' | 'party' | 'characters' | 'settings'

export type CampLocation = {
  id: CampLocationId
  /** Accessible name of the destination, also the dialog's section. */
  label: string
  /** Name of the object in the scene, appended in the Places list. */
  place: string
  /** Where the object stands: bottom centre, in base art pixels from the panorama's top left. */
  world: { x: number; y: number }
  /** Size of the object's click target in base art pixels, standing on `world`. */
  hit: { width: number; height: number }
  /**
   * Where the label plate sits: above or below the object, centred or at its
   * right end, or beside its left edge at ground level.
   */
  plate: 'above' | 'below' | 'left'
  plateAlign: 'center' | 'end'
  ownerOnly: boolean
}

/** The one table that drives scene buttons, the Places list, and panel gating. */
export const campLocations: readonly CampLocation[] = [
  {
    id: 'overview',
    label: 'Overview',
    place: 'Campfire',
    world: { x: 480, y: 244 },
    hit: { width: 56, height: 60 },
    plate: 'above',
    plateAlign: 'center',
    ownerOnly: false,
  },
  {
    id: 'party',
    label: 'Party',
    place: 'Bedroll circle',
    world: { x: 480, y: 262 },
    hit: { width: 200, height: 44 },
    // Beside the ring's left edge: above it, the plate would cover the sprites and their names.
    plate: 'left',
    plateAlign: 'center',
    ownerOnly: false,
  },
  {
    id: 'characters',
    label: 'My characters',
    place: 'Tent',
    // The tent's spot, and its 50×35 sprite at `tent.scale` (1.3), rounded to whole art pixels.
    world: { x: 280, y: 244 },
    hit: { width: 65, height: 46 },
    plate: 'above',
    plateAlign: 'center',
    ownerOnly: false,
  },
  {
    id: 'settings',
    label: 'Campaign settings',
    place: 'Steward’s wagon',
    world: { x: 170, y: 240 },
    hit: { width: 104, height: 80 },
    plate: 'above',
    plateAlign: 'center',
    ownerOnly: true,
  },
]

export function availableLocations(isOwner: boolean): CampLocation[] {
  return campLocations.filter(({ ownerOnly }) => !ownerOnly || isOwner)
}

/** Resolve a selection to a location the viewer may open, or null. */
export function resolveLocation(id: CampLocationId | null, isOwner: boolean): CampLocation | null {
  if (!id) return null
  return availableLocations(isOwner).find((location) => location.id === id) ?? null
}

/** Owner-only objects stay parked, unlabeled scenery for everyone else. */
export function parkedLocations(isOwner: boolean): CampLocation[] {
  return campLocations.filter(({ ownerOnly }) => ownerOnly && !isOwner)
}

/**
 * The panorama column the resting camera centres on: midway across the three
 * destinations, so a desktop view shows the wagon, the fire, and the bedrolls.
 */
export const restFocusX = 384

/** Static scenery drawn at fixed spots, never labeled or focusable. */
export type CampProp = {
  id: string
  x: number
  y: number
  flip?: boolean
  /** Draws the sprite this many times its size, to whole art pixels (default 1). */
  scale?: number
}

export const dormantProps: readonly CampProp[] = [
  { id: 'map-table', x: 690, y: 242 },
  { id: 'journal-crates', x: 770, y: 244 },
]

/** Where the high-road waystone stands, a pointer shortcut back to the galaxy. */
export const waystone: CampProp = { id: 'waystone', x: 880, y: 252 }

/** The waystone's click target in base art pixels, standing on its spot (the sprite is 44×60). */
export const waystoneHit = { width: 44, height: 60 } as const

/** The player's tent, the "My characters" destination, drawn a little larger than its 50×35 sprite. */
export const tent: CampProp = { id: 'empty-tent', x: 280, y: 244, scale: 1.3 }

/** The steward's wagon, a destination for owners and parked scenery for members. */
export const wagon: CampProp = { id: 'wagon', x: 170, y: 240 }

/** The stone-ringed fire pit; the flame itself is drawn in code. */
export const firePit: CampProp = { id: 'firepit', x: 480, y: 244 }

/** Six bedrolls in a ring around the fire, facing it. */
export const bedrolls: readonly CampProp[] = [
  { id: 'bedroll-red', x: 440, y: 260 },
  { id: 'bedroll-blue', x: 520, y: 260, flip: true },
  { id: 'bedroll-green', x: 410, y: 256 },
  { id: 'bedroll-purple', x: 550, y: 256, flip: true },
  { id: 'bedroll-gold', x: 380, y: 252 },
  { id: 'bedroll-cream', x: 580, y: 252, flip: true },
]

/**
 * How many seats, from the first, sit on a bedroll. The sixth bedroll (the
 * rightmost) is half hidden behind the foreground bushes at a desktop view, so
 * nobody sits there and it stays an empty bedroll.
 */
export const bedrollSeats = 5

/**
 * Seats around the fire, ordered so a small party fills the front row first.
 * Each of the first five sits in the body of its bedroll, a few pixels toward the
 * side away from the rolled end and low enough that the legs rest on the mat.
 * The back seats flank the fire pit rather than sitting behind it, where the
 * pit would hide them, and stay inside the foreground trees at the view's edge.
 * Neighbouring seats are at least 30 pixels apart so name plates can sit above.
 */
export const partySeats = [
  { x: 445, y: 252 },
  { x: 515, y: 252 },
  { x: 415, y: 248 },
  { x: 545, y: 248 },
  { x: 385, y: 244 },
  { x: 396, y: 222 },
  { x: 428, y: 222 },
  { x: 532, y: 222 },
  { x: 350, y: 236 },
  { x: 566, y: 220 },
] as const

export type RosterMember = {
  profile_id: string
  role: string
  username: string | null
  display_name?: string | null
}

export type SeatedMember = {
  member: RosterMember
  seat: (typeof partySeats)[number]
  label: string
}

export function memberLabel(member: RosterMember) {
  return member.username || (member.role === 'owner' ? 'Campaign owner' : 'Player')
}

/**
 * Seats up to ten real roster members around the fire. The owner sits first and
 * the rest follow in profile order, so seating is stable between loads. The
 * remainder is reported as a count for the "+N" marker.
 */
export function seatParty(roster: readonly RosterMember[]) {
  const ordered = roster.toSorted(
    (first, second) =>
      Number(second.role === 'owner') - Number(first.role === 'owner') ||
      first.profile_id.localeCompare(second.profile_id),
  )
  const seated: SeatedMember[] = ordered.slice(0, partySeats.length).map((member, index) => ({
    member,
    seat: partySeats[index],
    label: memberLabel(member),
  }))
  return { seated, overflow: Math.max(0, ordered.length - partySeats.length) }
}
