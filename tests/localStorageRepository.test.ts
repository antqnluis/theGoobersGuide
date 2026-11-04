import { describe, expect, it } from 'vitest';
import type { Campaign } from '../src/features/campaigns/model';
import type { Character } from '../src/features/characters/model';
import type { CampaignNote } from '../src/features/notes/model';
import {
  APP_STORAGE_KEY,
  LocalStorageRepository,
} from '../src/shared/persistence/localStorageRepository';
import { emptyAppData, SCHEMA_VERSION } from '../src/shared/persistence/model';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    keys: () => [...values.keys()],
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
  spells: [],
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
      JSON.stringify({ ...emptyAppData(), schemaVersion: SCHEMA_VERSION + 1 }),
    );
    expect(repository.load()).toEqual(emptyAppData());
  });

  it('refuses to save orphaned data', () => {
    const repository = new LocalStorageRepository(memoryStorage());
    expect(() =>
      repository.save({ ...emptyAppData(), characters: [character] }),
    ).toThrow('Cannot save invalid application data');
  });

  it('protects malformed and future-version data from an empty-data save', () => {
    for (const raw of [
      '{bad json',
      JSON.stringify({ ...emptyAppData(), schemaVersion: SCHEMA_VERSION + 1 }),
    ]) {
      const storage = memoryStorage();
      storage.setItem(APP_STORAGE_KEY, raw);
      const repository = new LocalStorageRepository(storage);

      expect(repository.load()).toEqual(emptyAppData());
      expect(repository.getStatus().kind).toBe('blocked');
      expect(() => repository.save(emptyAppData())).toThrow(
        'protected from being replaced',
      );
      expect(storage.getItem(APP_STORAGE_KEY)).toBe(raw);
    }
  });

  it('deduplicates damaged current-version data and backs up the original before saving', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({
      ...emptyAppData(),
      campaigns: [campaign, campaign],
      characters: [character, character],
      notes: [note, note],
    });
    storage.setItem(APP_STORAGE_KEY, raw);
    const repository = new LocalStorageRepository(storage);

    const loaded = repository.load();
    expect(loaded.campaigns).toEqual([campaign]);
    expect(loaded.characters).toEqual([character]);
    expect(loaded.notes).toEqual([note]);
    expect(repository.getStatus().kind).toBe('recovered');

    repository.save(loaded);
    const backupKey = storage
      .keys()
      .find((key) => key.startsWith(`${APP_STORAGE_KEY}:recovery:`));
    expect(backupKey).toBeDefined();
    expect(storage.getItem(backupKey!)).toBe(raw);
    expect(new LocalStorageRepository(storage).load()).toEqual(loaded);
  });

  it('migrates version 1 data without legacy spell text and backs up the original', () => {
    const storage = memoryStorage();
    const legacyCharacter = { ...character, spells: 'Hunter’s Mark' };
    const raw = JSON.stringify({
      schemaVersion: 1,
      campaigns: [campaign],
      characters: [legacyCharacter],
      notes: [note],
    });
    storage.setItem(APP_STORAGE_KEY, raw);
    const repository = new LocalStorageRepository(storage);

    const loaded = repository.load();
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.campaigns).toEqual([campaign]);
    expect(loaded.notes).toEqual([note]);
    expect(loaded.characters).toEqual([{ ...character, spells: [] }]);
    expect(repository.getStatus()).toMatchObject({
      kind: 'recovered',
      message: expect.stringContaining('spell text was not carried'),
    });

    repository.save(loaded);
    const backupKey = storage
      .keys()
      .find((key) => key.startsWith(`${APP_STORAGE_KEY}:recovery:`));
    expect(backupKey).toBeDefined();
    expect(storage.getItem(backupKey!)).toBe(raw);
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEY)!)).toEqual(loaded);
    expect(repository.getStatus()).toMatchObject({
      kind: 'recovered',
      message: expect.stringContaining('Saved data was upgraded'),
    });
  });

  it('stays usable without crashing when browser storage cannot be read', () => {
    const repository = new LocalStorageRepository({
      getItem: () => {
        throw new Error('Storage unavailable');
      },
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    });

    expect(repository.load()).toEqual(emptyAppData());
    expect(repository.getStatus().kind).toBe('blocked');
    expect(() => repository.save(emptyAppData())).toThrow(
      'protected from being replaced',
    );
  });
});
