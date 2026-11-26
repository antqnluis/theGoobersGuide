import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampVisions } from './CampVisions'
import { listCampaignLibraries, listLibraries } from './craftingService'

vi.mock('./craftingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./craftingService')>()),
  listLibraries: vi.fn(),
  listCampaignLibraries: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listLibraries).mockResolvedValue([])
  vi.mocked(listCampaignLibraries).mockResolvedValue([])
})

function setup(isOwner: boolean, enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CampVisions
        campaignId="camp-1"
        enabled={enabled}
        isOwner={isOwner}
        onNotice={vi.fn()}
        userId="user-1"
      />
    </QueryClientProvider>,
  )
}

describe('CampVisions', () => {
  it('is a journal page for the Maker’s Visions at the shrine stone', () => {
    setup(true)
    expect(screen.getByRole('heading', { name: 'The Maker’s Visions' })).toBeVisible()
    expect(screen.getByText('Shrine stone')).toBeVisible()
  })

  it('gives the campaign owner the libraries', async () => {
    setup(true)
    expect(
      await screen.findByText('Create a library and import a crafting pack to begin.'),
    ).toBeVisible()
  })

  it('gives everyone else a quiet shrine and reads no libraries', () => {
    setup(false)
    expect(screen.getByText(/The shrine is quiet/)).toBeVisible()
    expect(listLibraries).not.toHaveBeenCalled()
    expect(listCampaignLibraries).not.toHaveBeenCalled()
  })

  it('reads nothing before the area is opened', () => {
    setup(true, false)
    expect(listLibraries).not.toHaveBeenCalled()
  })
})
