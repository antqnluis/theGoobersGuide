import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCampaign } from './campaignService'
import { CreateCampaignPage } from './CreateCampaignPage'
import { moveGalaxyPlanet } from './galaxyPlanets'

vi.mock('./campaignService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./campaignService')>()),
  createCampaign: vi.fn(),
}))
vi.mock('./galaxyPlanets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./galaxyPlanets')>()),
  moveGalaxyPlanet: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'

function Landing() {
  const location = useLocation()
  return (
    <p data-testid="landing">
      {location.pathname} {JSON.stringify(location.state)}
    </p>
  )
}

function renderPage(search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/campaigns/new${search}`]}>
        <Routes>
          <Route element={<CreateCampaignPage />} path="/app/campaigns/new" />
          <Route element={<Landing />} path="/app/campaigns" />
          <Route element={<Landing />} path="/app/campaigns/:id" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

async function submit(name = 'The Red Hand') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Campaign name'), name)
  await user.click(screen.getByRole('button', { name: 'Create campaign' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createCampaign).mockResolvedValue({ id: campaignId })
  vi.mocked(moveGalaxyPlanet).mockResolvedValue(3)
})
afterEach(cleanup)

describe('CreateCampaignPage', () => {
  it('moves the new campaign to the requested planet after the insert succeeds', async () => {
    const { invalidate } = renderPage('?planet=3')
    await submit()

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
    expect(createCampaign).toHaveBeenCalledOnce()
    expect(moveGalaxyPlanet).toHaveBeenCalledWith(campaignId, 3)
    expect(vi.mocked(createCampaign).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(moveGalaxyPlanet).mock.invocationCallOrder[0],
    )
    // The planets refresh after the move, so the galaxy opens on the right planet.
    expect(vi.mocked(moveGalaxyPlanet).mock.invocationCallOrder[0]).toBeLessThan(
      invalidate.mock.invocationCallOrder[0],
    )
    expect(screen.getByTestId('landing')).toHaveTextContent(
      `/app/campaigns/${campaignId} {"campaignCreated":true}`,
    )
  })

  it('takes the first free planet when no planet is asked for', async () => {
    renderPage()
    await submit()

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
    expect(moveGalaxyPlanet).not.toHaveBeenCalled()
  })

  it.each(['?planet=', '?planet=-1', '?planet=abc', '?planet=1.5', '?planet=999999'])(
    'ignores a bad planet request (%s)',
    async (search) => {
      renderPage(search)
      await submit()

      await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
      expect(moveGalaxyPlanet).not.toHaveBeenCalled()
    },
  )

  it('moves nothing when the campaign could not be created', async () => {
    vi.mocked(createCampaign).mockRejectedValue(new Error('network down'))
    renderPage('?planet=2')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save this campaign.")
    expect(moveGalaxyPlanet).not.toHaveBeenCalled()
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
  })

  it('moves nothing when the form is invalid or cancelled', async () => {
    const user = userEvent.setup()
    renderPage('?planet=2')
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))
    expect(createCampaign).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByTestId('landing')).toHaveTextContent('/app/campaigns')
    expect(createCampaign).not.toHaveBeenCalled()
    expect(moveGalaxyPlanet).not.toHaveBeenCalled()
  })

  it('still opens the campaign, with the created notice, when the move fails', async () => {
    vi.mocked(moveGalaxyPlanet).mockRejectedValue({ message: 'galaxy_planet_campaign_unavailable' })
    renderPage('?planet=3')
    await submit()

    expect(await screen.findByTestId('landing')).toHaveTextContent(
      `/app/campaigns/${campaignId} {"campaignCreated":true}`,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
