import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterInventory, type InventoryActions } from './CharacterInventory'
import { item, userId } from './characterTestData'
import type { CharacterItem } from './characterTypes'
import { listCharacterItems } from './inventoryService'

vi.mock('./inventoryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventoryService')>()),
  listCharacterItems: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const characterId = '00000000-0000-4000-8000-000000000021'

const rope = item({ id: 'rope', name: 'Rope', weight: 10 })
const sword = item({ id: 'sword', name: 'Longsword', weight: 3, equipped: true })
const potion = item({
  id: 'potion',
  name: 'Healing potion',
  quantity: 4,
  weight: 0.5,
  description: 'Restores 2d4 + 2 hit points.',
})

function actionsFor(overrides: Partial<InventoryActions> = {}): InventoryActions {
  return {
    addItem: vi.fn().mockResolvedValue(true),
    editItem: vi.fn().mockResolvedValue(true),
    changeItemFlag: vi.fn().mockResolvedValue(true),
    changeItemQuantity: vi.fn().mockResolvedValue(true),
    removeItem: vi.fn().mockResolvedValue(true),
    pendingAction: null,
    pendingCharacterId: null,
    pendingItemId: null,
    ...overrides,
  }
}

function renderInventory({
  items = [rope, sword, potion],
  owner = true,
  actions = actionsFor(),
  onNotice = vi.fn(),
  onFormDirtyChange = vi.fn(),
}: {
  items?: CharacterItem[]
  owner?: boolean
  actions?: InventoryActions
  onNotice?: (notice: string) => void
  onFormDirtyChange?: (dirty: boolean) => void
} = {}) {
  vi.mocked(listCharacterItems).mockResolvedValue(items)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CharacterInventory
        actions={owner ? actions : undefined}
        capacity={150}
        characterId={characterId}
        characterName="Brand"
        onFormDirtyChange={onFormDirtyChange}
        onNotice={onNotice}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { actions, onNotice, onFormDirtyChange, user: userEvent.setup() }
}

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement

