import type { DemoUserId } from '../auth/demoAuth';

export const abilityNames = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export type AbilityName = (typeof abilityNames)[number];

export interface AbilityValue {
  score: number;
  modifier: number;
}

export type AbilityScores = Record<AbilityName, AbilityValue>;

export interface CombatStats {
  currentHp: number;
  maximumHp: number;
  temporaryHp: number;
  armorClass: number;
  initiativeModifier: number;
  speed: number;
  proficiencyBonus: number;
}

export interface Skill {
  name: string;
  modifier: number;
  proficient: boolean;
}

export interface SavingThrow {
  ability: AbilityName;
  modifier: number;
  proficient: boolean;
}

export interface Attack {
  id: string;
  name: string;
  attackBonus: number;
  damageExpression: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  description?: string;
}

export interface CharacterFeature {
  id: string;
  name: string;
  description: string;
  category?: string;
}

export interface CharacterSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  prepared: boolean;
  description: string;
}

export interface Character {
  id: string;
  campaignId: string;
  ownerUserId: DemoUserId;
  name: string;
  portraitDataUrl?: string;
  playerName?: string;
  className: string;
  subclass?: string;
  species: string;
  level: number;
  background?: string;
  description?: string;
  abilityScores: AbilityScores;
  combat: CombatStats;
  skills: Skill[];
  savingThrows: SavingThrow[];
  attacks: Attack[];
  inventory: InventoryItem[];
  currency: Record<string, number>;
  features: CharacterFeature[];
  notes?: string;
  spells: CharacterSpell[];
  createdAt: string;
  updatedAt: string;
}
