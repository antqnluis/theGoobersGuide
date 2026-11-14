import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  campaignMembershipError,
  isMembershipUnavailable,
  leaveCampaign,
  removeCampaignMember,
  transferCampaignOwnership,
} from './campaignMembership'
import { campaignCharactersKey } from '../characters/characterQueries'
import { readErrorMessage } from './rpcErrors'

export type MembershipAction = 'leave' | 'remove' | 'transfer'

/** The one inline confirmation that may be open at a time in the workspace. */
export type MembershipConfirmation =
  | { type: 'leave' }
  | { type: 'remove'; profileId: string }
  | { type: 'transfer'; profileId: string }

const fallbackCopy: Record<MembershipAction, string> = {
  leave: "We couldn't leave the campaign. Check your connection and try again.",
  remove: "We couldn't remove this player. Check your connection and try again.",
  transfer: "We couldn't transfer ownership. Check your connection and try again.",
}

/**
 * Leave, remove, and transfer for one campaign. Called once by the workspace so
 * mutation state survives the Settings panel unmounting after a transfer.
 * Authorization stays in the database; failures surface as safe copy.
 *
 * Each action resolves to whether it took effect, so the surface decides what
 * follows (navigating, announcing, moving focus).
 */
export function useCampaignMembership(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null)
  const leaveMutation = useMutation({ mutationFn: () => leaveCampaign(campaignId) })
  const removeMutation = useMutation({
    mutationFn: (profileId: string) => removeCampaignMember(campaignId, profileId),
  })
  const transferMutation = useMutation({
    mutationFn: (profileId: string) => transferCampaignOwnership(campaignId, profileId),
  })

  const detailKey = ['campaigns', 'detail', campaignId, userId]
  const rosterKey = ['campaigns', 'roster', campaignId, userId]
  const outgoingKey = ['campaigns', 'invitations', 'outgoing', campaignId, userId]
  const listKey = ['campaigns', 'list', userId]
  // Characters leave the party (and, for the leaver, become unreadable) on departure.
  const charactersKey = campaignCharactersKey(campaignId, userId)

  const clearError = useCallback(() => setError(null), [])

  const leave = async () => {
    setError(null)
    try {
      await leaveMutation.mutateAsync()
    } catch (failure) {
      if (!isMembershipUnavailable(failure)) {
        setError(campaignMembershipError(failure, fallbackCopy.leave))
        return false
      }
    }
    // Stale, not refetched: the page is about to leave, and a refetch would flash
    // "Campaign not available" before the navigation lands.
    for (const queryKey of [detailKey, rosterKey, outgoingKey, listKey, charactersKey]) {
      void queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
    }
    return true
  }

  const remove = async (profileId: string) => {
    setError(null)
    setPendingProfileId(profileId)
    try {
      await removeMutation.mutateAsync(profileId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rosterKey }),
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({ queryKey: charactersKey }),
      ])
      return true
    } catch (failure) {
      if (readErrorMessage(failure) === 'campaign_member_unavailable') {
        void queryClient.invalidateQueries({ queryKey: rosterKey })
      }
      setError(campaignMembershipError(failure, fallbackCopy.remove))
      return false
    } finally {
      setPendingProfileId(null)
    }
  }

  const transfer = async (profileId: string) => {
    setError(null)
    setPendingProfileId(profileId)
    try {
      await transferMutation.mutateAsync(profileId)
      queryClient.removeQueries({ queryKey: outgoingKey })
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      return true
    } catch (failure) {
      const message = readErrorMessage(failure)
      if (
        message === 'campaign_transfer_owner_required' ||
        message === 'campaign_transfer_target_unavailable'
      ) {
        void queryClient.invalidateQueries({ queryKey: detailKey })
        void queryClient.invalidateQueries({ queryKey: rosterKey })
      }
      setError(campaignMembershipError(failure, fallbackCopy.transfer))
      return false
    } finally {
      setPendingProfileId(null)
    }
  }

  const pendingAction: MembershipAction | null = leaveMutation.isPending
    ? 'leave'
    : removeMutation.isPending
      ? 'remove'
      : transferMutation.isPending
        ? 'transfer'
        : null

  return { error, clearError, pendingAction, pendingProfileId, leave, remove, transfer }
}
