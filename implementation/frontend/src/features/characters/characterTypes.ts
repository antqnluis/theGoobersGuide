import type { Database } from '../../types/database'

type Tables = Database['public']['Tables']

export type CharacterStatus = 'active' | 'retired' | 'deceased'
export type SheetVisibility = 'private' | 'campaign'

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

export type CharacterAttack = { name: string; bonus: string; damage: string; notes: string }

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

/** One inventory row (weight arrives as a number or null). */
export type CharacterItem = Tables['character_items']['Row']

/** An item as typed into the form. Weight and description stay text until normalized. */
export type CharacterItemInput = {
  name: string
  quantity: number
  weight: string
  description: string
  equipped: boolean
  attuned: boolean
}

/** An item as stored: trimmed, empty weight and description as null. */
export type CharacterItemValues = {
  name: string
  quantity: number
  weight: number | null
  description: string | null
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
