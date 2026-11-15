import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type { toImportPayload } from './characterDocument'
import type { ExpectedVersions, UpdatePayload } from './characterUpdateDocument'

type Functions = Database['public']['Functions']

export type CharacterImportKind = 'new' | 'update'

/** One row of a character's import history (M03.8 D10). */
export type CharacterImportRecord = {
  id: string
  kind: CharacterImportKind
  source_label: string | null
  change_count: number
  imported_at: string
}

/** Creates the character, its sheet, items, coins, and history row in one transaction. */
export async function importCharacter(
  campaignId: string,
  payload: ReturnType<typeof toImportPayload>,
  sourceLabel: string | null,
): Promise<string> {
  const args: Functions['import_character']['Args'] = {
    p_campaign_id: campaignId,
    p_character: payload as unknown as Json,
    p_source_label: sourceLabel ?? undefined,
  }
  const { data, error } = await supabase.rpc('import_character', args)
  if (error) throw error
  return data
}

/** Applies the selected changes in one transaction; returns the sheet's new `updated_at`. */
export async function applyCharacterUpdate(
  characterId: string,
  expected: ExpectedVersions,
  changes: UpdatePayload,
  sourceLabel: string | null,
): Promise<string> {
  const args: Functions['apply_character_update']['Args'] = {
    p_character_id: characterId,
    p_expected: expected as unknown as Json,
    p_changes: changes as unknown as Json,
    p_source_label: sourceLabel ?? undefined,
  }
  const { data, error } = await supabase.rpc('apply_character_update', args)
  if (error) throw error
  return data
}

/** The history the signed-in member may read (it follows the sheet's visibility), newest first. */
export async function listCharacterImports(characterId: string): Promise<CharacterImportRecord[]> {
  const { data, error } = await supabase
    .from('character_imports')
    .select('id,kind,source_label,change_count,imported_at')
    .eq('character_id', characterId)
    .order('imported_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as CharacterImportRecord[]
}

const importErrors: Record<string, string> = {
  import_invalid: "This import couldn't be read. Check the file and try again.",
  import_values_invalid: "Some values in this import aren't allowed. Review them and try again.",
  import_source_invalid: 'Use a source label of up to 120 characters.',
  import_conflict:
    'This character changed while you were reviewing. The latest version has been loaded; review the update again.',
  character_active_exists:
    'You already have an active character here. Use Import updates on that character, or retire them first.',
  character_campaign_unavailable: "You're no longer a member of this campaign.",
  character_unavailable: 'This character is no longer available.',
  character_name_invalid: 'Enter a name of up to 80 characters.',
  character_details_invalid: 'Species, class, subclass, and background can be up to 60 characters.',
  character_level_invalid: 'Level must be between 1 and 20.',
  item_limit_reached: 'A character can carry up to 200 items.',
  currency_limit_exceeded: 'Coins are limited to 9,999,999 of each kind.',
  currency_insufficient: 'Coins can’t go below zero.',
}

/** Safe copy for an import failure; anything unknown gets the caller's fallback. */
export function importError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(importErrors, message) ? importErrors[message] : fallback
}

export function isImportConflict(error: unknown) {
  return readErrorMessage(error) === 'import_conflict'
}
