import type { CharacterSummary } from '../characters/characterTypes'

/** The viewer's own characters, the active one first, then the rest by name. */
export function ownCharacters(characters: readonly CharacterSummary[], userId: string) {
  return characters
    .filter((character) => character.owner_id === userId)
    .toSorted(
      (a, b) =>
        Number(b.status === 'active') - Number(a.status === 'active') ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
}
