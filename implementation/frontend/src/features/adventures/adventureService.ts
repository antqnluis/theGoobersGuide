import { supabase } from '../../lib/supabase'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type {
  Adventure,
  AdventureCreateValues,
  AdventureDetail,
  AdventureObjective,
  AdventureStatus,
  AdventureSummary,
  AdventureUpdate,
  AdventureValues,
} from './adventureTypes'

const summaryFields =
  'id,campaign_id,created_by,type,visibility,status,title,next_step,reference,updated_by,status_changed_at,status_changed_by,archived_at,created_at,updated_at'
const adventureFields = `${summaryFields},description`
const objectiveFields =
  'id,adventure_id,title,done,created_by,completed_by,completed_at,created_at,updated_at'
const updateFields = 'id,adventure_id,author_id,body,created_at'
const participantFields = 'id,adventure_id,campaign_id,character_id,profile_id,status,created_at'

const listSelect = `${summaryFields},participants:adventure_participants(character_id),objectives:adventure_objectives(done)`
const detailSelect = `${adventureFields},participants:adventure_participants(${participantFields}),objectives:adventure_objectives(${objectiveFields}),updates:adventure_updates(${updateFields})`

/** A save that matched no row because the adventure changed since it was read; carries the latest. */
export class AdventureConflictError extends Error {
  readonly latest: AdventureDetail

  constructor(latest: AdventureDetail) {
    super('adventure_conflict')
    this.name = 'AdventureConflictError'
    this.latest = latest
  }
}

function unavailable() {
  return new Error('adventure_unavailable')
}

/** Every adventure the member may read in the campaign, newest edit first. Descriptions are left out. */
export async function listAdventures(campaignId: string): Promise<AdventureSummary[]> {
  const { data, error } = await supabase
    .from('adventures')
    .select(listSelect)
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as AdventureSummary[]
}

/** One adventure with its children. No row means it is archived by its creator, or the member left. */
export async function getAdventure(adventureId: string): Promise<AdventureDetail> {
  const { data, error } = await supabase
    .from('adventures')
    .select(detailSelect)
    .eq('id', adventureId)
    .order('created_at', { referencedTable: 'adventure_objectives', ascending: true })
    .order('created_at', { referencedTable: 'adventure_updates', ascending: false })
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
  return data as unknown as AdventureDetail
}

/** How many adventures a character is in, as the caller may see them: those deleted with it (D5). */
export async function countCharacterAdventures(characterId: string): Promise<number> {
  const { count, error } = await supabase
    .from('adventure_participants')
    .select('adventure_id', { count: 'exact', head: true })
    .eq('character_id', characterId)

  if (error) throw error
  return count ?? 0
}

/** Creates the adventure (and, for personal and side, its participant) in one transaction, then opens it. */
export async function createAdventure(
  campaignId: string,
  values: AdventureCreateValues,
): Promise<AdventureDetail> {
  const { data, error } = await supabase.rpc('create_adventure', {
    p_campaign_id: campaignId,
    p_type: values.type,
    p_title: values.title,
    // The function's defaults apply to omitted arguments, so a null becomes an omission.
    ...(values.character_id ? { p_character_id: values.character_id } : {}),
    ...(values.next_step ? { p_next_step: values.next_step } : {}),
  })

  if (error) {
    // Refused as a non-member: no longer in the campaign.
    if (error.code === '42501') throw new Error('adventure_campaign_unavailable')
    throw error
  }
  return getAdventure(data)
}

/** The row an adventure write returns: the columns without the children. */
async function writeAdventure(
  adventureId: string,
  patch: Partial<AdventureValues> | { status: AdventureStatus } | { archived_at: string | null },
  previousUpdatedAt?: string,
): Promise<Adventure> {
  let query = supabase.from('adventures').update(patch).eq('id', adventureId)
  if (previousUpdatedAt) query = query.eq('updated_at', previousUpdatedAt)
  const { data, error } = await query.select(adventureFields).maybeSingle()

  if (error) throw error
  if (data) return data as Adventure
  if (!previousUpdatedAt) throw unavailable()

  // Tell a stale save from an adventure that is no longer readable.
  const latest = await getAdventure(adventureId)
  throw new AdventureConflictError(latest)
}

