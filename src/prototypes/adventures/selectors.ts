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

export function acceptedOwnedCharacters(
  state: PreviewState,
  adventure: Adventure,
) {
  return ownedCharacters(state.viewerId, state.campaignId).filter((character) =>
    adventure.participantCharacterIds.includes(character.id),
  );
}

export function activeRequest(state: PreviewState, adventureId: string) {
  return state.requests.find(
    (request) =>
      request.adventureId === adventureId &&
      (request.status === 'approving' || request.status === 'invited'),
  );
}

// Deliberately return no thread ID, title, proposer, or other private metadata.
export function invitationInbox(state: PreviewState) {
  return state.requests
    .filter(
      (request) =>
        request.kind === 'invite' &&
        request.status === 'invited' &&
        request.campaignId === state.campaignId &&
        ownedCharacters(state.viewerId, state.campaignId).some(
          (character) => character.id === request.targetCharacterId,
        ) &&
        state.adventures.some(
          (adventure) =>
            adventure.id === request.adventureId &&
            adventure.campaignId === state.campaignId &&
            adventure.membershipRevision === request.membershipRevision,
        ),
    )
    .map((request) => ({
      requestId: request.id,
      characterId: request.targetCharacterId,
    }));
}
