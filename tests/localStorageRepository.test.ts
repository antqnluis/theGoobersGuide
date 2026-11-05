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
  partyMemberCharacterIds: [],
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
};

const character: Character = {
  id: 'character-1',
  campaignId: campaign.id,
  ownerUserId: 'player-one',
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

  it('persists a validated local character portrait', () => {
    const storage = memoryStorage();
    const repository = new LocalStorageRepository(storage);
    const data = {
      ...emptyAppData(),
      campaigns: [campaign],
      characters: [
        { ...character, portraitDataUrl: 'data:image/jpeg;base64,YWJj' },
      ],
    };

    repository.save(data);

    expect(new LocalStorageRepository(storage).load()).toEqual(data);
  });

  it('persists a validated campaign map image', () => {
    const storage = memoryStorage();
    const repository = new LocalStorageRepository(storage);
    const data = {
      ...emptyAppData(),
      campaigns: [{ ...campaign, mapDataUrl: 'data:image/jpeg;base64,YWJj' }],
    };

    repository.save(data);

    expect(new LocalStorageRepository(storage).load()).toEqual(data);
  });

  it('recovers a campaign when its stored map image is invalid', () => {
    const storage = memoryStorage();
    storage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...emptyAppData(),
        campaigns: [
          { ...campaign, mapDataUrl: 'data:image/png;base64,not-valid' },
        ],
      }),
    );
    const repository = new LocalStorageRepository(storage);

    const loaded = repository.load();

    expect(loaded.campaigns).toHaveLength(1);
    expect(loaded.campaigns[0].id).toBe(campaign.id);
    expect(loaded.campaigns[0].mapDataUrl).toBeUndefined();
    expect(repository.getStatus().kind).toBe('recovered');
  });

  it('reports browser storage quota failures clearly', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      const error = new Error('quota reached');
      error.name = 'QuotaExceededError';
      throw error;
    };
    const repository = new LocalStorageRepository(storage);

    expect(() =>
      repository.save({ ...emptyAppData(), campaigns: [campaign] }),
    ).toThrow('Browser storage is full');
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
    expect(loaded.schemaVersion).toBe(5);
    expect(loaded.campaigns).toEqual([
      { ...campaign, partyMemberCharacterIds: [character.id] },
    ]);
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

  it('migrates version 2 data with empty character preferences', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({
      schemaVersion: 2,
      campaigns: [campaign],
      characters: [character],
      notes: [note],
    });
    storage.setItem(APP_STORAGE_KEY, raw);
    const repository = new LocalStorageRepository(storage);

    const loaded = repository.load();
    expect(loaded).toMatchObject({
      schemaVersion: 5,
      campaigns: [{ ...campaign, partyMemberCharacterIds: [character.id] }],
      characters: [character],
      notes: [note],
      preferences: { selectedCharacterByCampaign: {} },
    });
    expect(repository.getStatus()).toMatchObject({
      kind: 'recovered',
      message: expect.stringContaining('character preferences'),
    });

    repository.save(loaded);
    expect(
      storage
        .keys()
        .some((key) => key.startsWith(`${APP_STORAGE_KEY}:recovery:`)),
    ).toBe(true);
  });

  it('migrates schema version 3 characters to Player One and backs up the source', () => {
    const storage = memoryStorage();
    const legacyCharacter = { ...character };
    delete (legacyCharacter as Partial<Character>).ownerUserId;
    const raw = JSON.stringify({
      schemaVersion: 3,
      campaigns: [campaign],
      characters: [legacyCharacter],
      notes: [note],
      preferences: { selectedCharacterByCampaign: {} },
    });
    storage.setItem(APP_STORAGE_KEY, raw);
    const repository = new LocalStorageRepository(storage);

    const loaded = repository.load();
    expect(loaded.schemaVersion).toBe(5);
    expect(loaded.campaigns).toEqual([
      { ...campaign, partyMemberCharacterIds: [character.id] },
    ]);
    expect(loaded.characters).toMatchObject([
      { id: character.id, ownerUserId: 'player-one' },
    ]);
    expect(repository.getStatus()).toMatchObject({
      kind: 'recovered',
      message: expect.stringContaining('assigned to Player One'),
    });

    repository.save(loaded);
    const backupKey = storage
      .keys()
      .find((key) => key.startsWith(`${APP_STORAGE_KEY}:recovery:`));
    expect(backupKey).toBeDefined();
    expect(storage.getItem(backupKey!)).toBe(raw);
  });

  it('migrates version 4 party rosters while keeping demo character owners', () => {
    const storage = memoryStorage();
    const playerTwoCharacter = {
      ...character,
      id: 'character-two',
      ownerUserId: 'player-two' as const,
    };
    const legacyCampaign = { ...campaign } as Partial<Campaign>;
    delete legacyCampaign.partyMemberCharacterIds;
    const raw = JSON.stringify({
      schemaVersion: 4,
      campaigns: [legacyCampaign],
      characters: [character, playerTwoCharacter],
      notes: [note],
      preferences: { selectedCharacterByCampaign: {} },
    });
    storage.setItem(APP_STORAGE_KEY, raw);
    const repository = new LocalStorageRepository(storage);

    const loaded = repository.load();

    expect(loaded.schemaVersion).toBe(5);
    expect(loaded.campaigns[0].partyMemberCharacterIds).toEqual([
      character.id,
      playerTwoCharacter.id,
    ]);
    expect(loaded.characters.map((item) => item.ownerUserId)).toEqual([
      'player-one',
      'player-two',
    ]);
    expect(repository.getStatus()).toMatchObject({
      kind: 'recovered',
      message: expect.stringContaining('existing campaign characters'),
    });

    repository.save(loaded);
    const backupKey = storage
      .keys()
      .find((key) => key.startsWith(`${APP_STORAGE_KEY}:recovery:`));
    expect(backupKey).toBeDefined();
    expect(storage.getItem(backupKey!)).toBe(raw);
  });

  it('recovers only campaign-scoped character preferences', () => {
    const storage = memoryStorage();
    const secondCampaign = { ...campaign, id: 'campaign-2', name: 'Second' };
    const raw = JSON.stringify({
      ...emptyAppData(),
      campaigns: [campaign, secondCampaign],
      characters: [character],
      preferences: {
        selectedCharacterByCampaign: {
          [campaign.id]: character.id,
          [secondCampaign.id]: character.id,
          missing: 'missing-character',
        },
      },
    });
    storage.setItem(APP_STORAGE_KEY, raw);

    expect(new LocalStorageRepository(storage).load().preferences).toEqual({
      selectedCharacterByCampaign: { [campaign.id]: character.id },
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