/** Saves the title, type, description, next step, and reference, only against the previous stamp. */
export function saveAdventureDetails(
  adventureId: string,
  values: AdventureValues,
  previousUpdatedAt: string,
) {
  return writeAdventure(adventureId, values, previousUpdatedAt)
}

/** A last-write-wins change: the database records who changed it and when. */
export function setAdventureStatus(adventureId: string, status: AdventureStatus) {
  return writeAdventure(adventureId, { status })
}

/** Archives (the guard stamps the time) or restores. Only the creator may; the database enforces it. */
export function setAdventureArchived(adventureId: string, archived: boolean) {
  return writeAdventure(adventureId, {
    archived_at: archived ? new Date().toISOString() : null,
  })
}

export async function addObjective(adventureId: string, title: string) {
  const { data, error } = await supabase
    .from('adventure_objectives')
    .insert({ adventure_id: adventureId, title })
    .select(objectiveFields)
    .single()

  if (error) {
    // Row-level security refused the insert: archived, or no longer readable.
    if (error.code === '42501') throw unavailable()
    throw error
  }
  return data as AdventureObjective
}

async function writeObjective(objectiveId: string, patch: { title: string } | { done: boolean }) {
  const { data, error } = await supabase
    .from('adventure_objectives')
    .update(patch)
    .eq('id', objectiveId)
    .select(objectiveFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
  return data as AdventureObjective
}

export function renameObjective(objectiveId: string, title: string) {
  return writeObjective(objectiveId, { title })
}

/** Ticks or unticks; the database records who ticked it and when. */
export function setObjectiveDone(objectiveId: string, done: boolean) {
  return writeObjective(objectiveId, { done })
}

export async function deleteObjective(objectiveId: string) {
  const { data, error } = await supabase
    .from('adventure_objectives')
    .delete()
    .eq('id', objectiveId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
}

export async function addAdventureUpdate(adventureId: string, body: string) {
  const { data, error } = await supabase
    .from('adventure_updates')
    .insert({ adventure_id: adventureId, body })
    .select(updateFields)
    .single()

  if (error) {
    if (error.code === '42501') throw unavailable()
    throw error
  }
  return data as AdventureUpdate
}

/** Only the author may delete an update; anyone else's attempt matches no row. */
export async function deleteAdventureUpdate(updateId: string) {
  const { data, error } = await supabase
    .from('adventure_updates')
    .delete()
    .eq('id', updateId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
}

const adventureErrors: Record<string, string> = {
  adventure_conflict: 'This adventure changed while you were editing. Your text is still here.',
  adventure_unavailable: 'This adventure is no longer available. It may have been archived.',
  adventure_archived: 'This adventure is archived. Restore it to make changes.',
  adventure_limit_reached:
    'You can keep up to 200 adventures in a campaign, archived ones included.',
  adventure_objective_limit_reached: 'An adventure can have up to 50 objectives.',
  adventure_update_limit_reached: 'This adventure has reached 500 updates.',
  adventure_character_unavailable: 'Choose one of your characters in this campaign.',
  adventure_character_required: 'Choose one of your characters in this campaign.',
  adventure_campaign_unavailable: 'You can no longer add adventures to this campaign.',
}

/** Safe copy for an adventure failure; anything unknown gets the caller's fallback. */
export function adventureError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(adventureErrors, message) ? adventureErrors[message] : fallback
}

export function isAdventureConflict(error: unknown): error is AdventureConflictError {
  return error instanceof AdventureConflictError
}

/** The adventure is archived, deleted, or the member left: its text can no longer be saved. */
export function isAdventureUnavailable(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'adventure_unavailable' || message === 'adventure_campaign_unavailable'
}
