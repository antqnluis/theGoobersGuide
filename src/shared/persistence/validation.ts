import type { Campaign } from '../../features/campaigns/model';
import {
  abilityNames,
  type AbilityScores,
  type Attack,
  type Character,
  type CharacterFeature,
  type CombatStats,
  type InventoryItem,
  type SavingThrow,
  type Skill,
} from '../../features/characters/model';
import type { CampaignNote } from '../../features/notes/model';
import { SCHEMA_VERSION, type AppData } from './model';

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

export function isCampaign(value: unknown): value is Campaign {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.partyName) &&
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

export function isCharacter(value: unknown): value is Character {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.campaignId) &&
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
    isOptionalString(value.spells) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isCampaignNote(value: unknown): value is CampaignNote {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.campaignId) &&
    isString(value.title) &&
    isString(value.content) &&
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
    value.characters.every((character) =>
      campaignIds.has(character.campaignId),
    ) && value.notes.every((note) => campaignIds.has(note.campaignId))
  );
}
