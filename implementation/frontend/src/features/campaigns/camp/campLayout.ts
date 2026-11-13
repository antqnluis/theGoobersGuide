/** Size of the authored panorama in base art pixels. */
export const panorama = { width: 960, height: 270 } as const

export type CampLocationId = 'overview' | 'party' | 'settings'

export type CampLocation = {
  id: CampLocationId
  /** Accessible name of the destination, also the dialog's section. */
  label: string
  /** Name of the object in the scene, appended in the Places list. */
  place: string
  /**
   * Anchor as [x, y] percentages of the temporary backdrop. Replaced by
   * panorama-space anchors from the art manifest when the renderer lands.
   */
  anchor: readonly [number, number]
  /**
   * Position in the panorama, in base art pixels from its top left. Provisional
   * until the approved art manifest supplies the final anchors.
   */
  world: { x: number; y: number }
  ownerOnly: boolean
}

/** The one table that drives scene buttons, the Places list, and panel gating. */
export const campLocations: readonly CampLocation[] = [
  {
    id: 'overview',
    label: 'Overview',
    place: 'Campfire',
    anchor: [19.5, 54.5],
    world: { x: 480, y: 236 },
    ownerOnly: false,
  },
  {
    id: 'party',
    label: 'Party',
    place: 'Bedroll circle',
    anchor: [41.5, 49.5],
    world: { x: 590, y: 238 },
    ownerOnly: false,
  },
  {
    id: 'settings',
    label: 'Campaign settings',
    place: 'Steward’s wagon',
    anchor: [68.2, 54],
    world: { x: 190, y: 228 },
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

/** Which side the panel docks on, opposite the destination. */
export function panelSideFor(location: CampLocation | null): 'left' | 'right' {
  return location && location.anchor[0] > 50 ? 'left' : 'right'
}

/** Owner-only objects stay parked, unlabeled scenery for everyone else. */
export function parkedLocations(isOwner: boolean): CampLocation[] {
  return campLocations.filter(({ ownerOnly }) => ownerOnly && !isOwner)
}

/** Dormant scenery reserved for later milestones: never labeled or focusable. */
export const dormantProps = [
  { id: 'map-table', world: { x: 760, y: 232 } },
  { id: 'journal-crate', world: { x: 860, y: 240 } },
  { id: 'empty-tent', world: { x: 90, y: 236 } },
] as const

/** Where the high-road waystone stands, a pointer shortcut back to the galaxy. */
export const waystone = { x: 905, y: 226 } as const

/** Seats around the fire, ordered so a small party fills the front row first. */
export const partySeats = [
  { x: 440, y: 246 },
  { x: 520, y: 246 },
  { x: 410, y: 242 },
  { x: 550, y: 242 },
  { x: 380, y: 238 },
  { x: 580, y: 238 },
  { x: 458, y: 230 },
  { x: 502, y: 230 },
  { x: 350, y: 236 },
  { x: 610, y: 236 },
] as const

export type RosterMember = { profile_id: string; role: string; username: string | null }

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
