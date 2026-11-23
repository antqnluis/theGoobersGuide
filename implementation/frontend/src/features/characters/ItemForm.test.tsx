import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { item } from './characterTestData'
import { ItemForm } from './ItemForm'

afterEach(cleanup)

function setup(props: Partial<React.ComponentProps<typeof ItemForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const onCancel = vi.fn()
  const onDirtyChange = vi.fn()
  render(
    <ItemForm
      isPending={false}
      mode="add"
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
      onSubmit={onSubmit}
      {...props}
    />,
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
      <ItemForm
        isPending={false}
        mode="add"
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
        onSubmit={vi.fn()}
      />,
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
