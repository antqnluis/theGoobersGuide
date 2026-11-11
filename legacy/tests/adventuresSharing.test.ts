import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { campaigns, characters } from '../src/prototypes/adventures/fixtures';
import {
  effectiveAudience,
  latestSharing,
} from '../src/prototypes/adventures/consent';
import {
  initialState,
  previewReducer,
  type PreviewAction,
} from '../src/prototypes/adventures/state';
import type { PreviewState } from '../src/prototypes/adventures/model';
import type { SharingInput } from '../src/prototypes/adventures/sharing';
import type { ParticipationInput } from '../src/prototypes/adventures/ParticipationPanel';
import ParticipationPanel from '../src/prototypes/adventures/ParticipationPanel';
import AdventureDetail from '../src/prototypes/adventures/AdventureDetail';
import {
  accessibleAdventure,
  visibleAdventures,
  invitationInbox,
} from '../src/prototypes/adventures/selectors';
import { readRoute, routeHash } from '../src/prototypes/adventures/navigation';

const id = 'lighthouse-letter';
const now = '2026-11-07T12:00:00.000Z';
let sequence = 0;
const adventure = (state: PreviewState) =>
  state.adventures.find((item) => item.id === id)!;
const proposal = (state: PreviewState) => latestSharing(state, id)!;
const as = (state: PreviewState, viewerId: string) =>
  previewReducer(state, { type: 'context', viewerId });
function act(state: PreviewState, input: SharingInput | ParticipationInput) {
  return previewReducer(state, {
    ...input,
    campaignId: state.campaignId,
    viewerId: state.viewerId,
    now,
    newId: `a3-${++sequence}`,
  });
}
const start = (state: PreviewState, actorCharacterId = 'ari-lark') =>
  act(state, {
    type: 'propose-sharing',
    id,
    actorCharacterId,
    membershipRevision: adventure(state).membershipRevision,
  });
const response = (state: PreviewState, actorCharacterId = 'ari-lark') => ({
  id,
  actorCharacterId,
  membershipRevision: adventure(state).membershipRevision,
  proposalId: proposal(state).id,
  proposalRevision: proposal(state).revision,
});
const decide = (
  state: PreviewState,
  actorCharacterId = 'ari-lark',
  approve = true,
) =>
  act(state, {
    ...response(state, actorCharacterId),
    type: 'decide-sharing',
    approve,
  });
const withdraw = (state: PreviewState, actorCharacterId = 'ari-lark') =>
  act(state, {
    ...response(state, actorCharacterId),
    type: 'withdraw-sharing',
  });
const reader = (state: PreviewState) => as(state, 'preview-cato');
const isShared = (state: PreviewState) =>
  effectiveAudience(state, adventure(state)) === 'Party';
function unchanged(before: PreviewState, after: PreviewState) {
  expect(after.error).not.toBeNull();
  for (const key of ['adventures', 'sharing', 'requests', 'activity'] as const)
    expect(after[key]).toBe(before[key]);
}
function invite(state: PreviewState, targetCharacterId: string) {
  const participantIds = adventure(state).participantCharacterIds;
  state = as(
    state,
    characters.find((item) => item.id === participantIds[0])!.ownerId,
  );
  state = act(state, {
    type: 'propose',
    id,
    actorCharacterId: participantIds[0],
    targetCharacterId,
    kind: 'invite',
  });
  const requestId = state.requests.at(-1)!.id;
  for (const actorCharacterId of participantIds.slice(1)) {
    state = as(
      state,
      characters.find((item) => item.id === actorCharacterId)!.ownerId,
    );
    state = act(state, {
      type: 'decide',
      id,
      actorCharacterId,
      requestId,
      approve: true,
    });
  }
  return state;
}
function accept(state: PreviewState, targetCharacterId: string) {
  state = as(
    state,
    characters.find((item) => item.id === targetCharacterId)!.ownerId,
  );
  return act(state, {
    type: 'answer-invitation',
    requestId: invitationInbox(state).find(
      (item) => item.characterId === targetCharacterId,
    )!.requestId,
    accept: true,
  });
}
const duo = () =>
  as(accept(invite(initialState(), 'bea-moss'), 'bea-moss'), 'preview-ari');
