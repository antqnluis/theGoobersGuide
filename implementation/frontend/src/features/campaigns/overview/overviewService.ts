import { supabase } from '../../../lib/supabase'
import type { CampaignOverview, OverviewValues } from './overviewTypes'

// One literal, so the client can read the column names.
const overviewFields =
  'campaign_id,announcement,location,in_world_date,chapter,situation,objective,last_session,next_session_at,next_session_note,ruleset,house_rules,table_notes,updated_at'

/** The campaign's overview, or null while its owner has not written one. */
export async function getOverview(campaignId: string): Promise<CampaignOverview | null> {
  const { data, error } = await supabase
    .from('campaign_overviews')
    .select(overviewFields)
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (error) throw error
  return data as CampaignOverview | null
}

async function updateOverview(campaignId: string, values: OverviewValues) {
  const { data, error } = await supabase
    .from('campaign_overviews')
    .update(values)
    .eq('campaign_id', campaignId)
    .select(overviewFields)
    .maybeSingle()

  if (error) throw error
  return data as CampaignOverview | null
}

/**
 * Saves the owner's overview. The first save creates the row. Only the owner can write it:
 * row-level security returns no row to anyone else, and the insert is then refused.
 */
export async function saveOverview(
  campaignId: string,
  values: OverviewValues,
): Promise<CampaignOverview> {
  const updated = await updateOverview(campaignId, values)
  if (updated) return updated

  const { data, error } = await supabase
    .from('campaign_overviews')
    .insert({ campaign_id: campaignId, ...values })
    .select(overviewFields)
    .single()

  if (error) {
    // Two first saves raced: the other one created the row, so this one is an update.
    if (error.code === '23505') {
      const retried = await updateOverview(campaignId, values)
      if (retried) return retried
    }
    throw error
  }
  return data as CampaignOverview
}
