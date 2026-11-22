import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureUpdates } from './AdventureUpdates'
import { miraId, roster, update, userId } from './adventureTestData'

afterEach(cleanup)

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString()
const mine = update({ id: 'u1', body: 'The cellar was empty.', created_at: hoursAgo(1) })
const theirs = update({
  id: 'u2',
  author_id: miraId,
  body: 'I found a key.\nIt was rusty.',
  created_at: hoursAgo(3),
})

function setup(props: Partial<React.ComponentProps<typeof AdventureUpdates>> = {}) {
  const ok = { ok: true as const, value: undefined }
  const handlers = {
    onPost: vi.fn().mockResolvedValue(ok),
    onRemove: vi.fn().mockResolvedValue(ok),
  }
  render(
    <AdventureUpdates
      editable
      pendingAction={null}
      pendingId={null}
      roster={roster}
      updates={[mine, theirs]}
      userId={userId}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('AdventureUpdates', () => {
  it('labels updates a handoff created, and only those', () => {
    setup({
      updates: [update({ id: 'u3', body: 'We reached Saltmere.', handoff_id: 'h1' }), mine],
      handoffLabels: new Map([['h1', 'session-4.md']]),
    })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('From handoff: session-4.md')
    expect(items[1]).not.toHaveTextContent('From handoff')
  })

  it('lists updates as given, with author and time, keeping line breaks', () => {
    setup()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('You')
    expect(items[0]).toHaveTextContent('1 hour ago')
    expect(items[1]).toHaveTextContent('Mira')
    // The text keeps its own line break; the page shows it with `white-space: pre-wrap`.
    expect(within(items[1]).getByText(/I found a key/).textContent).toBe(
      'I found a key.\nIt was rusty.',
    )
  })

  it('posts a trimmed update, then clears the field and keeps focus there', async () => {
    const { onPost, user } = setup()
    const field = screen.getByLabelText('Write an update')
    await user.type(field, '  We camped.  ')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(onPost).toHaveBeenCalledWith('We camped.')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('refuses a blank or over-long update and keeps the text when the post fails', async () => {
    const { onPost, user } = setup()
    const field = screen.getByLabelText('Write an update')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(onPost).not.toHaveBeenCalled()
    expect(field).toHaveAccessibleDescription('Enter an update of up to 2,000 characters.')

    onPost.mockResolvedValue({ ok: false, reason: 'failed' })
    await user.type(field, 'We camped.')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(field).toHaveValue('We camped.')
  })

  it('shows a counter near the limit', async () => {
    const { user } = setup()
    await user.click(screen.getByLabelText('Write an update'))
    await user.paste('x'.repeat(1900))
    expect(screen.getByText('100 characters left')).toBeVisible()
  })

  it('lets an author delete their own update only', async () => {
    const { onRemove, user } = setup()
    expect(screen.getAllByRole('button', { name: /^Delete update/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Delete update from 1 hour ago' }))
    expect(onRemove).toHaveBeenCalledWith('u1')
  })

  it('shows pending labels while a post or delete runs', () => {
    setup({ pendingAction: 'update-add', pendingId: 'a1' })
    expect(screen.getByRole('button', { name: 'Posting…' })).toBeDisabled()
    cleanup()
    setup({ pendingAction: 'update-delete', pendingId: 'u1' })
    expect(screen.getByRole('button', { name: /^Delete update/ })).toHaveTextContent('Deleting…')
  })

  it('is read-only when the adventure is archived', () => {
    setup({ editable: false })
    expect(screen.queryByLabelText('Write an update')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete update/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows an empty state', () => {
    setup({ updates: [] })
    expect(screen.getByText('No updates yet.')).toBeVisible()
  })
})

describe('dice in updates', () => {
  it('turns dice in an update into a chip named for the adventure', () => {
    setup({
      context: 'The cellar',
      updates: [update({ id: 'u9', body: 'Took 2d6 fire damage from the trap.' })],
    })
    expect(screen.getByRole('button', { name: 'Roll 2d6 for The cellar' })).toBeVisible()
    expect(screen.getByText(/Took/).textContent).toBe('Took 2d6 fire damage from the trap.')
  })
})
