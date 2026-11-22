import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureInvitationCard } from './AdventureInvitationCard'
import { characterId, invitation, miraId, roster, userId } from './adventureTestData'

afterEach(cleanup)

const ok = { ok: true as const, value: undefined }
const now = new Date('2026-11-16T13:00:00Z')

function setup(
  subject = invitation({ title: 'The long road' }),
  props: Record<string, unknown> = {},
) {
  const onRespond = vi.fn().mockResolvedValue(ok)
  render(
    <ul>
      <AdventureInvitationCard
        characters={[{ id: characterId, name: 'Brindle' }]}
        invitation={subject}
        now={now}
        onRespond={onRespond}
        pendingAction={null}
        pendingId={null}
        roster={roster}
        userId={userId}
        {...props}
      />
    </ul>,
  )
  return { onRespond, subject, user: userEvent.setup() }
}

describe('AdventureInvitationCard', () => {
  it('shows the title, type, character, inviter, and when, and nothing else', () => {
    setup()
    const card = screen.getByRole('listitem')
    expect(card).toHaveTextContent('The long road')
    expect(card).toHaveTextContent('Side')
    expect(card).toHaveTextContent('For Brindle')
    expect(card).toHaveTextContent('Invited by Mira')
    expect(card).toHaveTextContent('2 hours ago')
    expect(screen.queryByLabelText('Keep it shared with the party')).not.toBeInTheDocument()
  })

  it('names a deleted inviter as a former member and an unseen character neutrally', () => {
    setup(invitation({ invited_by: null, character_id: 'unseen' }))
    expect(screen.getByRole('listitem')).toHaveTextContent('Invited by a former member')
    expect(screen.getByRole('listitem')).toHaveTextContent('For A character')
  })

  it('accepts without keeping anything shared', async () => {
    const { onRespond, subject, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Accept the invitation to The long road' }))
    expect(onRespond).toHaveBeenCalledWith(subject, true, false)
  })

  it('asks about keeping a shared adventure shared, unticked, and sends the choice', async () => {
    const shared = invitation({
      title: 'The long road',
      shared_with_party: true,
      invited_by: miraId,
    })
    const { onRespond, user } = setup(shared)
    const keep = screen.getByLabelText('Keep it shared with the party')
    expect(keep).not.toBeChecked()
    expect(screen.getByText(/becomes private for everyone in it/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Accept the invitation to The long road' }))
    expect(onRespond).toHaveBeenLastCalledWith(shared, true, false)
    await user.click(keep)
    await user.click(screen.getByRole('button', { name: 'Accept the invitation to The long road' }))
    expect(onRespond).toHaveBeenLastCalledWith(shared, true, true)
  })

  it('declines after a confirmation, with focus on it and back on Decline if dismissed', async () => {
    const { onRespond, subject, user } = setup()
    const decline = screen.getByRole('button', { name: 'Decline the invitation to The long road' })
    await user.click(decline)
    expect(screen.getByRole('button', { name: 'Yes, decline' })).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Accept the invitation to The long road' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Keep invitation' }))
    expect(decline).toHaveFocus()
    expect(onRespond).not.toHaveBeenCalled()

    await user.click(decline)
    await user.click(screen.getByRole('button', { name: 'Yes, decline' }))
    expect(onRespond).toHaveBeenCalledWith(subject, false, false)
  })

  it('locks both answers while one is being saved', () => {
    const subject = invitation({ title: 'The long road' })
    setup(subject, { pendingAction: 'respond', pendingId: subject.participant_id })
    expect(
      screen.getByRole('button', { name: 'Accept the invitation to The long road' }),
    ).toHaveTextContent('Joining…')
    expect(
      screen.getByRole('button', { name: 'Accept the invitation to The long road' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Decline the invitation to The long road' }),
    ).toBeDisabled()
  })
})
