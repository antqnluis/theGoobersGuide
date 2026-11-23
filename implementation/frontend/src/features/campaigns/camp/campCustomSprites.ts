// Sprites players upload for their seat at the camp, per campaign (customSprite.ts).
// Readable by current members; a player or the campaign's owner may remove one.

import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database'
import { readErrorMessage } from '../rpcErrors'
import { decodeSprite } from './customSprite'

type Functions = Database['public']['Functions']

export const campaignCustomSpritesKey = (campaignId: string, userId: string) =>
  ['campaigns', 'custom-sprites', campaignId, userId] as const

/** Every uploaded sprite in the campaign the signed-in member may see, by profile id. */
export async function listCampaignCustomSprites(campaignId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('campaign_custom_sprites')
    .select('profile_id,pixels')
    .eq('campaign_id', campaignId)
  if (error) throw error

  const sprites = new Map<string, string>()
  // A row this build cannot decode is ignored, so that player keeps their look.
  for (const row of data ?? [])
    if (decodeSprite(row.pixels)) sprites.set(row.profile_id, row.pixels)
  return sprites
}

export function campaignCustomSpritesOptions(campaignId: string, userId: string) {
  return {
    queryKey: campaignCustomSpritesKey(campaignId, userId),
    queryFn: () => listCampaignCustomSprites(campaignId),
  }
}

export async function saveCampaignCustomSprite(campaignId: string, pixels: string) {
  const args: Functions['set_campaign_custom_sprite']['Args'] = {
    p_campaign_id: campaignId,
    p_pixels: pixels,
  }
  const { error } = await supabase.rpc('set_campaign_custom_sprite', args)
  if (error) throw error
}

/** Removes a player's sprite: their own, or anyone's when the caller owns the campaign. */
export async function removeCampaignCustomSprite(campaignId: string, profileId: string) {
  const { error } = await supabase
    .from('campaign_custom_sprites')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('profile_id', profileId)
  if (error) throw error
}

const spriteErrors: Record<string, string> = {
  sprite_campaign_unavailable: "You're no longer a member of this campaign.",
  sprite_invalid: 'That image is not a usable 16 × 16 sprite.',
}

export function spriteError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(spriteErrors, message) ? spriteErrors[message] : fallback
}
