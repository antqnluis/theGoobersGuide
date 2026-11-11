import { describe, expect, it } from 'vitest';
import { sampleCampaign, sampleCharacter } from '../src/design/sampleData';
import { sheetTabIds } from '../src/features/characters/model';
import {
  isSheetTabOrder,
  moveSheetTab,
  normalizeSheetTabOrder,
} from '../src/features/characters/sheetTabOrder';
import {
  characterExportDocument,
  characterToMarkdown,
} from '../src/features/characters/characterExport';
import { parseCharacterImport } from '../src/features/characters/characterImport';
import {
  applyCharacterImportUpdate,
  CHARACTER_UPDATE_FORMAT,
  CHARACTER_UPDATE_VERSION,
  parseCharacterUpdateImport,
} from '../src/features/characters/characterUpdateImport';
import { saveCharacter } from '../src/features/characters/characterService';
import {
  APP_STORAGE_KEY,
  LocalStorageRepository,
} from '../src/shared/persistence/localStorageRepository';
import { emptyAppData, SCHEMA_VERSION } from '../src/shared/persistence/model';
import { isCharacter } from '../src/shared/persistence/validation';

const customOrder = moveSheetTab(sheetTabIds, 'inventory', 0);

function setup() {
  const storage = new Map<string, string>();
  const repository = new LocalStorageRepository({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
  });
  const otherCampaign = {
    ...sampleCampaign,
    id: 'other-campaign',
    partyMemberCharacterIds: [],
  };
  const otherCharacter = {
    ...sampleCharacter,
    id: 'other-character',
    campaignId: otherCampaign.id,
  };
  const sibling = { ...sampleCharacter, id: 'sibling' };
  const data = {
    ...emptyAppData(),
    campaigns: [sampleCampaign, otherCampaign],
    characters: [sampleCharacter, sibling, otherCharacter],
  };
  return { storage, repository, data };
}

describe('character sheet tab order', () => {
  it.each([undefined, null, 'inventory', {}, []])(
    'defaults missing or unusable order %j',
    (value) => {
      expect(normalizeSheetTabOrder(value)).toEqual(sheetTabIds);
    },
  );

  it('removes invalid and duplicate IDs and appends missing tabs in default order', () => {
    expect(
      normalizeSheetTabOrder([
        'spells',
        'inventory',
        'spells',
        null,
        'gear',
        {},
        2,
      ]),
    ).toEqual([
      'spells',
      'inventory',
      'overview',
      'skills',
      'features',
      'notes',
    ]);
    expect(isSheetTabOrder(customOrder)).toBe(true);
    expect(isSheetTabOrder(['spells', 'inventory'])).toBe(false);
    expect(isSheetTabOrder([...sheetTabIds, 'spells'])).toBe(false);
    expect(isSheetTabOrder([...sheetTabIds.slice(0, -1), 'gear'])).toBe(false);
  });

  it('moves every tab in either direction without mutating the starting order', () => {
    for (const id of sheetTabIds) {
      for (
        let destination = 0;
        destination < sheetTabIds.length;
        destination++
      ) {
        const source = [...sheetTabIds];
        const moved = moveSheetTab(source, id, destination);
        expect(moved[destination]).toBe(id);
        expect(moved.filter((tab) => tab !== id)).toEqual(
          source.filter((tab) => tab !== id),
        );
        expect(isSheetTabOrder(moved)).toBe(true);
        expect(source).toEqual(sheetTabIds);
      }
    }
  });

  it.each([-1, 6, 1.5, NaN, Infinity])(
    'ignores out-of-range destination %s',
    (destination) => {
      expect(moveSheetTab(customOrder, 'inventory', destination)).toEqual(
        customOrder,
      );
    },
  );

  it('persists a character order after refresh and preserves other characters and campaigns', () => {
    const { repository, data } = setup();
    const next = saveCharacter(
      repository,
      data,
      { ...sampleCharacter, sheetTabOrder: customOrder },
      'player-one',
    );
    const loaded = repository.load();
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.characters[0]).toEqual(next.characters[0]);
    expect(loaded.characters[0].sheetTabOrder).toEqual(customOrder);
    expect(loaded.characters.slice(1)).toEqual(data.characters.slice(1));
    expect(loaded.campaigns).toEqual(data.campaigns);
  });

  it('retains old records without requiring a migration', () => {
    const { repository, storage, data } = setup();
    storage.set(APP_STORAGE_KEY, JSON.stringify(data));
    expect(repository.load()).toEqual(data);
    expect(repository.getStatus().kind).toBe('ready');
    expect(
      normalizeSheetTabOrder(repository.load().characters[0].sheetTabOrder),
    ).toEqual(sheetTabIds);
  });

  it.each([null, 'inventory', ['spells', 'spells', 'gear', 'inventory']])(
    'recovers malformed saved order %j without losing gameplay data',
    (value) => {
      const { repository, storage, data } = setup();
      storage.set(
        APP_STORAGE_KEY,
        JSON.stringify({
          ...data,
          characters: [
            { ...sampleCharacter, sheetTabOrder: value },
            ...data.characters.slice(1),
          ],
        }),
      );
      const loaded = repository.load();
      expect(loaded.characters[0]).toEqual({
        ...sampleCharacter,
        sheetTabOrder: normalizeSheetTabOrder(value),
      });
      expect(loaded.characters.slice(1)).toEqual(data.characters.slice(1));
      expect(isCharacter(loaded.characters[0])).toBe(true);
    },
  );

  it('rejects saving another owner’s tab order without writing data', () => {
    const { repository, storage, data } = setup();
    expect(() =>
      saveCharacter(
        repository,
        data,
        { ...sampleCharacter, sheetTabOrder: customOrder },
        'player-two',
      ),
    ).toThrow('only edit your own');
    expect(storage.size).toBe(0);
  });

  it('excludes layout metadata from exports and ignores it on new-character import', () => {
    const character = { ...sampleCharacter, sheetTabOrder: customOrder };
    const exported = characterExportDocument(character);
    expect(exported.character).not.toHaveProperty('sheetTabOrder');
    expect(characterToMarkdown(character)).toBe(
      characterToMarkdown(sampleCharacter),
    );
    const imported = parseCharacterImport(
      JSON.stringify({
        ...exported,
        character: { ...exported.character, sheetTabOrder: ['spells'] },
      }),
      sampleCampaign.id,
    );
    expect(imported.sheetTabOrder).toBeUndefined();
  });

  it('preserves the existing order when applying a reviewed gameplay update', () => {
    const current = { ...sampleCharacter, sheetTabOrder: customOrder };
    const update = parseCharacterUpdateImport(
      JSON.stringify({
        format: CHARACTER_UPDATE_FORMAT,
        version: CHARACTER_UPDATE_VERSION,
        changes: { fields: { set: { name: 'Updated character' } } },
      }),
      current,
    );
    expect(update.issues).toEqual([]);
    const updated = applyCharacterImportUpdate(
      current,
      update,
      new Set(update.changes.map((change) => change.id)),
    );
    expect(updated.name).toBe('Updated character');
    expect(updated.sheetTabOrder).toEqual(customOrder);
    expect(updated.inventory).toEqual(current.inventory);
  });

  it('does not allow a gameplay update to replace the local tab order', () => {
    expect(() =>
      parseCharacterUpdateImport(
        JSON.stringify({
          format: CHARACTER_UPDATE_FORMAT,
          version: CHARACTER_UPDATE_VERSION,
          changes: { fields: { set: { sheetTabOrder: customOrder } } },
        }),
        sampleCharacter,
      ),
    ).toThrow();
  });
});
