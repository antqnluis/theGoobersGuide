import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import { characterError } from './characterService'
import type { CharacterResource, ResourceValues } from './characterTypes'
import type { DeathSaveResult, HpKind, RestKind, RestPlan } from './resourceRules'

type Functions = Database['public']['Functions']

const resourceFields =
  'id,character_id,kind,name,slot_level,die,maximum,current,reset,position,created_at,updated_at'

function denied(code: string) {
  return new Error(code)
}

/** The character's trackers in display order. RLS decides who sees them. */
export async function listCharacterResources(characterId: string): Promise<CharacterResource[]> {
  const { data, error } = await supabase
    .from('character_resources')
    .select(resourceFields)
    .eq('character_id', characterId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as CharacterResource[]
}

export async function addCharacterResource(
  characterId: string,
  values: ResourceValues,
): Promise<CharacterResource> {
  const { data, error } = await supabase
    .from('character_resources')
    .insert({ character_id: characterId, ...values })
    .select(resourceFields)
    .single()

  if (error) {
    // Row-level security refused the insert: not the owner, or no longer a member.
    if (error.code === '42501') throw denied('character_update_denied')
    throw error
  }
  return data as CharacterResource
}

/** The columns an owner may change after a tracker exists. Kind, level, and die are fixed. */
export type ResourcePatch = Partial<
  Pick<ResourceValues, 'name' | 'maximum' | 'current' | 'reset' | 'position'>
>

/** Lowering the maximum clamps current in the database; the returned row shows the result. */
export async function updateCharacterResource(
  resourceId: string,
  patch: ResourcePatch,
): Promise<CharacterResource> {
  const { data, error } = await supabase
    .from('character_resources')
    .update(patch)
    .eq('id', resourceId)
    .select(resourceFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('resource_unavailable')
  return data as CharacterResource
}

export async function deleteCharacterResource(resourceId: string) {
  const { data, error } = await supabase
    .from('character_resources')
    .delete()
    .eq('id', resourceId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw denied('resource_unavailable')
}

/** The vitals and death saves after an HP tap, and what the tap needs for a concentration save. */
export type HpChange = {
  current_hp: number
  temp_hp: number
  death_save_successes: number
  death_save_failures: number
  /** Damage that got past temporary HP. */
  damage_taken: number
  /** The spell being concentrated on, or null. */
  concentration: string | null
  updated_at: string
}

/** Damage, healing, or temporary HP in one atomic call (temporary HP absorb damage first). */
export async function applyCharacterHp(
  characterId: string,
  kind: HpKind,
  amount: number,
): Promise<HpChange> {
  const args: Functions['apply_character_hp']['Args'] = {
    p_character_id: characterId,
    p_kind: kind,
    p_amount: amount,
  }
  const { data, error } = await supabase.rpc('apply_character_hp', args)
  if (error) throw error
  const row = data?.[0]
  if (!row) throw denied('character_unavailable')
  return { ...row, concentration: row.concentration ?? null }
}

export type ResourceAdjust = { current: number; updated_at: string }

/** Spends (negative) or restores (positive) one tracker; a restore stops at the maximum. */
export async function adjustCharacterResource(
  resourceId: string,
  delta: number,
): Promise<ResourceAdjust> {
  const args: Functions['adjust_character_resource']['Args'] = {
    p_resource_id: resourceId,
    p_delta: delta,
  }
  const { data, error } = await supabase.rpc('adjust_character_resource', args)
  if (error) throw error
  const row = data?.[0]
  if (!row) throw denied('resource_unavailable')
  return row
}

export type RestResult = {
  sheet: {
    current_hp: number | null
    temp_hp: number
    exhaustion: number
    death_save_successes: number
    death_save_failures: number
    updated_at: string
  }
  resources: { id: string; current: number; updated_at: string }[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function toRestResult(value: unknown): RestResult {
  if (isRecord(value) && isRecord(value.sheet) && Array.isArray(value.resources)) {
    return value as unknown as RestResult
  }
  throw denied('rest_result_invalid')
}

/** Applies a confirmed rest preview in one transaction. */
export async function takeCharacterRest(
  characterId: string,
  kind: RestKind,
  plan: RestPlan,
): Promise<RestResult> {
  const args: Functions['take_character_rest']['Args'] = {
    p_character_id: characterId,
    p_kind: kind,
    p_plan: plan,
  }
  const { data, error } = await supabase.rpc('take_character_rest', args)
  if (error) throw error
  return toRestResult(data)
}

export type DeathSaveUpdate = {
  current_hp: number
  death_save_successes: number
  death_save_failures: number
  updated_at: string
}

/** Records one death saving throw that the dice already rolled. */
export async function recordDeathSave(
  characterId: string,
  result: DeathSaveResult,
): Promise<DeathSaveUpdate> {
  const args: Functions['record_death_save']['Args'] = {
    p_character_id: characterId,
    p_result: result,
  }
  const { data, error } = await supabase.rpc('record_death_save', args)
  if (error) throw error
  const row = data?.[0]
  if (!row) throw denied('character_unavailable')
  return row
}

const resourceErrors: Record<string, string> = {
  hp_not_set: 'Set max and current HP on the sheet first.',
  hp_change_invalid: 'Enter a whole number from 1 to 9,999.',
  resource_empty: 'None left. Take a rest or restore one by hand.',
  resource_limit: 'A character can have up to 40 trackers.',
  resource_unavailable: 'This tracker is no longer available. The latest list is shown.',
  not_dying: 'Death saves are only rolled at 0 HP.',
  rest_plan_invalid: "That rest doesn't match this character's trackers. Review it and try again.",
}

/**
 * Safe copy for an HP, tracker, rest, or death-save failure. Character codes (such as
 * `character_unavailable`) use the character copy; anything else gets the caller's fallback.
 */
export function resourceError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(resourceErrors, message)
    ? resourceErrors[message]
    : characterError(error, fallback)
}

/** A tracker changed or vanished elsewhere, so the list must be refetched. */
export function isResourceStale(error: unknown) {
  return readErrorMessage(error) === 'resource_unavailable'
}