describe('CharacterInventory states', () => {
  it('shows a loading status, then the list', async () => {
    renderInventory()
    expect(screen.getByRole('status')).toHaveTextContent('Loading inventory…')
    expect(await screen.findByText('Rope')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    vi.mocked(listCharacterItems).mockRejectedValueOnce(new Error('network'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CharacterInventory
          capacity={150}
          characterId={characterId}
          characterName="Brand"
          userId={userId}
        />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('The inventory could not be loaded.')
    vi.mocked(listCharacterItems).mockResolvedValue([rope])
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Rope')).toBeInTheDocument()
  })

  it('shows an empty state with the add button for the owner', async () => {
    renderInventory({ items: [] })
    expect(await screen.findByText('No items yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  })

  it('shows an empty state without controls for others', async () => {
    renderInventory({ items: [], owner: false })
    expect(await screen.findByText('No items yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('CharacterInventory list', () => {
  it('lists equipped items first, then by name, with badges, weight, and a description', async () => {
    renderInventory({ items: [rope, potion, { ...sword, attuned: true }] })
    await screen.findByText('Rope')
    const names = screen
      .getAllByRole('listitem')
      .filter((entry) => entry.classList.contains('inventory-item'))
      .map((entry) => entry.querySelector('.inventory-item__name')?.textContent)
    expect(names).toEqual(['Longsword', 'Healing potion', 'Rope'])
    expect(within(row('Longsword')).getByText('Equipped')).toBeInTheDocument()
    expect(within(row('Longsword')).getByText('Attuned')).toBeInTheDocument()
    expect(within(row('Healing potion')).getByText('0.5 lb each')).toBeInTheDocument()
    expect(within(row('Healing potion')).getByText('Quantity 4')).toBeInTheDocument()
    expect(within(row('Healing potion')).getByText('Description')).toBeInTheDocument()
    expect(within(row('Rope')).queryByText('Description')).not.toBeInTheDocument()
  })

  it('summarizes the count, carried weight against capacity, and attunement', async () => {
    renderInventory({ items: [rope, potion] })
    // 10 + 4 × 0.5 = 12 lb
    expect(await screen.findByText('Carrying 12 lb of 150 lb')).toBeInTheDocument()
    expect(screen.getByText('2 items')).toBeInTheDocument()
    expect(screen.getByText('Attuned 0 of 3')).toBeInTheDocument()
  })

  it('flags weight over the capacity', async () => {
    renderInventory({ items: [item({ id: 'a', name: 'Anvil', weight: 200 })] })
    expect(await screen.findByText('Carrying 200 lb of 150 lb (over capacity)')).toBeInTheDocument()
  })

  it('warns, without blocking, above three attuned items', async () => {
    const attuned = ['a', 'b', 'c', 'd'].map((id) =>
      item({ id, name: `Ring ${id}`, attuned: true }),
    )
    renderInventory({ items: attuned })
    expect(await screen.findByText('More than 3 attuned items')).toBeInTheDocument()
    expect(screen.getByText('Attuned 4 of 3')).toBeInTheDocument()
  })

  it('shows no warning at three', async () => {
    const attuned = ['a', 'b', 'c'].map((id) => item({ id, name: `Ring ${id}`, attuned: true }))
    renderInventory({ items: attuned })
    await screen.findByText('Ring a')
    expect(screen.queryByText('More than 3 attuned items')).not.toBeInTheDocument()
  })

  it('is read-only for others', async () => {
    renderInventory({ owner: false })
    await screen.findByText('Rope')
    // Nothing to edit: the only buttons are roll chips for dice written in descriptions.
    const controls = screen
      .queryAllByRole('button')
      .filter((button) => !button.classList.contains('roll-button'))
    expect(controls).toHaveLength(0)
    expect(screen.getByText('Longsword')).toBeInTheDocument()
  })

  it('names a rarity above common with a coloured chip, and says nothing for common', async () => {
    renderInventory({
      items: [
        rope,
        item({ id: 'ring', name: 'Ring of Warmth', rarity: 'rare' }),
        item({ id: 'blade', name: 'Vorpal sword', rarity: 'very_rare' }),
      ],
    })
    await screen.findByText('Rope')
    const rowFor = (name: string) => screen.getByText(name).closest<HTMLElement>('.inventory-item')!
    const [plain, ring, blade] = ['Rope', 'Ring of Warmth', 'Vorpal sword'].map(rowFor)
    expect(plain).not.toHaveAttribute('data-rarity')
    expect(within(plain).queryByText(/common|rare|legendary|artifact/i)).toBeNull()
    expect(ring).toHaveAttribute('data-rarity', 'rare')
    expect(within(ring).getByText('Rare')).toHaveClass('journal-chip--rarity')
    expect(blade).toHaveAttribute('data-rarity', 'very_rare')
    expect(within(blade).getByText('Very rare')).toBeInTheDocument()
  })

  it('shows another player’s item rarity as well', async () => {
    renderInventory({ owner: false, items: [item({ name: 'Crown', rarity: 'artifact' })] })
    expect(await screen.findByText('Artifact')).toBeInTheDocument()
  })

  it('turns dice in your own descriptions into roll chips, leaving the words as written', async () => {
    renderInventory()
    await screen.findByText('Rope')
    const chip = screen.getByRole('button', { name: 'Roll 2d4 + 2 for Healing potion' })
    expect(chip).toHaveTextContent('2d4 + 2')
    expect(chip.closest('p')).toHaveTextContent(/Restores 2d4 \+ 2 hit points\./)
  })

  it('leaves dice as plain words in another player’s inventory', async () => {
    renderInventory({ owner: false })
    await screen.findByText('Rope')
    expect(screen.queryByRole('button', { name: /^Roll / })).toBeNull()
    expect(screen.getByText(/Restores 2d4 \+ 2 hit points\./)).toBeInTheDocument()
  })
})

describe('CharacterInventory owner controls', () => {
  it('uses and adds one with large, named buttons', async () => {
    const { actions, user } = renderInventory()
    await screen.findByText('Healing potion')
    await user.click(screen.getByRole('button', { name: 'Use one Healing potion' }))
    expect(actions.changeItemQuantity).toHaveBeenLastCalledWith(characterId, 'potion', -1)
    await user.click(screen.getByRole('button', { name: 'Add one Healing potion' }))
    expect(actions.changeItemQuantity).toHaveBeenLastCalledWith(characterId, 'potion', 1)
  })

  it('cannot use an item that is already used up or add past the maximum', async () => {
    renderInventory({
      items: [
        item({ id: 'empty', name: 'Arrows', quantity: 0 }),
        item({ id: 'full', name: 'Gold ore', quantity: 9999 }),
      ],
    })
    await screen.findByText('Arrows')
    expect(screen.getByRole('button', { name: 'Use one Arrows' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add one Arrows' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add one Gold ore' })).toBeDisabled()
  })

  it('equips, unequips, attunes, and ends attunement', async () => {
    const { actions, user } = renderInventory()
    await screen.findByText('Rope')
    await user.click(screen.getByRole('button', { name: 'Equip Rope' }))
    expect(actions.changeItemFlag).toHaveBeenLastCalledWith(characterId, 'rope', 'equipped', true)
    await user.click(screen.getByRole('button', { name: 'Unequip Longsword' }))
    expect(actions.changeItemFlag).toHaveBeenLastCalledWith(characterId, 'sword', 'equipped', false)
    await user.click(screen.getByRole('button', { name: 'Attune Rope' }))
    expect(actions.changeItemFlag).toHaveBeenLastCalledWith(characterId, 'rope', 'attuned', true)
    expect(screen.getByRole('button', { name: 'Unequip Longsword' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('ends attunement for an attuned item', async () => {
    const { actions, user } = renderInventory({ items: [{ ...rope, attuned: true }] })
    await user.click(await screen.findByRole('button', { name: 'End attunement to Rope' }))
    expect(actions.changeItemFlag).toHaveBeenCalledWith(characterId, 'rope', 'attuned', false)
  })

  it('locks one item’s controls, but not its quantity buttons, while it saves', async () => {
    renderInventory({
      actions: actionsFor({
        pendingAction: 'item-flag',
        pendingCharacterId: characterId,
        pendingItemId: 'rope',
      }),
    })
    await screen.findByText('Rope')
    expect(screen.getByRole('button', { name: 'Equip Rope' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Rope' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Rope' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add one Rope' })).toBeDisabled()
    // Other items stay usable.
    expect(screen.getByRole('button', { name: 'Equip Healing potion' })).toBeEnabled()
  })

  it('keeps quantity taps enabled while a quantity change is saving', async () => {
    renderInventory({
      actions: actionsFor({
        pendingAction: 'item-quantity',
        pendingCharacterId: characterId,
        pendingItemId: 'potion',
      }),
    })
    await screen.findByText('Healing potion')
    expect(screen.getByRole('button', { name: 'Use one Healing potion' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Healing potion' })).toBeDisabled()
  })
})

describe('CharacterInventory add and edit', () => {
  it('adds an item, closes the form, announces it, and returns focus', async () => {
    const { actions, onNotice, user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Add item' }))
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.type(screen.getByLabelText('Name'), 'Lantern')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(actions.addItem).toHaveBeenCalledWith(
      characterId,
      expect.objectContaining({ name: 'Lantern', quantity: 1 }),
    )
    expect(onNotice).toHaveBeenCalledWith('Added Lantern.')
    expect(screen.queryByRole('form', { name: 'Add an item' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  })

  it('keeps the form open when the add fails', async () => {
    const { onNotice, user } = renderInventory({
      actions: actionsFor({ addItem: vi.fn().mockResolvedValue(false) }),
    })
    await user.click(await screen.findByRole('button', { name: 'Add item' }))
    await user.type(screen.getByLabelText('Name'), 'Lantern')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByRole('form', { name: 'Add an item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Lantern')
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('cancels the add form and returns focus to the button', async () => {
    const { user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Add item' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  })

  it('reports typed input as unsaved', async () => {
    const { onFormDirtyChange, user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Add item' }))
    await user.type(screen.getByLabelText('Name'), 'L')
    expect(onFormDirtyChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onFormDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('edits an item against the item as shown', async () => {
    const { actions, onNotice, user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Edit Rope' }))
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('Rope')
    await user.clear(name)
    await user.type(name, 'Silk rope')
    await user.click(screen.getByRole('button', { name: 'Save item' }))
    expect(actions.editItem).toHaveBeenCalledWith(
      characterId,
      expect.objectContaining({ id: 'rope', updated_at: rope.updated_at }),
      expect.objectContaining({ name: 'Silk rope', weight: 10 }),
    )
    expect(onNotice).toHaveBeenCalledWith('Saved Silk rope.')
    expect(screen.queryByRole('form', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('locks the item’s buttons while its edit saves', async () => {
    renderInventory({
      actions: actionsFor({
        pendingAction: 'item-edit',
        pendingCharacterId: characterId,
        pendingItemId: 'rope',
      }),
    })
    expect(await screen.findByRole('button', { name: 'Edit Rope' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Healing potion' })).toBeEnabled()
  })

  it('opening one form closes another', async () => {
    const { user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Edit Rope' }))
    await user.click(screen.getByRole('button', { name: 'Edit Healing potion' }))
    expect(screen.queryByRole('form', { name: 'Edit Rope' })).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Edit Healing potion' })).toBeInTheDocument()
  })
})

describe('CharacterInventory removal', () => {
  it('asks first, names the item and character, and focuses the confirm button', async () => {
    const { actions, user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Remove Rope' }))
    const confirm = screen.getByRole('group', { name: 'Confirm removing Rope' })
    expect(confirm).toHaveTextContent('Remove Rope from Brand’s inventory?')
    expect(await screen.findByRole('button', { name: 'Yes, remove item' })).toHaveFocus()
    expect(actions.removeItem).not.toHaveBeenCalled()
  })

  it('removes the item, announces it, and moves focus to Add item', async () => {
    const { actions, onNotice, user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Remove Rope' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove item' }))
    expect(actions.removeItem).toHaveBeenCalledWith(characterId, 'rope')
    expect(onNotice).toHaveBeenCalledWith('Removed Rope.')
    expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  })

  it('keeps the item when the confirmation is declined and returns focus', async () => {
    const { actions, user } = renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Remove Rope' }))
    await user.click(screen.getByRole('button', { name: 'Keep item' }))
    expect(actions.removeItem).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Confirm removing Rope' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remove Rope' })).toBeInTheDocument()
  })

  it('locks the item’s buttons while its delete is pending', async () => {
    renderInventory({
      actions: actionsFor({
        pendingAction: 'item-delete',
        pendingCharacterId: characterId,
        pendingItemId: 'rope',
      }),
    })
    await screen.findByText('Rope')
    expect(screen.getByRole('button', { name: 'Remove Rope' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Healing potion' })).toBeEnabled()
  })
})

describe('CharacterInventory catalogue links', () => {
  const fang = item({ id: 'fang', name: 'Wyvern Fang', crafting_item_id: 'crafting-fang' })

  it('marks a linked item for its owner, and tells a reader of a shared sheet nothing', async () => {
    renderInventory({ items: [rope, fang] })
    expect(await screen.findByText('Wyvern Fang')).toBeInTheDocument()
    expect(within(row('Wyvern Fang')).getByText('Catalogue')).toBeVisible()
    expect(within(row('Rope')).queryByText('Catalogue')).not.toBeInTheDocument()
    cleanup()

    renderInventory({ items: [rope, fang], owner: false })
    expect(await screen.findByText('Wyvern Fang')).toBeInTheDocument()
    expect(screen.queryByText('Catalogue')).not.toBeInTheDocument()
  })

  it('opens the edit form as linked, and unlinking is saved with the item', async () => {
    const { actions, user } = renderInventory({ items: [fang] })
    await user.click(await screen.findByRole('button', { name: /Edit Wyvern Fang/ }))
    expect(screen.getByText('Linked to the catalogue')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Unlink' }))
    await user.click(screen.getByRole('button', { name: 'Save item' }))
    expect(actions.editItem).toHaveBeenCalledWith(
      characterId,
      fang,
      expect.objectContaining({ crafting_item_id: null }),
    )
  })

  it('gives the add form the character, so it can suggest from the catalogue', async () => {
    const { user } = renderInventory({ items: [] })
    await user.click(await screen.findByRole('button', { name: /Add item/ }))
    expect(screen.getByLabelText('Name')).toHaveAttribute('role', 'combobox')
  })
})
