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
  ownerOnly: boolean
}

/** The one table that drives scene buttons, the Places list, and panel gating. */
export const campLocations: readonly CampLocation[] = [
  {
    id: 'overview',
    label: 'Overview',
    place: 'Campfire',
    anchor: [19.5, 54.5],
    ownerOnly: false,
  },
  {
    id: 'party',
    label: 'Party',
    place: 'Bedroll circle',
    anchor: [41.5, 49.5],
    ownerOnly: false,
  },
  {
    id: 'settings',
    label: 'Campaign settings',
    place: 'Steward’s wagon',
    anchor: [68.2, 54],
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
