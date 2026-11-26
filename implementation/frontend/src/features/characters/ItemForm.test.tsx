import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchCraftingItems } from '../crafting/craftingService'
import type { ItemSuggestion } from '../crafting/craftingTypes'
import { item } from './characterTestData'
import { ItemForm } from './ItemForm'

vi.mock('../crafting/craftingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../crafting/craftingService')>()),
  searchCraftingItems: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(searchCraftingItems).mockReset()
  vi.mocked(searchCraftingItems).mockResolvedValue([])
})

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function setup(props: Partial<React.ComponentProps<typeof ItemForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const onCancel = vi.fn()
  const onDirtyChange = vi.fn()
  render(
    <Providers>
      <ItemForm
        isPending={false}
        mode="add"
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
        onSubmit={onSubmit}
        {...props}
      />
    </Providers>,
  )
  return { onSubmit, onCancel, onDirtyChange, user: userEvent.setup() }
}

describe('ItemForm', () => {
  it('opens with the name focused and a quantity of one', () => {
    setup()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(screen.getByLabelText('Quantity')).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled()
  })

  it('submits normalized values', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), '  Rope  ')
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.type(screen.getByLabelText(/Weight/), '1.5')
    await user.type(screen.getByLabelText(/Description/), ' Hempen ')
    await user.click(screen.getByLabelText('Equipped'))
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Rope',
      quantity: 3,
      weight: 1.5,
      description: 'Hempen',
      rarity: 'common',
      equipped: true,
      attuned: false,
    })
  })

  it('saves the rarity chosen, listing every step by name', async () => {
    const { onSubmit, user } = setup()
    const select = screen.getByLabelText('Rarity')
    expect(select).toHaveValue('common')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Common',
      'Uncommon',
      'Rare',
      'Very rare',
      'Legendary',
      'Artifact',
    ])
    await user.type(screen.getByLabelText('Name'), 'Vorpal sword')
    await user.selectOptions(select, 'very_rare')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rarity: 'very_rare' }))
  })

  it('starts on the item’s rarity when editing, and counts a change as unsaved', async () => {
    const { onDirtyChange, user } = setup({
      initial: item({ rarity: 'legendary' }),
      mode: 'edit',
    })
    expect(screen.getByLabelText('Rarity')).toHaveValue('legendary')
    await user.selectOptions(screen.getByLabelText('Rarity'), 'rare')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('stores an empty weight and description as null', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Torch')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Torch', weight: null, description: null }),
    )
  })

  it('shows every problem, focuses the first field, and does not submit', async () => {
    const { onSubmit, user } = setup()
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '10000')
    await user.type(screen.getByLabelText(/Weight/), 'heavy')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(screen.getByLabelText('Name')).toBeInvalid()
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(
      'Enter a name of up to 80 characters.',
    )
    expect(screen.getByLabelText('Quantity')).toHaveAccessibleDescription(
      'Quantity must be a whole number from 0 to 9,999.',
    )
    expect(screen.getByLabelText(/Weight/)).toBeInvalid()
  })

  it('clears a field’s error when it is edited', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByLabelText('Name')).toBeInvalid()
    await user.type(screen.getByLabelText('Name'), 'R')
    expect(screen.getByLabelText('Name')).toBeValid()
  })

  it('starts from the item when editing', () => {
    setup({
      initial: item({
        name: 'Silver dagger',
        quantity: 2,
        weight: 1,
        description: 'Gleams',
        equipped: true,
        attuned: true,
      }),
      mode: 'edit',
    })
    expect(screen.getByRole('form', { name: 'Edit Silver dagger' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Silver dagger')
    expect(screen.getByLabelText('Quantity')).toHaveValue('2')
    expect(screen.getByLabelText(/Weight/)).toHaveValue('1')
    expect(screen.getByLabelText(/Description/)).toHaveValue('Gleams')
    expect(screen.getByLabelText('Equipped')).toBeChecked()
    expect(screen.getByLabelText('Attuned')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save item' })).toBeInTheDocument()
  })

  it('reports unsaved input and reports clean again when it is undone', async () => {
    const { onDirtyChange, user } = setup()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.type(screen.getByLabelText('Name'), 'A')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.clear(screen.getByLabelText('Name'))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('reports clean when it closes', () => {
    const onDirtyChange = vi.fn()
    const { unmount } = render(
      <Providers>
        <ItemForm
          isPending={false}
          mode="add"
          onCancel={vi.fn()}
          onDirtyChange={onDirtyChange}
          onSubmit={vi.fn()}
        />
      </Providers>,
    )
    unmount()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('cancels', async () => {
    const { onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('locks the form and shows a saving label while pending', () => {
    setup({ isPending: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

/** The suggestion rows only; the rarity list has options too. */
const suggestionOptions = () => within(screen.getByRole('listbox')).getAllByRole('option')

const fang: ItemSuggestion = {
  id: 'crafting-fang',
  name: 'Wyvern Fang',
  category: 'material',
  rarity: 'uncommon',
  value_cp: 4000,
  weight: 0.5,
  description: 'A curved, yellowed fang.',
}
const gland: ItemSuggestion = {
  id: 'crafting-gland',
  name: 'Wyvern Poison Gland',
  category: 'material',
  rarity: 'uncommon',
  value_cp: 5000,
  weight: null,
  description: null,
}

describe('ItemForm catalogue suggestions', () => {
  const withCharacter = { characterId: 'char-1' }

  it('is a plain name field, and asks nothing, without a character', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('role', 'combobox')
    await user.type(screen.getByLabelText('Name'), 'Wyvern')
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(searchCraftingItems).not.toHaveBeenCalled()
  })

  it('waits for two characters and a pause before searching', async () => {
    const { user } = setup(withCharacter)
    expect(screen.getByLabelText('Name')).toHaveAttribute('role', 'combobox')
    await user.type(screen.getByLabelText('Name'), 'W')
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(searchCraftingItems).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Name'), 'yv')
    await waitFor(() => expect(searchCraftingItems).toHaveBeenCalledTimes(1))
    expect(searchCraftingItems).toHaveBeenCalledWith('char-1', 'Wyv')
  })

  it('lists suggestions with their rarity and value, and nothing for no matches', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([fang, gland])
    const { user } = setup(withCharacter)
    await user.type(screen.getByLabelText('Name'), 'wyv')
    const list = await screen.findByRole('listbox', { name: 'Catalogue suggestions' })
    const options = within(list).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Wyvern FangUncommon · 40 gp',
      'Wyvern Poison GlandUncommon · 50 gp',
    ])
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-controls', list.id)

    vi.mocked(searchCraftingItems).mockResolvedValue([])
    await user.type(screen.getByLabelText('Name'), 'zz')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-expanded', 'false')
  })

  it('fills the name, rarity, weight, and description, links, and saves the link', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([fang])
    const { onSubmit, user } = setup(withCharacter)
    await user.type(screen.getByLabelText('Name'), 'wyv')
    await user.click(await screen.findByRole('option', { name: /Wyvern Fang/ }))

    expect(screen.getByLabelText('Name')).toHaveValue('Wyvern Fang')
    expect(screen.getByLabelText('Rarity')).toHaveValue('uncommon')
    expect(screen.getByLabelText(/Weight/)).toHaveValue('0.5')
    expect(screen.getByLabelText(/Description/)).toHaveValue('A curved, yellowed fang.')
    expect(screen.getByText('Linked to the catalogue')).toBeVisible()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Wyvern Fang',
      quantity: 1,
      weight: 0.5,
      description: 'A curved, yellowed fang.',
      rarity: 'uncommon',
      equipped: false,
      attuned: false,
      crafting_item_id: 'crafting-fang',
    })
  })

  it('keeps what the player typed for weight and description when the catalogue has none', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([gland])
    const { user } = setup(withCharacter)
    await user.type(screen.getByLabelText(/Weight/), '2')
    await user.type(screen.getByLabelText(/Description/), 'Mine')
    await user.type(screen.getByLabelText('Name'), 'wyv')
    await user.click(await screen.findByRole('option', { name: /Poison Gland/ }))
    expect(screen.getByLabelText(/Weight/)).toHaveValue('2')
    expect(screen.getByLabelText(/Description/)).toHaveValue('Mine')
    expect(screen.getByLabelText('Rarity')).toHaveValue('uncommon')
  })

  it('picks with the keyboard, and Escape closes the list without closing anything behind it', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([fang, gland])
    const outside = vi.fn()
    const { user } = setup(withCharacter)
    document.body.addEventListener('keydown', outside)
    await user.type(screen.getByLabelText('Name'), 'wyv')
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'aria-activedescendant',
      suggestionOptions()[1].id,
    )
    await user.keyboard('{ArrowUp}')
    expect(suggestionOptions()[0]).toHaveAttribute('aria-selected', 'true')

    outside.mockClear()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(outside).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('wyv')

    await user.type(screen.getByLabelText('Name'), 'e')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByLabelText('Name')).toHaveValue('Wyvern Fang')
    expect(screen.getByText('Linked to the catalogue')).toBeVisible()
    document.body.removeEventListener('keydown', outside)
  })

  it('does not submit the form when Enter picks a suggestion', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([fang])
    const { onSubmit, user } = setup(withCharacter)
    await user.type(screen.getByLabelText('Name'), 'wyv')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('unlinks, and saves the item unlinked', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([fang])
    const { onSubmit, user } = setup(withCharacter)
    await user.type(screen.getByLabelText('Name'), 'wyv')
    await user.click(within(await screen.findByRole('listbox')).getByRole('option'))
    await user.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(screen.queryByText('Linked to the catalogue')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ crafting_item_id: null }))
  })

  it('shows a linked item as linked, keeps the link through a rename, and stops suggesting', async () => {
    const { onSubmit, user } = setup({
      ...withCharacter,
      mode: 'edit',
      initial: item({ name: 'Fang', crafting_item_id: 'crafting-fang' }),
    })
    expect(screen.getByText('Linked to the catalogue')).toBeVisible()
    await user.type(screen.getByLabelText('Name'), ' of doom')
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(searchCraftingItems).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save item' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fang of doom', crafting_item_id: 'crafting-fang' }),
    )
  })

  it('counts a link change as an unsaved change', async () => {
    vi.mocked(searchCraftingItems).mockResolvedValue([fang])
    const { onDirtyChange, user } = setup({
      ...withCharacter,
      mode: 'edit',
      initial: item({ name: 'Wyvern Fang', crafting_item_id: 'crafting-fang' }),
    })
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('leaves an item’s link alone when the form has no character to search for', async () => {
    const { onSubmit, user } = setup({
      mode: 'edit',
      initial: item({ name: 'Fang', crafting_item_id: 'crafting-fang' }),
    })
    expect(screen.queryByText('Linked to the catalogue')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save item' }))
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('crafting_item_id')
  })

  it('says it is searching, and keeps working when the search fails', async () => {
    let fail: (reason: unknown) => void = () => {}
    vi.mocked(searchCraftingItems).mockReturnValue(
      new Promise((_, reject) => {
        fail = reject
      }),
    )
    const { onSubmit, user } = setup(withCharacter)
    await user.type(screen.getByLabelText('Name'), 'wyv')
    expect(await screen.findByText('Searching the catalogue…')).toBeVisible()
    fail(new Error('offline'))
    await waitFor(() =>
      expect(screen.queryByText('Searching the catalogue…')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'wyv' }))
  })
})
