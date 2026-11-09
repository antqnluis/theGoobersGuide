import { describe, expect, it } from 'vitest';
import { sampleCampaign, sampleCharacter } from '../src/design/sampleData';
import { withInventoryQuantity } from '../src/features/characters/inventoryQuantity';
import { saveCharacter } from '../src/features/characters/characterService';
import { emptyAppData } from '../src/shared/persistence/model';
import { LocalStorageRepository } from '../src/shared/persistence/localStorageRepository';

const character = {
  ...sampleCharacter,
  inventory: [
    { id: 'one', name: 'Potion', quantity: 3, description: 'Healing' },
    { id: 'two', name: 'Potion', quantity: 7 },
  ],
};

describe('inventory quantity changes', () => {
  it.each(['', ' ', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects invalid quantity %j without changing the character',
    (raw) => {
      const before = structuredClone(character);
      expect(() => withInventoryQuantity(character, 'one', raw)).toThrow(
        'Enter a nonnegative whole number',
      );
      expect(character).toEqual(before);
    },
  );

  it('updates by ID, retains zero items and preserves all other data', () => {
    const changed = withInventoryQuantity(character, 'one', '0');
    expect(changed).toEqual({
      ...character,
      inventory: [
        { ...character.inventory[0], quantity: 0 },
        character.inventory[1],
      ],
    });
    expect(character.inventory[0].quantity).toBe(3);
    expect(changed.inventory[1]).toBe(character.inventory[1]);
    expect(withInventoryQuantity(changed, 'one', ' 0 ')).toBe(changed);
  });

  it('rejects a removed item rather than changing another row', () => {
    expect(() => withInventoryQuantity(character, 'missing', '5')).toThrow(
      'no longer available',
    );
  });

  it('persists successive quantity changes without altering other characters or campaigns', () => {
    let stored: string | null = null;
    const repository = new LocalStorageRepository({
      getItem: () => stored,
      setItem: (_key, value) => (stored = value),
    });
    const otherCampaign = {
      ...sampleCampaign,
      id: 'other-campaign',
      partyMemberCharacterIds: [],
    };
    const sameCampaignCharacter = { ...character, id: 'same-campaign' };
    const otherCharacter = {
      ...character,
      id: 'other-character',
      campaignId: otherCampaign.id,
    };
    let data = {
      ...emptyAppData(),
      campaigns: [sampleCampaign, otherCampaign],
      characters: [character, sameCampaignCharacter, otherCharacter],
    };
    for (const quantity of ['4', '5', '0']) {
      data = saveCharacter(
        repository,
        data,
        withInventoryQuantity(data.characters[0], 'one', quantity),
        'player-one',
      );
    }
    const loaded = repository.load();
    expect(loaded.characters[0].inventory[0].quantity).toBe(0);
    expect(loaded.characters[0].inventory).toHaveLength(2);
    expect(loaded.characters.slice(1)).toEqual([
      sameCampaignCharacter,
      otherCharacter,
    ]);
    expect(loaded.campaigns).toEqual(data.campaigns);
  });

  it('rejects another owner and leaves stored quantities unchanged', () => {
    let stored: string | null = null;
    const repository = new LocalStorageRepository({
      getItem: () => stored,
      setItem: (_key, value) => (stored = value),
    });
    const data = saveCharacter(
      repository,
      { ...emptyAppData(), campaigns: [sampleCampaign] },
      character,
      'player-one',
    );
    expect(() =>
      saveCharacter(
        repository,
        data,
        withInventoryQuantity(character, 'one', '1'),
        'player-two',
      ),
    ).toThrow('only edit your own');
    expect(repository.load().characters[0].inventory).toEqual(
      character.inventory,
    );
  });

  it('leaves the saved snapshot intact when persistence fails', () => {
    const before = structuredClone(character);
    expect(() =>
      saveCharacter(
        {
          load: emptyAppData,
          save: () => {
            throw new Error('Storage unavailable');
          },
        },
        {
          ...emptyAppData(),
          campaigns: [sampleCampaign],
          characters: [character],
        },
        withInventoryQuantity(character, 'one', '1'),
        'player-one',
      ),
    ).toThrow('Storage unavailable');
    expect(character).toEqual(before);
  });
});
