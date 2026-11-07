import type { PreviewState, SharingProposal } from './model';
import { hasParty, latestSharing, matchesMembership } from './consent';
import { accessibleAdventure, acceptedOwnedCharacters } from './selectors';
import { activityEntry } from './participation';

type SharingContext = {
  id: string;
  campaignId: string;
  viewerId: string;
  actorCharacterId: string;
  newId: string;
  now: string;
  membershipRevision: number;
};
export type SharingAction = SharingContext &
  (
    | { type: 'propose-sharing' }
    | {
        type: 'decide-sharing';
        proposalId: string;
        proposalRevision: number;
        approve: boolean;
      }
    | {
        type: 'withdraw-sharing';
        proposalId: string;
        proposalRevision: number;
      }
    | {
        type: 'cancel-sharing';
        proposalId: string;
        proposalRevision: number;
      }
  );
export type SharingInput = SharingAction extends infer A
  ? A extends SharingAction
    ? Omit<A, 'viewerId' | 'campaignId' | 'newId' | 'now'>
    : never
  : never;

export function sharingReducer(
  state: PreviewState,
  action: SharingAction,
): PreviewState {
  const reject = (
    error = 'This sharing request is unavailable. Review the current consent state.',
  ) => ({ ...state, error, feedback: null });
  const adventure = accessibleAdventure(state, action.id);
  if (
    !adventure ||
    !acceptedOwnedCharacters(state, adventure).some(
      (character) => character.id === action.actorCharacterId,
    )
  )
    return reject();
  if (action.membershipRevision !== adventure.membershipRevision)
    return reject();
  if (!hasParty(adventure.campaignId))
    return reject(
      'This campaign has no party. Keep this adventure participants only.',
    );
  if (
    state.activity.some((item) => item.id === action.newId) ||
    state.requests.some((item) => item.id === action.newId) ||
    state.sharing.some((item) => item.id === action.newId) ||
    state.adventures.some((item) => item.id === action.newId)
  )
    return reject('This preview ID is already in use. Try again.');
  const current = latestSharing(state, adventure.id);
  let proposal: SharingProposal;
  let message: string;
  if (action.type === 'propose-sharing') {
    if (current && ['Pending', 'Approved'].includes(current.status))
      return reject();
    proposal = {
      id: action.newId,
      adventureId: adventure.id,
      campaignId: adventure.campaignId,
      proposerCharacterId: action.actorCharacterId,
      actorId: state.viewerId,
      createdAt: action.now,
      updatedAt: action.now,
      revision: 0,
      membershipRevision: adventure.membershipRevision,
      participantCharacterIds: [...adventure.participantCharacterIds],
      decisions: [],
      status: 'Pending',
    };
    message =
      'Proposed sharing with the party. Every accepted character must explicitly approve.';
  } else {
    if (
      !current ||
      current.id !== action.proposalId ||
      current.revision !== action.proposalRevision ||
      !matchesMembership(current, adventure) ||
      !['Pending', 'Approved'].includes(current.status)
    )
      return reject();
    proposal = {
      ...current,
      updatedAt: action.now,
      revision: current.revision + 1,
    };
    const decision = current.decisions
      .slice()
      .reverse()
      .find((item) => item.characterId === action.actorCharacterId);
    if (action.type === 'cancel-sharing') {
      if (
        current.status !== 'Pending' ||
        current.proposerCharacterId !== action.actorCharacterId
      )
        return reject();
      proposal.status = 'Canceled';
      message =
        'Canceled the party-sharing proposal. The adventure remains participants only.';
    } else if (action.type === 'withdraw-sharing') {
      if (decision?.state !== 'Approved') return reject();
      proposal.decisions = [
        ...current.decisions,
        {
          characterId: action.actorCharacterId,
          actorId: state.viewerId,
          at: action.now,
          state: 'Withdrawn',
        },
      ];
      proposal.status = 'Withdrawn';
      message = 'Withdrew sharing consent. The adventure is participants only.';
    } else {
      if (current.status !== 'Pending' || decision) return reject();
      proposal.decisions = [
        ...current.decisions,
        {
          characterId: action.actorCharacterId,
          actorId: state.viewerId,
          at: action.now,
          state: action.approve ? 'Approved' : 'Declined',
        },
      ];
      proposal.status = !action.approve
        ? 'Declined'
        : adventure.participantCharacterIds.every((id) =>
              proposal.decisions.some(
                (item) => item.characterId === id && item.state === 'Approved',
              ),
            )
          ? 'Approved'
          : 'Pending';
      message = !action.approve
        ? 'Declined party sharing. The adventure remains participants only.'
        : proposal.status === 'Approved'
          ? 'Every accepted character approved. The adventure is now shared with the party.'
          : 'Approved party sharing. Waiting for the other accepted characters.';
    }
  }
  if (state.failNextSave)
    return {
      ...reject(
        'Simulated save failed. No sharing changes were saved. Try again.',
      ),
      failNextSave: false,
    };
  return {
    ...state,
    sharing:
      action.type === 'propose-sharing'
        ? [...state.sharing, proposal]
        : state.sharing.map((item) =>
            item.id === proposal.id ? proposal : item,
          ),
    adventures: state.adventures.map((item) =>
      item.id === adventure.id ? { ...item, updatedAt: action.now } : item,
    ),
    activity: [
      ...state.activity,
      activityEntry(action, adventure.id, action.actorCharacterId, message),
    ],
    error: null,
    feedback: `${message} Preview only.`,
  };
}
