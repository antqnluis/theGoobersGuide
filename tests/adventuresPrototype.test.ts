import { describe, expect, it } from 'vitest';
import { fixtureAdventures } from '../src/prototypes/adventures/fixtures';
import {
  blankDraft,
  type AdventureDraft,
} from '../src/prototypes/adventures/model';
import { readRoute, routeHash } from '../src/prototypes/adventures/navigation';
import {
  accessibleAdventure,
  ownedCharacters,
  visibleAdventures,
} from '../src/prototypes/adventures/selectors';
import {
  initialState,
  previewReducer,
  type PreviewAction,
} from '../src/prototypes/adventures/state';

const now = '2026-11-07T12:00:00.000Z';
const create = (overrides: Partial<AdventureDraft> = {}): PreviewAction => ({
  type: 'save',
  campaignId: 'lantern-coast',
  viewerId: 'preview-ari',
  draft: { ...blankDraft(), title: '  Visit the harbor  ', ...overrides },
  newId: 'created-objective',
  now,
});

describe('isolated Adventures prototype', () => {
  it('creates from only a title with owned-character, privacy, and metadata defaults', () => {
    const result = previewReducer(initialState(), create());
    expect(result.error).toBeNull();
    expect(result.adventures.at(-1)).toMatchObject({
      title: 'Visit the harbor',
      status: 'Pending',
      type: 'Personal',
      visibility: 'Participants only',
      participantCharacterIds: ['ari-lark'],
      creatorId: 'preview-ari',
      campaignId: 'lantern-coast',
      createdAt: now,
      updatedAt: now,
    });
  });
  it('creates outside the party and in a campaign with no party', () => {
    const outside = previewReducer(initialState(), {
      type: 'context',
      characterId: 'ari-ash',
    });
    expect(
      previewReducer(outside, create()).adventures.at(-1)
        ?.participantCharacterIds,
    ).toEqual(['ari-ash']);
    const solo = initialState('quiet-reach');
    const action = { ...create(), campaignId: 'quiet-reach' } as PreviewAction;
    expect(
      previewReducer(solo, action).adventures.at(-1)?.participantCharacterIds,
    ).toEqual(['ari-fern']);
  });
  it('selects only owned campaign characters and falls back from a stale selection', () => {
    const selected = previewReducer(initialState(), {
      type: 'context',
      characterId: 'bea-moss',
    });
    expect(selected.selectedCharacterId).toBe('ari-lark');
    expect(ownedCharacters('preview-ari', 'lantern-coast')).toHaveLength(2);
    const stale = { ...selected, selectedCharacterId: 'missing' };
    expect(
      previewReducer(stale, create()).adventures.at(-1)
        ?.participantCharacterIds,
    ).toEqual(['ari-lark']);
  });
  it('blocks creation without an owned character', () => {
    const state = previewReducer(initialState('quiet-reach'), {
      type: 'context',
      viewerId: 'preview-dena',
    });
    const result = previewReducer(state, {
      ...create(),
      campaignId: 'quiet-reach',
      viewerId: 'preview-dena',
    } as PreviewAction);
    expect(result.error).toContain('owned character');
    expect(result.adventures).toBe(state.adventures);
  });
  it('rejects whitespace and invalid runtime status/type without changing records', () => {
    const state = initialState();
    for (const draft of [
      { title: '   ' },
      { type: 'Main' },
      { status: 'Adjudicated' },
    ]) {
      const result = previewReducer(
        state,
        create(draft as Partial<AdventureDraft>),
      );
      expect(result.error).not.toBeNull();
      expect(result.adventures).toBe(state.adventures);
    }
  });
  it('edits fields without changing participants, audience, creator, or unrelated records', () => {
    const state = initialState();
    const before = state.adventures[0];
    const result = previewReducer(state, {
      ...create(),
      id: before.id,
      draft: {
        ...before,
        title: 'A revised goal',
        type: 'Side',
        status: 'On hold',
        nextStep: 'Find the pilot.',
        description: 'Player-entered text.',
      },
    } as PreviewAction);
    expect(result.adventures[0]).toEqual({
      ...before,
      title: 'A revised goal',
      type: 'Side',
      status: 'On hold',
      nextStep: 'Find the pilot.',
      description: 'Player-entered text.',
      updatedAt: now,
    });
    expect(result.adventures.slice(1)).toEqual(state.adventures.slice(1));
    expect(state.adventures[0]).toBe(before);
  });
  it('retains completed records and reopens as In progress', () => {
    let state = initialState();
    const adventure = state.adventures[0];
    for (const status of ['Completed', 'In progress'] as const) {
      state = previewReducer(state, {
        ...create(),
        id: adventure.id,
        draft: { ...adventure, status },
      } as PreviewAction);
      expect(accessibleAdventure(state, adventure.id)?.status).toBe(status);
      expect(state.adventures).toHaveLength(4);
    }
  });
  it('filters before list counts and gives readers and organizers no override', () => {
    const state = initialState();
    expect(visibleAdventures(state)).toHaveLength(3);
    expect(
      visibleAdventures(state).filter((item) => item.status === 'Completed'),
    ).toHaveLength(1);
    for (const viewerId of ['preview-bea', 'preview-cato', 'preview-dena']) {
      const other = previewReducer(state, { type: 'context', viewerId });
      expect(accessibleAdventure(other, 'lighthouse-letter')).toBeUndefined();
      expect(accessibleAdventure(other, 'nonexistent')).toBeUndefined();
      expect(
        visibleAdventures(other).some((item) =>
          item.title.includes('lighthouse'),
        ),
      ).toBe(false);
      expect(visibleAdventures(other)).toHaveLength(
        viewerId === 'preview-bea' ? 1 : 0,
      );
    }
  });
  it('rejects direct mutations, cross-campaign mutations, and stale viewer submissions', () => {
    const state = initialState();
    const results = [
      previewReducer(state, {
        ...create(),
        id: 'garden-gate',
      } as PreviewAction),
      previewReducer(state, { ...create(), id: 'missing' } as PreviewAction),
      previewReducer(state, {
        ...create(),
        campaignId: 'quiet-reach',
      } as PreviewAction),
      previewReducer(
        previewReducer(state, { type: 'context', viewerId: 'preview-bea' }),
        create(),
      ),
    ];
    for (const result of results) {
      expect(result.error).toBe(
        'This adventure is unavailable. Return to Adventures.',
      );
      expect(result.adventures).toEqual(state.adventures);
    }
    const otherCampaign = previewReducer(state, {
      type: 'context',
      campaignId: 'quiet-reach',
    });
    expect(visibleAdventures(otherCampaign)).toEqual([]);
  });
  it('retains the original records on simulated failure and permits an explicit retry', () => {
    const state = previewReducer(initialState(), {
      type: 'failure',
      enabled: true,
    });
    const failed = previewReducer(state, create());
    expect(failed.error).toContain('draft is still here');
    expect(failed.adventures).toBe(state.adventures);
    expect(failed.failNextSave).toBe(false);
    expect(previewReducer(failed, create()).error).toBeNull();
  });
  it('keeps records unchanged during draft cancellation and restores independent fixtures on reset', () => {
    const state = initialState();
    const canceled = previewReducer(state, {
      type: 'context',
      campaignId: 'quiet-reach',
    });
    expect(canceled.adventures).toBe(state.adventures);
    const changed = previewReducer(state, create());
    const reset = previewReducer(changed, {
      type: 'reset',
      campaignId: 'lantern-coast',
    });
    expect(reset).toEqual(initialState());
    reset.adventures[0].participantCharacterIds.push('not-a-fixture');
    expect(fixtureAdventures()[0].participantCharacterIds).toEqual([
      'ari-lark',
    ]);
  });
  it('round-trips preview list, new, and direct-detail routes without exposing a viewer in the URL', () => {
    for (const hash of [
      '#/campaigns/lantern-coast/adventures',
      '#/campaigns/quiet-reach/adventures/new',
      '#/campaigns/lantern-coast/adventures/silver-compass?view=completed',
    ]) {
      expect(routeHash(readRoute(hash))).toBe(hash);
    }
    expect(readRoute('#/characters/live-id').campaignId).toBe('');
    expect(readRoute('').campaignId).toBe('lantern-coast');
  });
});
