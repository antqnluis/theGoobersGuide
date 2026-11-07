import { accounts, campaigns, fixtureAdventures } from './fixtures';
import {
  blankDraft,
  statuses,
  type AdventureDraft,
  type PreviewState,
} from './model';
import {
  accessibleAdventure,
  acceptedOwnedCharacters,
  ownedCharacters,
} from './selectors';
import {
  activityEntry,
  participationReducer,
  type ParticipationAction,
} from './participation';

export type PreviewAction =
  | ParticipationAction
  | {
      type: 'context';
      viewerId?: string;
      campaignId?: string;
      characterId?: string;
    }
  | { type: 'failure'; enabled: boolean }
  | { type: 'reset'; campaignId: string }
  | {
      type: 'save';
      campaignId: string;
      viewerId: string;
      id?: string;
      draft: AdventureDraft;
      newId: string;
      now: string;
      actorCharacterId?: string;
    };

export function initialState(campaignId = campaigns[0].id): PreviewState {
  const viewerId = accounts[0].id;
  return {
    adventures: fixtureAdventures(),
    requests: [],
    activity: [],
    viewerId,
    campaignId,
    selectedCharacterId: ownedCharacters(viewerId, campaignId)[0]?.id ?? null,
    failNextSave: false,
    error: null,
    feedback: null,
  };
}
export function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  if (action.type === 'reset') return initialState(action.campaignId);
  if (action.type === 'failure')
    return { ...state, failNextSave: action.enabled };
  if (action.type === 'context') {
    const viewerId = action.viewerId ?? state.viewerId;
    const campaignId = action.campaignId ?? state.campaignId;
    if (!accounts.some((account) => account.id === viewerId)) return state;
    const owned = ownedCharacters(viewerId, campaignId);
    const preferred =
      action.characterId ??
      (viewerId === state.viewerId && campaignId === state.campaignId
        ? state.selectedCharacterId
        : null);
    return {
      ...state,
      viewerId,
      campaignId,
      selectedCharacterId:
        owned.find((character) => character.id === preferred)?.id ??
        owned[0]?.id ??
        null,
      error: null,
      feedback: null,
    };
  }
  const reject = (error: string): PreviewState => ({
    ...state,
    error,
    feedback: null,
  });
  if (
    action.campaignId !== state.campaignId ||
    action.viewerId !== state.viewerId ||
    !campaigns.some((campaign) => campaign.id === state.campaignId)
  )
    return reject('This adventure is unavailable. Return to Adventures.');
  if (action.type !== 'save') return participationReducer(state, action);
  const existing = action.id
    ? accessibleAdventure(state, action.id)
    : undefined;
  if (action.id && !existing)
    return reject('This adventure is unavailable. Return to Adventures.');
  const owned = ownedCharacters(state.viewerId, state.campaignId);
  const selected =
    owned.find((character) => character.id === state.selectedCharacterId) ??
    owned[0];
  const actors = existing ? acceptedOwnedCharacters(state, existing) : [];
  const actor = existing
    ? action.actorCharacterId
      ? actors.find((character) => character.id === action.actorCharacterId)
      : (actors.find(
          (character) => character.id === state.selectedCharacterId,
        ) ?? actors[0])
    : selected;
  if (existing && !actor)
    return reject(
      'Choose an accepted character you own to edit this adventure.',
    );
  if (!existing && !selected)
    return reject(
      'Choose a viewer with an owned character in this campaign to create an adventure.',
    );
  if (!action.draft.title.trim())
    return reject('Enter a title for this adventure.');
  if (
    !statuses.includes(action.draft.status) ||
    !['Personal', 'Side'].includes(action.draft.type)
  )
    return reject('Choose a valid type and player-tracked status.');
  if (
    (!existing &&
      state.adventures.some((adventure) => adventure.id === action.newId)) ||
    state.activity.some((item) => item.id === action.newId) ||
    state.requests.some((item) => item.id === action.newId)
  )
    return reject('This preview ID is already in use. Try saving again.');
  if (state.failNextSave)
    return {
      ...reject(
        'Simulated save failed. Your draft is still here. Try saving again.',
      ),
      failNextSave: false,
    };
  const draft = {
    title: action.draft.title.trim(),
    type: action.draft.type,
    status: action.draft.status,
    description: action.draft.description,
    nextStep: action.draft.nextStep,
  };
  const adventure = existing
    ? { ...existing, ...draft, updatedAt: action.now }
    : {
        ...blankDraft(),
        ...draft,
        id: action.newId,
        campaignId: state.campaignId,
        creatorId: state.viewerId,
        participantCharacterIds: [selected!.id],
        visibility: 'Participants only' as const,
        createdAt: action.now,
        updatedAt: action.now,
        membershipRevision: 0,
      };
  const fieldLabels: Record<keyof AdventureDraft, string> = {
    title: 'title',
    type: 'type',
    status: 'player-tracked status',
    description: 'description',
    nextStep: 'next step',
  };
  return {
    ...state,
    adventures: existing
      ? state.adventures.map((item) =>
          item.id === existing.id ? adventure : item,
        )
      : [...state.adventures, adventure],
    activity: [
      ...state.activity,
      activityEntry(
        action,
        adventure.id,
        actor!.id,
        existing
          ? `Edited adventure fields: ${
              (Object.keys(draft) as (keyof AdventureDraft)[])
                .filter((key) => draft[key] !== existing[key])
                .map((key) => fieldLabels[key])
                .join(', ') || 'no changes'
            }.`
          : 'Created the adventure.',
      ),
    ],
    error: null,
    feedback: existing
      ? 'Adventure updated in this preview.'
      : 'Adventure created in this preview.',
  };
}
