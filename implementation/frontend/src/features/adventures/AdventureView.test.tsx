import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureView } from './AdventureView'
import {
  adventure,
  characterId,
  miraCharacterId,
  miraId,
  objective,
  participant,
  roster,
  update,
  userId,
} from './adventureTestData'

afterEach(cleanup)

const personal = adventure({
  id: 'a1',
  title: 'Find the heir',
  next_step: 'Ask the innkeeper',
  reference: 'The Gilded Stag',
  objectives: [objective({ id: 'o1', title: 'Search the cellar', done: true })],
  updates: [update({ id: 'u1' })],
})
const main = adventure({
  id: 'a2',
  title: 'The long road',
  type: 'main',
  visibility: 'campaign',
  participants: [],
  created_by: miraId,
  updated_by: miraId,
})

function setup(
  subject = personal,
  props: Partial<React.ComponentProps<typeof AdventureView>> = {},
) {
  const ok = { ok: true as const, value: undefined }
  const handlers = {
    onAddObjective: vi.fn().mockResolvedValue(ok),
    onArchive: vi.fn().mockResolvedValue(true),
    onApprove: vi.fn().mockResolvedValue(ok),
    onBack: vi.fn(),
    onCancel: vi.fn().mockResolvedValue(ok),
    onEdit: vi.fn(),
    onLeave: vi.fn().mockResolvedValue(true),
    onPropose: vi.fn().mockResolvedValue(ok),
    onPostUpdate: vi.fn().mockResolvedValue(ok),
    onRemoveObjective: vi.fn().mockResolvedValue(ok),
    onRemoveUpdate: vi.fn().mockResolvedValue(ok),
    onRenameObjective: vi.fn().mockResolvedValue(ok),
    onRestore: vi.fn().mockResolvedValue(true),
    onStatus: vi.fn().mockResolvedValue(ok),
    onToggleObjective: vi.fn().mockResolvedValue(ok),
  }
  render(
    <AdventureView
      adventure={subject}
      characters={[{ id: characterId, name: 'Brindle', owner_id: userId, status: 'active' }]}
      error={null}
      headingRef={{ current: null }}
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

describe('AdventureView', () => {
  it('shows the details, who it is for, and what it is', () => {
    setup()
    expect(screen.getByRole('heading', { level: 3, name: 'Find the heir' })).toBeVisible()
    const about = screen.getByRole('list', { name: 'About this adventure' })
    expect(about).toHaveTextContent('Personal')
    expect(about).toHaveTextContent('Only you')
    expect(about).toHaveTextContent('Brindle')
    expect(screen.getByText('Ask the innkeeper')).toBeVisible()
    expect(screen.getByText('The Gilded Stag')).toBeVisible()
    expect(screen.getByText('Somebody knows where the heir went.')).toBeVisible()
    expect(screen.getByText('1 of 1 done', { selector: 'dd' })).toBeVisible()
  })

  it('names a main adventure as visible to every member, with no character', () => {
    setup(main)
    const about = screen.getByRole('list', { name: 'About this adventure' })
    expect(about).toHaveTextContent('Main')
    expect(about).toHaveTextContent('Every member')
    expect(about).not.toHaveTextContent('Brindle')
    expect(screen.getByText('Edited by Mira', { exact: false })).toBeVisible()
  })

  it('shows empty next step and description honestly', () => {
    setup(adventure({ next_step: '', description: '', reference: '' }))
    expect(screen.getByText('None yet.')).toBeVisible()
    expect(screen.getByText('This adventure has no description yet.')).toBeVisible()
    expect(screen.queryByText('Reference')).not.toBeInTheDocument()
  })

  it('changes the status through a native select and shows who changed it', async () => {
    const { onStatus, user } = setup(
      adventure({
        status: 'completed',
        status_changed_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        status_changed_by: miraId,
      }),
    )
    const select = screen.getByLabelText('Status')
    expect(select).toHaveValue('completed')
    expect(screen.getByText('Completed by Mira, 2 days ago')).toBeVisible()
    await user.selectOptions(select, 'On hold')
    expect(onStatus).toHaveBeenCalledWith('on_hold')
  })

  it('opens the editor and goes back', async () => {
    const { onEdit, onBack, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(onEdit).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Back to adventures' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('passes objective and update writes through', async () => {
    const { onToggleObjective, onPostUpdate, user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Search the cellar' }))
    expect(onToggleObjective).toHaveBeenCalledWith('o1', false)
    await user.type(screen.getByLabelText('Write an update'), 'We rested.')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(onPostUpdate).toHaveBeenCalledWith('We rested.')
  })

  describe('archiving', () => {
    it('asks first in the adventure’s own words, and archives on yes', async () => {
      const { onArchive, user } = setup()
      await user.click(screen.getByRole('button', { name: 'Archive adventure' }))
      const group = screen.getByRole('group', { name: 'Confirm archiving Find the heir' })
      expect(group).toHaveTextContent('It moves to your Archived list')
      expect(screen.getByRole('button', { name: 'Yes, archive' })).toHaveFocus()
      expect(onArchive).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Yes, archive' }))
      expect(onArchive).toHaveBeenCalledTimes(1)
    })

    it('warns that a main adventure disappears for every member', async () => {
      const { user } = setup(main, { userId: miraId })
      await user.click(screen.getByRole('button', { name: 'Archive adventure' }))
      expect(screen.getByRole('group')).toHaveTextContent('Every member stops seeing it')
    })

    it('keeps the adventure on cancel and returns focus to the control', async () => {
      const { onArchive, user } = setup()
      await user.click(screen.getByRole('button', { name: 'Archive adventure' }))
      await user.click(screen.getByRole('button', { name: 'Keep adventure' }))
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Archive adventure' })).toHaveFocus()
      expect(onArchive).not.toHaveBeenCalled()
    })

    it('closes the confirmation when the archive fails, so the error is visible', async () => {
      const { onArchive, user } = setup()
      onArchive.mockResolvedValue(false)
      await user.click(screen.getByRole('button', { name: 'Archive adventure' }))
      await user.click(screen.getByRole('button', { name: 'Yes, archive' }))
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
    })

    it('offers archiving to the creator only', () => {
      setup(main)
      expect(screen.queryByRole('button', { name: 'Archive adventure' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit details' })).toBeVisible()
    })
  })

  describe('an archived adventure', () => {
    const archived = adventure({ ...personal, archived_at: '2026-11-16T12:00:00+00:00' })

    it('is read-only, says so, and offers restore to its creator', async () => {
      const { onRestore, user } = setup(archived)
      expect(
        screen.getByText('This adventure is archived. Restore it to make changes.'),
      ).toBeVisible()
      expect(screen.getByLabelText('Status')).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Add an objective')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Write an update')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Archive adventure' })).not.toBeInTheDocument()
      expect(
        within(screen.getByRole('list', { name: 'About this adventure' })).getByText('Archived'),
      ).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Restore adventure' }))
      expect(onRestore).toHaveBeenCalled()
    })
  })

  it('shows an error above the controls and disables them while a write runs', () => {
    setup(personal, { error: 'We couldn’t change the status.' })
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t change the status.')
    cleanup()
    setup(personal, { pendingAction: 'status', pendingId: 'a1' })
    expect(screen.getByLabelText('Status')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to adventures' })).toBeDisabled()
  })
})

describe('AdventureView with others', () => {
  const mira = participant({ profile_id: miraId, character_id: miraCharacterId })

  it('shows the participants section for personal and side adventures, not for main', () => {
    setup(adventure({ type: 'side', participants: [participant(), mira] }))
    expect(screen.getByRole('region', { name: 'Participants' })).toBeVisible()
    cleanup()
    setup(adventure({ type: 'main', visibility: 'campaign', participants: [] }))
    expect(screen.queryByRole('region', { name: 'Participants' })).not.toBeInTheDocument()
  })

  it('names the audience: only you, only the people in it, or the party', () => {
    setup(adventure({ type: 'side', participants: [participant()] }))
    expect(
      within(screen.getByRole('list', { name: 'About this adventure' })).getByText('Only you'),
    ).toBeVisible()
    cleanup()
    setup(adventure({ type: 'side', participants: [participant(), mira] }))
    expect(screen.getByText('Only the people in it')).toBeVisible()
    cleanup()
    setup(adventure({ type: 'side', visibility: 'party', participants: [participant(), mira] }))
    expect(screen.getByText('The party')).toBeVisible()
  })

  it('lists only accepted characters in the chips', () => {
    setup(
      adventure({
        type: 'side',
        participants: [
          participant(),
          participant({ character_id: 'zz', profile_id: 'zz', status: 'invited' }),
        ],
      }),
    )
    const chips = within(screen.getByRole('list', { name: 'About this adventure' }))
    expect(chips.getByText('Brindle')).toBeVisible()
    expect(chips.queryByText('A character')).not.toBeInTheDocument()
  })

  it('passes participant actions through', async () => {
    const proposal = participant({
      id: 'p1',
      profile_id: 'zz',
      character_id: 'zz',
      status: 'proposed',
    })
    const { onApprove, onLeave, user } = setup(
      adventure({ type: 'side', participants: [participant(), mira, proposal] }),
    )
    await user.click(screen.getByRole('button', { name: /^Approve/ }))
    expect(onApprove).toHaveBeenCalledWith('p1')
    await user.click(screen.getByRole('button', { name: 'Leave adventure' }))
    await user.click(screen.getByRole('button', { name: 'Yes, leave' }))
    expect(onLeave).toHaveBeenCalled()
  })

  it('lets a participant other than the creator archive only once the creator has left', () => {
    const asMira = (participants: ReturnType<typeof participant>[]) =>
      setup(adventure({ type: 'side', created_by: userId, participants }), { userId: miraId })
    asMira([participant(), mira])
    expect(screen.queryByRole('button', { name: 'Archive adventure' })).not.toBeInTheDocument()
    cleanup()
    asMira([participant({ status: 'left' }), mira])
    expect(screen.getByRole('button', { name: 'Archive adventure' })).toBeVisible()
  })
})
