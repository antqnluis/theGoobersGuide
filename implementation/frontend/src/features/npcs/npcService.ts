import { supabase } from '../../lib/supabase'
import { readErrorMessage } from '../campaigns/rpcErrors'
import { portraitExtension } from '../characters/characterValidation'
import type { Npc, NpcCreateValues, NpcSummary, NpcValues, NpcVisibility } from './npcTypes'

const summaryFields =
  'id,campaign_id,author_id,visibility,name,role,location,portrait_path,updated_by,created_at,updated_at'
const npcFields = `${summaryFields},body`

/** A save that matched no row because the NPC changed since it was read; carries the latest. */
export class NpcConflictError extends Error {
  readonly latest: Npc

  constructor(latest: Npc) {
    super('npc_conflict')
    this.name = 'NpcConflictError'
    this.latest = latest
  }
}

function unavailable() {
  return new Error('npc_unavailable')
}

/** Every NPC the member may read in the campaign, newest edit first. Bodies are left out. */
export async function listNpcs(campaignId: string): Promise<NpcSummary[]> {
  const { data, error } = await supabase
    .from('npcs')
    .select(summaryFields)
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as NpcSummary[]
}

/** One NPC with its text. No row means it was deleted, made private, or the member left. */
export async function getNpc(npcId: string): Promise<Npc> {
  const { data, error } = await supabase
    .from('npcs')
    .select(npcFields)
    .eq('id', npcId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
  return data as Npc
}

export async function createNpc(campaignId: string, values: NpcCreateValues) {
  const { data, error } = await supabase
    .from('npcs')
    .insert({
      campaign_id: campaignId,
      visibility: values.visibility,
      name: values.name,
      role: values.role,
      location: values.location,
      body: values.body,
    })
    .select(npcFields)
    .single()

  if (error) {
    // Row-level security refused the insert: no longer a member of the campaign.
    if (error.code === '42501') throw new Error('npc_campaign_unavailable')
    throw error
  }
  return data as Npc
}

/**
 * Applies a change only if nobody wrote the NPC since `previousUpdatedAt`. Zero rows means it
 * changed (a conflict, with the latest version attached) or is gone (unavailable).
 */
async function writeNpc(
  npcId: string,
  patch: Partial<NpcValues> & { visibility?: NpcVisibility },
  previousUpdatedAt: string,
): Promise<Npc> {
  const { data, error } = await supabase
    .from('npcs')
    .update(patch)
    .eq('id', npcId)
    .eq('updated_at', previousUpdatedAt)
    .select(npcFields)
    .maybeSingle()

  if (error) throw error
  if (data) return data as Npc

  // Tell a stale save from an entry that is no longer readable.
  const latest = await getNpc(npcId)
  throw new NpcConflictError(latest)
}

/** Saves the name, role, location, and text. */
export function saveNpc(npcId: string, values: NpcValues, previousUpdatedAt: string) {
  return writeNpc(npcId, values, previousUpdatedAt)
}

/** Shares an NPC with the campaign or makes it private. Only the author may. */
export function setNpcVisibility(
  npcId: string,
  visibility: NpcVisibility,
  previousUpdatedAt: string,
) {
  return writeNpc(npcId, { visibility }, previousUpdatedAt)
}

const portraitBucket = 'npc-portraits'

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
 * Stores a new picture and points the NPC at it, then drops the old one. Each upload gets a
 * fresh name, so a failure after the upload leaves the old picture intact. Author only.
 */
export async function uploadNpcPortrait(
  npcId: string,
  file: File,
  previousPath: string | null,
): Promise<Npc> {
  const extension = portraitExtension(file.type)
  if (!extension) throw new Error('npc_portrait_type_invalid')
  const path = `${npcId}/${crypto.randomUUID()}.${extension}`

  const upload = await supabase.storage
    .from(portraitBucket)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (upload.error) throw upload.error

  try {
    const { data, error } = await supabase
      .from('npcs')
      .update({ portrait_path: path })
      .eq('id', npcId)
      .select(npcFields)
      .maybeSingle()
    if (error) throw error
    if (!data) throw unavailable()
    await discardPortraitObject(previousPath)
    return data as Npc
  } catch (failure) {
    await discardPortraitObject(path)
    throw failure
  }
}

/** Clears the NPC's picture, then drops the file. Author only. */
export async function removeNpcPortrait(npcId: string, path: string): Promise<Npc> {
  const { data, error } = await supabase
    .from('npcs')
    .update({ portrait_path: null })
    .eq('id', npcId)
    .select(npcFields)
    .maybeSingle()
  if (error) throw error
  if (!data) throw unavailable()
  await discardPortraitObject(path)
  return data as Npc
}

/** A short-lived link to a portrait; only members who may read the NPC get one. */
export async function getNpcPortraitUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(portraitBucket).createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteNpc(npcId: string, portraitPath?: string | null) {
  // The picture's storage rules need the NPC row, so it goes first.
  await discardPortraitObject(portraitPath)
  const { data, error } = await supabase
    .from('npcs')
    .delete()
    .eq('id', npcId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw unavailable()
}

const npcErrors: Record<string, string> = {
  npc_conflict: 'This NPC changed while you were editing. Your text is still here.',
  npc_unavailable: 'This NPC is no longer available. It may have been made private or deleted.',
  npc_campaign_unavailable: 'You can no longer add NPCs to this campaign.',
  npc_portrait_type_invalid: 'Choose a PNG, JPEG, or WebP picture.',
  npc_portrait_author_only: 'Only the person who logged this NPC can change its picture.',
  npc_limit_reached: 'You can keep up to 500 NPCs in a campaign. Delete one to add another.',
}

/** Safe copy for an NPC failure; anything unknown gets the caller's fallback. */
export function npcError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(npcErrors, message) ? npcErrors[message] : fallback
}

export function isNpcConflict(error: unknown): error is NpcConflictError {
  return error instanceof NpcConflictError
}

/** The NPC was deleted, made private, or the member left: its text can no longer be saved. */
export function isNpcUnavailable(error: unknown) {
  const message = readErrorMessage(error)
  return message === 'npc_unavailable' || message === 'npc_campaign_unavailable'
}
