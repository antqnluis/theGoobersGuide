import { describe, expect, it } from 'vitest';
import {
  initialState,
  previewReducer,
  type PreviewAction,
} from '../src/prototypes/adventures/state';
import type { PreviewState } from '../src/prototypes/adventures/model';
import type { ParticipationInput } from '../src/prototypes/adventures/ParticipationPanel';
import {
  accessibleAdventure,
  invitationInbox,
  visibleAdventures,
} from '../src/prototypes/adventures/selectors';

const id = 'lighthouse-letter';
const now = '2026-11-07T12:00:00.000Z';
let sequence = 0;
const as = (state: PreviewState, viewerId: string) =>
  previewReducer(state, { type: 'context', viewerId });
const act = (state: PreviewState, input: ParticipationInput) =>
  previewReducer(state, {
    ...input,
    campaignId: state.campaignId,
    viewerId: state.viewerId,
    now,
    newId: `a2-${++sequence}`,
  });
const propose = (
  state: PreviewState,
  targetCharacterId: string,
  actorCharacterId = 'ari-lark',
) =>
  act(state, {
    type: 'propose',
    id,
    actorCharacterId,
    targetCharacterId,
    kind: 'invite',
  });
const accept = (state: PreviewState, viewerId: string) => {
  state = as(state, viewerId);
  return act(state, {
    type: 'answer-invitation',
    requestId: invitationInbox(state)[0].requestId,
    accept: true,
  });
};
const duo = () => accept(propose(initialState(), 'bea-moss'), 'preview-bea');
const members = (state: PreviewState) =>
  state.adventures.find((item) => item.id === id)!.participantCharacterIds;
const request = (state: PreviewState) => state.requests.at(-1)!;
const unchanged = (before: PreviewState, after: PreviewState) => {
  expect(after.error).not.toBeNull();
  expect(after.adventures).toBe(before.adventures);
  expect(after.requests).toBe(before.requests);
  expect(after.activity).toBe(before.activity);
};

