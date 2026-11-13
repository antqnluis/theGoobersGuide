import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type {
  CharacterDetails,
  CharacterSheet,
  CharacterSheetBody,
  CharacterStatus,
  CharacterSummary,
  CharacterVitals,
  SheetVisibility,
} from './characterTypes'
import { normalizeSheet, portraitExtension } from './characterValidation'

type Functions = Database['public']['Functions']

const summaryFields =
  'id,campaign_id,owner_id,name,species,class_name,subclass,background,level,status,in_party,sheet_visibility,portrait_path,status_changed_at,created_at,updated_at'
const sheetFields = 'character_id,max_hp,current_hp,temp_hp,armor_class,speed,sheet,updated_at'

type SheetRow = Omit<CharacterSheet, 'sheet'> & { sheet: unknown }

function toSheet(row: SheetRow): CharacterSheet {
  return { ...row, sheet: normalizeSheet(row.sheet) }
}

/** A write the database accepted but matched no row, so RLS hid it from this account. */
function denied(code: string) {
  return new Error(code)
}

/** The characters the signed-in member may see in a campaign (RLS decides which). */
export async function listCampaignCharacters(campaignId: string): Promise<CharacterSummary[]> {
  const { data, error } = await supabase
    .from('characters')
    .select(summaryFields)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as CharacterSummary[]
}

/** The sheet, or null when it is private, gone, or the owner has left. */
export async function getCharacterSheet(characterId: string): Promise<CharacterSheet | null> {
  const { data, error } = await supabase
    .from('character_sheets')
    .select(sheetFields)
    .eq('character_id', characterId)
    .maybeSingle()

  if (error) throw error
  return data ? toSheet(data as SheetRow) : null
}

export async function createCharacter(
  campaignId: string,
  details: CharacterDetails,
  inParty: boolean,
): Promise<string> {
  const args: Functions['create_character']['Args'] = {
    p_campaign_id: campaignId,
    p_name: details.name,
    p_species: details.species ?? undefined,
    p_class_name: details.class_name ?? undefined,
    p_subclass: details.subclass ?? undefined,
    p_background: details.background ?? undefined,
    p_level: details.level,
    p_in_party: inParty,
  }
  const { data, error } = await supabase.rpc('create_character', args)
  if (error) throw error
  return data
}

export async function updateCharacterDetails(
  characterId: string,
  details: CharacterDetails,
): Promise<CharacterSummary> {
  const { data, error } = await supabase
    .from('characters')
    .update(details)
    .eq('id', characterId)
    .select(summaryFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('character_update_denied')
  return data as CharacterSummary
}

export async function setCharacterStatus(characterId: string, status: CharacterStatus) {
  const args: Functions['set_character_status']['Args'] = {
    p_character_id: characterId,
    p_status: status,
  }
  const { error } = await supabase.rpc('set_character_status', args)
  if (error) throw error
}

export async function setCharacterInParty(characterId: string, inParty: boolean) {
  const args: Functions['set_character_in_party']['Args'] = {
    p_character_id: characterId,
    p_in_party: inParty,
  }
  const { error } = await supabase.rpc('set_character_in_party', args)
  if (error) throw error
}

export async function setSheetVisibility(characterId: string, visibility: SheetVisibility) {
  const { data, error } = await supabase
    .from('characters')
    .update({ sheet_visibility: visibility })
    .eq('id', characterId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('character_update_denied')
}

/** Patches only the given vitals (last write wins; only the owner writes). */
export async function updateCharacterVitals(
  characterId: string,
  patch: Partial<CharacterVitals>,
): Promise<CharacterSheet> {
  const { data, error } = await supabase
    .from('character_sheets')
    .update(patch)
    .eq('character_id', characterId)
    .select(sheetFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('sheet_unavailable')
  return toSheet(data as SheetRow)
}

/**
 * Saves the whole body, but only if nobody wrote the sheet since `previousUpdatedAt`.
 * Zero rows means another device saved first (or the sheet is gone).
 */
export async function updateCharacterSheetBody(
  characterId: string,
  body: CharacterSheetBody,
  previousUpdatedAt: string,
): Promise<CharacterSheet> {
  const { data, error } = await supabase
    .from('character_sheets')
    .update({ sheet: body })
    .eq('character_id', characterId)
    .eq('updated_at', previousUpdatedAt)
    .select(sheetFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('sheet_conflict')
  return toSheet(data as SheetRow)
}

const portraitBucket = 'character-portraits'

/** Best effort: a leftover picture is harmless, so a failed removal never fails the caller. */
async function discardPortraitObject(path: string | null | undefined) {
  if (!path) return
  try {
    await supabase.storage.from(portraitBucket).remove([path])
  } catch {
    // Ignored: see above.
  }
}

/**
 * Stores a new picture and points the character at it, then drops the old one. Each
 * upload gets a fresh name, so a failure after the upload leaves the old picture intact.
 */
export async function uploadCharacterPortrait(
  characterId: string,
  file: File,
  previousPath: string | null,
): Promise<CharacterSummary> {
  const extension = portraitExtension(file.type)
  if (!extension) throw new Error('portrait_type_invalid')
  const path = `${characterId}/${crypto.randomUUID()}.${extension}`

  const upload = await supabase.storage
    .from(portraitBucket)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (upload.error) throw upload.error

  try {
    const { data, error } = await supabase
      .from('characters')
      .update({ portrait_path: path })
      .eq('id', characterId)
      .select(summaryFields)
      .maybeSingle()
    if (error) throw error
    if (!data) throw denied('character_update_denied')
    await discardPortraitObject(previousPath)
    return data as CharacterSummary
  } catch (failure) {
    await discardPortraitObject(path)
    throw failure
  }
}

export async function removeCharacterPortrait(characterId: string, path: string) {
  const { data, error } = await supabase
    .from('characters')
    .update({ portrait_path: null })
    .eq('id', characterId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw denied('character_update_denied')
  await discardPortraitObject(path)
}

/** A short-lived link to a portrait; only members who may read the character get one. */
export async function getCharacterPortraitUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(portraitBucket).createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteCharacter(characterId: string, portraitPath?: string | null) {
  // The picture's storage rules need the character row, so it goes first.
  await discardPortraitObject(portraitPath)
  const { data, error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('character_delete_denied')
}

const characterErrors: Record<string, string> = {
  character_campaign_unavailable: "You're no longer a member of this campaign.",
  character_active_exists:
    'You already have an active character here. Retire them or mark them deceased first.',
  character_unavailable: 'This character is no longer available.',
  character_not_active: 'Only an active character can join the party.',
  character_name_invalid: 'Enter a name of up to 80 characters.',
  character_details_invalid: 'Species, class, subclass, and background can be up to 60 characters.',
  character_level_invalid: 'Level must be between 1 and 20.',
  character_update_denied: 'This character could not be updated by this account.',
  character_delete_denied: 'This character could not be deleted by this account.',
  portrait_type_invalid: 'Choose a PNG, JPEG, or WebP picture.',
  sheet_unavailable: 'This sheet is no longer available.',
  sheet_conflict: 'This sheet changed on another device. Reload it to see the latest version.',
}

/** Safe copy for a character failure; anything unknown gets the caller's fallback. */
export function characterError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(characterErrors, message) ? characterErrors[message] : fallback
}

/** True when the character or its campaign is gone for this account. */
export function isCharacterUnavailable(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'character_unavailable' || message === 'character_campaign_unavailable'
}

export function isSheetConflict(error: unknown) {
  return readErrorMessage(error) === 'sheet_conflict'
}
