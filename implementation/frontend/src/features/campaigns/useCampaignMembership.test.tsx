import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  leaveCampaign,
  removeCampaignMember,
  transferCampaignOwnership,
} from './campaignMembership'
import { useCampaignMembership } from './useCampaignMembership'

vi.mock('./campaignMembership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./campaignMembership')>()),
  leaveCampaign: vi.fn(),
  removeCampaignMember: vi.fn(),
  transferCampaignOwnership: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const playerId = '00000000-0000-4000-8000-000000000002'
const listKey = ['campaigns', 'list', userId]
const detailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]
const outgoingKey = ['campaigns', 'invitations', 'outgoing', campaignId, userId]
const charactersKey = ['campaigns', 'characters', campaignId, userId]
const itemsKey = [
  'campaigns',
  'characters',
  'items',
  '00000000-0000-4000-8000-000000000021',
  userId,
]
const otherDetailKey = ['campaigns', 'detail', 'another-campaign', userId]

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const key of [
    listKey,
    detailKey,
    rosterKey,
    outgoingKey,
    charactersKey,
    itemsKey,
    otherDetailKey,
  ]) {
    queryClient.setQueryData(key, 'cached')
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCampaignMembership(campaignId, userId), { wrapper })
  return { queryClient, result }
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useCampaignMembership', () => {
  it('leaves, marking campaign data stale without refetching', async () => {
    vi.mocked(leaveCampaign).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    const fetchSpy = vi.spyOn(queryClient, 'refetchQueries')

    let left = false
    await act(async () => {
      left = await result.current.leave()
    })

    expect(left).toBe(true)
    expect(leaveCampaign).toHaveBeenCalledWith(campaignId)
    for (const key of [listKey, detailKey, rosterKey, outgoingKey, charactersKey, itemsKey]) {
      expect(stale(queryClient, key)).toBe(true)
    }
    expect(stale(queryClient, otherDetailKey)).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('treats an already-left campaign as a successful leave', async () => {
    vi.mocked(leaveCampaign).mockRejectedValue({ message: 'campaign_membership_unavailable' })
    const { queryClient, result } = setup()

    let left = false
    await act(async () => {
      left = await result.current.leave()
    })

    expect(left).toBe(true)
    expect(result.current.error).toBeNull()
    expect(stale(queryClient, detailKey)).toBe(true)
  })

  it('shows the transfer-first copy when the owner tries to leave', async () => {
    vi.mocked(leaveCampaign).mockRejectedValue({ message: 'campaign_leave_owner_must_transfer' })
    const { queryClient, result } = setup()

    let left = true
    await act(async () => {
      left = await result.current.leave()
    })

    expect(left).toBe(false)
    expect(result.current.error).toBe('Transfer ownership to another member before you leave.')
    expect(stale(queryClient, detailKey)).toBe(false)
  })

  it('uses safe copy for unknown leave failures', async () => {
    vi.mocked(leaveCampaign).mockRejectedValue(new Error('network down'))
    const { result } = setup()

    await act(async () => {
      await result.current.leave()
    })

    expect(result.current.error).toBe(
      "We couldn't leave the campaign. Check your connection and try again.",
    )
  })

  it('removes a player and invalidates the roster, campaign list, and characters only', async () => {
    vi.mocked(removeCampaignMember).mockResolvedValue(undefined)
    const { queryClient, result } = setup()

    let removed = false
    await act(async () => {
      removed = await result.current.remove(playerId)
    })

    expect(removed).toBe(true)
    expect(removeCampaignMember).toHaveBeenCalledWith(campaignId, playerId)
    expect(stale(queryClient, rosterKey)).toBe(true)
    expect(stale(queryClient, listKey)).toBe(true)
    expect(stale(queryClient, charactersKey)).toBe(true)
    expect(stale(queryClient, itemsKey)).toBe(true)
    expect(stale(queryClient, detailKey)).toBe(false)
    expect(result.current.pendingProfileId).toBeNull()
    expect(result.current.pendingAction).toBeNull()
  })

  it('refetches the roster and explains when the player is already gone', async () => {
    vi.mocked(removeCampaignMember).mockRejectedValue({ message: 'campaign_member_unavailable' })
    const { queryClient, result } = setup()

    let removed = true
    await act(async () => {
      removed = await result.current.remove(playerId)
    })

    expect(removed).toBe(false)
    expect(result.current.error).toBe('That player is no longer in this campaign.')
    expect(stale(queryClient, rosterKey)).toBe(true)
  })

  it('transfers ownership, drops the outgoing invitations, and refreshes every campaign query', async () => {
    vi.mocked(transferCampaignOwnership).mockResolvedValue(undefined)
    const { queryClient, result } = setup()

    let transferred = false
    await act(async () => {
      transferred = await result.current.transfer(playerId)
    })

    expect(transferred).toBe(true)
    expect(transferCampaignOwnership).toHaveBeenCalledWith(campaignId, playerId)
    expect(queryClient.getQueryState(outgoingKey)).toBeUndefined()
    for (const key of [listKey, detailKey, rosterKey, otherDetailKey]) {
      expect(stale(queryClient, key)).toBe(true)
    }
  })

  it.each([
    ['campaign_transfer_owner_required', 'Only the campaign owner can transfer ownership.'],
    [
      'campaign_transfer_target_unavailable',
      'That player is no longer in this campaign. Choose another member.',
    ],
  ])('refetches detail and roster after %s', async (message, copy) => {
    vi.mocked(transferCampaignOwnership).mockRejectedValue({ message })
    const { queryClient, result } = setup()

    await act(async () => {
      await result.current.transfer(playerId)
    })

    expect(result.current.error).toBe(copy)
    expect(stale(queryClient, detailKey)).toBe(true)
    expect(stale(queryClient, rosterKey)).toBe(true)
    expect(queryClient.getQueryState(outgoingKey)).toBeDefined()
  })

  it('uses safe copy for an unexpected transfer failure and leaves caches alone', async () => {
    vi.mocked(transferCampaignOwnership).mockRejectedValue(new Error('offline'))
    const { queryClient, result } = setup()

    await act(async () => {
      await result.current.transfer(playerId)
    })

    expect(result.current.error).toBe(
      "We couldn't transfer ownership. Check your connection and try again.",
    )
    expect(stale(queryClient, detailKey)).toBe(false)
  })

  it('reports the pending action and player while a request is in flight', async () => {
    let finish: () => void = () => {}
    vi.mocked(removeCampaignMember).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const { result } = setup()

    let pending: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pending = result.current.remove(playerId)
    })
    await waitFor(() => expect(result.current.pendingAction).toBe('remove'))
    expect(result.current.pendingProfileId).toBe(playerId)

    await act(async () => {
      finish()
      await pending
    })
    expect(result.current.pendingAction).toBeNull()
    expect(result.current.pendingProfileId).toBeNull()
  })

  it('clears an earlier error when the next attempt starts, or on request', async () => {
    vi.mocked(removeCampaignMember).mockRejectedValue(new Error('offline'))
    vi.mocked(transferCampaignOwnership).mockResolvedValue(undefined)
    const { result } = setup()

    await act(async () => {
      await result.current.remove(playerId)
    })
    expect(result.current.error).not.toBeNull()

    await act(async () => {
      await result.current.transfer(playerId)
    })
    expect(result.current.error).toBeNull()

    await act(async () => {
      await result.current.remove(playerId)
    })
    expect(result.current.error).not.toBeNull()
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
