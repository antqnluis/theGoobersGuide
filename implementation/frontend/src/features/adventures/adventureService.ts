import { supabase } from '../../lib/supabase'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type {
  Adventure,
  AdventureCreateValues,
  AdventureDetail,
  AdventureInvitation,
  AdventureObjective,
  AdventureStatus,
  AdventureSummary,
  AdventureUpdate,
  AdventureValues,
  CharacterAdventureCounts,
} from './adventureTypes'

const summaryFields =
  'id,campaign_id,created_by,type,visibility,status,title,next_step,reference,updated_by,status_changed_at,status_changed_by,archived_at,created_at,updated_at'
const adventureFields = `${summaryFields},description`
const objectiveFields =
  'id,adventure_id,title,done,created_by,completed_by,completed_at,created_at,updated_at'
const updateFields = 'id,adventure_id,author_id,body,created_at'
const approvals = 'approvals:adventure_invite_approvals(approver_id)'
const participantFields = `id,adventure_id,campaign_id,character_id,profile_id,status,invited_by,share_consent,share_consent_at,responded_at,created_at,updated_at,${approvals}`

const listSelect = `${summaryFields},participants:adventure_participants(id,character_id,profile_id,status,share_consent,${approvals}),objectives:adventure_objectives(done)`
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

/**
 * What deleting a character does to adventures (D11): `sole` are adventures only it is in, which
 * are deleted; `shared` have other accepted participants and are only left. Both reads go through
 * the accepted rows the character's owner may read.
 */
export async function countCharacterAdventures(
  characterId: string,
): Promise<CharacterAdventureCounts> {
  const own = await supabase
    .from('adventure_participants')
    .select('adventure_id')
    .eq('character_id', characterId)
    .eq('status', 'accepted')
  if (own.error) throw own.error

  const adventureIds = (own.data ?? []).map((row) => row.adventure_id)
  if (adventureIds.length === 0) return { sole: 0, shared: 0 }

  const all = await supabase
    .from('adventure_participants')
    .select('adventure_id')
    .in('adventure_id', adventureIds)
    .eq('status', 'accepted')
  if (all.error) throw all.error

  const accepted = new Map<string, number>()
  for (const row of all.data ?? []) {
    accepted.set(row.adventure_id, (accepted.get(row.adventure_id) ?? 0) + 1)
  }
  const shared = adventureIds.filter((id) => (accepted.get(id) ?? 1) > 1).length
  return { sole: adventureIds.length - shared, shared }
}

/** The caller's open invitations in the campaign: titles and inviters only (D5). */
export async function listInvitations(campaignId: string): Promise<AdventureInvitation[]> {
  const { data, error } = await supabase.rpc('list_my_adventure_invitations', {
    p_campaign_id: campaignId,
  })
  if (error) throw error
  return (data ?? []) as AdventureInvitation[]
}

/** Invitations, proposals awaiting the caller's approval, and share requests awaiting consent (D13). */
export async function countAdventureRequests(campaignId: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_my_adventure_requests', {
    p_campaign_id: campaignId,
  })
  if (error) throw error
  return data ?? 0
}

/** Proposes another player's character; it is sent once every accepted participant approves (D3). */
export async function proposeParticipant(adventureId: string, characterId: string) {
  const { data, error } = await supabase.rpc('propose_adventure_participant', {
    p_adventure_id: adventureId,
    p_character_id: characterId,
  })
  if (error) throw error
  return data
}

export async function approveParticipant(participantId: string) {
  const { error } = await supabase.rpc('approve_adventure_participant', {
    p_participant_id: participantId,
  })
  if (error) throw error
}

/** Rejects a proposal or withdraws an invitation (D4): the row is deleted. */
export async function cancelParticipant(participantId: string) {
  const { error } = await supabase.rpc('cancel_adventure_participant', {
    p_participant_id: participantId,
  })
  if (error) throw error
}

/** Accepts or declines an invitation; `keepShared` only matters when the adventure is shared (D6). */
export async function respondToInvitation(
  participantId: string,
  accept: boolean,
  keepShared = false,
) {
  const { error } = await supabase.rpc('respond_to_adventure_invitation', {
    p_participant_id: participantId,
    p_accept: accept,
    p_keep_shared: keepShared,
  })
  if (error) throw error
}

export async function leaveAdventure(adventureId: string) {
  const { error } = await supabase.rpc('leave_adventure', { p_adventure_id: adventureId })
  if (error) throw error
}

/** `true` gives the caller's consent; `false` clears every consent (Not now, Stop sharing). */
export async function setShareConsent(adventureId: string, consent: boolean) {
  const { error } = await supabase.rpc('set_adventure_share_consent', {
    p_adventure_id: adventureId,
    p_consent: consent,
  })
  if (error) throw error
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
  adventure_player_already_participating: 'That player already has a character in this adventure.',
  adventure_participant_limit_reached:
    'An adventure can have up to 10 characters, invitations included.',
  adventure_proposal_unavailable: 'This invitation changed. The adventure has been refreshed.',
  adventure_invitation_unavailable: 'This invitation is no longer open.',
  adventure_last_participant: "You're the only one left in this adventure. Archive it instead.",
}

/** `adventure_character_unavailable` means a different thing when inviting someone else's character. */
const inviteCharacterCopy =
  "That character can't be invited. It may have retired or left the campaign."

export function inviteError(error: unknown, fallback: string) {
  return readErrorMessage(error) === 'adventure_character_unavailable'
    ? inviteCharacterCopy
    : adventureError(error, fallback)
}

/** Safe copy for an adventure failure; anything unknown gets the caller's fallback. */
export function adventureError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(adventureErrors, message) ? adventureErrors[message] : fallback
}

export function isAdventureConflict(error: unknown): error is AdventureConflictError {
  return error instanceof AdventureConflictError
}

/** An invitation or proposal changed under the writer: the surface refreshes and shows the copy. */
export function isCollaborationStale(error: unknown) {
  const message = readErrorMessage(error)
  return (
    message === 'adventure_proposal_unavailable' || message === 'adventure_invitation_unavailable'
  )
}

/** The adventure is archived, deleted, or the member left: its text can no longer be saved. */
export function isAdventureUnavailable(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'adventure_unavailable' || message === 'adventure_campaign_unavailable'
}
