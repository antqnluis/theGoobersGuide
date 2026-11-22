import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { readErrorMessage } from './rpcErrors'

type Functions = Database['public']['Functions']

export async function leaveCampaign(campaignId: string) {
  const args: Functions['leave_campaign']['Args'] = { p_campaign_id: campaignId }
  const { error } = await supabase.rpc('leave_campaign', args)
  if (error) throw error
}

export async function removeCampaignMember(campaignId: string, profileId: string) {
  const args: Functions['remove_campaign_member']['Args'] = {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
  }
  const { error } = await supabase.rpc('remove_campaign_member', args)
  if (error) throw error
}

export async function transferCampaignOwnership(campaignId: string, profileId: string) {
  const args: Functions['transfer_campaign_ownership']['Args'] = {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
  }
  const { error } = await supabase.rpc('transfer_campaign_ownership', args)
  if (error) throw error
}

const membershipErrors: Record<string, string> = {
  campaign_membership_unavailable: "You're no longer a member of this campaign.",
  campaign_leave_owner_must_transfer: 'Transfer ownership to another member before you leave.',
  campaign_member_owner_required: 'Only the campaign owner can remove members.',
  campaign_member_remove_owner: "The campaign owner can't be removed.",
  campaign_member_unavailable: 'That player is no longer in this campaign.',
  campaign_transfer_owner_required: 'Only the campaign owner can transfer ownership.',
  campaign_transfer_self: 'You already own this campaign.',
  campaign_transfer_target_unavailable:
    'That player is no longer in this campaign. Choose another member.',
}

/** True when the database says the caller is not (or no longer) a member of the campaign. */
export function isMembershipUnavailable(error: unknown) {
  return readErrorMessage(error) === 'campaign_membership_unavailable'
}

export function campaignMembershipError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(membershipErrors, message) ? membershipErrors[message] : fallback
}
