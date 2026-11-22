import { supabase } from '../../lib/supabase'
import type { Json } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import { adventureError, getAdventure } from './adventureService'
import type { AdventureDetail, AdventureType } from './adventureTypes'
import type { HandoffExpected, HandoffRpcChanges } from './handoffChanges'

export type HandoffKind = 'new' | 'attach'

/** What a handoff applied (plan §3.2): the changed detail fields and counts. */
export type HandoffApplied = {
  fields: string[]
  objectives_added: number
  objectives_changed: number
  update: boolean
}

/** One kept source: the handoff text verbatim, who brought it in, and what it changed. */
export type HandoffRecord = {
  id: string
  adventure_id: string
  kind: HandoffKind
  source_label: string | null
  source_text: string
  applied: HandoffApplied
  change_count: number
  imported_by: string
  imported_at: string
}

const handoffFields =
  'id,adventure_id,kind,source_label,source_text,applied,change_count,imported_by,imported_at'

/** Attaches a handoff in one transaction: the selected changes, plus the source. Returns its id. */
export async function attachHandoff(
  adventureId: string,
  expected: HandoffExpected | Record<string, never>,
  changes: HandoffRpcChanges,
  sourceText: string,
  sourceLabel: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('attach_adventure_handoff', {
    p_adventure_id: adventureId,
    p_expected: expected as unknown as Json,
    p_changes: changes as unknown as Json,
    p_source_text: sourceText,
    // The function's default applies to an omitted argument, so a null becomes an omission.
    ...(sourceLabel ? { p_source_label: sourceLabel } : {}),
  })
  if (error) throw error
  return data
}

/**
 * Creates the adventure, its objectives and update, and the source in one transaction, then
 * opens it. A personal or side adventure starts private to the creator's character.
 */
export async function createAdventureFromHandoff(
  campaignId: string,
  type: AdventureType,
  characterId: string | null,
  changes: HandoffRpcChanges,
  sourceText: string,
  sourceLabel: string | null,
): Promise<AdventureDetail> {
  const { data, error } = await supabase.rpc('create_adventure_from_handoff', {
    p_campaign_id: campaignId,
    p_type: type,
    // The function reads a null character as none, which a main adventure needs.
    p_character_id: (type === 'main' ? null : characterId) as string,
    p_changes: changes as unknown as Json,
    p_source_text: sourceText,
    ...(sourceLabel ? { p_source_label: sourceLabel } : {}),
  })

  if (error) {
    // Refused as a non-member: no longer in the campaign.
    if (error.code === '42501') throw new Error('adventure_campaign_unavailable')
    throw error
  }
  return getAdventure(data)
}

/** Every source the member may read on the adventure, oldest first (it follows adventure access). */
export async function listHandoffs(adventureId: string): Promise<HandoffRecord[]> {
  const { data, error } = await supabase
    .from('adventure_handoffs')
    .select(handoffFields)
    .eq('adventure_id', adventureId)
    .order('imported_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as HandoffRecord[]
}

/**
 * Deletes a source. Only its importer may, while the adventure is editable; anyone else's
 * attempt matches no row. The changes it applied stay.
 */
export async function deleteHandoff(handoffId: string) {
  const { data, error } = await supabase
    .from('adventure_handoffs')
    .delete()
    .eq('id', handoffId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('handoff_unavailable')
}

const handoffErrors: Record<string, string> = {
  handoff_invalid: "This handoff couldn't be read. Check it and try again.",
  handoff_values_invalid: "Some proposed values aren't allowed. Review them and try again.",
  handoff_source_invalid: 'Keep the handoff under 64 KB and the label under 120 characters.',
  handoff_conflict:
    'This adventure changed while you were reviewing. The latest version is loaded; review the handoff again.',
  handoff_limit_reached: 'This adventure already has 50 sources. Delete an old one first.',
  handoff_unavailable: 'This source is no longer available.',
}

/** Safe copy for a handoff failure; the adventure's own rules keep their copy, others the fallback. */
export function handoffError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(handoffErrors, message)
    ? handoffErrors[message]
    : adventureError(error, fallback)
}

export function isHandoffConflict(error: unknown) {
  return readErrorMessage(error) === 'handoff_conflict'
}

/** The adventure was archived, deleted, or the member left: nothing more can be applied to it. */
export function isHandoffTargetUnavailable(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'adventure_unavailable' || message === 'adventure_archived'
}