function approveAll(state: PreviewState) {
  state = start(as(state, 'preview-ari'));
  for (const actor of adventure(state).participantCharacterIds) {
    state = decide(
      as(state, characters.find((item) => item.id === actor)!.ownerId),
      actor,
    );
  }
  return state;
}

describe('A3 party-sharing consent', () => {
  it('keeps a solo proposal private until a separate explicit approval, then grants party read access', () => {
    let state = start(initialState());
    expect(proposal(state)).toMatchObject({
      status: 'Pending',
      decisions: [],
      membershipRevision: 0,
      revision: 0,
      actorId: 'preview-ari',
      createdAt: now,
    });
    expect(accessibleAdventure(reader(state), id)).toBeUndefined();
    state = decide(state);
    expect(isShared(state)).toBe(true);
    expect(proposal(state).decisions).toEqual([
      {
        actorId: 'preview-ari',
        characterId: 'ari-lark',
        state: 'Approved',
        at: now,
      },
    ]);
    expect(accessibleAdventure(reader(state), id)).toBeDefined();
    expect(visibleAdventures(reader(state))).toHaveLength(1);
    expect(accessibleAdventure(as(state, 'preview-dena'), id)).toBeUndefined();
  });
  it.each([2, 3])('requires all %i participants to approve', (size) => {
    let state = duo();
    if (size === 3)
      state = as(
        accept(invite(state, 'dena-reed'), 'dena-reed'),
        'preview-ari',
      );
    state = start(state);
    const ids = adventure(state).participantCharacterIds;
    for (const [index, actor] of ids.entries()) {
      state = decide(
        as(state, characters.find((item) => item.id === actor)!.ownerId),
        actor,
      );
      expect(isShared(state)).toBe(index === ids.length - 1);
      expect(Boolean(accessibleAdventure(reader(state), id))).toBe(
        index === ids.length - 1,
      );
    }
  });
  it('requires separate character approvals even for one owner and outside-party participants', () => {
    let state = accept(invite(initialState(), 'ari-ash'), 'ari-ash');
    state = decide(start(state));
    expect(isShared(state)).toBe(false);
    unchanged(state, decide(state));
    state = decide(state, 'ari-ash');
    expect(isShared(state)).toBe(true);
    expect(proposal(state).decisions.map((item) => item.characterId)).toEqual([
      'ari-lark',
      'ari-ash',
    ]);
  });
  it('decline closes the proposal; fresh proposals discard all old approvals', () => {
    let state = decide(start(duo()));
    state = decide(as(state, 'preview-bea'), 'bea-moss', false);
    expect(proposal(state).status).toBe('Declined');
    expect(isShared(state)).toBe(false);
    unchanged(state, decide(state, 'bea-moss'));
    state = start(state, 'bea-moss');
    expect(proposal(state).decisions).toEqual([]);
    state = decide(state, 'bea-moss');
    expect(isShared(state)).toBe(false);
    state = decide(as(state, 'preview-ari'));
    expect(isShared(state)).toBe(true);
  });
  it.each(['pending', 'active'])(
    'withdrawal during %s consent closes sharing immediately',
    (phase) => {
      let state =
        phase === 'pending' ? decide(start(duo())) : approveAll(duo());
      state = as(state, 'preview-ari');
      const stale = {
        ...response(state),
        type: 'decide-sharing' as const,
        approve: true,
      };
      state = withdraw(state);
      expect(proposal(state).status).toBe('Withdrawn');
      expect(proposal(state).decisions.at(-1)?.state).toBe('Withdrawn');
      expect(accessibleAdventure(reader(state), id)).toBeUndefined();
      unchanged(state, act(state, stale));
      unchanged(state, withdraw(state));
      expect(proposal(start(state)).decisions).toEqual([]);
    },
  );
  it('only the proposer can cancel a pending request; active sharing uses withdrawal', () => {
    let state = start(duo());
    unchanged(
      state,
      act(as(state, 'preview-bea'), {
        ...response(state, 'bea-moss'),
        type: 'cancel-sharing',
      }),
    );
    unchanged(state, withdraw(state));
    state = act(state, { ...response(state), type: 'cancel-sharing' });
    expect(proposal(state).status).toBe('Canceled');
    unchanged(state, decide(state));
    state = approveAll(state);
    state = as(state, 'preview-ari');
    unchanged(
      state,
      act(state, { ...response(state), type: 'cancel-sharing' }),
    );
    expect(isShared(state)).toBe(true);
  });
  it.each(['pending', 'active'])(
    'acceptance invalidates %s sharing atomically and requires fresh approvals',
    (phase) => {
      let state =
        phase === 'pending' ? decide(start(duo())) : approveAll(duo());
      const oldProposal = proposal(state);
      state = invite(state, 'dena-reed');
      expect(proposal(state)).toBe(oldProposal);
      state = accept(state, 'dena-reed');
      expect(proposal(state).status).toBe('Invalidated');
      expect(isShared(state)).toBe(false);
      expect(accessibleAdventure(reader(state), id)).toBeUndefined();
      expect(adventure(state).participantCharacterIds).toHaveLength(3);
      const oldResponse = {
        id,
        actorCharacterId: 'ari-lark',
        membershipRevision: oldProposal.membershipRevision,
        proposalId: oldProposal.id,
        proposalRevision: oldProposal.revision,
        type: 'decide-sharing' as const,
        approve: true,
      };
      unchanged(
        as(state, 'preview-ari'),
        act(as(state, 'preview-ari'), oldResponse),
      );
      state = approveAll(state);
      expect(isShared(state)).toBe(true);
      expect(proposal(state).decisions).toHaveLength(3);
    },
  );
  it.each(['leave', 'remove'])(
    '%s invalidates active consent without automatically re-sharing to remaining participants',
    (mode) => {
      let state = as(approveAll(duo()), 'preview-ari');
      if (mode === 'remove') {
        state = act(state, {
          type: 'propose',
          id,
          actorCharacterId: 'ari-lark',
          targetCharacterId: 'bea-moss',
          kind: 'remove',
        });
        state = as(state, 'preview-bea');
        state = act(state, {
          type: 'decide',
          id,
          actorCharacterId: 'bea-moss',
          requestId: state.requests.at(-1)!.id,
          approve: true,
        });
      } else
        state = act(as(state, 'preview-bea'), {
          type: 'leave',
          id,
          actorCharacterId: 'bea-moss',
        });
      expect(adventure(state).participantCharacterIds).toEqual(['ari-lark']);
      expect(proposal(state).status).toBe('Invalidated');
      expect(accessibleAdventure(state, id)).toBeUndefined();
      expect(accessibleAdventure(reader(state), id)).toBeUndefined();
      expect(isShared(approveAll(state))).toBe(true);
    },
  );
  it('declining an invitation does not alter sharing or accepted membership', () => {
    let state = approveAll(duo());
    const before = proposal(state);
    state = as(invite(state, 'dena-reed'), 'preview-dena');
    state = act(state, {
      type: 'answer-invitation',
      requestId: invitationInbox(state)[0].requestId,
      accept: false,
    });
    expect(proposal(state)).toBe(before);
    expect(isShared(state)).toBe(true);
  });
  it('rejects stale revisions and old proposal IDs without overriding later decisions', () => {
    let state = start(duo());
    const stale = {
      ...response(state, 'bea-moss'),
      type: 'decide-sharing' as const,
      approve: true,
    };
    state = decide(state);
    unchanged(as(state, 'preview-bea'), act(as(state, 'preview-bea'), stale));
    state = withdraw(state);
    state = start(state);
    unchanged(
      as(state, 'preview-bea'),
      act(as(state, 'preview-bea'), {
        ...stale,
        proposalRevision: proposal(state).revision,
      }),
    );
  });
  it('party readers and organizers cannot acquire participant powers through direct actions', () => {
    const shared = approveAll(initialState());
    for (const viewerId of ['preview-cato', 'preview-dena']) {
      const state = as(shared, viewerId);
      const actorCharacterId =
        viewerId === 'preview-cato' ? 'cato-wren' : 'dena-reed';
      for (const input of [
        { ...response(state, actorCharacterId), type: 'withdraw-sharing' },
        {
          ...response(state, actorCharacterId),
          type: 'decide-sharing',
          approve: true,
        },
        {
          id,
          actorCharacterId,
          type: 'propose-sharing',
          membershipRevision: 0,
        },
        { id, actorCharacterId, type: 'note', text: 'unauthorized' },
        { id, actorCharacterId, type: 'leave' },
        {
          id,
          actorCharacterId,
          type: 'propose',
          kind: 'invite',
          targetCharacterId: 'bea-moss',
        },
      ] as (SharingInput | ParticipationInput)[])
        unchanged(state, act(state, input));
      unchanged(
        state,
        previewReducer(state, {
          type: 'save',
          id,
          actorCharacterId,
          campaignId: state.campaignId,
          viewerId,
          now,
          newId: `a3-${++sequence}`,
          draft: {
            ...adventure(state),
            title: 'unauthorized',
            status: 'Completed',
          },
        }),
      );
      unchanged(
        state,
        act(state, {
          ...response(state, 'ari-lark'),
          type: 'withdraw-sharing',
        }),
      );
    }
  });
  it('rejects wrong campaign/viewer contexts and stale membership without sharing changes', () => {
    const state = start(initialState());
    const action: PreviewAction = {
      ...response(state),
      type: 'decide-sharing',
      approve: true,
      campaignId: state.campaignId,
      viewerId: state.viewerId,
      now,
      newId: 'context-test',
    };
    for (const overrides of [
      { campaignId: 'quiet-reach' },
      { viewerId: 'preview-bea' },
      { membershipRevision: -1 },
      { actorCharacterId: 'ari-ash' },
    ])
      unchanged(state, previewReducer(state, { ...action, ...overrides }));
    const switched = previewReducer(state, {
      type: 'context',
      campaignId: 'quiet-reach',
    });
    expect(visibleAdventures(switched)).toEqual([]);
  });
  it.each(['proposal', 'approval', 'withdrawal', 'membership'])(
    'failed %s leaves consent, audience, membership, and history unchanged',
    (kind) => {
      let state =
        kind === 'proposal'
          ? initialState()
          : kind === 'approval'
            ? start(initialState())
            : approveAll(duo());
      state = as(state, 'preview-ari');
      state = previewReducer(state, { type: 'failure', enabled: true });
      const result =
        kind === 'proposal'
          ? start(state)
          : kind === 'approval'
            ? decide(state)
            : kind === 'withdrawal'
              ? withdraw(state)
              : act(state, { type: 'leave', id, actorCharacterId: 'ari-lark' });
      unchanged(state, result);
      expect(result.failNextSave).toBe(false);
      expect(isShared(result)).toBe(isShared(state));
    },
  );
  it('uses current party accounts rather than campaign membership or a selected character', () => {
    const state = approveAll(initialState());
    const roster = [...campaigns[0].partyCharacterIds];
    try {
      campaigns[0].partyCharacterIds = ['ari-ash'];
      expect(accessibleAdventure(reader(state), id)).toBeUndefined();
      expect(accessibleAdventure(as(state, 'preview-ari'), id)).toBeDefined();
      campaigns[0].partyCharacterIds = ['dena-reed', 'cato-wren'];
      expect(accessibleAdventure(as(state, 'preview-dena'), id)).toBeDefined();
      expect(accessibleAdventure(reader(state), id)).toBeDefined();
      campaigns[0].partyCharacterIds = ['dena-reed'];
      expect(accessibleAdventure(reader(state), id)).toBeUndefined();
    } finally {
      campaigns[0].partyCharacterIds = roster;
    }
  });
  it('fails closed when approved metadata does not match membership or explicit owner consent', () => {
    const state = approveAll(initialState());
    for (const bad of [
      { ...proposal(state), membershipRevision: 99 },
      { ...proposal(state), participantCharacterIds: ['bea-moss'] },
      { ...proposal(state), campaignId: 'quiet-reach' },
      { ...proposal(state), decisions: [] },
      {
        ...proposal(state),
        decisions: [
          { ...proposal(state).decisions[0], actorId: 'preview-bea' },
        ],
      },
    ])
      expect(
        accessibleAdventure(reader({ ...state, sharing: [bad] }), id),
      ).toBeUndefined();
  });
  it('keeps no-party creation private and prevents proposals; reset clears all consent', () => {
    let state = initialState('quiet-reach');
    state = previewReducer(state, {
      type: 'save',
      campaignId: state.campaignId,
      viewerId: state.viewerId,
      draft: {
        title: 'Solo',
        type: 'Personal',
        status: 'Pending',
        description: '',
        nextStep: '',
      },
      newId: 'quiet-objective',
      now,
    });
    unchanged(
      state,
      act(state, {
        type: 'propose-sharing',
        id: 'quiet-objective',
        actorCharacterId: 'ari-fern',
        membershipRevision: 0,
      }),
    );
    state = approveAll(initialState());
    expect(
      previewReducer(state, { type: 'reset', campaignId: 'lantern-coast' }),
    ).toEqual(initialState());
    expect(initialState().sharing).toEqual([]);
  });
  it('ordinary edits preserve sharing and unrelated adventures and membership requests', () => {
    const state = approveAll(initialState());
    const result = previewReducer(state, {
      type: 'save',
      id,
      campaignId: state.campaignId,
      viewerId: state.viewerId,
      actorCharacterId: 'ari-lark',
      draft: {
        ...adventure(state),
        title: 'Updated title',
        type: 'Side',
        status: 'Completed',
      },
      newId: 'edit-shared',
      now,
    });
    expect(isShared(result)).toBe(true);
    expect(result.sharing).toBe(state.sharing);
    expect(result.requests).toBe(state.requests);
    expect(result.adventures.slice(1)).toEqual(state.adventures.slice(1));
  });
  it('renders shared content and activity without participant controls for a party reader', () => {
    const state = reader(approveAll(initialState()));
    const html = renderToStaticMarkup(
      createElement(ParticipationPanel, {
        state,
        adventure: adventure(state),
        actorCharacterId: '',
        readOnly: true,
        onAction: () => {},
        onDirty: () => {},
      }),
    );
    expect(html).toContain('Lark Fen');
    expect(html).toContain('Proposed sharing');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Request removal');
    expect(html).not.toContain('Propose invitation');
    const detail = renderToStaticMarkup(
      createElement(AdventureDetail, {
        adventure: adventure(state),
        audience: 'Party',
        canEdit: false,
        error: null,
        onEdit: () => {},
        onStatus: () => {},
      }),
    );
    expect(detail).toContain('Read-only party view');
    expect(detail).not.toContain('Edit adventure');
    expect(detail).not.toContain('Mark completed');
  });
  it('round-trips audience/progress routes while preserving old links', () => {
    for (const hash of [
      '#/campaigns/lantern-coast/adventures',
      '#/campaigns/lantern-coast/adventures?audience=shared',
      '#/campaigns/lantern-coast/adventures/lighthouse-letter?view=completed&audience=shared',
    ])
      expect(routeHash(readRoute(hash))).toBe(hash);
    expect(
      readRoute('#/campaigns/lantern-coast/adventures?audience=unknown')
        .audience,
    ).toBeUndefined();
  });
});
