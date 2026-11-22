import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roster, userId, miraId } from './adventureTestData'
import { AdventureSources } from './AdventureSources'
import { deleteHandoff, listHandoffs } from './handoffService'
import { handoffRecord } from './handoffTestData'

vi.mock('./handoffService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handoffService')>()),
  listHandoffs: vi.fn(),
  deleteHandoff: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

function setup(props: Partial<React.ComponentProps<typeof AdventureSources>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <AdventureSources adventureId="a1" editable roster={roster} userId={userId} {...props} />
    </QueryClientProvider>,
  )
  return { invalidate, user }
}

const mine = handoffRecord()
const theirs = handoffRecord({
  id: 'h2',
  source_label: null,
  kind: 'new',
  imported_by: miraId,
  source_text: 'Their recap',
  change_count: 0,
  applied: { fields: [], objectives_added: 0, objectives_changed: 0, update: false },
})

describe('AdventureSources', () => {
  it('shows a loading state, then the empty state', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([])
    setup()
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible()
    expect(screen.getByText('Loading sources…')).toBeVisible()
    expect(await screen.findByText('No handoffs yet.')).toBeVisible()
  })

  it('shows an error with a way to try again', async () => {
    vi.mocked(listHandoffs).mockRejectedValueOnce(new Error('boom'))
    const { user } = setup()
    expect(await screen.findByText('The sources could not be loaded.')).toBeVisible()
    vi.mocked(listHandoffs).mockResolvedValue([mine])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('session-4.md')).toBeVisible()
  })

  it('lists each source with who, when, and what it changed', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([mine, theirs])
    setup()
    const first = (await screen.findByText('session-4.md')).closest('li')!
    expect(within(first).getByText(/Attached · You/)).toBeVisible()
    expect(first).toHaveTextContent('Changed status, next step.')
    const second = screen.getByText('Pasted text').closest('li')!
    expect(second).toHaveTextContent('Started this adventure · Mira')
    expect(second).toHaveTextContent('Kept as a source only. No changes applied.')
  })

  it('starts collapsed, shows the source as plain text, and hides it again', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([mine])
    const { user } = setup()
    await screen.findByText('session-4.md')
    expect(screen.queryByRole('region', { name: /Source text/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show source' }))
    const region = screen.getByRole('region', { name: 'Source text: session-4.md' })
    // HTML-looking text stays inert text: no element is created from it.
    expect(region).toHaveTextContent('<b>The party</b> reached Saltmere.')
    expect(region.querySelector('b')).toBeNull()
    expect(region).toHaveAttribute('tabindex', '0')

    await user.click(screen.getByRole('button', { name: 'Hide source' }))
    expect(screen.queryByRole('region', { name: /Source text/ })).not.toBeInTheDocument()
  })

  it('copies the source', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([mine])
    const { user } = setup()
    await screen.findByText('session-4.md')
    await user.click(screen.getByRole('button', { name: 'Copy source session-4.md' }))
    expect(await screen.findByText('Copied')).toBeVisible()
    expect(await navigator.clipboard.readText()).toBe(mine.source_text)
  })

  it('offers Delete only to the importer, and only while the adventure is editable', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([mine, theirs])
    setup()
    await screen.findByText('session-4.md')
    expect(screen.getAllByRole('button', { name: /^Delete source/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Delete source session-4.md' })).toBeVisible()
    cleanup()

    vi.mocked(listHandoffs).mockResolvedValue([mine])
    setup({ editable: false })
    await screen.findByText('session-4.md')
    expect(screen.queryByRole('button', { name: /^Delete source/ })).not.toBeInTheDocument()
    // Reading is unaffected.
    expect(screen.getByRole('button', { name: 'Show source' })).toBeVisible()
  })

  it('asks first, keeps the source on cancel, and deletes and refreshes on yes', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([mine])
    vi.mocked(deleteHandoff).mockResolvedValue(undefined)
    const { invalidate, user } = setup()
    await screen.findByText('session-4.md')

    await user.click(screen.getByRole('button', { name: 'Delete source session-4.md' }))
    const confirm = screen.getByRole('group', { name: 'Confirm deleting session-4.md' })
    expect(confirm).toHaveTextContent('lose their “From handoff” label')
    expect(within(confirm).getByRole('button', { name: 'Keep source' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'Keep source' }))
    expect(deleteHandoff).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete source session-4.md' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(deleteHandoff).toHaveBeenCalledWith('h1'))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['campaigns', 'adventures'] }),
    )
  })

  it('shows safe copy when a delete fails', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([mine])
    vi.mocked(deleteHandoff).mockRejectedValue(new Error('handoff_unavailable'))
    const { user } = setup()
    await screen.findByText('session-4.md')
    await user.click(screen.getByRole('button', { name: 'Delete source session-4.md' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This source is no longer available.',
    )
  })
})
