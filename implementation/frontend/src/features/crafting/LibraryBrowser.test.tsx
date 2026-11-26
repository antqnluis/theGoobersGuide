import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryBrowser } from './LibraryBrowser'
import { contentFromPack, editablePack, library } from './craftingTestData'
import { getLibraryContent } from './craftingService'

vi.mock('./craftingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./craftingService')>()),
  getLibraryContent: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function setup(onBack = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <LibraryBrowser
        library={library({ description: 'Wyvern parts.' })}
        onBack={onBack}
        userId="user-1"
      />
    </QueryClientProvider>,
  )
  return { onBack, user }
}

/** The §2.6 library with the DM-only fields filled in, so there is something to hide. */
function richContent() {
  const pack = editablePack()
  pack.items[4].dm_notes = 'Keep it from the first tier.'
  pack.items[4].source = 'Chapter 3'
  pack.recipes[1].dm_notes = 'Hidden from players.'
  pack.recipes[1].notes = 'Quench it in poison.'
  pack.recipes[1].check = { skill: 'Arcana', dc: 15 }
  return contentFromPack(pack)
}

const row = (name: string) =>
  screen.getByText(name, { selector: '.crafting-row__name' }).closest('li') as HTMLElement

describe('LibraryBrowser', () => {
  it('shows a loading state, then the library', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    setup()
    expect(screen.getByText('Loading the library…')).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Items (6)' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Wyvern Components' })).toBeVisible()
    expect(screen.getByText('Wyvern parts.')).toBeVisible()
    expect(screen.getByText('6 items')).toBeVisible()
  })

  it('says so, and retries, when the library can’t be loaded', async () => {
    vi.mocked(getLibraryContent).mockRejectedValueOnce(new Error('offline'))
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('The library could not be loaded.')
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('6 items')).toBeVisible()
  })

  it('invites an import when the library is empty', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue({ items: [], recipes: [] })
    const { user } = setup()
    expect(await screen.findByText(/no items yet\. Import a pack/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Recipes (0)' }))
    expect(screen.getByText(/no recipes yet\. Import a pack/)).toBeVisible()
  })

  it('goes back to the libraries', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    const { user, onBack } = setup()
    await user.click(await screen.findByRole('button', { name: 'Back to libraries' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('lists items by name with their rarity, category, and value', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    setup()
    await screen.findByText('6 items')
    const names = screen
      .getAllByText(/./, { selector: '.crafting-row__name' })
      .map((node) => node.textContent)
    expect(names).toEqual([
      'Alchemical Base',
      'Venom Blade Oil',
      'Wyrmfang Blade',
      'Wyvern Fang',
      'Wyvern Fang Dagger',
      'Wyvern Poison Gland',
    ])
    const fang = within(row('Wyvern Fang'))
    expect(fang.getByText('Uncommon')).toBeVisible()
    expect(fang.getByText('Material · 40 gp')).toBeVisible()
  })

  it('shows an item’s own facts and the parts only the DM sees', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    const { user } = setup()
    await screen.findByText('6 items')
    await user.click(within(row('Wyvern Fang Dagger')).getByText('Wyvern Fang Dagger'))
    const dagger = within(row('Wyvern Fang Dagger'))
    expect(dagger.getByText('wyvern-fang-dagger')).toBeVisible()
    expect(dagger.getByText('1 lb')).toBeVisible()
    expect(
      dagger.getByText(
        'A +1 dagger. On a critical hit, the target takes an extra 3d6 poison damage.',
      ),
    ).toBeVisible()
    expect(dagger.getByText('Only you see this')).toBeVisible()
    expect(dagger.getByText('Chapter 3')).toBeVisible()
    expect(dagger.getByText('Keep it from the first tier.')).toBeVisible()

    await user.click(within(row('Wyvern Poison Gland')).getByText('Wyvern Poison Gland'))
    expect(
      within(row('Wyvern Poison Gland')).getByText(/from Wyvern · Medicine · DC 15/),
    ).toBeVisible()
    await user.click(within(row('Wyrmfang Blade')).getByText('Wyrmfang Blade'))
    expect(within(row('Wyrmfang Blade')).getByText('Requires attunement')).toBeVisible()
  })

  it('searches by name, id, and tag, and filters by category, rarity, and tag', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    const { user } = setup()
    await screen.findByText('6 items')

    await user.type(screen.getByLabelText('Search'), 'fang')
    expect(screen.getByText('3 of 6 items')).toBeVisible()
    await user.clear(screen.getByLabelText('Search'))
    await user.type(screen.getByLabelText('Search'), 'wyvern-fang')
    expect(screen.getByText('2 of 6 items')).toBeVisible()
    await user.clear(screen.getByLabelText('Search'))

    await user.selectOptions(screen.getByLabelText('Category'), 'weapon')
    expect(screen.getByText('2 of 6 items')).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Rarity'), 'rare')
    expect(screen.getByText('1 of 6 items')).toBeVisible()
    expect(row('Wyrmfang Blade')).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Category'), '')
    await user.selectOptions(screen.getByLabelText('Rarity'), '')
    await user.selectOptions(screen.getByLabelText('Tag'), 'wyvern')
    expect(screen.getByText('2 of 6 items')).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Rarity'), 'legendary')
    expect(screen.getByText('No items match these filters.')).toBeVisible()
  })

  it('shows a recipe’s lines, the total against the guideline, and flags a key with no source', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Recipes (3)' }))
    expect(screen.getByText('3 recipes')).toBeVisible()

    // The oil: 50 + 10 + 40 = 100 gp, exactly half the uncommon guideline (a consumable).
    await user.click(within(row('Venom Blade Oil')).getByText('Venom Blade Oil'))
    const oil = within(row('Venom Blade Oil'))
    const lines = oil.getByRole('table', { name: 'Materials for Venom Blade Oil' })
    expect(within(lines).getByText('Wyvern Poison Gland')).toBeVisible()
    expect(within(lines).getByText('(key)')).toBeVisible()
    expect(within(lines).getByRole('row', { name: /^Total\b/ })).toHaveTextContent('100 gp')
    expect(
      oil.getByText(/Guideline for a consumable of uncommon rarity: 100 gp, 5 workdays/),
    ).toBeVisible()
    expect(oil.queryByText(/No known source/)).not.toBeInTheDocument()

    // The dagger: a fang key that nothing makes and nothing harvests; 80 + 50 + 70 = 200 gp.
    await user.click(within(row('Wyvern Fang Dagger')).getByText('Wyvern Fang Dagger'))
    const dagger = within(row('Wyvern Fang Dagger'))
    expect(dagger.getByText(/No known source for Wyvern Fang:/)).toBeVisible()
    expect(
      within(dagger.getByRole('table', { name: /Materials for/ })).getByRole('row', {
        name: /^Total\b/,
      }),
    ).toHaveTextContent('200 gp')
    expect(dagger.getByText('Arcana DC 15')).toBeVisible()
    expect(dagger.getByText('Smith’s Tools'.replace('’', "'"))).toBeVisible()
    expect(dagger.getByText('Hidden from players.')).toBeVisible()

    // The blade's key is the dagger, which a recipe makes, so it has a source.
    await user.click(within(row('Wyrmfang Blade')).getByText('Wyrmfang Blade'))
    expect(within(row('Wyrmfang Blade')).queryByText(/No known source/)).not.toBeInTheDocument()
  })

  it('previews a recipe as a player sees it, without the DM’s notes', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Recipes (3)' }))
    await user.click(within(row('Wyvern Fang Dagger')).getByText('Wyvern Fang Dagger'))
    const dagger = within(row('Wyvern Fang Dagger'))
    expect(dagger.getByText('Hidden from players.')).toBeVisible()

    await user.click(dagger.getByRole('button', { name: 'Preview as a player' }))
    expect(dagger.getByRole('button', { name: 'Show everything' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(dagger.queryByText('Hidden from players.')).not.toBeInTheDocument()
    expect(dagger.queryByText(/No known source/)).not.toBeInTheDocument()
    expect(dagger.getByText('Quench it in poison.')).toBeVisible()
    expect(dagger.getByRole('row', { name: /^Total, with nothing in hand/ })).toBeVisible()

    await user.click(dagger.getByRole('button', { name: 'Show everything' }))
    expect(dagger.getByText('Hidden from players.')).toBeVisible()
  })

  it('searches recipes by output or material, and shows a long list a page at a time', async () => {
    vi.mocked(getLibraryContent).mockResolvedValue(richContent())
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Recipes (3)' }))
    await user.type(screen.getByLabelText('Search'), 'alchemical')
    expect(screen.getByText('1 of 3 recipes')).toBeVisible()
    expect(row('Venom Blade Oil')).toBeVisible()
    cleanup()

    const many = contentFromPack()
    for (let index = 0; index < 250; index += 1) {
      many.items.push({
        ...many.items[2],
        id: `bulk-${index}`,
        slug: `bulk-${index}`,
        name: `Bulk ${String(index).padStart(3, '0')}`,
      })
    }
    vi.mocked(getLibraryContent).mockResolvedValue(many)
    const second = setup()
    await screen.findByText('256 items')
    expect(document.querySelectorAll('.crafting-row')).toHaveLength(100)
    await second.user.click(screen.getByRole('button', { name: 'Show 100 more' }))
    expect(document.querySelectorAll('.crafting-row')).toHaveLength(200)
    await second.user.click(screen.getByRole('button', { name: 'Show 56 more' }))
    expect(document.querySelectorAll('.crafting-row')).toHaveLength(256)
    expect(screen.queryByRole('button', { name: /Show .* more/ })).not.toBeInTheDocument()
  })
})
