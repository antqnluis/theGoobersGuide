import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../characters/characterTestData'
import { NoteEditor } from './NoteEditor'
import { note } from './noteTestData'
import type { NoteResult } from './useNoteActions'

afterEach(cleanup)

const brand = character({ id: 'c-brand', name: 'Brand' })
const aria = character({ id: 'c-aria', name: 'Aria' })

function setup(props: Partial<React.ComponentProps<typeof NoteEditor>> = {}) {
  const onSubmit = vi
    .fn<React.ComponentProps<typeof NoteEditor>['onSubmit']>()
    .mockResolvedValue({ ok: true, note: note() })
  const onCancel = vi.fn()
  const onDirtyChange = vi.fn()
  render(
    <NoteEditor
      characters={[brand, aria]}
      error={null}
      isPending={false}
      mode="new"
      note={null}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, onCancel, onDirtyChange, user: userEvent.setup() }
}

describe('a new note', () => {
  it('opens with the title focused, private by default', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Only you' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Shared with the campaign' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Create note' })).toBeEnabled()
  })

  it('submits normalized values with the chosen visibility and link', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Title'), '  Thorin’s debts  ')
    await user.type(screen.getByLabelText(/^Note/), 'Owes 40 gp')
    await user.selectOptions(screen.getByLabelText(/About a character/), 'Brand')
    await user.click(screen.getByRole('radio', { name: 'Shared with the campaign' }))
    await user.click(screen.getByRole('button', { name: 'Create note' }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        title: 'Thorin’s debts',
        body: 'Owes 40 gp',
        visibility: 'campaign',
        character_id: 'c-brand',
      },
      null,
    )
  })

  it('lists characters by name and defaults the link to none', async () => {
    setup()
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['None', 'Aria', 'Brand'])
    expect(screen.getByLabelText(/About a character/)).toHaveValue('')
  })

  it('stores an empty body as an empty string and no link as null', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Title'), 'Just a title')
    await user.click(screen.getByRole('button', { name: 'Create note' }))
    expect(onSubmit).toHaveBeenCalledWith(
      { title: 'Just a title', body: '', visibility: 'private', character_id: null },
      null,
    )
  })

  it('refuses a blank title and an over-long body, naming the field and focusing it', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Title'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create note' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription(
      'Enter a title of up to 120 characters.',
    )
    expect(screen.getByLabelText('Title')).toBeInvalid()

    await user.type(screen.getByLabelText('Title'), 'ok')
    const body = screen.getByLabelText(/^Note/)
    await user.click(body)
    await user.paste('x'.repeat(20_001))
    await user.click(screen.getByRole('button', { name: 'Create note' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(body).toHaveFocus()
    expect(body).toHaveAccessibleDescription(/Notes can be up to 20,000 characters/)
  })

  it('counts down from 18,000 characters and says when the limit is passed', async () => {
    const { user } = setup()
    const body = screen.getByLabelText(/^Note/)
    expect(screen.queryByText(/characters left/)).not.toBeInTheDocument()
    await user.click(body)
    await user.paste('x'.repeat(18_500))
    expect(screen.getByText('1,500 characters left')).toBeVisible()
    await user.paste('y'.repeat(1_600))
    expect(screen.getByText('100 characters over the 20,000 limit')).toBeVisible()
  })

  it('reports unsaved text, and clears it again on unmount', async () => {
    const { onDirtyChange, user } = setup()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.type(screen.getByLabelText('Title'), 'x')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.clear(screen.getByLabelText('Title'))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.type(screen.getByLabelText('Title'), 'x')
    cleanup()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('shows a pending save and blocks a second one', async () => {
    const { onSubmit } = setup({ isPending: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit twice while the first save is in flight', async () => {
    let finish: (result: NoteResult) => void = () => {}
    const { onSubmit, user } = setup()
    onSubmit.mockReturnValue(new Promise<NoteResult>((resolve) => (finish = resolve)))
    await user.type(screen.getByLabelText('Title'), 'Once')
    await user.dblClick(screen.getByRole('button', { name: 'Create note' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish({ ok: true, note: note() })
  })

  it('shows the failure copy and keeps the text', async () => {
    setup({ error: 'You can keep up to 500 notes in a campaign. Delete one to add another.' })
    expect(screen.getByRole('alert')).toHaveTextContent('You can keep up to 500 notes')
  })

  it('cancels through the callback', async () => {
    const { onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('says the campaign is gone when a create loses its membership, and keeps the text', async () => {
    const { onSubmit, user } = setup()
    onSubmit.mockResolvedValue({ ok: false, reason: 'unavailable' })
    await user.type(screen.getByLabelText('Title'), 'Kept')
    await user.click(screen.getByRole('button', { name: 'Create note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can no longer add notes to this campaign.',
    )
    expect(screen.getByLabelText('Title')).toHaveValue('Kept')
    expect(screen.getByRole('button', { name: 'Create note' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to notes' })).toBeEnabled()
  })
})

describe('editing a note', () => {
  const existing = note({
    id: 'n-edit',
    title: 'Clues',
    body: 'First line\nSecond line',
    visibility: 'campaign',
    character_id: 'c-aria',
    updated_at: '2026-11-16T10:00:00+00:00',
  })

  it('starts from the note, without a visibility choice', () => {
    setup({ mode: 'edit', note: existing })
    expect(screen.getByRole('form', { name: 'Edit Clues' })).toBeVisible()
    expect(screen.getByLabelText('Title')).toHaveValue('Clues')
    expect(screen.getByLabelText(/^Note/)).toHaveValue('First line\nSecond line')
    expect(screen.getByLabelText(/About a character/)).toHaveValue('c-aria')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled()
  })

  it('saves against the version it started from', async () => {
    const { onSubmit, user } = setup({ mode: 'edit', note: existing })
    await user.type(screen.getByLabelText('Title'), ' II')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        title: 'Clues II',
        body: 'First line\nSecond line',
        visibility: 'campaign',
        character_id: 'c-aria',
      },
      existing,
    )
  })

  it('can remove the link', async () => {
    const { onSubmit, user } = setup({ mode: 'edit', note: existing })
    await user.selectOptions(screen.getByLabelText(/About a character/), 'None')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(onSubmit.mock.calls[0][0].character_id).toBeNull()
  })

  it('keeps a link to a character the writer cannot see, rather than dropping it', async () => {
    const { onSubmit, user } = setup({
      mode: 'edit',
      note: note({ ...existing, character_id: 'c-hidden' }),
    })
    expect(screen.getByRole('option', { name: 'A character you can’t see' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(onSubmit.mock.calls[0][0].character_id).toBe('c-hidden')
  })
})

describe('a stale save', () => {
  const base = note({
    id: 'n-race',
    title: 'Plan',
    body: 'mine',
    updated_at: '2026-11-16T10:00:00+00:00',
  })
  const latest = note({
    id: 'n-race',
    title: 'Plan',
    body: 'theirs',
    updated_at: '2026-11-16T11:00:00+00:00',
  })

  async function conflict() {
    const out = setup({ mode: 'edit', note: base })
    out.onSubmit.mockResolvedValueOnce({ ok: false, reason: 'conflict', latest })
    await out.user.type(screen.getByLabelText(/^Note/), ' plus mine')
    await out.user.click(screen.getByRole('button', { name: 'Save note' }))
    await screen.findByRole('button', { name: 'Load latest' })
    return out
  }

  it('keeps the writer’s text and offers both choices', async () => {
    await conflict()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This note changed while you were editing. Your text is still here.',
    )
    expect(screen.getByLabelText(/^Note/)).toHaveValue('mine plus mine')
    expect(screen.getByRole('button', { name: 'Save mine anyway' })).toBeEnabled()
    // The ordinary save is replaced by the two choices.
    expect(screen.queryByRole('button', { name: 'Save note' })).not.toBeInTheDocument()
  })

  it('saves mine anyway against the latest version', async () => {
    const { onSubmit, user } = await conflict()
    await user.click(screen.getByRole('button', { name: 'Save mine anyway' }))
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: 'mine plus mine' }),
      latest,
    )
    expect(screen.queryByRole('button', { name: 'Load latest' })).not.toBeInTheDocument()
  })

  it('shows the banner again when saving mine anyway loses a second race', async () => {
    const newer = note({ ...latest, body: 'newest', updated_at: '2026-11-16T12:00:00+00:00' })
    const { onSubmit, user } = await conflict()
    onSubmit.mockResolvedValueOnce({ ok: false, reason: 'conflict', latest: newer })
    await user.click(screen.getByRole('button', { name: 'Save mine anyway' }))
    expect(await screen.findByRole('button', { name: 'Load latest' })).toBeVisible()
    onSubmit.mockResolvedValueOnce({ ok: true, note: newer })
    await user.click(screen.getByRole('button', { name: 'Save mine anyway' }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), newer)
  })

  it('loads the latest only after a confirmation, then drops the writer’s text', async () => {
    const { user } = await conflict()
    await user.click(screen.getByRole('button', { name: 'Load latest' }))
    expect(screen.getByRole('group', { name: 'Confirm loading the latest version' })).toBeVisible()
    // Declining keeps the text.
    await user.click(screen.getByRole('button', { name: 'Keep my text' }))
    expect(screen.getByLabelText(/^Note/)).toHaveValue('mine plus mine')

    await user.click(screen.getByRole('button', { name: 'Load latest' }))
    await user.click(screen.getByRole('button', { name: 'Yes, load latest' }))
    expect(screen.getByLabelText(/^Note/)).toHaveValue('theirs')
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled()
  })

  it('counts loading the latest as no unsaved text', async () => {
    const { onDirtyChange, user } = await conflict()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Load latest' }))
    await user.click(screen.getByRole('button', { name: 'Yes, load latest' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})

describe('a note that has gone', () => {
  it('keeps the text on screen, blocks saving, and offers a way back', async () => {
    const existing = note({ title: 'Doomed', body: 'copy me' })
    const { onSubmit, user } = setup({ mode: 'edit', note: existing })
    onSubmit.mockResolvedValue({ ok: false, reason: 'unavailable' })
    await user.type(screen.getByLabelText(/^Note/), '!')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This note is no longer available. It may have been made private or deleted.',
    )
    expect(screen.getByLabelText(/^Note/)).toHaveValue('copy me!')
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to notes' })).toBeEnabled()
  })
})
