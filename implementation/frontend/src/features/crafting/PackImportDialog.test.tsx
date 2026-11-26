import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PackImportDialog } from './PackImportDialog'
import { describeImport } from './craftingText'
import { contentFromPack, editablePack, library, wyvernPack, wyvernText } from './craftingTestData'
import { getLibraryContent, importPack } from './craftingService'
import { useCraftingActions } from './useCraftingActions'

vi.mock('./craftingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./craftingService')>()),
  getLibraryContent: vi.fn(),
  importPack: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getLibraryContent).mockResolvedValue({ items: [], recipes: [] })
})

const result = {
  import_id: 'h1',
  items_added: 6,
  items_updated: 0,
  recipes_added: 3,
  recipes_updated: 0,
  items_removed: 0,
  recipes_removed: 0,
}

function Harness(props: { onClose: () => void; onImported: (r: typeof result) => void }) {
  const actions = useCraftingActions('user-1')
  return (
    <PackImportDialog
      actions={actions}
      library={library()}
      onClose={props.onClose}
      onImported={props.onImported}
      userId="user-1"
    />
  )
}

function setup() {
  const onClose = vi.fn()
  const onImported = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <Harness onClose={onClose} onImported={onImported} />
    </QueryClientProvider>,
  )
  return { onClose, onImported, user }
}

const field = () => screen.getByLabelText('2. The pack (JSON)')
const importButton = () => screen.getByRole('button', { name: /^Import pack|Importing…/ })

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(field())
  await user.paste(text)
}

