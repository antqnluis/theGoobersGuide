import type { ItemRarity } from '../characters/characterTypes'

/** The crafting pack document, version 1 (M04 plan §2), after parsing: known keys only. */

export const craftingCategories = [
  'material',
  'weapon',
  'armor',
  'shield',
  'wondrous',
  'potion',
  'scroll',
  'ammunition',
  'tool',
  'other',
] as const

export type CraftingCategory = (typeof craftingCategories)[number]

export const categoryLabels: Record<CraftingCategory, string> = {
  material: 'Material',
  weapon: 'Weapon',
  armor: 'Armor',
  shield: 'Shield',
  wondrous: 'Wondrous item',
  potion: 'Potion',
  scroll: 'Scroll',
  ammunition: 'Ammunition',
  tool: 'Tool',
  other: 'Other',
}

export type PackHarvest = {
  from?: string[]
  skill?: string
  dc?: number
  notes?: string
}

export type PackItem = {
  id: string
  name: string
  category: CraftingCategory
  rarity: ItemRarity
  value_gp: number
  weight?: number
  consumable?: boolean
  attunement?: boolean | string
  description?: string
  tags?: string[]
  source?: string
  harvest?: PackHarvest
  dm_notes?: string
}

export type PackLine = { item: string; quantity: number }

export type PackRecipe = {
  id: string
  output: PackLine
  key_materials: PackLine[]
  materials?: PackLine[]
  crafting_cost_gp: number
  workdays: number
  tools?: string[]
  requirements?: string
  check?: { skill: string; dc: number }
  notes?: string
  source?: string
  dm_notes?: string
}

export type CraftingPack = {
  format: 'the-goobers-guide-crafting-pack'
  version: 1
  pack: { name: string; source?: string; description?: string }
  items?: PackItem[]
  recipes?: PackRecipe[]
  remove?: { items?: string[]; recipes?: string[] }
}

/** A library the DM owns. */
export type CraftingLibrary = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

/** A catalogue item as the DM reads it (every field, in copper). */
export type LibraryItem = {
  id: string
  slug: string
  name: string
  category: CraftingCategory
  rarity: ItemRarity
  value_cp: number
  weight: number | null
  consumable: boolean
  attunement: boolean
  attunement_note: string | null
  description: string | null
  tags: string[]
  source: string | null
  harvest: PackHarvest | null
  dm_notes: string | null
}

export type LibraryRecipeLine = {
  role: 'key' | 'other'
  item_id: string
  quantity: number
  position: number
}

export type LibraryRecipe = {
  id: string
  slug: string
  output_item_id: string
  output_quantity: number
  crafting_cost_cp: number
  workdays: number
  tools: string[]
  requirements: string | null
  check_skill: string | null
  check_dc: number | null
  notes: string | null
  source: string | null
  dm_notes: string | null
  lines: LibraryRecipeLine[]
}

export type LibraryContent = {
  items: LibraryItem[]
  recipes: LibraryRecipe[]
}

export type PackImport = {
  id: string
  pack_name: string
  source_label: string | null
  items_added: number
  items_updated: number
  recipes_added: number
  recipes_updated: number
  items_removed: number
  recipes_removed: number
  imported_at: string
}

/** What an import did (the RPC's result). */
export type PackImportResult = {
  import_id: string
  items_added: number
  items_updated: number
  recipes_added: number
  recipes_updated: number
  items_removed: number
  recipes_removed: number
}

/** A library enabled on the campaign, as the campaign owner sees it. */
export type CampaignLibraryLink = {
  library_id: string
  enabled_at: string
}

/** One suggestion for an inventory item's name: the player-facing fields only (plan C9, C16). */
export type ItemSuggestion = {
  id: string
  name: string
  category: CraftingCategory
  rarity: ItemRarity
  value_cp: number
  weight: number | null
  description: string | null
}

export type LibraryDeletePreview = {
  campaigns: number
  saved: number
  linked_items: number
  deleted: boolean
}

/** What a long rest did, as the campaign owner sees it: counts only, never a character's result. */
export type LongRestResult = {
  rest_id: string
  called_at: string
  character_count: number
  library_count: number
}

/** The newest long rest of a campaign (time and count only; every member may read it). */
export type LastRest = { called_at: string; character_count: number }

/** The output of a vision, in the fields a player may see (plan C16). */
export type VisionOutput = {
  name: string
  category: CraftingCategory
  rarity: ItemRarity
  value_cp: number
  weight: number | null
  consumable: boolean
  attunement: boolean | string | null
  description: string | null
  quantity: number
}

/** One material of a vision, with how many the character holds now. */
export type VisionLine = {
  role: 'key' | 'other'
  item_id: string
  name: string
  rarity: ItemRarity
  value_cp: number
  need: number
  have: number
}

/** A recipe the character holds every key material for, or has saved. */
export type Vision = {
  recipe_id: string
  new: boolean
  saved: boolean
  output: VisionOutput
  lines: VisionLine[]
  crafting_cost_cp: number
  workdays: number
  tools: string[]
  requirements: string | null
  check: { skill: string; dc: number } | null
  notes: string | null
}

/** A recipe the character holds only some key materials for: nothing else is revealed. */
export type Fragment = {
  id: string
  new: boolean
  held: string[]
  missing: number
}

/** The whole of what one character may see (`get_character_visions`). */
export type CharacterVisions = {
  last_rest_at: string | null
  library_count: number
  visions: Vision[]
  fragments: Fragment[]
  saved: Vision[]
}
