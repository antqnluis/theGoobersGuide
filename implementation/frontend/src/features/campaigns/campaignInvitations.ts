import { supabase } from '../../lib/supabase'
import { readErrorMessage } from './rpcErrors'

type IncomingInvitation = {
  id: string
  campaign_name: string
  inviter_username: string | null
}

type OutgoingInvitation = {
  id: string
  recipient_username: string
}

export function incomingInvitationsOptions(userId: string) {
  return {
    queryKey: ['campaigns', 'invitations', 'incoming', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_campaign_invitations')
      if (error) throw error
      return (data ?? []) as IncomingInvitation[]
    },
    refetchOnWindowFocus: true,
  } as const
}

export function outgoingInvitationsOptions(campaignId: string, userId: string) {
  return {
    queryKey: ['campaigns', 'invitations', 'outgoing', campaignId, userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_campaign_outgoing_invitations', {
        p_campaign_id: campaignId,
      })
      if (error) throw error
      return (data ?? []) as OutgoingInvitation[]
    },
    refetchOnWindowFocus: true,
  } as const
}

export async function sendCampaignInvitation(campaignId: string, username: string) {
  const { error } = await supabase.rpc('send_campaign_invitation', {
    p_campaign_id: campaignId,
    p_username: username,
  })
  if (error) throw error
}

export async function respondToCampaignInvitation(id: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_to_campaign_invitation', {
    p_invitation_id: id,
    p_accept: accept,
  })
  if (error) throw error
}

export async function cancelCampaignInvitation(id: string) {
  const { error } = await supabase.rpc('cancel_campaign_invitation', { p_invitation_id: id })
  if (error) throw error
}

const invitationErrors: Record<string, string> = {
  campaign_invitation_unknown_username:
    'No player has that username. Check the spelling and try again.',
  campaign_invitation_self: 'You already own this campaign.',
  campaign_invitation_already_member: 'That player is already in this campaign.',
  campaign_invitation_already_pending: 'That player already has a pending invitation.',
  campaign_invitation_owner_required: 'Only the campaign owner can send invitations.',
  campaign_invitation_unavailable: 'This invitation is no longer pending.',
}

export function isInvitationUnavailable(error: unknown) {
  return readErrorMessage(error) === 'campaign_invitation_unavailable'
}

export function campaignInvitationError(error: unknown, fallback: string) {
  const message = readErrorMessage(error)
  return Object.hasOwn(invitationErrors, message) ? invitationErrors[message] : fallback
}
