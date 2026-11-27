import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterSummary } from '../characters/characterTypes'
import { CampVisions } from './CampVisions'
import { ownCharacters } from './ownCharacters'
import { characterRow, daggerVision, oilVision, visionsDocument } from './craftingTestData'
import {
  getCharacterVisions,
  getLastRest,
  listCampaignLibraries,
  listLibraries,
  saveVision,
  unsaveVision,
} from './craftingService'

vi.mock('./craftingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./craftingService')>()),
  listLibraries: vi.fn(),
  listCampaignLibraries: vi.fn(),
  getCharacterVisions: vi.fn(),
  getLastRest: vi.fn(),
  saveVision: vi.fn(),
  unsaveVision: vi.fn(),
}))

afterEach(cleanup)

/** What a rest brought arrives sealed; most tests want to read it. */
async function breakSeals(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Break all seals' }))
}

beforeEach(() => {
  window.localStorage.clear()
  vi.resetAllMocks()
  vi.mocked(listLibraries).mockResolvedValue([])
  vi.mocked(listCampaignLibraries).mockResolvedValue([])
  vi.mocked(getLastRest).mockResolvedValue(null)
  vi.mocked(getCharacterVisions).mockResolvedValue(visionsDocument())
  vi.mocked(saveVision).mockResolvedValue(undefined)
  vi.mocked(unsaveVision).mockResolvedValue(undefined)
})

function setup({
  isOwner = false,
  enabled = true,
  characters = [characterRow()],
}: { isOwner?: boolean; enabled?: boolean; characters?: CharacterSummary[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <CampVisions
        campaignId="camp-1"
        characters={characters}
        enabled={enabled}
        isOwner={isOwner}
        onNotice={vi.fn()}
        userId="user-1"
      />
    </QueryClientProvider>,
  )
  return { client, user }
}

describe('ownCharacters', () => {
  it('keeps only the viewer’s characters, the active one first, then by name', () => {
    const rows = [
      characterRow({ id: 'a', name: 'Zed', status: 'retired' }),
      characterRow({ id: 'b', name: 'Other', owner_id: 'user-2' }),
      characterRow({ id: 'c', name: 'Ada', status: 'deceased' }),
      characterRow({ id: 'd', name: 'Mira', status: 'active' }),
    ]
    expect(ownCharacters(rows, 'user-1').map(({ id }) => id)).toEqual(['d', 'c', 'a'])
  })
})

describe('CampVisions', () => {
  it('is a journal page for the Maker’s Visions at the shrine stone', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'The Maker’s Visions' })).toBeVisible()
    expect(screen.getByText('Shrine stone')).toBeVisible()
  })

  it('reads the viewer’s own character, never the DM’s libraries', async () => {
    const { user } = setup()
    expect(screen.getByText('Reading your visions…')).toBeVisible()
    await breakSeals(user)
    expect(await screen.findByText('Wyvern Fang Dagger')).toBeVisible()
    expect(getCharacterVisions).toHaveBeenCalledWith('char-1')
    expect(listLibraries).not.toHaveBeenCalled()
    expect(listCampaignLibraries).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /DM: libraries/ })).not.toBeInTheDocument()
  })

  it('reads nothing before the area is opened', () => {
    setup({ enabled: false })
    expect(getCharacterVisions).not.toHaveBeenCalled()
  })

  it('invites a player without a character to make one', () => {
    setup({ characters: [characterRow({ owner_id: 'user-2' })] })
    expect(screen.getByText(/Create a character in the tent/)).toBeVisible()
    expect(getCharacterVisions).not.toHaveBeenCalled()
  })

  it('says so, and retries, when the visions can’t be read', async () => {
    vi.mocked(getCharacterVisions).mockRejectedValueOnce(new Error('offline'))
    const { user } = setup()
    expect(await screen.findByText('Your visions could not be loaded.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await breakSeals(user)
    expect(await screen.findByText('Wyvern Fang Dagger')).toBeVisible()
  })

  it('lets a player choose among their characters and reads the one chosen', async () => {
    const { user } = setup({
      characters: [
        characterRow({ id: 'char-1', name: 'Brannoc' }),
        characterRow({ id: 'char-2', name: 'Old Ned', status: 'retired' }),
      ],
    })
    await breakSeals(user)
    await screen.findByText('Wyvern Fang Dagger')
    const picker = screen.getByRole('combobox', { name: 'Character' })
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Brannoc', 'Old Ned (retired)'])
    vi.mocked(getCharacterVisions).mockResolvedValueOnce(
      visionsDocument({ visions: [oilVision], fragments: [] }),
    )
    await user.selectOptions(picker, 'char-2')
    expect(await screen.findByText('Venom Blade Oil')).toBeVisible()
    expect(getCharacterVisions).toHaveBeenLastCalledWith('char-2')
  })

  it('saves a vision and refetches the list', async () => {
    const { user } = setup()
    // A card just unsealed opens itself.
    await breakSeals(user)
    vi.mocked(getCharacterVisions).mockResolvedValue(
      visionsDocument({ visions: [{ ...daggerVision, saved: true }, oilVision] }),
    )
    await user.click(screen.getByRole('button', { name: 'Save this vision (Wyvern Fang Dagger)' }))
    await waitFor(() => expect(saveVision).toHaveBeenCalledWith('char-1', daggerVision.recipe_id))
    expect(await screen.findByText('Saved')).toBeVisible()
  })

  it('unsaves a saved vision', async () => {
    vi.mocked(getCharacterVisions).mockResolvedValue(
      visionsDocument({ visions: [], fragments: [], saved: [{ ...daggerVision, saved: true }] }),
    )
    const { user } = setup()
    await user.click(await screen.findByText('Wyvern Fang Dagger'))
    await user.click(screen.getByRole('button', { name: /^Remove from saved/ }))
    await waitFor(() => expect(unsaveVision).toHaveBeenCalledWith('char-1', daggerVision.recipe_id))
  })

  it('explains a vision that can no longer be saved, and refreshes the list', async () => {
    vi.mocked(saveVision).mockRejectedValue(new Error('vision_unavailable'))
    const { user } = setup()
    await breakSeals(user)
    await user.click(
      await screen.findByRole('button', { name: 'Save this vision (Wyvern Fang Dagger)' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('That vision is no longer there')
    await waitFor(() => expect(getCharacterVisions).toHaveBeenCalledTimes(2))
  })

  describe('as the campaign owner', () => {
    it('opens on their own visions, with the DM’s tab beside them', async () => {
      const { user } = setup({ isOwner: true })
      await breakSeals(user)
      expect(await screen.findByText('Wyvern Fang Dagger')).toBeVisible()
      expect(listLibraries).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'DM: libraries and rests' }))
      expect(
        await screen.findByText('Create a library and import a crafting pack to begin.'),
      ).toBeVisible()
      expect(screen.getByRole('button', { name: 'Call a long rest' })).toBeVisible()
      expect(screen.queryByText('Wyvern Fang Dagger')).not.toBeInTheDocument()
    })

    it('goes straight to the DM’s side without a character of their own', async () => {
      setup({ isOwner: true, characters: [] })
      expect(
        await screen.findByText('Create a library and import a crafting pack to begin.'),
      ).toBeVisible()
      expect(screen.queryByRole('button', { name: 'My visions' })).not.toBeInTheDocument()
      expect(getCharacterVisions).not.toHaveBeenCalled()
    })
  })
})
