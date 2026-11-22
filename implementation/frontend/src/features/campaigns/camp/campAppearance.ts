// A player's chosen look for their seat at the camp, per campaign. The default look is
// derived from the profile id (adventurerAppearance.ts); a saved row overrides all four
// choices. Cosmetic only.

import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database'
import { readErrorMessage } from '../rpcErrors'
import {
  cloakCount,
  headwear,
  packs,
  skinCount,
  type AdventurerAppearance,
} from './adventurerAppearance'

type Functions = Database['public']['Functions']

export const campaignAppearancesKey = (campaignId: string, userId: string) =>
  ['campaigns', 'appearances', campaignId, userId] as const

/** Whether the four choices are all valid, as the database checks them. */
export function isValidAppearance(look: AdventurerAppearance) {
  return (
    Number.isInteger(look.cloak) &&
    look.cloak >= 0 &&
    look.cloak < cloakCount &&
    Number.isInteger(look.skin) &&
    look.skin >= 0 &&
    look.skin < skinCount &&
    headwear.includes(look.headwear) &&
    packs.includes(look.pack)
  )
}

export function sameAppearance(first: AdventurerAppearance, second: AdventurerAppearance) {
  return (
    first.cloak === second.cloak &&
    first.skin === second.skin &&
    first.headwear === second.headwear &&
    first.pack === second.pack
  )
}

/** Every saved look in the campaign the signed-in member may see, by profile id. */
export async function listCampaignAppearances(
  campaignId: string,
): Promise<Map<string, AdventurerAppearance>> {
  const { data, error } = await supabase
    .from('campaign_appearances')
    .select('profile_id,cloak,skin,headwear,pack')
    .eq('campaign_id', campaignId)
  if (error) throw error

  const looks = new Map<string, AdventurerAppearance>()
  for (const row of data ?? []) {
    const look = {
      cloak: row.cloak,
      skin: row.skin,
      headwear: row.headwear as AdventurerAppearance['headwear'],
      pack: row.pack as AdventurerAppearance['pack'],
    }
    // A row this build does not recognize falls back to the default look.
    if (isValidAppearance(look)) looks.set(row.profile_id, look)
  }
  return looks
}

export function campaignAppearancesOptions(campaignId: string, userId: string) {
  return {
    queryKey: campaignAppearancesKey(campaignId, userId),
    queryFn: () => listCampaignAppearances(campaignId),
  }
}

export async function saveCampaignAppearance(campaignId: string, look: AdventurerAppearance) {
  const args: Functions['set_campaign_appearance']['Args'] = {
    p_campaign_id: campaignId,
    p_cloak: look.cloak,
    p_skin: look.skin,
    p_headwear: look.headwear,
    p_pack: look.pack,
  }
  const { error } = await supabase.rpc('set_campaign_appearance', args)
  if (error) throw error
}

/** Returns the player to the default look by removing their saved one. */
export async function resetCampaignAppearance(campaignId: string, profileId: string) {
  const { error } = await supabase
    .from('campaign_appearances')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('profile_id', profileId)
  if (error) throw error
}

const appearanceErrors: Record<string, string> = {
  appearance_campaign_unavailable: "You're no longer a member of this campaign.",
  appearance_invalid: 'Choose a cloak, skin, headwear, and pack from the lists.',
}

export function appearanceError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(appearanceErrors, message) ? appearanceErrors[message] : fallback
}
