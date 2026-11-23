// Which seated adventurers have shared their character sheet with the party. Pure, so the rule
// can be tested without a canvas. It reads only the characters the signed-in member's own query
// returned: row-level security already limits that list to what this member may see, and
// `sheet_visibility = 'campaign'` is exactly what lets members read the sheet (the same rule
// the Party journal's "View sheet" button follows).

import type { CharacterSummary } from '../../characters/characterTypes'
import type { PartyFigure } from './campParty'

/** The character a member brings to the party: active and opted in (at most one). */
export function partyCharacterOf(characters: readonly CharacterSummary[], profileId: string) {
  return characters.find(
    (character) =>
      character.owner_id === profileId && character.status === 'active' && character.in_party,
  )
}

export type SheetMarker = {
  /** The seated member's profile id, the marker's stable key. */
  profileId: string
  characterId: string
  characterName: string
  /** The seat's foot in panorama pixels, where the bedroll lies. */
  x: number
  y: number
}

/** One marker per seated member whose party character has shared their sheet. */
export function sharedSheetMarkers(
  figures: readonly PartyFigure[],
  characters: readonly CharacterSummary[],
): SheetMarker[] {
  const markers: SheetMarker[] = []
  for (const figure of figures) {
    const character = partyCharacterOf(characters, figure.id)
    if (character?.sheet_visibility !== 'campaign') continue
    markers.push({
      profileId: figure.id,
      characterId: character.id,
      characterName: character.name,
      x: figure.x,
      y: figure.y,
    })
  }
  return markers
}

/** The accessible name of a marker's button. */
export function sheetMarkerLabel(marker: Pick<SheetMarker, 'characterName'>) {
  return `View ${marker.characterName}'s shared sheet`
}
