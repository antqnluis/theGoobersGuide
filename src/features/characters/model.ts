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

export interface Character {
  id: string;
  campaignId: string;
  name: string;
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
  spells?: string;
  createdAt: string;
  updatedAt: string;
}
