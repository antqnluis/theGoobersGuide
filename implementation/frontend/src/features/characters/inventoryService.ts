import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import { characterError } from './characterService'
import { toRarity } from './itemRarity'
import type {
  CharacterItem,
  CharacterItemValues,
  CharacterPurse,
  CoinTransaction,
} from './characterTypes'

type Functions = Database['public']['Functions']

const itemFields =
  'id,character_id,name,quantity,weight,description,rarity,equipped,attuned,created_at,updated_at'

type ItemRow = Omit<CharacterItem, 'weight' | 'rarity'> & {
  weight: number | string | null
  rarity: string
}

/** PostgREST returns numeric as a number at this size; coerce in case it arrives as text. */
function toItem(row: ItemRow): CharacterItem {
  return {
    ...row,
    weight: row.weight === null ? null : Number(row.weight),
    rarity: toRarity(row.rarity),
  }
}

function denied(code: string) {
  return new Error(code)
}

/** The character's items, oldest first (the client sorts for display). RLS decides who sees them. */
export async function listCharacterItems(characterId: string): Promise<CharacterItem[]> {
  const { data, error } = await supabase
    .from('character_items')
    .select(itemFields)
    .eq('character_id', characterId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as ItemRow[]).map(toItem)
}

export async function addCharacterItem(
  characterId: string,
  values: CharacterItemValues,
): Promise<CharacterItem> {
  const { data, error } = await supabase
    .from('character_items')
    .insert({ character_id: characterId, ...values })
    .select(itemFields)
    .single()

  if (error) {
    // Row-level security refused the insert: not the owner, or no longer a member.
    if (error.code === '42501') throw denied('character_update_denied')
    throw error
  }
  return toItem(data as ItemRow)
}

/**
 * Saves the whole item form, but only if nobody wrote the item since `previousUpdatedAt`.
 * Zero rows means another device saved first (or the item is gone).
 */
export async function updateCharacterItem(
  itemId: string,
  values: CharacterItemValues,
  previousUpdatedAt: string,
): Promise<CharacterItem> {
  const { data, error } = await supabase
    .from('character_items')
    .update(values)
    .eq('id', itemId)
    .eq('updated_at', previousUpdatedAt)
    .select(itemFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('item_conflict')
  return toItem(data as ItemRow)
}

/** Equip, unequip, attune, or unattune. Single toggles, so the last write wins. */
export async function setItemFlag(
  itemId: string,
  flag: 'equipped' | 'attuned',
  value: boolean,
): Promise<CharacterItem> {
  const { data, error } = await supabase
    .from('character_items')
    .update({ [flag]: value })
    .eq('id', itemId)
    .select(itemFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('item_unavailable')
  return toItem(data as ItemRow)
}

/** Adds or removes a quantity atomically and returns the new quantity. */
export async function adjustItemQuantity(itemId: string, delta: number): Promise<number> {
  const args: Functions['adjust_character_item_quantity']['Args'] = {
    p_item_id: itemId,
    p_delta: delta,
  }
  const { data, error } = await supabase.rpc('adjust_character_item_quantity', args)
  if (error) throw error
  return data
}

export async function deleteCharacterItem(itemId: string) {
  const { data, error } = await supabase
    .from('character_items')
    .delete()
    .eq('id', itemId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('item_unavailable')
}

/** The purse and the sheet stamp after a coin change. */
export type PurseUpdate = CharacterPurse & { updated_at: string }

/** Adds (positive) or spends (negative) coins in one atomic call; all or nothing. */
export async function adjustCharacterCurrency(
  characterId: string,
  deltas: Partial<CharacterPurse>,
): Promise<PurseUpdate> {
  const args: Functions['adjust_character_currency']['Args'] = {
    p_character_id: characterId,
    p_cp: deltas.cp ?? 0,
    p_sp: deltas.sp ?? 0,
    p_gp: deltas.gp ?? 0,
  }
  const { data, error } = await supabase.rpc('adjust_character_currency', args)
  if (error) throw error
  const row = data?.[0]
  if (!row) throw denied('character_unavailable')
  return row
}

const coinLogFields =
  'id,seq,character_id,created_at,cp_delta,sp_delta,gp_delta,cp_after,sp_after,gp_after'

/** The character's most recent coin changes, newest first. Readable like the sheet. */
export async function listCoinTransactions(
  characterId: string,
  limit = 20,
): Promise<CoinTransaction[]> {
  const { data, error } = await supabase
    .from('character_currency_log')
    .select(coinLogFields)
    .eq('character_id', characterId)
    .order('seq', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as CoinTransaction[]
}

const inventoryErrors: Record<string, string> = {
  currency_insufficient: "You don't have enough coins for that. Nothing was spent.",
  currency_limit_exceeded: 'A purse can hold up to 9,999,999 of each coin.',
  currency_amount_invalid: 'Enter whole numbers of coins up to 9,999,999.',
  item_limit_reached: 'A character can carry up to 200 different items. Remove one to add another.',
  item_quantity_insufficient: "There aren't that many left.",
  item_quantity_invalid: 'Quantity must be between 0 and 9,999.',
  item_unavailable: 'This item is no longer available.',
  item_conflict: 'This item changed on another device. The latest version is shown.',
}

/**
 * Safe copy for a coin or item failure. Character codes (such as `character_unavailable`)
 * use the character copy; anything else gets the caller's fallback.
 */
export function inventoryError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(inventoryErrors, message)
    ? inventoryErrors[message]
    : characterError(error, fallback)
}

/** The item changed or vanished elsewhere, so the list must be refetched. */
export function isItemStale(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'item_conflict' || message === 'item_unavailable'
}
