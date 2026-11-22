import { supabase } from '../../lib/supabase'
import type { Json } from '../../types/database'
import { readErrorMessage } from '../campaigns/rpcErrors'
import {
  toRollRecord,
  type DiceRollRecord,
  type DiceSource,
  type DiceVisibility,
} from './diceRules'
import type { RollSpec } from './diceTypes'

export const logPageSize = 50

const columns =
  'id,campaign_id,roller_id,character_id,visibility,source,label,expression,terms,dice,total,created_at'

export type CampaignRollInput = {
  campaignId: string
  spec: RollSpec
  visibility: DiceVisibility
  source: DiceSource
  label: string | null
  characterId: string | null
}

/** Rolls on the server: the database chooses the faces and returns the stored roll. */
export async function rollInCampaign(input: CampaignRollInput): Promise<DiceRollRecord> {
  const { data, error } = await supabase.rpc('roll_dice', {
    p_campaign_id: input.campaignId,
    p_terms: input.spec.terms as unknown as Json,
    p_visibility: input.visibility,
    p_source: input.source,
    p_label: input.label,
    p_character_id: input.characterId,
  })
  if (error) throw error
  return toRollRecord(data)
}

/** One page of the log, newest first; `before` is the oldest `created_at` already loaded. */
export async function listRolls(
  campaignId: string,
  before: string | null,
): Promise<DiceRollRecord[]> {
  let query = supabase
    .from('dice_rolls')
    .select(columns)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(logPageSize)
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(toRollRecord)
}

export type DiceFailureKind = 'member' | 'character' | 'invalid' | 'rate' | 'network' | 'other'

export type DiceFailure = { kind: DiceFailureKind; message: string }

const networkPattern =
  /failed to fetch|networkerror|load failed|network request failed|fetch failed/i

/** Turns a failed roll into the copy the tray shows (plan §4.3). */
export function diceFailure(error: unknown): DiceFailure {
  const message = readErrorMessage(error)
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : ''

  if (message === 'not_a_member') {
    return { kind: 'member', message: "You're no longer in this campaign." }
  }
  if (message === 'character_unavailable') {
    return { kind: 'character', message: "That character isn't yours in this campaign." }
  }
  if (code === '22023') {
    return { kind: 'invalid', message: 'That roll is too big. Up to 100 dice and 20 parts.' }
  }
  if (code === 'P0001' || message === 'dice_rate_limited') {
    return { kind: 'rate', message: 'Slow down — too many rolls at once.' }
  }
  if (error instanceof TypeError || networkPattern.test(message)) {
    return { kind: 'network', message: "Can't reach the table." }
  }
  return { kind: 'other', message: "Couldn't roll. Try again." }
}
