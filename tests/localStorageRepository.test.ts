import { describe, expect, it } from 'vitest';
import type { Campaign } from '../src/features/campaigns/model';
import type { Character } from '../src/features/characters/model';
import type { CampaignNote } from '../src/features/notes/model';
import { LocalStorageRepository } from '../src/shared/persistence/localStorageRepository';
import { emptyAppData } from '../src/shared/persistence/model';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const campaign: Campaign = {
  id: 'campaign-1',
  name: 'Journey to Asterholm',
  partyName: 'The Bad Company',
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
};

const character: Character = {
  id: 'character-1',
  campaignId: campaign.id,
  name: 'Soren',
  className: 'Fighter',
  species: 'Human',
  level: 1,
  abilityScores: {
    strength: { score: 16, modifier: 3 },
    dexterity: { score: 12, modifier: 1 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 10, modifier: 0 },
    wisdom: { score: 11, modifier: 0 },
    charisma: { score: 8, modifier: -1 },
  },
  combat: {
    currentHp: 12,
    maximumHp: 12,
    temporaryHp: 0,
    armorClass: 16,
    initiativeModifier: 1,
    speed: 30,
    proficiencyBonus: 2,
  },
  skills: [],
  savingThrows: [],
  attacks: [],
  inventory: [],
  currency: { gold: 10 },
  features: [],
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
};

const note: CampaignNote = {
  id: 'note-1',
  campaignId: campaign.id,
  title: 'First session',
  content: 'The party met.',
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
};

describe('LocalStorageRepository', () => {
  it('starts with empty data when nothing is stored', () => {
    expect(new LocalStorageRepository(memoryStorage()).load()).toEqual(
      emptyAppData(),
    );
  });

  it('round trips campaign-linked records', () => {
    const storage = memoryStorage();
    const repository = new LocalStorageRepository(storage);
    const data = {
      ...emptyAppData(),
      campaigns: [campaign],
      characters: [character],
      notes: [note],
    };

    repository.save(data);

    expect(new LocalStorageRepository(storage).load()).toEqual(data);
  });

  it('recovers valid records and drops malformed or orphaned records', () => {
    const storage = memoryStorage();
    storage.setItem(
      'the-goobers-guide:data',
      JSON.stringify({
        ...emptyAppData(),
        campaigns: [campaign, { id: 'broken' }],
        characters: [
          character,
          { ...character, id: 'orphan', campaignId: 'missing' },
        ],
        notes: [note, { ...note, id: 'invalid', content: 42 }],
      }),
    );

    expect(new LocalStorageRepository(storage).load()).toEqual({
      ...emptyAppData(),
      campaigns: [campaign],
      characters: [character],
      notes: [note],
    });
  });

  it('does not crash on invalid JSON or an unknown schema version', () => {
    const storage = memoryStorage();
    const repository = new LocalStorageRepository(storage);
    storage.setItem('the-goobers-guide:data', '{bad json');
    expect(repository.load()).toEqual(emptyAppData());

    storage.setItem(
      'the-goobers-guide:data',
      JSON.stringify({ ...emptyAppData(), schemaVersion: 2 }),
    );
    expect(repository.load()).toEqual(emptyAppData());
  });

  it('refuses to save orphaned data', () => {
    const repository = new LocalStorageRepository(memoryStorage());
    expect(() =>
      repository.save({ ...emptyAppData(), characters: [character] }),
    ).toThrow('Cannot save invalid application data');
  });
});
