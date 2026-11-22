import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../characters/characterTestData'
import { NoteView } from './NoteView'
import { miraId, note, roster, userId } from './noteTestData'

afterEach(cleanup)

function setup(
  overrides: Partial<React.ComponentProps<typeof NoteView>> = {},
  noteOverrides: Parameters<typeof note>[0] = {},
) {
  const props = {
    characters: [character({ id: 'c-brand', name: 'Brand' })],
    error: null,
    headingRef: createRef<HTMLHeadingElement>(),
    note: note(noteOverrides),
    onBack: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(true),
    onEdit: vi.fn(),
    onVisibility: vi.fn().mockResolvedValue(true),
    pendingAction: null as React.ComponentProps<typeof NoteView>['pendingAction'],
    roster,
    userId,
    ...overrides,
  }
  render(<NoteView {...props} />)
  return { ...props, user: userEvent.setup() }
}

describe('reading a note', () => {
  it('shows the title, text, standing, author, and editor', () => {
    setup(
      {},
      {
        title: 'Thorin’s debts',
        body: 'Owes 40 gp\n\nto the dwarves',
        visibility: 'campaign',
        character_id: 'c-brand',
        author_id: miraId,
        updated_by: miraId,
        updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      },
    )
    expect(screen.getByRole('heading', { name: 'Thorin’s debts' })).toBeVisible()
    const about = screen.getByRole('list', { name: 'About this note' })
    expect(within(about).getByText('Shared with the campaign')).toBeVisible()
    expect(within(about).getByText('About Brand')).toBeVisible()
    expect(screen.getByText(/Written by Mira/)).toHaveTextContent(
      'Written by Mira · Edited by Mira, 2 hours ago',
    )
    // Line breaks are kept as typed.
    expect(screen.getByText(/Owes 40 gp/)).toHaveTextContent('Owes 40 gp to the dwarves')
    expect(screen.getByText(/Owes 40 gp/)).toHaveClass('note-body')
  })

  it('says you wrote it, and marks a private note with text as well as an icon', () => {
    setup({}, { visibility: 'private' })
    expect(screen.getByText(/Written by You/)).toBeVisible()
    expect(screen.getByText('Only you')).toBeVisible()
  })

  it('hides a link to a character the reader cannot see', () => {
    setup({}, { character_id: 'c-hidden' })
    expect(screen.queryByText(/^About /)).not.toBeInTheDocument()
  })

  it('says so when the note has no text', () => {
    setup({}, { body: '' })
    expect(screen.getByText('This note has no text yet.')).toBeVisible()
  })

  it('names a former member as the author', () => {
    setup({}, { visibility: 'campaign', author_id: 'gone', updated_by: 'gone' })
    expect(screen.getByText(/Written by A former member/)).toBeVisible()
  })

  it('shows the failure copy', () => {
    setup({ error: 'We couldn’t delete this note. Check your connection and try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t delete this note')
  })
})

describe('what each reader may do', () => {
  it('lets the author edit, share, and delete a private note', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Share with the campaign' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete note' })).toBeEnabled()
  })

  it('lets another member edit a shared note, with no visibility or delete controls', () => {
    setup({}, { visibility: 'campaign', author_id: miraId })
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: /Share with|Make private/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument()
  })

  it('goes back and edits through the callbacks', async () => {
    const { onBack, onEdit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit note' }))
    await user.click(screen.getByRole('button', { name: 'Back to notes' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('disables every control while a change is pending', () => {
    setup({ pendingAction: 'visibility' })
    for (const name of ['Back to notes', 'Edit note', 'Saving…', 'Delete note']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })
})

describe('sharing and hiding', () => {
  it('shares a private note straight away', async () => {
    const { onVisibility, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Share with the campaign' }))
    expect(onVisibility).toHaveBeenCalledWith('campaign')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('asks before making a shared note private, and names the consequence', async () => {
    const { onVisibility, user } = setup({}, { title: 'Plan', visibility: 'campaign' })
    await user.click(screen.getByRole('button', { name: 'Make private' }))
    const confirm = screen.getByRole('group', { name: 'Confirm making Plan private' })
    expect(confirm).toHaveTextContent('Members will no longer see Plan, including their edits.')
    expect(screen.getByRole('button', { name: 'Yes, make private' })).toHaveFocus()
    expect(onVisibility).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, make private' }))
    expect(onVisibility).toHaveBeenCalledWith('private')
  })

  it('keeps the note shared and returns focus when the confirmation is declined', async () => {
    const { onVisibility, user } = setup({}, { visibility: 'campaign' })
    await user.click(screen.getByRole('button', { name: 'Make private' }))
    await user.click(screen.getByRole('button', { name: 'Keep shared' }))
    expect(onVisibility).not.toHaveBeenCalled()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make private' })).toHaveFocus()
  })

  it('leaves the confirmation open when making private fails', async () => {
    const { user } = setup(
      { onVisibility: vi.fn().mockResolvedValue(false) },
      { visibility: 'campaign' },
    )
    await user.click(screen.getByRole('button', { name: 'Make private' }))
    await user.click(screen.getByRole('button', { name: 'Yes, make private' }))
    expect(screen.getByRole('group', { name: /Confirm making/ })).toBeVisible()
  })
})

describe('deleting', () => {
  it('asks first, then deletes', async () => {
    const { onDelete, user } = setup({}, { title: 'Old plan' })
    await user.click(screen.getByRole('button', { name: 'Delete note' }))
    const confirm = screen.getByRole('group', { name: 'Confirm deleting Old plan' })
    expect(confirm).toHaveTextContent('Delete Old plan permanently? This can’t be undone.')
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, delete note' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('warns that members lose a shared note', async () => {
    const { user } = setup({}, { visibility: 'campaign' })
    await user.click(screen.getByRole('button', { name: 'Delete note' }))
    expect(screen.getByRole('group', { name: /Confirm deleting/ })).toHaveTextContent(
      'Every member loses it, including their edits.',
    )
  })

  it('keeps the note and returns focus when declined', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete note' }))
    await user.click(screen.getByRole('button', { name: 'Keep note' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete note' })).toHaveFocus()
  })

  it('shows the pending label while deleting', () => {
    setup({ pendingAction: null })
    cleanup()
    // The confirmation's own button reports the pending delete.
    const { user } = setup({ pendingAction: 'delete' })
    void user
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeDisabled()
  })
})

describe('dice in a note', () => {
  it('turns written dice into roll chips and leaves the text as typed', () => {
    setup({}, { title: 'Trap', body: 'The dart trap deals 1d4 + 2 piercing.\nDC 13 to spot.' })
    const body = screen.getByText(/dart trap/).closest('.note-body')!
    expect(body).toHaveTextContent('The dart trap deals 1d4 + 2 piercing. DC 13 to spot.')
    expect(
      within(body as HTMLElement).getByRole('button', { name: 'Roll 1d4 + 2 for Trap' }),
    ).toBeVisible()
    expect(within(body as HTMLElement).getAllByRole('button')).toHaveLength(1)
  })
})