describe('PackImportDialog', () => {
  it('opens on the library with nothing to import yet', async () => {
    setup()
    expect(
      screen.getByRole('dialog', { name: 'Import a pack into Wyvern Components' }),
    ).toBeInTheDocument()
    expect(importButton()).toBeDisabled()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalledWith('lib-1'))
    expect(screen.queryByRole('status', { name: /ready/i })).not.toBeInTheDocument()
  })

  it('reads the pack against the library, shows the counts, and imports it', async () => {
    vi.mocked(importPack).mockResolvedValue(result)
    const { user, onImported } = setup()
    await waitFor(() => expect(screen.queryByText(/Reading the library/)).not.toBeInTheDocument())
    await paste(user, wyvernText())
    expect(await screen.findByText(/Ready to import: Wyvern Components/)).toBeVisible()
    expect(screen.getByText('6 new, 0 updated')).toBeVisible()
    expect(screen.getByText('3 new, 0 updated')).toBeVisible()
    expect(importButton()).toBeEnabled()

    await user.type(screen.getByLabelText(/Source label/), 'wyvern.json')
    await user.click(importButton())
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(result))
    expect(importPack).toHaveBeenCalledWith('lib-1', wyvernPack, 'wyvern.json')
  })

  it('counts updates against what the library already holds', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(contentFromPack())
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await paste(user, wyvernText())
    expect(await screen.findByText('0 new, 6 updated')).toBeVisible()
    expect(screen.getByText('0 new, 3 updated')).toBeVisible()
  })

  it('shows each problem with its path and keeps Import disabled', async () => {
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    const pack = editablePack()
    pack.items[0].value_gp = -5
    pack.recipes[0].materials = [{ item: 'ghost', quantity: 1 }]
    await paste(user, JSON.stringify(pack))
    expect(await screen.findByText(/\d+ problems to fix/)).toBeVisible()
    expect(screen.getByText('items[0].value_gp')).toBeVisible()
    expect(screen.getByText('recipes[0].materials[0].item')).toBeVisible()
    expect(screen.getByText(/No item “ghost”/)).toBeVisible()
    expect(importButton()).toBeDisabled()
    expect(screen.queryByText(/Ready to import/)).not.toBeInTheDocument()
  })

  it('refuses text that is not a pack, and other Goober’s Guide documents', async () => {
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await paste(user, 'not json')
    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t valid JSON')
    await user.clear(field())
    await paste(user, JSON.stringify({ format: 'the-goobers-guide-adventure-handoff', version: 1 }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This is an adventure handoff')
    expect(importButton()).toBeDisabled()
  })

  it('lists keys the format does not have under Not imported', async () => {
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await paste(user, JSON.stringify({ ...wyvernPack, extra: true }))
    expect(await screen.findByText('Not imported (1)')).toBeVisible()
    expect(importButton()).toBeEnabled()
  })

  it('keeps the pack and says nothing changed when the import fails', async () => {
    vi.mocked(importPack).mockRejectedValue({ message: 'crafting_name_taken' })
    const { user, onImported } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await paste(user, wyvernText())
    await user.click(await screen.findByRole('button', { name: 'Import pack' }))
    expect(await screen.findByText(/Two items would share a name/)).toBeVisible()
    expect(onImported).not.toHaveBeenCalled()
    expect(field()).toHaveValue(wyvernText())
    expect(importButton()).toBeEnabled()
  })

  it('explains an unknown failure without leaking it', async () => {
    vi.mocked(importPack).mockRejectedValue({ message: 'permission denied for table x' })
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await paste(user, wyvernText())
    await user.click(await screen.findByRole('button', { name: 'Import pack' }))
    expect(await screen.findByText(/Nothing was changed/)).toBeVisible()
    expect(screen.queryByText(/permission denied/)).not.toBeInTheDocument()
  })

  it('cannot check a pack when the library can’t be read, and retries', async () => {
    vi.mocked(getLibraryContent).mockRejectedValueOnce(new Error('offline'))
    const { user } = setup()
    expect(await screen.findByText(/library couldn’t be read/)).toBeVisible()
    await paste(user, wyvernText())
    expect(importButton()).toBeDisabled()
    vi.mocked(getLibraryContent).mockResolvedValue({ items: [], recipes: [] })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Ready to import/)).toBeVisible()
  })

  it('shows a loading state while it reads the library', () => {
    vi.mocked(getLibraryContent).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByText(/Reading the library/)).toBeVisible()
  })

  it('copies a prompt that lists the items already in the library', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(contentFromPack())
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await user.click(await screen.findByText('1. Copy the pack prompt'))
    await waitFor(() => expect(screen.getByText(/lists the items already/)).toBeVisible())
    await user.click(screen.getByRole('button', { name: 'Copy pack prompt' }))
    expect(await screen.findByText('Copied')).toBeVisible()
    const copied = await navigator.clipboard.readText()
    expect(copied).toContain('alchemical-base, venom-blade-oil')
    expect(copied).toContain('PASTE THE SOURCE MATERIAL')
  })

  it('asks before discarding a pasted pack, and leaves at once when empty', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    cleanup()
    const second = setup()
    await paste(second.user, 'something')
    await second.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('alertdialog', { name: 'Discard this pack?' })).toBeVisible()
    expect(second.onClose).not.toHaveBeenCalled()
    await second.user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(field()).toHaveValue('something')
  })

  it('checks the source label', async () => {
    const { user } = setup()
    await waitFor(() => expect(getLibraryContent).toHaveBeenCalled())
    await paste(user, wyvernText())
    await user.type(screen.getByLabelText(/Source label/), 'x'.repeat(121))
    expect(await screen.findByText(/up to 120 characters/)).toBeVisible()
    expect(importButton()).toBeDisabled()
  })
})

describe('describeImport', () => {
  it('names what was imported', () => {
    expect(describeImport(result, 'Wyvern Components')).toBe(
      'Imported 6 items and 3 recipes into Wyvern Components',
    )
    expect(
      describeImport(
        {
          ...result,
          items_added: 0,
          items_updated: 1,
          recipes_added: 0,
          items_removed: 2,
          recipes_removed: 1,
        },
        'L',
      ),
    ).toBe('Imported 1 item and 3 removals into L')
    expect(
      describeImport({ ...result, items_added: 1, recipes_added: 0, items_updated: 0 }, 'L'),
    ).toBe('Imported 1 item into L')
  })
})
