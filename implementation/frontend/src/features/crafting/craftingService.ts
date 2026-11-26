import { supabase } from '../../lib/supabase'
import type { Json } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type { ItemRarity } from '../characters/characterTypes'
import type {
  CampaignLibraryLink,
  CraftingCategory,
  CraftingLibrary,
  CraftingPack,
  LibraryContent,
  LibraryDeletePreview,
  LibraryItem,
  LibraryRecipe,
  PackHarvest,
  PackImport,
  PackImportResult,
} from './craftingTypes'

const libraryFields = 'id,name,description,created_at,updated_at'

/** The most rows a request returns (the project's `max_rows`); longer lists are read in pages. */
const pageSize = 1000

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) return rows
  }
}

/** The caller's libraries, oldest first. Only a library's owner can read it. */
export async function listLibraries(): Promise<CraftingLibrary[]> {
  const { data, error } = await supabase
    .from('crafting_libraries')
    .select(libraryFields)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createLibrary(name: string, description: string): Promise<CraftingLibrary> {
  const { data, error } = await supabase
    .from('crafting_libraries')
    .insert({ name: name.trim(), description: description.trim() || null })
    .select(libraryFields)
    .single()
  if (error) throw error
  return data
}

export async function updateLibrary(
  libraryId: string,
  name: string,
  description: string,
): Promise<CraftingLibrary> {
  const { data, error } = await supabase
    .from('crafting_libraries')
    .update({ name: name.trim(), description: description.trim() || null })
    .eq('id', libraryId)
    .select(libraryFields)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('crafting_library_unavailable')
  return data
}

/**
 * Reports what deleting a library would affect (campaigns that use it, and, in later phases,
 * saved recipes and linked inventory items) without deleting anything.
 */
export async function previewLibraryDelete(libraryId: string): Promise<LibraryDeletePreview> {
  const { data, error } = await supabase.rpc('delete_crafting_library', {
    p_library_id: libraryId,
    p_confirm: false,
  })
  if (error) throw error
  return data as unknown as LibraryDeletePreview
}

export async function deleteLibrary(libraryId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_crafting_library', {
    p_library_id: libraryId,
    p_confirm: true,
  })
  if (error) throw error
}

type ItemRow = Omit<LibraryItem, 'category' | 'rarity' | 'harvest'> & {
  category: string
  rarity: string
  harvest: Json | null
}

type RecipeRow = Omit<LibraryRecipe, 'lines'> & {
  crafting_recipe_materials: LibraryRecipe['lines']
}

/** Every item and recipe of a library, with every field, for the DM's browser. */
export async function getLibraryContent(libraryId: string): Promise<LibraryContent> {
  const [items, recipes] = await Promise.all([
    readAll<ItemRow>((from, to) =>
      supabase
        .from('crafting_items')
        .select(
          'id,slug,name,category,rarity,value_cp,weight,consumable,attunement,attunement_note,description,tags,source,harvest,dm_notes',
        )
        .eq('library_id', libraryId)
        .order('slug', { ascending: true })
        .range(from, to),
    ),
    readAll<RecipeRow>(
      (from, to) =>
        supabase
          .from('crafting_recipes')
          .select(
            'id,slug,output_item_id,output_quantity,crafting_cost_cp,workdays,tools,requirements,check_skill,check_dc,notes,source,dm_notes,crafting_recipe_materials(role,item_id,quantity,position)',
          )
          .eq('library_id', libraryId)
          .order('slug', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: RecipeRow[] | null; error: unknown }>,
    ),
  ])
  return {
    items: items.map((row) => ({
      ...row,
      category: row.category as CraftingCategory,
      rarity: row.rarity as ItemRarity,
      harvest: (row.harvest as PackHarvest | null) ?? null,
    })),
    recipes: recipes.map(({ crafting_recipe_materials, ...recipe }) => ({
      ...recipe,
      lines: [...crafting_recipe_materials].sort((a, b) => a.position - b.position),
    })),
  }
}

/** The newest imports of a library, newest first (the history keeps 100). */
export async function listImports(libraryId: string): Promise<PackImport[]> {
  const { data, error } = await supabase
    .from('crafting_pack_imports')
    .select(
      'id,pack_name,source_label,items_added,items_updated,recipes_added,recipes_updated,items_removed,recipes_removed,imported_at',
    )
    .eq('library_id', libraryId)
    .order('imported_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

/** Imports a checked pack in one transaction: all of it, or none of it. */
export async function importPack(
  libraryId: string,
  pack: CraftingPack,
  sourceLabel: string | null,
): Promise<PackImportResult> {
  const { data, error } = await supabase.rpc('import_crafting_pack', {
    p_library_id: libraryId,
    p_pack: pack as unknown as Json,
    // The function's default applies to an omitted argument, so a null becomes an omission.
    ...(sourceLabel ? { p_source_label: sourceLabel } : {}),
  })
  if (error) throw error
  return data as unknown as PackImportResult
}

/** The libraries enabled on a campaign; only its owner can list them. */
export async function listCampaignLibraries(campaignId: string): Promise<CampaignLibraryLink[]> {
  const { data, error } = await supabase
    .from('campaign_crafting_libraries')
    .select('library_id,enabled_at')
    .eq('campaign_id', campaignId)
    .order('enabled_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function setCampaignLibrary(
  campaignId: string,
  libraryId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_campaign_crafting_library', {
    p_campaign_id: campaignId,
    p_library_id: libraryId,
    p_enabled: enabled,
  })
  if (error) throw error
}

const craftingErrors: Record<string, string> = {
  crafting_sign_in_required: 'Sign in again to continue.',
  crafting_library_unavailable: 'This library is no longer available.',
  crafting_library_limit_reached: 'You can keep up to 20 libraries. Delete one you no longer use.',
  crafting_library_full: 'A library holds at most 2,000 items and 2,000 recipes.',
  crafting_pack_invalid:
    'This pack couldn’t be accepted. Check it against the prompt and try again.',
  crafting_pack_reference_missing:
    'A recipe uses an item that isn’t in the library or the pack, or an item you removed is still used by a recipe.',
  crafting_name_taken:
    'Two items would share a name. Item names must be different within a library, ignoring capital letters.',
  crafting_campaign_library_limit: 'A campaign can use up to 10 libraries. Turn one off first.',
  crafting_campaign_owner_required: 'Only the campaign owner can change which libraries it uses.',
  campaign_unavailable: 'This campaign is no longer available.',
  crafting_argument_required: 'Something was missing from that request. Try again.',
}

/** Where in the pack the server found the problem, from the error's detail, when it names one. */
export function craftingErrorDetail(error: unknown) {
  const detail =
    error && typeof error === 'object' && 'details' in error && typeof error.details === 'string'
      ? error.details
      : ''
  return detail.trim()
}

/** Safe copy for a crafting failure; anything unknown gets the fallback. */
export function craftingError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  if (!Object.hasOwn(craftingErrors, message)) return fallback
  const detail = message === 'crafting_pack_invalid' ? craftingErrorDetail(error) : ''
  return detail ? `${craftingErrors[message]} (Problem at ${detail}.)` : craftingErrors[message]
}

export function isLibraryUnavailable(error: unknown) {
  return readErrorMessage(error) === 'crafting_library_unavailable'
}