describe('A2 invitation and participation demo', () => {
  it('walks solo to duo to trio with approval before disclosure and acceptance before access', () => {
    let state = propose(initialState(), 'bea-moss');
    expect(request(state).status).toBe('invited');
    let bea = as(state, 'preview-bea');
    expect(invitationInbox(bea)).toEqual([
      { requestId: request(state).id, characterId: 'bea-moss' },
    ]);
    expect(accessibleAdventure(bea, id)).toBeUndefined();
    expect(visibleAdventures(bea)).toHaveLength(1);
    state = accept(state, 'preview-bea');
    expect(members(state)).toEqual(['ari-lark', 'bea-moss']);
    expect(accessibleAdventure(state, id)).toBeDefined();
    state = propose(as(state, 'preview-ari'), 'cato-wren');
    expect(request(state).status).toBe('approving');
    expect(invitationInbox(as(state, 'preview-cato'))).toEqual([]);
    state = act(as(state, 'preview-bea'), {
      type: 'decide',
      id,
      actorCharacterId: 'bea-moss',
      requestId: request(state).id,
      approve: true,
    });
    expect(request(state).status).toBe('invited');
    expect(accessibleAdventure(as(state, 'preview-cato'), id)).toBeUndefined();
    state = accept(state, 'preview-cato');
    expect(members(state)).toEqual(['ari-lark', 'bea-moss', 'cato-wren']);
    expect(state.adventures.find((item) => item.id === id)?.type).toBe(
      'Personal',
    );
    expect(
      state.adventures.find((item) => item.id === id)?.membershipRevision,
    ).toBe(2);
  });
  it('treats characters of one owner as distinct, including outside-party characters and approvals', () => {
    let state = propose(initialState(), 'ari-ash');
    expect(members(state)).toEqual(['ari-lark']);
    state = accept(state, 'preview-ari');
    expect(members(state)).toEqual(['ari-lark', 'ari-ash']);
    state = propose(state, 'bea-moss');
    expect(request(state).status).toBe('approving');
    unchanged(
      state,
      act(state, {
        type: 'decide',
        id,
        actorCharacterId: 'ari-lark',
        requestId: request(state).id,
        approve: true,
      }),
    );
    state = act(state, {
      type: 'decide',
      id,
      actorCharacterId: 'ari-ash',
      requestId: request(state).id,
      approve: true,
    });
    expect(request(state).status).toBe('invited');
  });
  it('rejects expansion or declines an invitation without changing membership', () => {
    let state = propose(as(duo(), 'preview-ari'), 'cato-wren');
    state = act(as(state, 'preview-bea'), {
      type: 'decide',
      id,
      actorCharacterId: 'bea-moss',
      requestId: request(state).id,
      approve: false,
    });
    expect(request(state).status).toBe('rejected');
    expect(members(state)).toEqual(['ari-lark', 'bea-moss']);
    expect(invitationInbox(as(state, 'preview-cato'))).toEqual([]);
    state = as(propose(initialState(), 'bea-moss'), 'preview-bea');
    const requestId = request(state).id;
    state = act(state, { type: 'answer-invitation', requestId, accept: false });
    expect(request(state).status).toBe('declined');
    expect(accessibleAdventure(state, id)).toBeUndefined();
    expect(invitationInbox(state)).toEqual([]);
    unchanged(
      state,
      act(state, { type: 'answer-invitation', requestId, accept: true }),
    );
  });
  it('permits only the proposing character to cancel and rejects answered/canceled responses', () => {
    let state = propose(as(duo(), 'preview-ari'), 'cato-wren');
    unchanged(
      state,
      act(as(state, 'preview-bea'), {
        type: 'cancel-request',
        id,
        actorCharacterId: 'bea-moss',
        requestId: request(state).id,
      }),
    );
    const requestId = request(state).id;
    state = act(state, {
      type: 'cancel-request',
      id,
      actorCharacterId: 'ari-lark',
      requestId,
    });
    expect(request(state).status).toBe('canceled');
    unchanged(
      state,
      act(state, {
        type: 'decide',
        id,
        actorCharacterId: 'ari-lark',
        requestId,
        approve: true,
      }),
    );
  });
  it('serializes membership requests and rejects invalid targets, actors, and cross-campaign characters', () => {
    const state = initialState();
    for (const target of ['ari-lark', 'ari-fern', 'missing'])
      unchanged(state, propose(state, target));
    unchanged(state, propose(state, 'bea-moss', 'ari-ash'));
    unchanged(state, propose(state, 'bea-moss', 'bea-moss'));
    const pending = propose(state, 'bea-moss');
    unchanged(pending, propose(pending, 'cato-wren'));
  });
  it('blocks wrong viewers, campaign mismatch, inaccessible and unsent invitation responses', () => {
    const state = propose(initialState(), 'bea-moss');
    unchanged(
      state,
      act(state, {
        type: 'answer-invitation',
        requestId: request(state).id,
        accept: true,
      }),
    );
    const base: PreviewAction = {
      type: 'answer-invitation',
      requestId: request(state).id,
      accept: true,
      campaignId: 'lantern-coast',
      viewerId: 'preview-bea',
      now,
      newId: 'wrong-context',
    };
    unchanged(state, previewReducer(state, base));
    const bea = as(state, 'preview-bea');
    unchanged(bea, previewReducer(bea, { ...base, campaignId: 'quiet-reach' }));
    const pending = propose(as(duo(), 'preview-ari'), 'cato-wren');
    unchanged(
      pending,
      act(as(pending, 'preview-cato'), {
        type: 'answer-invitation',
        requestId: request(pending).id,
        accept: true,
      }),
    );
    for (const viewer of ['preview-cato', 'preview-dena']) {
      const other = as(state, viewer);
      unchanged(
        other,
        act(other, {
          type: 'note',
          id,
          actorCharacterId:
            viewer === 'preview-cato' ? 'cato-wren' : 'dena-reed',
          text: 'Forbidden',
        }),
      );
    }
  });
  it('lets accepted collaborators edit, complete/reopen, and post attributed updates without changing other records', () => {
    let state = duo();
    const before = state.adventures;
    for (const status of ['Completed', 'In progress'] as const) {
      state = previewReducer(state, {
        type: 'save',
        id,
        actorCharacterId: 'bea-moss',
        viewerId: state.viewerId,
        campaignId: state.campaignId,
        now,
        newId: `edit-${++sequence}`,
        draft: {
          ...state.adventures[0],
          title: 'Collaborative goal',
          nextStep: 'Meet at dawn',
          status,
        },
      });
      expect(state.error).toBeNull();
      expect(state.activity.at(-1)).toMatchObject({
        actorId: 'preview-bea',
        characterId: 'bea-moss',
        at: now,
      });
    }
    state = act(state, {
      type: 'note',
      id,
      actorCharacterId: 'bea-moss',
      text: '  Found the keeper.  ',
    });
    expect(state.activity.at(-1)).toMatchObject({
      actorId: 'preview-bea',
      characterId: 'bea-moss',
      note: 'Found the keeper.',
    });
    expect(state.adventures.slice(1)).toEqual(before.slice(1));
    unchanged(
      state,
      act(state, {
        type: 'note',
        id,
        actorCharacterId: 'bea-moss',
        text: '   ',
      }),
    );
  });
  it('preserves records and history on failed membership saves and allows retry', () => {
    const state = { ...initialState(), failNextSave: true };
    const failed = propose(state, 'bea-moss');
    unchanged(state, failed);
    expect(failed.failNextSave).toBe(false);
    expect(propose(failed, 'bea-moss').error).toBeNull();
    let invited = as(propose(initialState(), 'bea-moss'), 'preview-bea');
    invited = { ...invited, failNextSave: true };
    const input = {
      type: 'answer-invitation' as const,
      requestId: request(invited).id,
      accept: true,
    };
    const failure = act(invited, input);
    unchanged(invited, failure);
    expect(act(failure, input).error).toBeNull();
  });
  it('retains failed update drafts as unchanged saved state and permits retry', () => {
    const state = { ...duo(), failNextSave: true };
    const input = {
      type: 'note' as const,
      id,
      actorCharacterId: 'bea-moss',
      text: 'Keep this draft',
    };
    const failed = act(state, input);
    unchanged(state, failed);
    expect(act(failed, input).activity.at(-1)?.note).toBe('Keep this draft');
  });
  it('requires target agreement for removal and allows refusal', () => {
    let state = as(duo(), 'preview-ari');
    state = act(state, {
      type: 'propose',
      id,
      actorCharacterId: 'ari-lark',
      targetCharacterId: 'bea-moss',
      kind: 'remove',
    });
    const requestId = request(state).id;
    expect(members(state)).toHaveLength(2);
    unchanged(
      state,
      act(state, {
        type: 'decide',
        id,
        actorCharacterId: 'ari-lark',
        requestId,
        approve: true,
      }),
    );
    state = act(as(state, 'preview-bea'), {
      type: 'decide',
      id,
      actorCharacterId: 'bea-moss',
      requestId,
      approve: false,
    });
    expect(members(state)).toHaveLength(2);
    state = act(as(state, 'preview-ari'), {
      type: 'propose',
      id,
      actorCharacterId: 'ari-lark',
      targetCharacterId: 'bea-moss',
      kind: 'remove',
    });
    state = act(as(state, 'preview-bea'), {
      type: 'decide',
      id,
      actorCharacterId: 'bea-moss',
      requestId: request(state).id,
      approve: true,
    });
    expect(members(state)).toEqual(['ari-lark']);
    expect(accessibleAdventure(state, id)).toBeUndefined();
    expect(state.activity.at(-1)?.message).toBe(
      'Agreed to leave the adventure.',
    );
  });
  it('revokes creator access after leaving and blocks final departure without losing contributions', () => {
    let state = as(duo(), 'preview-ari');
    const history = state.activity;
    state = act(state, { type: 'leave', id, actorCharacterId: 'ari-lark' });
    expect(accessibleAdventure(state, id)).toBeUndefined();
    expect(state.activity.slice(0, -1)).toEqual(history);
    state = as(state, 'preview-bea');
    unchanged(
      state,
      act(state, { type: 'leave', id, actorCharacterId: 'bea-moss' }),
    );
  });
  it('retains access through another accepted owned character after one leaves', () => {
    let state = accept(propose(initialState(), 'ari-ash'), 'preview-ari');
    state = act(state, { type: 'leave', id, actorCharacterId: 'ari-lark' });
    expect(members(state)).toEqual(['ari-ash']);
    expect(accessibleAdventure(state, id)).toBeDefined();
  });
  it('cancels pending proposals and sent invitations when membership changes and rejects stale decisions', () => {
    let state = propose(as(duo(), 'preview-ari'), 'cato-wren');
    const requestId = request(state).id;
    state = act(as(state, 'preview-bea'), {
      type: 'decide',
      id,
      actorCharacterId: 'bea-moss',
      requestId,
      approve: true,
    });
    expect(invitationInbox(as(state, 'preview-cato'))).toHaveLength(1);
    state = act(state, { type: 'leave', id, actorCharacterId: 'bea-moss' });
    expect(request(state).status).toBe('canceled');
    expect(invitationInbox(as(state, 'preview-cato'))).toEqual([]);
    unchanged(
      state,
      act(as(state, 'preview-cato'), {
        type: 'answer-invitation',
        requestId,
        accept: true,
      }),
    );
    // Even a stale active record cannot bypass revision validation.
    state = {
      ...state,
      requests: state.requests.map((item) => ({ ...item, status: 'invited' })),
    };
    expect(invitationInbox(as(state, 'preview-cato'))).toEqual([]);
    unchanged(
      state,
      act(as(state, 'preview-cato'), {
        type: 'answer-invitation',
        requestId,
        accept: true,
      }),
    );
  });
  it('rejects a forged invitation with incomplete approvals at acceptance', () => {
    let state = propose(as(duo(), 'preview-ari'), 'cato-wren');
    state = {
      ...state,
      requests: state.requests.map((item) =>
        item.status === 'approving' ? { ...item, status: 'invited' } : item,
      ),
    };
    unchanged(
      state,
      act(as(state, 'preview-cato'), {
        type: 'answer-invitation',
        requestId: request(state).id,
        accept: true,
      }),
    );
  });
  it('resets requests, history, and memberships independently of the previous state', () => {
    const state = duo();
    const reset = previewReducer(state, {
      type: 'reset',
      campaignId: 'lantern-coast',
    });
    expect(reset).toEqual(initialState());
    expect(members(state)).toHaveLength(2);
    expect(state.activity.length).toBeGreaterThan(0);
  });
});
