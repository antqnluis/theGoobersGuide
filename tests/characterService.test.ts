import { describe, expect, it } from 'vitest';
import {
  createCampaign,
  deleteCampaign,
} from '../src/features/campaigns/campaignService';
import {
  abilityModifier,
  deleteCharacter,
  newCharacter,
  saveCharacter,
} from '../src/features/characters/characterService';
import {
  LocalStorageRepository,
  APP_STORAGE_KEY,
} from '../src/shared/persistence/localStorageRepository';
import { emptyAppData } from '../src/shared/persistence/model';

function setup() {
  const store = new Map<string, string>();
  const repository = new LocalStorageRepository({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  });
  const first = createCampaign(repository, emptyAppData(), {
    name: 'First',
    partyName: 'One',
  });
  const second = createCampaign(repository, first.data, {
    name: 'Second',
    partyName: 'Two',
  });
  return {
    store,
    repository,
    first: first.campaign,
    second: second.campaign,
    data: second.data,
  };
}

describe('character management', () => {
  it('creates, updates and deletes only the selected campaign character across reloads', () => {
    const { repository, data, first, second } = setup();
    const a = { ...newCharacter(first.id), name: 'A' };
    const b = { ...newCharacter(second.id), name: 'B' };
    const saved = saveCharacter(
      repository,
      saveCharacter(repository, data, a),
      b,
    );
    const edited = {
      ...a,
      name: 'Updated',
      combat: { ...a.combat, currentHp: 7 },
      inventory: [{ id: 'item', name: 'Rope', quantity: 2 }],
      currency: { gp: 12 },
      features: [{ id: 'feature', name: 'Custom', description: 'Homebrew' }],
    };
    const updated = saveCharacter(repository, saved, edited);
    expect(
      new LocalStorageRepository({
        getItem: (key) => JSON.stringify(updated),
        setItem: () => {},
      }).load().characters,
    ).toHaveLength(2);
    expect(
      updated.characters.find((c) => c.id === a.id)?.combat.currentHp,
    ).toBe(7);
    expect(
      updated.characters.find((c) => c.id === a.id)?.inventory[0].quantity,
    ).toBe(2);
    expect(updated.characters.find((c) => c.id === a.id)?.currency.gp).toBe(12);
    expect(
      updated.characters.find((c) => c.id === a.id)?.features[0].name,
    ).toBe('Custom');
    expect(updated.characters.find((c) => c.id === b.id)?.name).toBe('B');
    expect(() =>
      saveCharacter(repository, updated, { ...a, campaignId: second.id }),
    ).toThrow();
    const after = deleteCharacter(repository, updated, first.id, a.id);
    expect(after.characters.map((c) => c.id)).toEqual([b.id]);
    expect(repository.load()).toEqual(after);
    expect(() => deleteCharacter(repository, after, first.id, b.id)).toThrow();
  });

  it('calculates standard ability modifiers, including negative odd scores', () => {
    expect([1, 9, 10, 11, 17, 20].map(abilityModifier)).toEqual([
      -5, -1, 0, 0, 3, 5,
    ]);
  });

  it('recovers incomplete records and ignores unrelated or unidentifiable records', () => {
    const { store, repository, data, first } = setup();
    store.set(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...data,
        characters: [
          {
            id: 'partial',
            campaignId: first.id,
            name: 'Recovered',
            combat: { currentHp: 8 },
          },
          { id: 'orphan', campaignId: 'missing', name: 'Lost' },
          { name: 'No ID', campaignId: first.id },
        ],
      }),
    );
    const loaded = repository.load();
    expect(loaded.characters).toHaveLength(1);
    expect(loaded.characters[0].combat.currentHp).toBe(8);
    expect(loaded.characters[0].inventory).toEqual([]);
    expect(loaded.characters[0].id).toBe('partial');
  });

  it('campaign deletion cascades through saved characters', () => {
    const { repository, data, first, second } = setup();
    const a = { ...newCharacter(first.id), name: 'A' };
    const b = { ...newCharacter(second.id), name: 'B' };
    const saved = saveCharacter(
      repository,
      saveCharacter(repository, data, a),
      b,
    );
    expect(
      deleteCampaign(repository, saved, first.id).characters.map((c) => c.id),
    ).toEqual([b.id]);
  });
});
