import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contentFromPack, library } from './craftingTestData'
import {
  callLongRest,
  createLibrary,
  deleteLibrary,
  getLastRest,
  getLibraryContent,
  listCampaignLibraries,
  listImports,
  listLibraries,
  previewLibraryDelete,
  setCampaignLibrary,
  updateLibrary,
} from './craftingService'
import { VisionsDm } from './VisionsDm'

vi.mock('./craftingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./craftingService')>()),
  listLibraries: vi.fn(),
  listCampaignLibraries: vi.fn(),
  createLibrary: vi.fn(),
  updateLibrary: vi.fn(),
  deleteLibrary: vi.fn(),
  previewLibraryDelete: vi.fn(),
  setCampaignLibrary: vi.fn(),
  getLibraryContent: vi.fn(),
  listImports: vi.fn(),
  importPack: vi.fn(),
  callLongRest: vi.fn(),
  getLastRest: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listLibraries).mockResolvedValue([])
  vi.mocked(listCampaignLibraries).mockResolvedValue([])
  vi.mocked(getLibraryContent).mockResolvedValue(contentFromPack())
  vi.mocked(listImports).mockResolvedValue([])
  vi.mocked(getLastRest).mockResolvedValue(null)
})

const wyvern = library({ id: 'lib-1', name: 'Wyvern Components' })
const drakkenheim = library({ id: 'lib-2', name: 'Drakkenheim', description: 'Delirium crafting.' })

function setup(enabled = true) {
  const onNotice = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <VisionsDm campaignId="camp-1" enabled={enabled} onNotice={onNotice} userId="user-1" />
    </QueryClientProvider>,
  )
  return { onNotice, user }
}

const cardOf = (heading: HTMLElement) => within(heading.closest('li') as HTMLElement)
/** A library's card once the list has loaded. */
const card = (name: string) => cardOf(screen.getByRole('heading', { name }))
/** A library's card, waiting for the list to load. */
const cardWhenLoaded = async (name: string) => cardOf(await screen.findByRole('heading', { name }))

