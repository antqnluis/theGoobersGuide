import type { Campaign } from '../../features/campaigns/model';
import {
  abilityNames,
  type AbilityScores,
  type Attack,
  type Character,
  type CharacterFeature,
  type CharacterSpell,
  type CombatStats,
  type InventoryItem,
  type SavingThrow,
  type Skill,
} from '../../features/characters/model';
import type { CampaignNote } from '../../features/notes/model';
import { SCHEMA_VERSION, type AppData } from './model';
import { newCharacter } from '../../features/characters/characterService';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isNumber);
}

function hasUniqueIds(values: { id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

export function isCampaign(value: unknown): value is Campaign {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim() !== '' &&
    isString(value.name) &&
    value.name.trim() !== '' &&
    isString(value.partyName) &&
    value.partyName.trim() !== '' &&
    isOptionalString(value.description) &&
    isOptionalString(value.currentLocation) &&
    isOptionalString(value.status) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isAbilityScores(value: unknown): value is AbilityScores {
  return (
    isRecord(value) &&
    abilityNames.every((name) => {
      const ability = value[name];
      return (
        isRecord(ability) &&
        isNumber(ability.score) &&
        isNumber(ability.modifier)
      );
    })
  );
}

function isCombatStats(value: unknown): value is CombatStats {
  return (
    isRecord(value) &&
    isNumber(value.currentHp) &&
    isNumber(value.maximumHp) &&
    isNumber(value.temporaryHp) &&
    isNumber(value.armorClass) &&
    isNumber(value.initiativeModifier) &&
    isNumber(value.speed) &&
    isNumber(value.proficiencyBonus)
  );
}

function isSkill(value: unknown): value is Skill {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isNumber(value.modifier) &&
    isBoolean(value.proficient)
  );
}

function isSavingThrow(value: unknown): value is SavingThrow {
  return (
    isRecord(value) &&
    abilityNames.some((name) => name === value.ability) &&
    isNumber(value.modifier) &&
    isBoolean(value.proficient)
  );
}

function isAttack(value: unknown): value is Attack {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.attackBonus) &&
    isString(value.damageExpression)
  );
}

function isInventoryItem(value: unknown): value is InventoryItem {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.quantity) &&
    isOptionalString(value.description)
  );
}

function isCharacterFeature(value: unknown): value is CharacterFeature {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.description) &&
    isOptionalString(value.category)
  );
}

function isCharacterSpell(value: unknown): value is CharacterSpell {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim() !== '' &&
    isString(value.name) &&
    isNumber(value.level) &&
    isString(value.school) &&
    isString(value.castingTime) &&
    isString(value.range) &&
    isString(value.components) &&
    isString(value.duration) &&
    isBoolean(value.concentration) &&
    isBoolean(value.ritual) &&
    isBoolean(value.prepared) &&
    isString(value.description)
  );
}

export function isCharacter(value: unknown): value is Character {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim() !== '' &&
    isString(value.campaignId) &&
    value.campaignId.trim() !== '' &&
    isString(value.name) &&
    isOptionalString(value.playerName) &&
    isString(value.className) &&
    isOptionalString(value.subclass) &&
    isString(value.species) &&
    isNumber(value.level) &&
    isOptionalString(value.background) &&
    isOptionalString(value.description) &&
    isAbilityScores(value.abilityScores) &&
    isCombatStats(value.combat) &&
    isArrayOf(value.skills, isSkill) &&
    isArrayOf(value.savingThrows, isSavingThrow) &&
    isArrayOf(value.attacks, isAttack) &&
    isArrayOf(value.inventory, isInventoryItem) &&
    isNumberRecord(value.currency) &&
    isArrayOf(value.features, isCharacterFeature) &&
    isOptionalString(value.notes) &&
    isArrayOf(value.spells, isCharacterSpell) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function recoverCharacter(
  value: unknown,
  campaignIds: Set<string>,
): Character | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !value.id ||
    !isString(value.campaignId) ||
    !campaignIds.has(value.campaignId)
  )
    return null;
  if (isCharacter(value)) return value;
  const base = newCharacter(value.campaignId);
  const combat = isRecord(value.combat) ? value.combat : {};
  const abilities = isRecord(value.abilityScores) ? value.abilityScores : {};
  return {
    ...base,
    id: value.id,
    name: isString(value.name) ? value.name : '',
    playerName: isOptionalString(value.playerName)
      ? value.playerName
      : undefined,
    className: isString(value.className) ? value.className : '',
    subclass: isOptionalString(value.subclass) ? value.subclass : undefined,
    species: isString(value.species) ? value.species : '',
    level: isNumber(value.level) ? value.level : 1,
    background: isOptionalString(value.background)
      ? value.background
      : undefined,
    description: isOptionalString(value.description)
      ? value.description
      : undefined,
    notes: isOptionalString(value.notes) ? value.notes : undefined,
    spells: Array.isArray(value.spells)
      ? value.spells.filter(isCharacterSpell)
      : [],
    abilityScores: Object.fromEntries(
      abilityNames.map((name) => {
        const entry = isRecord(abilities[name]) ? abilities[name] : {};
        return [
          name,
          {
            score: isNumber(entry.score) ? entry.score : 10,
            modifier: isNumber(entry.modifier) ? entry.modifier : 0,
          },
        ];
      }),
    ) as AbilityScores,
    combat: Object.fromEntries(
      Object.entries(base.combat).map(([key, fallback]) => [
        key,
        isNumber(combat[key]) ? combat[key] : fallback,
      ]),
    ) as unknown as CombatStats,
    skills: Array.isArray(value.skills) ? value.skills.filter(isSkill) : [],
    savingThrows: Array.isArray(value.savingThrows)
      ? value.savingThrows.filter(isSavingThrow)
      : base.savingThrows,
    attacks: Array.isArray(value.attacks) ? value.attacks.filter(isAttack) : [],
    inventory: Array.isArray(value.inventory)
      ? value.inventory.filter(isInventoryItem)
      : [],
    currency: isNumberRecord(value.currency) ? value.currency : base.currency,
    features: Array.isArray(value.features)
      ? value.features.filter(isCharacterFeature)
      : [],
    createdAt: isString(value.createdAt) ? value.createdAt : base.createdAt,
    updatedAt: isString(value.updatedAt) ? value.updatedAt : base.updatedAt,
  };
}

export function isCampaignNote(value: unknown): value is CampaignNote {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.id.trim() !== '' &&
    isString(value.campaignId) &&
    value.campaignId.trim() !== '' &&
    isString(value.title) &&
    value.title.trim() !== '' &&
    isString(value.content) &&
    value.content.trim() !== '' &&
    isOptionalString(value.category) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isAppData(value: unknown): value is AppData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !isArrayOf(value.campaigns, isCampaign) ||
    !isArrayOf(value.characters, isCharacter) ||
    !isArrayOf(value.notes, isCampaignNote)
  ) {
    return false;
  }

  const campaignIds = new Set(value.campaigns.map((campaign) => campaign.id));
  return (
    hasUniqueIds(value.campaigns) &&
    hasUniqueIds(value.characters) &&
    hasUniqueIds(value.notes) &&
    value.characters.every((character) =>
      campaignIds.has(character.campaignId),
    ) &&
    value.notes.every((note) => campaignIds.has(note.campaignId))
  );
}
