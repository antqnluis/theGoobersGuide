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

export const denominations = ['cp', 'sp', 'gp'] as const
export type Denomination = (typeof denominations)[number]

/** The coin purse: whole coins per denomination, written only through the delta RPC. */
export type CharacterPurse = Record<Denomination, number>

/** A sheet row with its body normalized to a complete version-1 object. */
export type CharacterSheet = CharacterVitals &
  CharacterPurse & {
    character_id: string
    updated_at: string
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
  /** The catalogue item this one is linked to; left out by imports, which keep the link. */
  crafting_item_id?: string | null
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
  /** Sent only when the form knows the link: a string sets it, null clears it. */
  crafting_item_id?: string | null
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