describe('VisionsDm', () => {
  it('loads nothing until the area is opened', () => {
    setup(false)
    expect(listLibraries).not.toHaveBeenCalled()
    expect(listCampaignLibraries).not.toHaveBeenCalled()
  })

  it('shows a loading state, then invites a first library', async () => {
    setup()
    expect(screen.getByText('Loading your libraries…')).toBeVisible()
    expect(
      await screen.findByText('Create a library and import a crafting pack to begin.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'New library' })).toBeVisible()
  })

  it('says so, and retries, when libraries can’t be loaded', async () => {
    vi.mocked(listLibraries).mockRejectedValueOnce(new Error('offline'))
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your libraries could not be loaded.',
    )
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Wyvern Components' })).toBeVisible()
  })

  it('lists each library with whether this campaign uses it', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern, drakkenheim])
    vi.mocked(listCampaignLibraries).mockResolvedValue([
      { library_id: 'lib-2', enabled_at: '2026-11-27T10:00:00Z' },
    ])
    setup()
    await screen.findByRole('heading', { name: 'Wyvern Components' })
    expect(card('Wyvern Components').getByLabelText('Use in this campaign')).not.toBeChecked()
    expect(card('Drakkenheim').getByLabelText('Use in this campaign')).toBeChecked()
    expect(screen.getByText('Delirium crafting.')).toBeVisible()
    expect(
      screen.queryByText('Create a library and import a crafting pack to begin.'),
    ).not.toBeInTheDocument()
  })

  it('turns a library on for the campaign and shows it on', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(setCampaignLibrary).mockImplementation(async () => {
      vi.mocked(listCampaignLibraries).mockResolvedValue([
        { library_id: 'lib-1', enabled_at: '2026-11-27T10:00:00Z' },
      ])
    })
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByLabelText('Use in this campaign'),
    )
    expect(setCampaignLibrary).toHaveBeenCalledWith('camp-1', 'lib-1', true)
    await waitFor(() =>
      expect(card('Wyvern Components').getByLabelText('Use in this campaign')).toBeChecked(),
    )
  })

  it('turns a library off', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(listCampaignLibraries).mockResolvedValue([
      { library_id: 'lib-1', enabled_at: '2026-11-27T10:00:00Z' },
    ])
    vi.mocked(setCampaignLibrary).mockImplementation(async () => {
      vi.mocked(listCampaignLibraries).mockResolvedValue([])
    })
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByLabelText('Use in this campaign'),
    )
    expect(setCampaignLibrary).toHaveBeenCalledWith('camp-1', 'lib-1', false)
    await waitFor(() =>
      expect(card('Wyvern Components').getByLabelText('Use in this campaign')).not.toBeChecked(),
    )
  })

  it('explains why a library couldn’t be turned on, and leaves it off', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(setCampaignLibrary).mockRejectedValue({ message: 'crafting_campaign_library_limit' })
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByLabelText('Use in this campaign'),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A campaign can use up to 10 libraries',
    )
    expect(card('Wyvern Components').getByLabelText('Use in this campaign')).not.toBeChecked()
  })

  it('creates a library, tells the DM, and clears the form', async () => {
    vi.mocked(createLibrary).mockResolvedValue(drakkenheim)
    const { user, onNotice } = setup()
    await screen.findByRole('heading', { name: 'New library' })
    await user.type(screen.getByLabelText('Library name'), '  Drakkenheim ')
    await user.type(screen.getByLabelText(/Description/), 'Delirium crafting.')
    await user.click(screen.getByRole('button', { name: 'Create library' }))
    await waitFor(() =>
      expect(createLibrary).toHaveBeenCalledWith('Drakkenheim', 'Delirium crafting.'),
    )
    expect(onNotice).toHaveBeenCalledWith('Created Drakkenheim')
    expect(screen.getByLabelText('Library name')).toHaveValue('')
  })

  it('asks for a name and refuses one that is too long, without calling the database', async () => {
    const { user } = setup()
    await screen.findByRole('heading', { name: 'New library' })
    await user.click(screen.getByRole('button', { name: 'Create library' }))
    expect(await screen.findByText('Give the library a name.')).toBeVisible()
    await user.type(screen.getByLabelText('Library name'), 'x'.repeat(121))
    expect(screen.getByText('Use a name of up to 120 characters.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Create library' }))
    expect(createLibrary).not.toHaveBeenCalled()
  })

  it('keeps what was typed when creating fails', async () => {
    vi.mocked(createLibrary).mockRejectedValue({ message: 'crafting_library_limit_reached' })
    const { user } = setup()
    await user.type(await screen.findByLabelText('Library name'), 'Eleventh')
    await user.click(screen.getByRole('button', { name: 'Create library' }))
    expect(await screen.findByText(/up to 20 libraries/)).toBeVisible()
    expect(screen.getByLabelText('Library name')).toHaveValue('Eleventh')
  })

  it('renames a library', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(updateLibrary).mockImplementation(async () => {
      vi.mocked(listLibraries).mockResolvedValue([library({ id: 'lib-1', name: 'Renamed' })])
      return library({ id: 'lib-1', name: 'Renamed' })
    })
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByRole('button', { name: 'Rename' }),
    )
    // The rename form is in the list, above the new-library form.
    const [name] = screen.getAllByLabelText('Library name')
    expect(name).toHaveValue('Wyvern Components')
    await user.clear(name)
    await user.type(name, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateLibrary).toHaveBeenCalledWith('lib-1', 'Renamed', '')
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeVisible()
  })

  it('shows what deleting affects, and deletes only on confirmation', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(previewLibraryDelete).mockResolvedValue({
      campaigns: 2,
      saved: 3,
      linked_items: 4,
      deleted: false,
    })
    vi.mocked(deleteLibrary).mockImplementation(async () => {
      vi.mocked(listLibraries).mockResolvedValue([])
    })
    const { user, onNotice } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByRole('button', { name: 'Delete' }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Delete Wyvern Components?')
    expect(alert).toHaveTextContent('on in 2 campaigns')
    expect(alert).toHaveTextContent('3 saved visions will be lost')
    expect(alert).toHaveTextContent('4 inventory items will stop being linked')
    expect(alert).toHaveTextContent('can’t be undone')
    expect(deleteLibrary).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(deleteLibrary).not.toHaveBeenCalled()

    await user.click(card('Wyvern Components').getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete library' }))
    await waitFor(() => expect(deleteLibrary).toHaveBeenCalledWith('lib-1'))
    expect(onNotice).toHaveBeenCalledWith('Deleted Wyvern Components')
    expect(
      await screen.findByText('Create a library and import a crafting pack to begin.'),
    ).toBeVisible()
  })

  it('keeps the library and says so when deleting fails', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(previewLibraryDelete).mockResolvedValue({
      campaigns: 0,
      saved: 0,
      linked_items: 0,
      deleted: false,
    })
    vi.mocked(deleteLibrary).mockRejectedValue(new Error('offline'))
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByRole('button', { name: 'Delete' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Delete library' }))
    expect(await screen.findByText(/couldn’t be deleted/)).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Wyvern Components' })).toBeVisible()
  })

  it('tells the DM when the delete check itself fails', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(previewLibraryDelete).mockRejectedValue(new Error('offline'))
    const { user, onNotice } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByRole('button', { name: 'Delete' }),
    )
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith('That library couldn’t be checked. Try again.'),
    )
    expect(screen.queryByRole('button', { name: 'Delete library' })).not.toBeInTheDocument()
  })

  it('lists libraries a previous DM enabled, which can be turned off but not opened', async () => {
    vi.mocked(listLibraries).mockResolvedValue([])
    vi.mocked(listCampaignLibraries).mockResolvedValue([
      { library_id: 'someone-elses', enabled_at: '2026-11-27T10:00:00Z' },
    ])
    vi.mocked(setCampaignLibrary).mockImplementation(async () => {
      vi.mocked(listCampaignLibraries).mockResolvedValue([])
    })
    const { user } = setup()
    expect(await screen.findByRole('heading', { name: 'Enabled by a previous DM' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Browse' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(setCampaignLibrary).toHaveBeenCalledWith('camp-1', 'someone-elses', false)
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Enabled by a previous DM' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('browses a library and comes back', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Wyvern Components')).findByRole('button', { name: 'Browse' }),
    )
    expect(await screen.findByRole('button', { name: 'Items (6)' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back to libraries' }))
    expect(await screen.findByRole('button', { name: 'Import pack' })).toBeVisible()
  })

  it('opens the import dialog for the chosen library', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern, drakkenheim])
    const { user } = setup()
    await user.click(
      await (await cardWhenLoaded('Drakkenheim')).findByRole('button', { name: 'Import pack' }),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Import a pack into Drakkenheim' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('loads a library’s imports only when they are opened', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    vi.mocked(listImports).mockResolvedValue([
      {
        id: 'h1',
        pack_name: 'Wyvern Components',
        source_label: 'wyvern.json',
        items_added: 6,
        items_updated: 0,
        recipes_added: 3,
        recipes_updated: 0,
        items_removed: 0,
        recipes_removed: 0,
        imported_at: '2026-11-27T10:00:00Z',
      },
    ])
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Wyvern Components' })
    expect(listImports).not.toHaveBeenCalled()
    await user.click(card('Wyvern Components').getByText('Recent imports'))
    expect(
      await screen.findByText(/6 items added, 0 updated; 3 recipes added, 0 updated/),
    ).toBeVisible()
    expect(screen.getByText('(wyvern.json)')).toBeVisible()
    expect(listImports).toHaveBeenCalledWith('lib-1')
  })

  it('says when nothing has been imported', async () => {
    vi.mocked(listLibraries).mockResolvedValue([wyvern])
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Wyvern Components' })
    await user.click(card('Wyvern Components').getByText('Recent imports'))
    expect(await screen.findByText('Nothing has been imported yet.')).toBeVisible()
  })

  it('copies the pack prompt for a new library', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Copy pack prompt' }))
    expect(await screen.findByText('Copied')).toBeVisible()
    expect(await navigator.clipboard.readText()).toContain('the-goobers-guide-crafting-pack')
  })
})

