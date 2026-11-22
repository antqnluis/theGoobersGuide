import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { respondToCampaignInvitation, incomingInvitationsOptions } from './campaignInvitations'
import { CampaignInvitationInbox } from './CampaignInvitationInbox'

vi.mock('./campaignInvitations', async (importOriginal) => {
  const original = await importOriginal<typeof import('./campaignInvitations')>()
  return {
    ...original,
    incomingInvitationsOptions: vi.fn((userId: string) => ({
      ...original.incomingInvitationsOptions(userId),
      queryFn: async () => [
        { id: 'invitation-1', campaign_name: 'The Red Hand', inviter_username: 'player_two' },
      ],
    })),
    respondToCampaignInvitation: vi.fn(),
  }
})

const userId = '00000000-0000-4000-8000-000000000001'
const listKey = ['campaigns', 'list', userId]
const planetsKey = ['campaigns', 'planets', userId]

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(listKey, [])
  queryClient.setQueryData(planetsKey, [])
  render(
    <QueryClientProvider client={queryClient}>
      <CampaignInvitationInbox expanded onExpandedChange={vi.fn()} userId={userId} />
    </QueryClientProvider>,
  )
  return queryClient
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated

beforeEach(() => {
  vi.mocked(respondToCampaignInvitation).mockReset().mockResolvedValue(undefined)
  vi.mocked(incomingInvitationsOptions).mockClear()
})
afterEach(cleanup)

describe('CampaignInvitationInbox', () => {
  it('refreshes the campaign list and the planets after an invitation is accepted', async () => {
    const user = userEvent.setup()
    const queryClient = setup()
    await user.click(
      await screen.findByRole('button', { name: 'Accept invitation to The Red Hand' }),
    )

    await waitFor(() =>
      expect(respondToCampaignInvitation).toHaveBeenCalledWith('invitation-1', true),
    )
    await waitFor(() => expect(stale(queryClient, planetsKey)).toBe(true))
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('leaves the campaign list and planets alone after a decline', async () => {
    const user = userEvent.setup()
    const queryClient = setup()
    await user.click(
      await screen.findByRole('button', { name: 'Decline invitation to The Red Hand' }),
    )

    await waitFor(() =>
      expect(respondToCampaignInvitation).toHaveBeenCalledWith('invitation-1', false),
    )
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(stale(queryClient, listKey)).toBe(false)
    expect(stale(queryClient, planetsKey)).toBe(false)
  })
})
