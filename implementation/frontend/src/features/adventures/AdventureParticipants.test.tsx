import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureParticipants } from './AdventureParticipants'
import {
  adventure,
  characterId,
  miraCharacterId,
  miraId,
  participant,
  roster,
  userId,
} from './adventureTestData'
import type { AdventureDetail } from './adventureTypes'

afterEach(cleanup)

const ok = { ok: true as const, value: undefined }
const bram = { profile_id: 'bram', role: 'member', username: 'bram', display_name: 'Bram' } as const
const characters = [
  { id: characterId, name: 'Brindle', owner_id: userId, status: 'active' as const },
  { id: miraCharacterId, name: 'Tess', owner_id: miraId, status: 'active' as const },
  { id: 'c-bram', name: 'Bram the Bold', owner_id: 'bram', status: 'active' as const },
  { id: 'c-cass', name: 'Cass', owner_id: 'cass', status: 'active' as const },
]
const people = [
  ...roster,
  bram,
  { profile_id: 'cass', role: 'member', username: 'cass', display_name: 'Cass P' },
]

const mira = (overrides = {}) =>
  participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })
const other = (profile: string, character: string, overrides = {}) =>
  participant({ profile_id: profile, character_id: character, ...overrides })

function setup(subject: AdventureDetail, props: Record<string, unknown> = {}) {
  const handlers = {
    onApprove: vi.fn().mockResolvedValue(ok),
    onCancel: vi.fn().mockResolvedValue(ok),
    onLeave: vi.fn().mockResolvedValue(true),
    onPropose: vi.fn().mockResolvedValue(ok),
  }
  render(
    <AdventureParticipants
      adventure={subject}
      characters={characters}
      pendingAction={null}
      pendingId={null}
      roster={people}
      userId={userId}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

const duo = adventure({ id: 'duo', type: 'side', participants: [participant(), mira()] })

describe('AdventureParticipants', () => {
  it('lists accepted characters with their players, and who agrees to share', () => {
    setup(
      adventure({
        type: 'side',
        participants: [participant({ share_consent: true }), mira()],
      }),
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Brindle')
    expect(items[0]).toHaveTextContent('You')
    expect(items[0]).toHaveTextContent('Agrees to share with the party')
    expect(items[1]).toHaveTextContent('Tess')
    expect(items[1]).toHaveTextContent('Mira')
    expect(items[1]).not.toHaveTextContent('Agrees')
  })

  it('states each pending, declined, and left row in words, after the accepted ones', () => {
    setup(
      adventure({
        type: 'side',
        participants: [
          other('cass', 'c-cass', { status: 'left' }),
          other('bram', 'c-bram', { status: 'invited' }),
          participant(),
          mira(),
        ],
      }),
    )
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('data-status'))).toEqual([
      'accepted',
      'accepted',
      'invited',
      'left',
    ])
    expect(items[2]).toHaveTextContent("Waiting for Bram's answer")
    expect(items[3]).toHaveTextContent('Left')
  })

  it('approves a proposal waiting for the viewer, and not one they already approved', async () => {
    const waiting = other('bram', 'c-bram', {
      id: 'p1',
      status: 'proposed',
      approvals: [{ approver_id: miraId }],
    })
    const { onApprove, user } = setup(
      adventure({ type: 'side', participants: [participant(), mira(), waiting] }),
    )
    expect(screen.getByText('Waiting for 1 approval')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Approve Bram the Bold joining' }))
    expect(onApprove).toHaveBeenCalledWith('p1')
    cleanup()

    setup(
      adventure({
        type: 'side',
        participants: [
          participant(),
          mira(),
          { ...waiting, approvals: [{ approver_id: userId }, { approver_id: miraId }] },
        ],
      }),
    )
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
  })

  it('rejects a proposal only after a confirmation, with focus on it and back on Reject', async () => {
    const waiting = other('bram', 'c-bram', { id: 'p1', status: 'proposed' })
    const { onCancel, user } = setup(
      adventure({ type: 'side', participants: [participant(), mira(), waiting] }),
    )
    const reject = screen.getByRole('button', { name: 'Reject Bram the Bold' })
    await user.click(reject)
    const confirm = screen.getByRole('button', { name: 'Yes, reject' })
    expect(confirm).toHaveFocus()
    expect(screen.getByText(/never sees this proposal/)).toBeVisible()
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(reject).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Yes, reject' })).not.toBeInTheDocument()

    await user.click(reject)
    await user.click(screen.getByRole('button', { name: 'Yes, reject' }))
    expect(onCancel).toHaveBeenCalledWith('p1')
  })

  it('withdraws a sent invitation after a confirmation', async () => {
    const sent = other('bram', 'c-bram', { id: 'p2', status: 'invited' })
    const { onCancel, user } = setup(
      adventure({ type: 'side', participants: [participant(), mira(), sent] }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Withdraw the invitation to Bram the Bold' }),
    )
    expect(screen.getByText(/disappears from Bram’s list/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Yes, withdraw' }))
    expect(onCancel).toHaveBeenCalledWith('p2')
  })

  it('invites a character that can be invited, naming who must approve first', async () => {
    const { onPropose, user } = setup(duo)
    const picker = screen.getByLabelText('Invite a character')
    // Mira is already in; the viewer's own character is not offered either.
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose a character…', 'Bram the Bold (Bram)', 'Cass (Cass P)'])
    expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled()
    await user.selectOptions(picker, 'c-bram')
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    expect(screen.getByRole('button', { name: 'Ask for approval' })).toHaveFocus()
    expect(screen.getByText(/Everyone in this adventure must approve first: Mira/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Ask for approval' }))
    expect(onPropose).toHaveBeenCalledWith('c-bram')
    expect(screen.queryByRole('button', { name: 'Ask for approval' })).not.toBeInTheDocument()
  })

  it('sends a sole participant’s invitation at once, and can be dismissed', async () => {
    const { onPropose, user } = setup(
      adventure({ type: 'personal', participants: [participant()] }),
    )
    await user.selectOptions(screen.getByLabelText('Invite a character'), 'c-cass')
    const invite = screen.getByRole('button', { name: 'Invite' })
    await user.click(invite)
    expect(screen.getByText(/Cass P will see the invitation right away/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(onPropose).not.toHaveBeenCalled()
    expect(invite).toHaveFocus()
    await user.click(invite)
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(onPropose).toHaveBeenCalledWith('c-cass')
  })

  it('offers "Invite again" for a declined or left character that can still be invited', async () => {
    const { onPropose, user } = setup(
      adventure({
        type: 'side',
        participants: [participant(), other('bram', 'c-bram', { status: 'declined' })],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Invite Bram the Bold again' }))
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(onPropose).toHaveBeenCalledWith('c-bram')
    cleanup()

    // Their player has another live row, or the character retired: no button.
    setup(
      adventure({
        type: 'side',
        participants: [
          participant(),
          other('bram', 'c-bram', { status: 'declined' }),
          other('bram', 'c-bram-2', { status: 'invited' }),
        ],
      }),
    )
    expect(screen.queryByRole('button', { name: /again/ })).not.toBeInTheDocument()
  })

  it('says why nothing can be invited, and stops at ten live participations', () => {
    setup(adventure({ type: 'side', participants: [participant()] }), {
      characters: [characters[0]],
    })
    expect(screen.getByText('No other player has a character that can be invited.')).toBeVisible()
    cleanup()

    const crowd = Array.from({ length: 9 }, (_, index) =>
      other(`p${index}`, `c${index}`, { status: index % 2 ? 'invited' : 'accepted' }),
    )
    setup(adventure({ type: 'side', participants: [participant(), ...crowd] }))
    expect(
      screen.getByText('An adventure can have up to 10 characters, invitations included.'),
    ).toBeVisible()
    expect(screen.queryByLabelText('Invite a character')).not.toBeInTheDocument()
  })

  it('leaves through a confirmation, and keeps the page when leaving fails', async () => {
    const onLeave = vi.fn().mockResolvedValueOnce(false)
    const { user } = setup(duo, { onLeave })
    const leave = screen.getByRole('button', { name: 'Leave adventure' })
    await user.click(leave)
    expect(screen.getByRole('button', { name: 'Yes, leave' })).toHaveFocus()
    expect(screen.getByText(/coming back needs a new invitation/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Yes, leave' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Yes, leave' })).not.toBeInTheDocument()
    expect(leave).toHaveFocus()
  })

  it('does not offer leaving to the last accepted participant', () => {
    setup(adventure({ type: 'side', participants: [participant(), mira({ status: 'left' })] }))
    expect(screen.queryByRole('button', { name: 'Leave adventure' })).not.toBeInTheDocument()
  })

  it('is read-only for the party and for an archived adventure', () => {
    // A party viewer reads the accepted characters, with no controls.
    setup(
      adventure({
        type: 'side',
        visibility: 'party',
        created_by: miraId,
        participants: [mira(), other('bram', 'c-bram')],
      }),
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Invite a character')).not.toBeInTheDocument()
    cleanup()

    setup({
      ...duo,
      archived_at: '2026-11-16T10:00:00+00:00',
      participants: [participant(), mira(), other('bram', 'c-bram', { status: 'invited' })],
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('locks the controls while a write is pending and shows which one', () => {
    const waiting = other('bram', 'c-bram', { id: 'p1', status: 'proposed' })
    setup(adventure({ type: 'side', participants: [participant(), mira(), waiting] }), {
      pendingAction: 'approve',
      pendingId: 'p1',
    })
    expect(screen.getByRole('button', { name: 'Approve Bram the Bold joining' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve Bram the Bold joining' })).toHaveTextContent(
      'Approving…',
    )
    expect(screen.getByRole('button', { name: 'Reject Bram the Bold' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Leave adventure' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled()
  })
})