describe('Long rest', () => {
  it('says the party has not rested yet, and reads nothing before the area is opened', async () => {
    setup(false)
    expect(getLastRest).not.toHaveBeenCalled()
    cleanup()
    setup()
    expect(await screen.findByText('The party has not rested yet.')).toBeVisible()
    expect(getLastRest).toHaveBeenCalledWith('camp-1')
  })

  it('names when the party last rested and how many characters it reached', async () => {
    vi.mocked(getLastRest).mockResolvedValue({
      called_at: '2026-11-27T21:04:00Z',
      character_count: 4,
    })
    setup()
    expect(
      await screen.findByText(/The party last rested .*, reaching 4 characters\./),
    ).toBeVisible()
  })

  it('asks before calling a rest, and cancelling calls nothing', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Call a long rest' }))
    const confirm = screen.getByRole('group', { name: 'Confirm long rest' })
    expect(confirm).toHaveTextContent('You won’t see what anyone receives')
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(callLongRest).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Call a long rest' })).toBeVisible()
  })

  it('calls the rest, tells the DM only how many characters it reached, and refreshes', async () => {
    vi.mocked(callLongRest).mockResolvedValue({
      rest_id: 'rest-1',
      called_at: '2026-11-27T21:10:00Z',
      character_count: 4,
      library_count: 1,
    })
    const { onNotice, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Call a long rest' }))
    await user.click(screen.getByRole('button', { name: 'Call the rest' }))
    await waitFor(() => expect(callLongRest).toHaveBeenCalledWith('camp-1'))
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith('The party rests. Visions come to 4 characters.'),
    )
    expect(screen.queryByRole('group', { name: 'Confirm long rest' })).not.toBeInTheDocument()
    await waitFor(() => expect(getLastRest).toHaveBeenCalledTimes(2))
  })

  it('says the party has only just rested, and keeps the question open', async () => {
    vi.mocked(callLongRest).mockRejectedValue(new Error('crafting_rest_too_soon'))
    const { onNotice, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Call a long rest' }))
    await user.click(screen.getByRole('button', { name: 'Call the rest' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The party has only just rested.')
    expect(onNotice).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Confirm long rest' })).toBeVisible()
  })

  it('says so when the last rest can’t be read', async () => {
    vi.mocked(getLastRest).mockRejectedValue(new Error('offline'))
    setup()
    expect(await screen.findByText('The last rest could not be read.')).toBeVisible()
  })
})
