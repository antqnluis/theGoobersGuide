import { supabase } from '../../lib/supabase'
import type {
  CampaignInput,
  CampaignListItem,
  CampaignRecord,
  CampaignRosterMember,
  CampaignRole,
} from './campaignTypes'

const campaignFields = 'id,owner_id,name,description,created_at,updated_at'

type MembershipRow = { campaign_id: string; role: CampaignRole }

export async function listAccessibleCampaigns(userId: string): Promise<CampaignListItem[]> {
  const [campaignResult, membershipResult] = await Promise.all([
    supabase.from('campaigns').select(campaignFields).order('created_at', { ascending: false }),
    supabase.from('campaign_members').select('campaign_id,role').eq('profile_id', userId),
  ])

  if (campaignResult.error) throw campaignResult.error
  if (membershipResult.error) throw membershipResult.error

  const roles = new Map(
    ((membershipResult.data ?? []) as MembershipRow[]).map((membership) => [
      membership.campaign_id,
      membership.role,
    ]),
  )

  return ((campaignResult.data ?? []) as CampaignRecord[]).map((campaign) => ({
    ...campaign,
    role: campaign.owner_id === userId ? 'owner' : (roles.get(campaign.id) ?? 'member'),
  }))
}

export async function createCampaign(input: CampaignInput): Promise<Pick<CampaignRecord, 'id'>> {
  const { data, error } = await supabase.from('campaigns').insert(input).select('id').single()

  if (error) throw error
  return data as Pick<CampaignRecord, 'id'>
}

export async function getCampaign(campaignId: string): Promise<CampaignRecord | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select(campaignFields)
    .eq('id', campaignId)
    .maybeSingle()

  if (error) throw error
  return data as CampaignRecord | null
}

export async function getCampaignRoster(campaignId: string): Promise<CampaignRosterMember[]> {
  const { data, error } = await supabase.rpc('get_campaign_roster', {
    p_campaign_id: campaignId,
  })

  if (error) throw error
  return (data ?? []) as CampaignRosterMember[]
}

export async function updateCampaign(
  campaignId: string,
  input: CampaignInput,
): Promise<CampaignRecord> {
  const { data, error } = await supabase
    .from('campaigns')
    .update(input)
    .eq('id', campaignId)
    .select(campaignFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Campaign could not be updated by this account.')
  return data as CampaignRecord
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const { data, error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Campaign could not be deleted by this account.')
}
