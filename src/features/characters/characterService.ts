import type { AppData, AppRepository } from '../../shared/persistence/model';
import { abilityNames, type Character } from './model';

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function newCharacter(campaignId: string): Character {
  const now = new Date().toISOString();
  const standardSkills = [
    'Acrobatics',
    'Animal Handling',
    'Arcana',
    'Athletics',
    'Deception',
    'History',
    'Insight',
    'Intimidation',
    'Investigation',
    'Medicine',
    'Nature',
    'Perception',
    'Performance',
    'Persuasion',
    'Religion',
    'Sleight of Hand',
    'Stealth',
    'Survival',
  ];
  return {
    id: crypto.randomUUID(),
    campaignId,
    name: '',
    className: '',
    species: '',
    level: 1,
    abilityScores: Object.fromEntries(
      abilityNames.map((name) => [name, { score: 10, modifier: 0 }]),
    ) as Character['abilityScores'],
    combat: {
      currentHp: 0,
      maximumHp: 0,
      temporaryHp: 0,
      armorClass: 0,
      initiativeModifier: 0,
      speed: 0,
      proficiencyBonus: 0,
    },
    skills: standardSkills.map((name) => ({
      name,
      modifier: 0,
      proficient: false,
    })),
    savingThrows: abilityNames.map((ability) => ({
      ability,
      modifier: 0,
      proficient: false,
    })),
    attacks: [],
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    features: [],
    createdAt: now,
    updatedAt: now,
  };
}

function validate(data: AppData, character: Character) {
  if (!data.campaigns.some((c) => c.id === character.campaignId))
    throw new Error('Campaign no longer exists.');
  if (!character.name.trim()) throw new Error('Enter a character name.');
  if (!Number.isInteger(character.level) || character.level < 1)
    throw new Error('Level must be at least 1.');
  if (
    character.combat.maximumHp < 0 ||
    character.combat.temporaryHp < 0 ||
    character.combat.currentHp < 0
  )
    throw new Error('HP cannot be negative.');
  if (
    character.inventory.some(
      (i) => !i.name.trim() || !Number.isInteger(i.quantity) || i.quantity < 0,
    )
  )
    throw new Error('Items need a name and a nonnegative whole quantity.');
  if (character.attacks.some((a) => !a.name.trim()))
    throw new Error('Attacks need a name.');
  if (character.features.some((f) => !f.name.trim()))
    throw new Error('Features need a name.');
  if (
    Object.values(character.currency).some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new Error('Currency cannot be negative.');
}

export function saveCharacter(
  repository: AppRepository,
  data: AppData,
  character: Character,
): AppData {
  validate(data, character);
  const existing = data.characters.find((c) => c.id === character.id);
  if (existing && existing.campaignId !== character.campaignId)
    throw new Error('Character belongs to another campaign.');
  const saved = {
    ...character,
    name: character.name.trim(),
    updatedAt: new Date().toISOString(),
  };
  const next = {
    ...data,
    characters: existing
      ? data.characters.map((c) => (c.id === saved.id ? saved : c))
      : [...data.characters, saved],
  };
  repository.save(next);
  return next;
}

export function deleteCharacter(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
): AppData {
  if (
    !data.characters.some(
      (c) => c.id === characterId && c.campaignId === campaignId,
    )
  )
    throw new Error('Character not found in this campaign.');
  const next = {
    ...data,
    characters: data.characters.filter((c) => c.id !== characterId),
  };
  repository.save(next);
  return next;
}
