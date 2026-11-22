import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterImportHistory } from './CharacterImportHistory'
import { listCharacterImports } from './characterImportService'
import { userId } from './characterTestData'

vi.mock('./characterImportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterImportService')>()),
  listCharacterImports: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <CharacterImportHistory characterId="char-1" userId={userId} />
    </QueryClientProvider>,
  )
  return { user }
}

describe('CharacterImportHistory', () => {
  it('stays closed and fetches nothing until opened', () => {
    setup()
    expect(screen.getByText('Import history').closest('details')).not.toHaveAttribute('open')
    expect(listCharacterImports).not.toHaveBeenCalled()
  })

  it('lists imports newest first with kind, source, and change count', async () => {
    vi.mocked(listCharacterImports).mockResolvedValue([
      {
        id: '2',
        kind: 'update',
        source_label: 'handoff-2.md',
        change_count: 1,
        imported_at: '2026-11-15T10:00:00+00:00',
      },
      {
        id: '1',
        kind: 'new',
        source_label: null,
        change_count: 5,
        imported_at: '2026-11-14T10:00:00+00:00',
      },
    ])
    const { user } = setup()
    await user.click(screen.getByText('Import history'))
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Updated from import')
    expect(items[0]).toHaveTextContent('handoff-2.md')
    expect(items[0]).toHaveTextContent('1 change')
    expect(items[0]).not.toHaveTextContent('1 changes')
    expect(items[1]).toHaveTextContent('Imported as new')
    expect(items[1]).toHaveTextContent('Pasted text')
    expect(items[1]).toHaveTextContent('5 changes')
    expect(listCharacterImports).toHaveBeenCalledWith('char-1')
  })

  it('says so when there is nothing to show', async () => {
    vi.mocked(listCharacterImports).mockResolvedValue([])
    const { user } = setup()
    await user.click(screen.getByText('Import history'))
    expect(await screen.findByText('Never imported.')).toBeInTheDocument()
  })

  it('shows an error and retries', async () => {
    vi.mocked(listCharacterImports).mockRejectedValueOnce(new Error('network'))
    const { user } = setup()
    await user.click(screen.getByText('Import history'))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    vi.mocked(listCharacterImports).mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Never imported.')).toBeInTheDocument()
  })
})
