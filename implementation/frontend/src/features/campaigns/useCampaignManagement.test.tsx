import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCampaign, updateCampaign } from './campaignService'
import type { CampaignRecord } from './campaignTypes'
import { useCampaignManagement } from './useCampaignManagement'

vi.mock('./campaignService', () => ({
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const listKey = ['campaigns', 'list', userId]
const detailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]
const otherDetailKey = ['campaigns', 'detail', 'another-campaign', userId]

const campaign: CampaignRecord = {
  id: campaignId,
  owner_id: userId,
  name: 'The Red Hand',
  description: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const key of [listKey, detailKey, rosterKey, otherDetailKey]) {
    queryClient.setQueryData(key, 'cached')
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCampaignManagement(campaignId, userId), { wrapper })
  return { queryClient, result }
}

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useCampaignManagement', () => {
  it('saves trimmed details and marks cached campaign data stale', async () => {
    vi.mocked(updateCampaign).mockResolvedValue(campaign)
    const { queryClient, result } = setup()

    let saved = false
    await act(async () => {
      saved = await result.current.save('  The Red Hand  ', '   ')
    })

    expect(saved).toBe(true)
    expect(updateCampaign).toHaveBeenCalledWith(campaignId, {
      name: 'The Red Hand',
      description: null,
    })
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.isSaving).toBe(false)
  })

  it('reports a safe error when a save is refused, then clears it on request', async () => {
    vi.mocked(updateCampaign).mockRejectedValue(
      new Error('Campaign could not be updated by this account.'),
    )
    const { queryClient, result } = setup()

    let saved = true
    await act(async () => {
      saved = await result.current.save('The Red Hand', '')
    })

    expect(saved).toBe(false)
    expect(result.current.error).toBe(
      "We couldn't save these changes. Check your connection and try again.",
    )
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false)

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it("deletes the campaign and drops only that campaign's cached detail and roster", async () => {
    vi.mocked(deleteCampaign).mockResolvedValue(undefined)
    const { queryClient, result } = setup()

    let removed = false
    await act(async () => {
      removed = await result.current.remove()
    })

    expect(removed).toBe(true)
    expect(deleteCampaign).toHaveBeenCalledWith(campaignId)
    expect(queryClient.getQueryState(detailKey)).toBeUndefined()
    expect(queryClient.getQueryState(rosterKey)).toBeUndefined()
    expect(queryClient.getQueryState(otherDetailKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    expect(result.current.isDeleting).toBe(false)
  })

  it('keeps cached data and reports a safe error when a delete is refused', async () => {
    vi.mocked(deleteCampaign).mockRejectedValue(
      new Error('Campaign could not be deleted by this account.'),
    )
    const { queryClient, result } = setup()

    let removed = true
    await act(async () => {
      removed = await result.current.remove()
    })

    expect(removed).toBe(false)
    expect(result.current.error).toBe(
      "We couldn't delete this campaign. Check your connection and try again.",
    )
    expect(queryClient.getQueryState(detailKey)).toBeDefined()
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false)
  })

  it('clears an earlier error when the next attempt starts', async () => {
    vi.mocked(deleteCampaign).mockRejectedValue(new Error('offline'))
    vi.mocked(updateCampaign).mockResolvedValue(campaign)
    const { result } = setup()

    await act(async () => {
      await result.current.remove()
    })
    expect(result.current.error).not.toBeNull()

    await act(async () => {
      await result.current.save('The Red Hand', '')
    })
    expect(result.current.error).toBeNull()
  })
})
