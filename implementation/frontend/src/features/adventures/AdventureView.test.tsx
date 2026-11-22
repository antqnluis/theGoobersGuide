import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdventureView } from './AdventureView'
import { attachHandoff, listHandoffs } from './handoffService'
import { handoffRecord } from './handoffTestData'
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

vi.mock('./handoffService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handoffService')>()),
  listHandoffs: vi.fn(),
  attachHandoff: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(listHandoffs).mockResolvedValue([])
})

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
    onConsent: vi.fn().mockResolvedValue(ok),
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
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
      />
    </QueryClientProvider>,
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

describe('handoffs', () => {
  it('offers Import handoff to editors and shows the Sources section', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([])
    setup()
    expect(screen.getByRole('button', { name: 'Import handoff' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible()
    expect(await screen.findByText('No handoffs yet.')).toBeVisible()
  })

  it('opens the dialog from the button and tells the page when a handoff is saved', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([])
    vi.mocked(attachHandoff).mockResolvedValue('h1')
    const onNotice = vi.fn()
    const { user } = setup(personal, { onNotice })
    await user.click(screen.getByRole('button', { name: 'Import handoff' }))
    expect(screen.getByRole('dialog', { name: 'Import handoff' })).toBeVisible()

    await user.click(screen.getByLabelText('1. The handoff text'))
    await user.paste('The recap.')
    await user.click(screen.getByRole('button', { name: 'Keep as source only' }))
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Handoff saved — kept as a source.'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sources' })).toHaveFocus()
  })

  it('returns focus to the button when the dialog is cancelled', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([])
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Import handoff' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Import handoff' })).toHaveFocus(),
    )
  })

  it('hides Import handoff when the adventure is archived or the viewer only reads it', () => {
    vi.mocked(listHandoffs).mockResolvedValue([])
    setup(adventure({ ...personal, archived_at: '2026-11-17T10:00:00+00:00' }))
    expect(screen.queryByRole('button', { name: 'Import handoff' })).not.toBeInTheDocument()
    cleanup()
    setup(
      adventure({
        id: 'a3',
        type: 'side',
        visibility: 'party',
        created_by: miraId,
        participants: [participant({ profile_id: miraId, character_id: miraCharacterId })],
      }),
    )
    expect(screen.queryByRole('button', { name: 'Import handoff' })).not.toBeInTheDocument()
    // Party readers still read the sources section.
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible()
  })

  it('labels the objectives and updates a handoff created with its source', async () => {
    vi.mocked(listHandoffs).mockResolvedValue([
      handoffRecord({ id: 'h1', source_label: 'session-4.md' }),
    ])
    setup(
      adventure({
        id: 'a4',
        objectives: [objective({ id: 'o9', title: 'Recover the clapper', handoff_id: 'h1' })],
        updates: [update({ id: 'u9', body: 'We reached Saltmere.', handoff_id: 'h1' })],
      }),
    )
    await waitFor(() => expect(screen.getAllByText('From handoff: session-4.md')).toHaveLength(2))
  })
})

describe('an adventure shared with the party', () => {
  const miraRow = participant({ profile_id: miraId, character_id: miraCharacterId })
  const shared = adventure({
    id: 'a3',
    title: 'The lantern job',
    type: 'side',
    visibility: 'party',
    status: 'in_progress',
    created_by: miraId,
    updated_by: miraId,
    participants: [miraRow],
    objectives: [
      objective({
        id: 'o1',
        title: 'Light the lantern',
        done: true,
        completed_by: miraId,
        completed_at: '2026-11-16T10:00:00+00:00',
      }),
      objective({ id: 'o2', title: 'Hide the oil', done: false }),
    ],
    updates: [update({ id: 'u9', author_id: miraId, body: 'The oil is gone.' })],
  })

  it('reads as a read-only page: no editing, status, archive, sharing, or participant controls', () => {
    setup(shared)
    expect(
      screen.getByText('Shared with the party by Mira. Only the people in it can make changes.'),
    ).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeVisible()
    for (const name of [
      'Edit details',
      'Archive adventure',
      'Stop sharing',
      'Share with party',
      'Leave adventure',
      'Add',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lists objectives with done marks and who ticked them, and the updates', () => {
    setup(shared)
    expect(screen.getByText('Light the lantern')).toBeVisible()
    expect(screen.getByText('(done)')).toBeVisible()
    expect(screen.getByText('(not done)')).toBeVisible()
    expect(screen.getByText(/Done by Mira/)).toBeVisible()
    expect(screen.getByText('The oil is gone.')).toBeVisible()
  })

  it('shows participants and sharing controls to an accepted participant of the same adventure', () => {
    const mine = adventure({
      ...shared,
      participants: [participant(), miraRow],
      created_by: userId,
    })
    setup(mine)
    expect(screen.getByRole('button', { name: 'Stop sharing' })).toBeVisible()
    expect(screen.queryByText(/Only the people in it can make changes/)).not.toBeInTheDocument()
  })
})

describe('dice in an adventure', () => {
  it('turns dice in the description and the next step into chips', () => {
    setup(
      adventure({
        description: 'The ogre hits for 2d8 + 4.',
        next_step: 'Roll d20 to sneak past.',
      }),
    )
    expect(screen.getByRole('button', { name: 'Roll 2d8 + 4 for Find the heir' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Roll d20 for Find the heir' })).toBeVisible()
  })
})
