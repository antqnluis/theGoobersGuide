import { characters } from './fixtures';
import { invalidateSharing } from './consent';
import type {
  AdventureActivity,
  MembershipRequest,
  PreviewState,
} from './model';
import {
  accessibleAdventure,
  activeRequest,
  invitationInbox,
} from './selectors';

type MutationContext = {
  campaignId: string;
  viewerId: string;
  now: string;
  newId: string;
};
export type ParticipationAction = MutationContext &
  (
    | {
        type: 'propose';
        id: string;
        actorCharacterId: string;
        targetCharacterId: string;
        kind: 'invite' | 'remove';
      }
    | {
        type: 'decide';
        id: string;
        actorCharacterId: string;
        requestId: string;
        approve: boolean;
      }
    | {
        type: 'cancel-request';
        id: string;
        actorCharacterId: string;
        requestId: string;
      }
    | { type: 'leave'; id: string; actorCharacterId: string }
    | { type: 'note'; id: string; actorCharacterId: string; text: string }
    | { type: 'answer-invitation'; requestId: string; accept: boolean }
  );

export function activityEntry(
  action: MutationContext,
  adventureId: string,
  characterId: string,
  message: string,
  note?: string,
): AdventureActivity {
  return {
    id: action.newId,
    adventureId,
    actorId: action.viewerId,
    characterId,
    at: action.now,
    message,
    ...(note ? { note } : {}),
  };
}

