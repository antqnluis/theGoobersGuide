import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureObjectives } from './AdventureObjectives'
import { miraId, objective, roster, userId } from './adventureTestData'

afterEach(cleanup)

const cellar = objective({ id: 'o1', title: 'Search the cellar' })
const key = objective({
  id: 'o2',
  title: 'Find the key',
  done: true,
  completed_by: miraId,
  completed_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
})

function setup(props: Partial<React.ComponentProps<typeof AdventureObjectives>> = {}) {
  const ok = { ok: true as const, value: undefined }
  const handlers = {
    onAdd: vi.fn().mockResolvedValue(ok),
    onRemove: vi.fn().mockResolvedValue(ok),
    onRename: vi.fn().mockResolvedValue(ok),
    onToggle: vi.fn().mockResolvedValue(ok),
  }
  render(
    <AdventureObjectives
      editable
      objectives={[cellar, key]}
      pendingAction={null}
      pendingId={null}
      roster={roster}
      userId={userId}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('AdventureObjectives', () => {
  it('labels objectives a handoff created, and only those', () => {
    setup({
      objectives: [objective({ id: 'o3', title: 'Recover the clapper', handoff_id: 'h1' }), cellar],
      handoffLabels: new Map([['h1', 'session-4.md']]),
    })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('From handoff: session-4.md')
    expect(items[1]).not.toHaveTextContent('From handoff')
  })

  it('says only "From handoff" when the source has no label or is not known', () => {
    setup({ objectives: [objective({ id: 'o3', title: 'Recover', handoff_id: 'h9' })] })
    expect(screen.getByText('From handoff')).toBeVisible()
  })

  it('lists objectives in order with progress and who ticked one', () => {
    setup()
    expect(screen.getByRole('heading', { name: /Objectives/ })).toHaveTextContent('1 of 2 done')
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByRole('checkbox', { name: 'Search the cellar' })).not.toBeChecked()
    expect(within(items[1]).getByRole('checkbox', { name: 'Find the key' })).toBeChecked()
    expect(items[1]).toHaveTextContent('Done by Mira, 2 hours ago')
  })

  it('ticks and unticks through the write', async () => {
    const { onToggle, user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Search the cellar' }))
    expect(onToggle).toHaveBeenCalledWith('o1', true)
    await user.click(screen.getByRole('checkbox', { name: 'Find the key' }))
    expect(onToggle).toHaveBeenCalledWith('o2', false)
  })

  it('adds a trimmed objective, clears the field, and keeps focus there', async () => {
    const { onAdd, user } = setup()
    const field = screen.getByLabelText('Add an objective')
    await user.type(field, '  Open the vault ')
    await user.click(screen.getByRole('button', { name: 'Add objective' }))
    expect(onAdd).toHaveBeenCalledWith('Open the vault')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('refuses a blank or over-long objective and keeps what was typed', async () => {
    const { onAdd, user } = setup()
    const field = screen.getByLabelText('Add an objective')
    await user.click(screen.getByRole('button', { name: 'Add objective' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(field).toHaveAccessibleDescription(
      'Enter an objective of up to 200 characters on one line.',
    )
    expect(field).toHaveFocus()

    await user.type(field, 'x'.repeat(201))
    await user.click(screen.getByRole('button', { name: 'Add objective' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(field).toHaveValue('x'.repeat(201))
  })

  it('keeps the draft when the add fails', async () => {
    const { onAdd, user } = setup()
    onAdd.mockResolvedValue({ ok: false, reason: 'failed' })
    const field = screen.getByLabelText('Add an objective')
    await user.type(field, 'Open the vault')
    await user.click(screen.getByRole('button', { name: 'Add objective' }))
    expect(field).toHaveValue('Open the vault')
  })

  it('renames in place, returning focus to the rename control', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Rename Search the cellar' }))
    const field = screen.getByLabelText('Objective')
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Search the cellar')
    await user.clear(field)
    await user.type(field, 'Search the attic')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onRename).toHaveBeenCalledWith('o1', 'Search the attic')
    expect(screen.getByRole('button', { name: 'Rename Search the cellar' })).toHaveFocus()
  })

  it('cancels a rename with Escape or Cancel without writing', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Rename Search the cellar' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Objective')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rename Search the cellar' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Objective')).not.toBeInTheDocument()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('does not write an unchanged rename and refuses a blank one', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Rename Search the cellar' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onRename).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Rename Search the cellar' }))
    await user.clear(screen.getByLabelText('Objective'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Objective')).toHaveAccessibleDescription(
      'Enter an objective of up to 200 characters on one line.',
    )
  })

  it('deletes an objective and moves focus to the add field', async () => {
    const { onRemove, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete Search the cellar' }))
    expect(onRemove).toHaveBeenCalledWith('o1')
    expect(screen.getByLabelText('Add an objective')).toHaveFocus()
  })

  it('shows pending labels and disables the controls while one write runs', () => {
    setup({ pendingAction: 'objective-delete', pendingId: 'o1' })
    expect(screen.getByRole('button', { name: 'Delete Search the cellar' })).toHaveTextContent(
      'Deleting…',
    )
    expect(screen.getByRole('checkbox', { name: 'Find the key' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add objective' })).toBeDisabled()
  })

  it('is read-only when the adventure is archived', () => {
    setup({ editable: false })
    expect(screen.getByRole('checkbox', { name: 'Find the key' })).toBeDisabled()
    expect(screen.queryByLabelText('Add an objective')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Rename/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
  })

  it('shows an empty state', () => {
    setup({ objectives: [] })
    expect(screen.getByText('No objectives yet. Add the first step.')).toBeVisible()
    cleanup()
    setup({ objectives: [], editable: false })
    expect(screen.getByText('No objectives.')).toBeVisible()
  })
})
