import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampaignOwnershipTransfer } from './CampaignOwnershipTransfer'
import type { CampaignRosterMember } from './campaignTypes'
import type { MembershipAction, MembershipConfirmation } from './useCampaignMembership'

afterEach(cleanup)

const roster: CampaignRosterMember[] = [
  { profile_id: 'owner', role: 'owner', username: 'player_one' },
  { profile_id: 'ally', role: 'member', username: 'player_two' },
  { profile_id: 'ghost', role: 'member', username: null },
]

function Harness({
  members = roster,
  status = 'success',
  pendingAction = null,
  error = null,
  initial = null,
  onTransfer,
  onRetry = vi.fn(),
}: {
  members?: CampaignRosterMember[]
  status?: 'pending' | 'error' | 'success'
  pendingAction?: MembershipAction | null
  error?: string | null
  initial?: MembershipConfirmation | null
  onTransfer: (profileId: string, name: string) => void
  onRetry?: () => void
}) {
  const [confirmation, setConfirmation] = useState<MembershipConfirmation | null>(initial)
  return (
    <CampaignOwnershipTransfer
      campaignName="The Red Hand"
      confirmation={confirmation}
      error={error}
      onConfirmationChange={setConfirmation}
      onRetry={onRetry}
      onTransfer={onTransfer}
      pendingAction={pendingAction}
      roster={members}
      status={status}
    />
  )
}

describe('CampaignOwnershipTransfer', () => {
  it('asks the owner to invite someone first when there are no other members', () => {
    render(<Harness members={[roster[0]]} onTransfer={vi.fn()} />)
    expect(screen.getByText('Invite a player before you transfer ownership.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('offers each non-owner member and enables the button only after a choice', async () => {
    const user = userEvent.setup()
    render(<Harness onTransfer={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Transfer ownership' })
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'this player' })).toBeVisible()
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'player_two' }))
    expect(button).toBeEnabled()
  })

  it('names the new owner in the confirmation and transfers on confirm', async () => {
    const user = userEvent.setup()
    const onTransfer = vi.fn()
    render(<Harness onTransfer={onTransfer} />)
    await user.click(screen.getByRole('radio', { name: 'player_two' }))
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }))

    expect(screen.getByRole('group', { name: 'Confirm ownership transfer' })).toHaveTextContent(
      "Make player_two the owner of The Red Hand? You'll become a regular member and will no longer be able to edit, delete, or invite players to this campaign.",
    )
    expect(screen.getByRole('button', { name: 'Yes, transfer ownership' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Yes, transfer ownership' }))
    expect(onTransfer).toHaveBeenCalledWith('ally', 'player_two')
  })

  it('goes back to the picker when the owner keeps ownership', async () => {
    const user = userEvent.setup()
    const onTransfer = vi.fn()
    render(<Harness onTransfer={onTransfer} />)
    await user.click(screen.getByRole('radio', { name: 'player_two' }))
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    await user.click(screen.getByRole('button', { name: 'Keep ownership' }))
    expect(
      screen.queryByRole('group', { name: 'Confirm ownership transfer' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).toBeVisible()
    expect(onTransfer).not.toHaveBeenCalled()
  })

  it('shows the pending label and disables both buttons while transferring', () => {
    render(
      <Harness
        initial={{ type: 'transfer', profileId: 'ally' }}
        onTransfer={vi.fn()}
        pendingAction="transfer"
      />,
    )
    expect(screen.getByRole('button', { name: 'Transferring…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep ownership' })).toBeDisabled()
  })

  it('announces a failure as an alert', () => {
    render(
      <Harness
        error="Only the campaign owner can transfer ownership."
        initial={{ type: 'transfer', profileId: 'ally' }}
        onTransfer={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Only the campaign owner')
  })

  it('shows the roster loading and error states instead of the picker', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<Harness onTransfer={vi.fn()} status="pending" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign members…')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    rerender(<Harness onRetry={onRetry} onTransfer={vi.fn()} status="error" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Campaign members could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