export function participationReducer(
  state: PreviewState,
  action: ParticipationAction,
): PreviewState {
  const reject = (
    error = 'This request is unavailable. Return to Adventures.',
  ): PreviewState => ({ ...state, error, feedback: null });
  const requested =
    'requestId' in action
      ? state.requests.find((item) => item.id === action.requestId)
      : undefined;
  const adventure =
    action.type === 'answer-invitation'
      ? state.adventures.find(
          (item) =>
            item.id === requested?.adventureId &&
            item.campaignId === state.campaignId,
        )
      : accessibleAdventure(state, action.id);
  if (!adventure) return reject();
  const actorCharacterId =
    action.type === 'answer-invitation'
      ? requested?.targetCharacterId
      : action.actorCharacterId;
  const actor = characters.find(
    (item) =>
      item.id === actorCharacterId &&
      item.ownerId === state.viewerId &&
      item.campaignId === state.campaignId,
  );
  if (
    !actor ||
    (action.type !== 'answer-invitation' &&
      !adventure.participantCharacterIds.includes(actor.id))
  )
    return reject();
  if (
    state.activity.some((item) => item.id === action.newId) ||
    state.requests.some((item) => item.id === action.newId) ||
    state.sharing.some((item) => item.id === action.newId)
  )
    return reject('This preview ID is already in use. Try again.');
  let requests = state.requests;
  let participants = adventure.participantCharacterIds;
  let message = '';
  let note: string | undefined;
  const replaceRequest = (next: MembershipRequest) => {
    requests = requests.map((item) => (item.id === next.id ? next : item));
  };
  if (action.type === 'propose') {
    if (activeRequest(state, adventure.id))
      return reject('Resolve or cancel the current membership request first.');
    const target = characters.find(
      (item) =>
        item.id === action.targetCharacterId &&
        item.campaignId === state.campaignId,
    );
    if (!target || !['invite', 'remove'].includes(action.kind)) return reject();
    const alreadyAccepted = participants.includes(target.id);
    if (
      action.kind === 'invite'
        ? alreadyAccepted
        : !alreadyAccepted || target.id === actor.id
    )
      return reject();
    requests = [
      ...requests,
      {
        id: action.newId,
        adventureId: adventure.id,
        campaignId: state.campaignId,
        kind: action.kind,
        targetCharacterId: target.id,
        proposerCharacterId: actor.id,
        membershipRevision: adventure.membershipRevision,
        approvedCharacterIds: [actor.id],
        status:
          action.kind === 'invite' && participants.length > 1
            ? 'approving'
            : 'invited',
      },
    ];
    message =
      action.kind === 'invite'
        ? `Proposed inviting ${target.name}.`
        : `Requested ${target.name}’s agreement to leave.`;
  } else if (action.type === 'leave') {
    if (participants.length === 1)
      return reject(
        'Keep at least one accepted participant. The final character cannot leave in this preview.',
      );
    participants = participants.filter((id) => id !== actor.id);
    message = 'Left the adventure.';
  } else if (action.type === 'note') {
    if (!action.text.trim())
      return reject('Enter a short update before posting.');
    note = action.text.trim();
    message = 'Posted an update.';
  } else {
    if (
      !requested ||
      requested.adventureId !== adventure.id ||
      requested.campaignId !== state.campaignId ||
      requested.membershipRevision !== adventure.membershipRevision ||
      !['approving', 'invited'].includes(requested.status)
    )
      return reject();
    if (action.type === 'cancel-request') {
      if (requested.proposerCharacterId !== actor.id) return reject();
      replaceRequest({ ...requested, status: 'canceled' });
      message = 'Canceled the membership request.';
    } else if (action.type === 'answer-invitation') {
      if (
        !invitationInbox(state).some((item) => item.requestId === requested.id)
      )
        return reject();
      // Validate approvals again at acceptance, against the entire current set.
      if (
        !participants.every((id) =>
          requested.approvedCharacterIds.includes(id),
        ) ||
        participants.includes(actor.id)
      )
        return reject();
      replaceRequest({
        ...requested,
        status: action.accept ? 'accepted' : 'declined',
      });
      if (action.accept) participants = [...participants, actor.id];
      message = action.accept
        ? 'Accepted the invitation.'
        : 'Declined the invitation.';
    } else if (requested.kind === 'remove') {
      if (
        requested.targetCharacterId !== actor.id ||
        requested.status !== 'invited'
      )
        return reject();
      if (action.approve && participants.length === 1)
        return reject('Keep at least one accepted participant.');
      replaceRequest({
        ...requested,
        status: action.approve ? 'accepted' : 'declined',
      });
      if (action.approve)
        participants = participants.filter((id) => id !== actor.id);
      message = action.approve
        ? 'Agreed to leave the adventure.'
        : 'Declined the removal request.';
    } else {
      if (
        requested.status !== 'approving' ||
        requested.approvedCharacterIds.includes(actor.id)
      )
        return reject();
      const approvedCharacterIds = action.approve
        ? [...requested.approvedCharacterIds, actor.id]
        : requested.approvedCharacterIds;
      const unanimous = participants.every((id) =>
        approvedCharacterIds.includes(id),
      );
      replaceRequest({
        ...requested,
        approvedCharacterIds,
        status: !action.approve
          ? 'rejected'
          : unanimous
            ? 'invited'
            : 'approving',
      });
      message = action.approve
        ? 'Approved the proposed invitation.'
        : 'Rejected the proposed invitation.';
    }
  }
  if (state.failNextSave)
    return {
      ...reject(
        action.type === 'note'
          ? 'Simulated save failed. Your draft is still here. Try saving again.'
          : 'Simulated save failed. No membership changes were saved. Try again.',
      ),
      failNextSave: false,
    };
  const membershipChanged = participants !== adventure.participantCharacterIds;
  if (membershipChanged)
    requests = requests.map((item) =>
      item.adventureId === adventure.id &&
      ['approving', 'invited'].includes(item.status)
        ? { ...item, status: 'canceled' }
        : item,
    );
  return {
    ...state,
    adventures: state.adventures.map((item) =>
      item.id === adventure.id
        ? {
            ...item,
            participantCharacterIds: participants,
            membershipRevision:
              item.membershipRevision + (membershipChanged ? 1 : 0),
            updatedAt: action.now,
          }
        : item,
    ),
    requests,
    sharing: membershipChanged
      ? invalidateSharing(state.sharing, adventure.id, action.now)
      : state.sharing,
    activity: [
      ...state.activity,
      activityEntry(action, adventure.id, actor.id, message, note),
    ],
    error: null,
    feedback: `${message}${membershipChanged && state.sharing.some((item) => item.adventureId === adventure.id && ['Pending', 'Approved'].includes(item.status)) ? ' Membership changed: party sharing is private again. Propose sharing again for fresh consent from every accepted character.' : ''} Preview only.`,
  };
}
