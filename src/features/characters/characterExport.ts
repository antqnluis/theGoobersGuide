import {
  CHARACTER_IMPORT_FORMAT,
  CHARACTER_IMPORT_VERSION,
} from './characterImport';
import { abilityNames, type Character } from './model';

export type PortableCharacter = Omit<
  Character,
  'id' | 'campaignId' | 'createdAt' | 'updatedAt'
>;

export interface CharacterExportDocument {
  format: typeof CHARACTER_IMPORT_FORMAT;
  version: typeof CHARACTER_IMPORT_VERSION;
  character: PortableCharacter;
}

export type CharacterExportFormat = 'json' | 'markdown';

export interface CharacterExportFile {
  content: string;
  filename: string;
  mimeType: string;
}

const abilityLabels = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
} as const;

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function text(value: string | undefined): string {
  const cleaned = value?.trim();
  return cleaned ? cleaned.replace(/\r\n?/g, '\n') : 'Not recorded';
}

function field(label: string, value: string | number): string {
  return `- **${label}:** ${String(value).replace(/\n/g, '  \n  ')}`;
}

function emptyList(lines: string[]): string[] {
  return lines.length ? lines : ['_None recorded._'];
}

function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'character'
  );
}

export function characterExportDocument(
  character: Character,
): CharacterExportDocument {
  const { id, campaignId, createdAt, updatedAt, ...portable } = character;
  void id;
  void campaignId;
  void createdAt;
  void updatedAt;
  return {
    format: CHARACTER_IMPORT_FORMAT,
    version: CHARACTER_IMPORT_VERSION,
    character: portable,
  };
}

export function characterToMarkdown(character: Character): string {
  const classLine = [character.className, character.subclass]
    .filter(Boolean)
    .join(' / ');
  const lines = [
    `# ${text(character.name)}`,
    '',
    '## Identity',
    '',
    field('Player', text(character.playerName)),
    field('Level', character.level),
    field('Class', text(classLine)),
    field('Species', text(character.species)),
    field('Background', text(character.background)),
    field('Description', text(character.description)),
    '',
    '## Ability scores',
    '',
    ...abilityNames.map((ability) =>
      field(
        abilityLabels[ability],
        `${character.abilityScores[ability].score} (${signed(character.abilityScores[ability].modifier)})`,
      ),
    ),
    '',
    '## Combat',
    '',
    field(
      'Hit points',
      `${character.combat.currentHp} / ${character.combat.maximumHp}`,
    ),
    field('Temporary hit points', character.combat.temporaryHp),
    field('Armor class', character.combat.armorClass),
    field('Initiative', signed(character.combat.initiativeModifier)),
    field('Speed', `${character.combat.speed} feet`),
    field('Proficiency bonus', signed(character.combat.proficiencyBonus)),
    '',
    '## Skills',
    '',
    ...emptyList(
      character.skills.map((skill) =>
        field(
          skill.name || 'Unnamed skill',
          `${signed(skill.modifier)}${skill.proficient ? ' (proficient)' : ''}`,
        ),
      ),
    ),
    '',
    '## Saving throws',
    '',
    ...emptyList(
      character.savingThrows.map((save) =>
        field(
          abilityLabels[save.ability],
          `${signed(save.modifier)}${save.proficient ? ' (proficient)' : ''}`,
        ),
      ),
    ),
    '',
    '## Attacks',
    '',
    ...emptyList(
      character.attacks.map((attack) =>
        field(
          attack.name || 'Unnamed attack',
          `${signed(attack.attackBonus)} to hit; ${text(attack.damageExpression)}`,
        ),
      ),
    ),
    '',
    '## Inventory',
    '',
    ...emptyList(
      character.inventory.map((item) =>
        field(
          `${item.name || 'Unnamed item'} × ${item.quantity}`,
          text(item.description),
        ),
      ),
    ),
    '',
    '### Currency',
    '',
    ...emptyList(
      Object.entries(character.currency)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => field(currency, amount)),
    ),
    '',
    '## Features',
    '',
    ...emptyList(
      character.features.flatMap((feature) => [
        `### ${text(feature.name)}`,
        '',
        field('Category', text(feature.category)),
        '',
        text(feature.description),
        '',
      ]),
    ),
    '## Spells',
    '',
    ...emptyList(
      [...character.spells]
        .sort(
          (left, right) =>
            left.level - right.level || left.name.localeCompare(right.name),
        )
        .flatMap((spell) => [
          `### ${text(spell.name)}`,
          '',
          field('Level', spell.level === 0 ? 'Cantrip' : spell.level),
          field('School', text(spell.school)),
          field('Casting time', text(spell.castingTime)),
          field('Range', text(spell.range)),
          field('Components', text(spell.components)),
          field('Duration', text(spell.duration)),
          field('Prepared', spell.prepared ? 'Yes' : 'No'),
          field('Concentration', spell.concentration ? 'Yes' : 'No'),
          field('Ritual', spell.ritual ? 'Yes' : 'No'),
          '',
          text(spell.description),
          '',
        ]),
    ),
    '## Character notes',
    '',
    text(character.notes),
    '',
  ];

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function createCharacterExport(
  character: Character,
  format: CharacterExportFormat,
): CharacterExportFile {
  const basename = `${slug(character.name)}-goobers-guide`;
  if (format === 'json') {
    return {
      content: `${JSON.stringify(characterExportDocument(character), null, 2)}\n`,
      filename: `${basename}.json`,
      mimeType: 'application/json',
    };
  }
  return {
    content: characterToMarkdown(character),
    filename: `${basename}.md`,
    mimeType: 'text/markdown',
  };
}
