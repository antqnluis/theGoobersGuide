import { describe, expect, it } from 'vitest';
import {
  createCampaign,
  deleteCampaign,
} from '../src/features/campaigns/campaignService';
import {
  abilityModifier,
  deleteCharacter,
  newCharacter,
  selectCharacter,
  selectedCharacterId,
  saveCharacter as saveCharacterForUser,
  deleteCharacter as deleteCharacterForUser,
} from '../src/features/characters/characterService';
import type { DemoUserId } from '../src/features/auth/demoAuth';
import type { AppData, AppRepository } from '../src/shared/persistence/model';
import type { Character } from '../src/features/characters/model';
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
  });
  const second = createCampaign(repository, first.data, {
    name: 'Second',
  });
  return {
    store,
    repository,
    first: first.campaign,
    second: second.campaign,
    data: second.data,
  };
}

function saveCharacter(
  repository: AppRepository,
  data: AppData,
  character: Character,
  actorUserId: DemoUserId = 'player-one',
) {
  return saveCharacterForUser(repository, data, character, actorUserId);
}

function deleteCharacter(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
  actorUserId: DemoUserId = 'player-one',
) {
  return deleteCharacterForUser(
    repository,
    data,
    campaignId,
    characterId,
    actorUserId,
  );
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
      level: 4,
      abilityScores: {
        ...a.abilityScores,
        strength: { score: 18, modifier: 7 },
      },
      combat: { ...a.combat, currentHp: 7 },
      skills: [{ name: 'Athletics', modifier: 11, proficient: true }],
      savingThrows: [
        { ability: 'strength' as const, modifier: 5, proficient: true },
      ],
      attacks: [
        {
          id: 'attack',
          name: 'Longsword',
          attackBonus: 9,
          damageExpression: '1d8 + 4',
        },
      ],
      inventory: [{ id: 'item', name: 'Rope', quantity: 2 }],
      currency: { gp: 12 },
      features: [{ id: 'feature', name: 'Custom', description: 'Homebrew' }],
      notes: 'Keep watch.',
      spells: [
        {
          id: 'spell',
          name: 'Fog Cloud',
          level: 1,
          school: 'Conjuration',
          castingTime: '1 action',
          range: '120 feet',
          components: 'V, S',
          duration: 'Up to 1 hour',
          concentration: true,
          ritual: false,
          prepared: true,
          description: 'Create an obscuring cloud of fog.',
        },
      ],
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
    expect(repository.load().characters.find((c) => c.id === a.id)?.level).toBe(
      4,
    );
    expect(updated.characters.find((c) => c.id === a.id)).toMatchObject({
      abilityScores: { strength: { score: 18, modifier: 7 } },
      skills: [{ name: 'Athletics', modifier: 11, proficient: true }],
      savingThrows: [{ ability: 'strength', modifier: 5, proficient: true }],
      attacks: [{ name: 'Longsword', attackBonus: 9 }],
      notes: 'Keep watch.',
      spells: [{ name: 'Fog Cloud', level: 1, prepared: true }],
    });
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

  it('assigns character ownership and rejects edits or deletion by another demo user', () => {
    const { repository, data, first } = setup();
    const spoofedOwner = {
      ...newCharacter(first.id, 'player-two'),
      name: 'Arlen',
    };
    const afterFirst = saveCharacter(
      repository,
      data,
      spoofedOwner,
      'player-one',
    );
    const firstCharacter = afterFirst.characters[0];
    expect(firstCharacter.ownerUserId).toBe('player-one');

    const secondCharacter = {
      ...newCharacter(first.id, 'player-two'),
      name: 'Mara',
    };
    const bothSaved = saveCharacter(
      repository,
      afterFirst,
      secondCharacter,
      'player-two',
    );
    const updatedFirst = saveCharacter(
      repository,
      bothSaved,
      { ...firstCharacter, ownerUserId: 'player-two', name: 'Arlen Vale' },
      'player-one',
    );

    expect(
      updatedFirst.characters.find(
        (character) => character.id === firstCharacter.id,
      ),
    ).toMatchObject({ name: 'Arlen Vale', ownerUserId: 'player-one' });
    expect(() =>
      saveCharacter(
        repository,
        updatedFirst,
        { ...firstCharacter, name: 'Changed by another player' },
        'player-two',
      ),
    ).toThrow('only edit your own characters');
    expect(() =>
      deleteCharacter(
        repository,
        updatedFirst,
        first.id,
        firstCharacter.id,
        'player-two',
      ),
    ).toThrow('only delete your own characters');
    expect(
      selectedCharacterId(
        selectCharacter(repository, updatedFirst, first.id, firstCharacter.id),
        first.id,
        'player-two',
      ),
    ).toBe(secondCharacter.id);
  });

  it('remembers one valid selected character per campaign and falls back after deletion', () => {
    const { repository, data, first, second } = setup();
    const a = { ...newCharacter(first.id), name: 'A' };
    const b = { ...newCharacter(first.id), name: 'B' };
    const c = { ...newCharacter(second.id), name: 'C' };
    const saved = saveCharacter(
      repository,
      saveCharacter(repository, saveCharacter(repository, data, a), b),
      c,
    );
    const firstSelected = selectCharacter(repository, saved, first.id, b.id);
    const selected = selectCharacter(
      repository,
      firstSelected,
      second.id,
      c.id,
    );

    expect(selectedCharacterId(selected, first.id)).toBe(b.id);
    expect(selectedCharacterId(selected, second.id)).toBe(c.id);
    expect(repository.load().preferences.selectedCharacterByCampaign).toEqual({
      [first.id]: b.id,
      [second.id]: c.id,
    });
    expect(() => selectCharacter(repository, selected, first.id, c.id)).toThrow(
      'not found in this campaign',
    );

    const afterDelete = deleteCharacter(repository, selected, first.id, b.id);
    expect(afterDelete.preferences.selectedCharacterByCampaign[first.id]).toBe(
      undefined,
    );
    expect(selectedCharacterId(afterDelete, first.id)).toBe(a.id);
    expect(selectedCharacterId(afterDelete, second.id)).toBe(c.id);
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
    const selected = selectCharacter(repository, saved, first.id, a.id);
    const afterDelete = deleteCampaign(repository, selected, first.id);
    expect(afterDelete.characters.map((c) => c.id)).toEqual([b.id]);
    expect(afterDelete.preferences.selectedCharacterByCampaign[first.id]).toBe(
      undefined,
    );
  });

  it('rejects invalid level, hit points and currency without changing saved data', () => {
    const { repository, data, first } = setup();
    const character = { ...newCharacter(first.id), name: 'A' };
    const saved = saveCharacter(repository, data, character);

    expect(() =>
      saveCharacter(repository, saved, { ...character, level: 0 }),
    ).toThrow('Level must be at least 1');
    expect(() =>
      saveCharacter(repository, saved, { ...character, level: 1.5 }),
    ).toThrow('Level must be at least 1');

    expect(() =>
      saveCharacter(repository, saved, {
        ...character,
        combat: { ...character.combat, currentHp: 1.5 },
      }),
    ).toThrow('nonnegative whole number');
    expect(() =>
      saveCharacter(repository, saved, {
        ...character,
        currency: { gp: -1 },
      }),
    ).toThrow('nonnegative whole number');
    expect(repository.load()).toEqual(saved);
  });

  it('rejects blank spell names and spell levels outside 0 through 9', () => {
    const { repository, data, first } = setup();
    const character = { ...newCharacter(first.id), name: 'A' };
    const spell = {
      id: 'spell',
      name: 'Light',
      level: 0,
      school: 'Evocation',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V, M',
      duration: '1 hour',
      concentration: false,
      ritual: false,
      prepared: false,
      description: 'Make an object shed light.',
    };

    expect(() =>
      saveCharacter(repository, data, {
        ...character,
        spells: [{ ...spell, name: ' ' }],
      }),
    ).toThrow('Spells need a name');
    for (const level of [-1, 1.5, 10]) {
      expect(() =>
        saveCharacter(repository, data, {
          ...character,
          spells: [{ ...spell, level }],
        }),
      ).toThrow('Spell levels must be whole numbers from 0 to 9');
    }
    expect(repository.load()).toEqual(data);
  });
});
