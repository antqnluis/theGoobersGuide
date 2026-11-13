import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  campaignMembershipError,
  isMembershipUnavailable,
  leaveCampaign,
  removeCampaignMember,
  transferCampaignOwnership,
} from './campaignMembership'

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

const campaignId = '00000000-0000-4000-8000-000000000011'
const profileId = '00000000-0000-4000-8000-000000000002'

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
})

describe('membership RPC wrappers', () => {
  it('calls leave_campaign with the campaign id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await leaveCampaign(campaignId)
    expect(supabase.rpc).toHaveBeenCalledWith('leave_campaign', { p_campaign_id: campaignId })
  })

  it('calls remove_campaign_member with the campaign and player', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await removeCampaignMember(campaignId, profileId)
    expect(supabase.rpc).toHaveBeenCalledWith('remove_campaign_member', {
      p_campaign_id: campaignId,
      p_profile_id: profileId,
    })
  })

  it('calls transfer_campaign_ownership with the campaign and player', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await transferCampaignOwnership(campaignId, profileId)
    expect(supabase.rpc).toHaveBeenCalledWith('transfer_campaign_ownership', {
      p_campaign_id: campaignId,
      p_profile_id: profileId,
    })
  })

  it.each([
    ['leave', () => leaveCampaign(campaignId)],
    ['remove', () => removeCampaignMember(campaignId, profileId)],
    ['transfer', () => transferCampaignOwnership(campaignId, profileId)],
  ])('throws the database error when %s fails', async (_name, call) => {
    const failure = { message: 'campaign_membership_unavailable', code: 'P0001' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: failure } as never)
    await expect(call()).rejects.toBe(failure)
  })
})

describe('membership error copy', () => {
  it.each([
    ['campaign_membership_unavailable', "You're no longer a member of this campaign."],
    [
      'campaign_leave_owner_must_transfer',
      'Transfer ownership to another member before you leave.',
    ],
    ['campaign_member_owner_required', 'Only the campaign owner can remove members.'],
    ['campaign_member_remove_owner', "The campaign owner can't be removed."],
    ['campaign_member_unavailable', 'That player is no longer in this campaign.'],
    ['campaign_transfer_owner_required', 'Only the campaign owner can transfer ownership.'],
    ['campaign_transfer_self', 'You already own this campaign.'],
    [
      'campaign_transfer_target_unavailable',
      'That player is no longer in this campaign. Choose another member.',
    ],
  ])('maps %s to safe copy', (message, copy) => {
    expect(campaignMembershipError({ message }, 'fallback')).toBe(copy)
  })

  it('falls back for unknown, empty, and non-error values', () => {
    expect(campaignMembershipError({ message: 'permission denied for table x' }, 'fallback')).toBe(
      'fallback',
    )
    expect(campaignMembershipError(new Error('offline'), 'fallback')).toBe('fallback')
    expect(campaignMembershipError(null, 'fallback')).toBe('fallback')
    expect(campaignMembershipError({ message: 'toString' }, 'fallback')).toBe('fallback')
  })

  it('recognises only the unavailable-membership error', () => {
    expect(isMembershipUnavailable({ message: 'campaign_membership_unavailable' })).toBe(true)
    expect(isMembershipUnavailable({ message: 'campaign_member_unavailable' })).toBe(false)
    expect(isMembershipUnavailable(undefined)).toBe(false)
  })
})
