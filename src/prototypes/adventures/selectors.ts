import { characters } from './fixtures';
import type { Adventure, PreviewState } from './model';

export function ownedCharacters(viewerId: string, campaignId: string) {
  return characters.filter(
    (character) =>
      character.ownerId === viewerId && character.campaignId === campaignId,
  );
}
export function canAccess(
  adventure: Adventure,
  viewerId: string,
  campaignId: string,
): boolean {
  return (
    adventure.campaignId === campaignId &&
    adventure.participantCharacterIds.some((id) =>
      characters.some(
        (character) =>
          character.id === id &&
          character.ownerId === viewerId &&
          character.campaignId === campaignId,
      ),
    )
  );
}
export function visibleAdventures(state: PreviewState): Adventure[] {
  return state.adventures.filter((adventure) =>
    canAccess(adventure, state.viewerId, state.campaignId),
  );
}
export function accessibleAdventure(
  state: PreviewState,
  id: string,
): Adventure | undefined {
  return visibleAdventures(state).find((adventure) => adventure.id === id);
}
