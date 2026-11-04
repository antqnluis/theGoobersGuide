import { describe, expect, it } from 'vitest';
import {
  characterExportDocument,
  characterToMarkdown,
  createCharacterExport,
} from '../src/features/characters/characterExport';
import { parseCharacterImport } from '../src/features/characters/characterImport';
import { newCharacter } from '../src/features/characters/characterService';

function completeCharacter() {
  return {
    ...newCharacter('campaign-1'),
    id: 'character-1',
    name: 'Éowyn / Shield?',
    playerName: 'Ton',
    className: 'Fighter',
    subclass: 'Battle Master',
    species: 'Human',
    level: 4,
    background: 'Soldier',
    description: 'Front-line defender.\nKeeps the western gate.',
    combat: {
      currentHp: 31,
      maximumHp: 36,
      temporaryHp: 4,
      armorClass: 18,
      initiativeModifier: 2,
      speed: 30,
      proficiencyBonus: 2,
    },
    skills: [{ name: 'Athletics', modifier: 6, proficient: true }],
    savingThrows: [
      { ability: 'strength' as const, modifier: 6, proficient: true },
    ],
    attacks: [
      {
        id: 'attack-1',
        name: 'Longsword',
        attackBonus: 6,
        damageExpression: '1d8 + 4',
      },
    ],
    inventory: [
      {
        id: 'item-1',
        name: 'Rope',
        quantity: 2,
        description: '50 feet each',
      },
    ],
    currency: { gp: 17, sp: 5 },
    features: [
      {
        id: 'feature-1',
        name: 'Riposte',
        category: 'Maneuver',
        description: 'Counter after a missed attack.',
      },
    ],
    spells: [
      {
        id: 'spell-1',
        name: 'Light',
        level: 0,
        school: 'Evocation',
        castingTime: '1 action',
        range: 'Touch',
        components: 'V, M',
        duration: '1 hour',
        concentration: false,
        ritual: false,
        prepared: true,
        description: 'An object sheds bright light.',
      },
    ],
    notes: 'Owes the quartermaster one shield.\nUses homebrew recovery.',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
  };
}

describe('character export', () => {
  it('creates a portable version-2 JSON document without application-owned character fields', () => {
    const character = completeCharacter();
    const document = characterExportDocument(character);

    expect(document).toMatchObject({
      format: 'the-goobers-guide-character',
      version: 2,
      character: {
        name: character.name,
        attacks: [{ id: 'attack-1', name: 'Longsword' }],
        spells: [{ id: 'spell-1', name: 'Light' }],
      },
    });
    expect(document.character).not.toHaveProperty('id');
    expect(document.character).not.toHaveProperty('campaignId');
    expect(document.character).not.toHaveProperty('createdAt');
    expect(document.character).not.toHaveProperty('updatedAt');
  });

  it('round trips JSON through import while regenerating owned IDs and campaign data', () => {
    const file = createCharacterExport(completeCharacter(), 'json');
    let id = 0;
    const imported = parseCharacterImport(file.content, 'campaign-2', {
      createId: () => `new-${++id}`,
      now: () => '2026-11-05T00:00:00.000Z',
    });

    expect(file.filename).toBe('eowyn-shield-goobers-guide.json');
    expect(file.mimeType).toBe('application/json');
    expect(imported).toMatchObject({
      id: 'new-1',
      campaignId: 'campaign-2',
      name: 'Éowyn / Shield?',
      attacks: [{ id: 'new-2', name: 'Longsword' }],
      inventory: [{ id: 'new-3', name: 'Rope' }],
      features: [{ id: 'new-4', name: 'Riposte' }],
      spells: [{ id: 'new-5', name: 'Light' }],
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:00.000Z',
    });
  });

  it('creates a readable Markdown handoff with every character section and multiline values', () => {
    const character = completeCharacter();
    const markdown = characterToMarkdown(character);
    const file = createCharacterExport(character, 'markdown');

    expect(file.filename).toBe('eowyn-shield-goobers-guide.md');
    expect(file.mimeType).toBe('text/markdown');
    for (const section of [
      '## Identity',
      '## Ability scores',
      '## Combat',
      '## Skills',
      '## Saving throws',
      '## Attacks',
      '## Inventory',
      '## Features',
      '## Spells',
      '## Character notes',
    ])
      expect(markdown).toContain(section);
    expect(markdown).toContain(
      'Front-line defender.  \n  Keeps the western gate.',
    );
    expect(markdown).toContain('### Riposte');
    expect(markdown).toContain('### Light');
    expect(markdown).toContain('Owes the quartermaster one shield.');
  });

  it('labels optional and empty character values without omitting their sections', () => {
    const character = {
      ...newCharacter('campaign-1'),
      name: 'Blank Slate',
      skills: [],
      savingThrows: [],
    };
    const markdown = characterToMarkdown(character);

    expect(markdown).toContain('- **Player:** Not recorded');
    expect(markdown).toContain('## Skills\n\n_None recorded._');
    expect(markdown).toContain('## Spells\n\n_None recorded._');
  });
});
