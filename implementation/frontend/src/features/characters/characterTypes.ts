import type { Database } from '../../types/database'

type Tables = Database['public']['Tables']

export type CharacterStatus = 'active' | 'retired' | 'deceased'
export type SheetVisibility = 'private' | 'campaign'

export const itemRarities = [
  'common',
  'uncommon',
  'rare',
  'very_rare',
  'legendary',
  'artifact',
] as const
export type ItemRarity = (typeof itemRarities)[number]

export const characterStatuses: readonly CharacterStatus[] = ['active', 'retired', 'deceased']

/** The summary row every current member can read. */
export type CharacterSummary = Omit<Tables['characters']['Row'], 'status' | 'sheet_visibility'> & {
  status: CharacterStatus
  sheet_visibility: SheetVisibility
}

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof abilityKeys)[number]

export const skillKeys = [
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
] as const
export type SkillKey = (typeof skillKeys)[number]
export type SkillProficiency = 'proficient' | 'expertise'

/** `id` is a lowercase UUID, unique within the sheet; the database requires it (M03.8 D12). */
export type CharacterAttack = {
  id: string
  name: string
  bonus: string
  damage: string
  notes: string
}

/** Sheet body, version 1 (plan §5.1). Derived values are never stored. */
export type CharacterSheetBody = {
  version: 1
  abilities: Record<AbilityKey, number>
  saving_throws: AbilityKey[]
  skills: Partial<Record<SkillKey, SkillProficiency>>
  attacks: CharacterAttack[]
  features: string
  spells: string
  notes: string
  alignment: string
  experience: number | null
}

/** The vitals stored as columns because they change mid-session. */
export type CharacterVitals = Pick<
  Tables['character_sheets']['Row'],
  'max_hp' | 'current_hp' | 'temp_hp' | 'armor_class' | 'speed'
>

/** Live status stored beside the vitals: small, fixed, and changed mid-session (M04 L2). */
export type CharacterStatusState = Pick<
  Tables['character_sheets']['Row'],
  | 'conditions'
  | 'exhaustion'
  | 'death_save_successes'
  | 'death_save_failures'
  | 'concentration'
  | 'inspiration'
>

export const denominations = ['cp', 'sp', 'gp'] as const
export type Denomination = (typeof denominations)[number]

/** The coin purse: whole coins per denomination, written only through the delta RPC. */
export type CharacterPurse = Record<Denomination, number>

/** A sheet row with its body normalized to a complete version-1 object. */
export type CharacterSheet = CharacterVitals &
  CharacterPurse &
  CharacterStatusState & {
    character_id: string
    updated_at: string
    /** Counts body saves only, so it is the concurrency token for the body (M04 L10). */
    body_revision: number
    sheet: CharacterSheetBody
  }

/** One coin change from the log: the net change and the balances after it. */
export type CoinTransaction = Database['public']['Tables']['character_currency_log']['Row']

/** One inventory row (weight arrives as a number or null). */
export type CharacterItem = Omit<Tables['character_items']['Row'], 'rarity'> & {
  rarity: ItemRarity
}

/** An item as typed into the form. Weight and description stay text until normalized. */
export type CharacterItemInput = {
  name: string
  quantity: number
  weight: string
  description: string
  /** Left out by imports, which then keep the item's rarity (or the default for a new one). */
  rarity?: ItemRarity
  equipped: boolean
  attuned: boolean
}

/** An item as stored: trimmed, empty weight and description as null. */
export type CharacterItemValues = {
  name: string
  quantity: number
  weight: number | null
  description: string | null
  rarity?: ItemRarity
  equipped: boolean
  attuned: boolean
}

/** Editable summary fields as typed into the form. */
export type CharacterDetailsInput = {
  name: string
  species: string
  class_name: string
  subclass: string
  background: string
  level: number
}

/** Summary fields as stored: trimmed, empty optionals as null. */
export type CharacterDetails = {
  name: string
  species: string | null
  class_name: string | null
  subclass: string | null
  background: string | null
  level: number
}

/** What a tracker counts: spell slots of one level, hit dice of one size, or something named. */
export const resourceKinds = ['spell_slots', 'hit_dice', 'tracker'] as const
export type ResourceKind = (typeof resourceKinds)[number]

/** Which rest refills a tracker; `none` means only by hand. */
export const resetRules = ['short', 'long', 'none'] as const
export type ResetRule = (typeof resetRules)[number]

export const hitDieSizes = [6, 8, 10, 12] as const

/** One tracker row (M04 L1, L4). */
export type CharacterResource = Omit<Tables['character_resources']['Row'], 'kind' | 'reset'> & {
  kind: ResourceKind
  reset: ResetRule
}

/** A tracker as written by the editor: the columns an owner may set. */
export type ResourceValues = {
  kind: ResourceKind
  name: string | null
  slot_level: number | null
  die: number | null
  maximum: number
  current: number
  reset: ResetRule
  position: number
}

/** The standard conditions: stored as `key`, shown with a label and a one-line reminder (L8). */
export const standardConditions = [
  { key: 'blinded', label: 'Blinded', reminder: "Can't see. Attacks against you have advantage." },
  {
    key: 'charmed',
    label: 'Charmed',
    reminder: "Can't attack the charmer. They have advantage on social checks.",
  },
  { key: 'deafened', label: 'Deafened', reminder: "Can't hear. Fails checks that need hearing." },
  {
    key: 'frightened',
    label: 'Frightened',
    reminder: 'Disadvantage while the source is in sight. Cannot move closer.',
  },
  { key: 'grappled', label: 'Grappled', reminder: 'Speed is 0.' },
  { key: 'incapacitated', label: 'Incapacitated', reminder: "Can't take actions or reactions." },
  {
    key: 'invisible',
    label: 'Invisible',
    reminder: 'Unseen. Attacks against you have disadvantage; yours have advantage.',
  },
  {
    key: 'paralyzed',
    label: 'Paralyzed',
    reminder: 'Incapacitated. Attacks within 5 feet are critical hits.',
  },
  {
    key: 'petrified',
    label: 'Petrified',
    reminder: 'Turned to stone. Incapacitated and resistant to all damage.',
  },
  {
    key: 'poisoned',
    label: 'Poisoned',
    reminder: 'Disadvantage on attack rolls and ability checks.',
  },
  {
    key: 'prone',
    label: 'Prone',
    reminder: 'Disadvantage on attacks. Melee attacks against you have advantage.',
  },
  {
    key: 'restrained',
    label: 'Restrained',
    reminder: 'Speed is 0. Disadvantage on attacks and Dexterity saves.',
  },
  {
    key: 'stunned',
    label: 'Stunned',
    reminder: 'Incapacitated. Fails Strength and Dexterity saves.',
  },
  {
    key: 'unconscious',
    label: 'Unconscious',
    reminder: 'Incapacitated and prone. Unaware of surroundings.',
  },
] as const
export type StandardConditionKey = (typeof standardConditions)[number]['key']
