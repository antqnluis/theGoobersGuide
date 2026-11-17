import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampaignPartyMembers } from './CampaignPartyMembers'
import type { CampaignRosterMember } from './campaignTypes'
import type { MembershipAction, MembershipConfirmation } from './useCampaignMembership'

afterEach(cleanup)

const roster: CampaignRosterMember[] = [
  { profile_id: 'owner', role: 'owner', username: 'game_master' },
  { profile_id: 'ally', role: 'member', username: 'player_two' },
  { profile_id: 'ghost', role: 'member', username: null },
]

type Overrides = {
  isOwner?: boolean
  roster?: CampaignRosterMember[]
  status?: 'pending' | 'error' | 'success'
  pendingAction?: MembershipAction | null
  pendingProfileId?: string | null
  error?: string | null
  sharedAdventureCount?: number
}

function Harness({
  onLeaveCampaign,
  onRemoveMember,
  onRetry = vi.fn(),
  ...overrides
}: Overrides & {
  onLeaveCampaign: () => void
  onRemoveMember: (profileId: string, name: string) => void
  onRetry?: () => void
}) {
  const [confirmation, setConfirmation] = useState<MembershipConfirmation | null>(null)
  return (
    <CampaignPartyMembers
      campaignName="The Red Hand"
      confirmation={confirmation}
      error={overrides.error ?? null}
      isOwner={overrides.isOwner ?? false}
      onConfirmationChange={setConfirmation}
      onLeaveCampaign={onLeaveCampaign}
      onRemoveMember={onRemoveMember}
      onRetry={onRetry}
      sharedAdventureCount={overrides.sharedAdventureCount}
      pendingAction={overrides.pendingAction ?? null}
      pendingProfileId={overrides.pendingProfileId ?? null}
      roster={overrides.roster ?? roster}
      status={overrides.status ?? 'success'}
    >
      <button type="button">Invite player</button>
    </CampaignPartyMembers>
  )
}

function setup(overrides: Overrides = {}) {
  const onLeaveCampaign = vi.fn()
  const onRemoveMember = vi.fn()
  const onRetry = vi.fn()
  render(
    <Harness
      {...overrides}
      onLeaveCampaign={onLeaveCampaign}
      onRemoveMember={onRemoveMember}
      onRetry={onRetry}
    />,
  )
  return { onLeaveCampaign, onRemoveMember, onRetry, user: userEvent.setup() }
}

describe('CampaignPartyMembers', () => {
  it('shows Remove on member rows only, with the leave hint, for the owner', () => {
    setup({ isOwner: true })
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Remove player_two from the campaign' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove this player from the campaign' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Leave campaign' })).not.toBeInTheDocument()
    expect(screen.getByText(/transfer ownership in Campaign settings first/)).toBeVisible()
  })

  it('shows usernames beside distinct display names in the roster and removal confirmation', async () => {
    const named: CampaignRosterMember[] = [
      { profile_id: 'owner', role: 'owner', username: 'game_master', display_name: 'The Warden' },
      { profile_id: 'ally', role: 'member', username: 'player_two', display_name: 'Aria' },
      {
        profile_id: 'same',
        role: 'member',
        username: 'player_three',
        display_name: 'player_three',
      },
    ]
    const { user } = setup({ isOwner: true, roster: named })
    expect(screen.getByText('The Warden')).toBeVisible()
    expect(screen.getByText('player_two')).toHaveClass('campaign-member-list__handle')
    expect(screen.getAllByText('player_three')).toHaveLength(1)

    await user.click(
      screen.getByRole('button', { name: 'Remove Aria (player_two) from the campaign' }),
    )
    expect(
      screen.getByRole('group', { name: 'Confirm removal of Aria (player_two)' }),
    ).toHaveTextContent('Remove Aria (player_two) from The Red Hand?')
  })

  it('omits the leave hint when the owner has no other members', () => {
    setup({ isOwner: true, roster: [roster[0]] })
    expect(screen.queryByText(/transfer ownership in Campaign settings first/)).toBeNull()
  })

  it('shows Leave and no Remove for a member', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Leave campaign' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('confirms a removal by name, focuses the confirm button, and only one confirmation is open', async () => {
    const { user, onRemoveMember } = setup({ isOwner: true })
    await user.click(screen.getByRole('button', { name: 'Remove player_two from the campaign' }))

    const group = screen.getByRole('group', { name: 'Confirm removal of player_two' })
    expect(group).toHaveTextContent(
      "Remove player_two from The Red Hand? They'll lose access until you invite them again. Their characters are kept and leave the party.",
    )
    expect(screen.getByRole('button', { name: 'Yes, remove' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Remove this player from the campaign' }))
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Confirm removal of this player' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))
    expect(onRemoveMember).toHaveBeenCalledWith('ghost', 'this player')
  })

  it('returns focus to the Remove button when the owner keeps the player', async () => {
    const { user, onRemoveMember } = setup({ isOwner: true })
    await user.click(screen.getByRole('button', { name: 'Remove player_two from the campaign' }))
    await user.click(screen.getByRole('button', { name: 'Keep player_two' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove player_two from the campaign' }),
    ).toHaveFocus()
    expect(onRemoveMember).not.toHaveBeenCalled()
  })

  it('confirms leaving and returns focus to Leave on cancel', async () => {
    const { user, onLeaveCampaign } = setup()
    await user.click(screen.getByRole('button', { name: 'Leave campaign' }))

    expect(screen.getByRole('group', { name: 'Confirm leaving the campaign' })).toHaveTextContent(
      "Leave The Red Hand? You'll lose access until the owner invites you again. Your characters are kept and leave the party.",
    )
    expect(screen.getByRole('button', { name: 'Yes, leave campaign' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Stay in campaign' }))
    expect(screen.getByRole('button', { name: 'Leave campaign' })).toHaveFocus()
    expect(onLeaveCampaign).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Leave campaign' }))
    await user.click(screen.getByRole('button', { name: 'Yes, leave campaign' }))
    expect(onLeaveCampaign).toHaveBeenCalledTimes(1)
  })

  it('says how many shared adventures leaving takes the player out of, and nothing when none', async () => {
    for (const [count, sentence] of [
      [1, 'You’ll leave 1 shared adventure. Rejoining the campaign won’t bring you back into it.'],
      [
        3,
        'You’ll leave 3 shared adventures. Rejoining the campaign won’t bring you back into them.',
      ],
    ] as const) {
      const { user } = setup({ sharedAdventureCount: count })
      await user.click(screen.getByRole('button', { name: 'Leave campaign' }))
      expect(screen.getByRole('group', { name: 'Confirm leaving the campaign' })).toHaveTextContent(
        `Your characters are kept and leave the party. ${sentence}`,
      )
      cleanup()
    }
    for (const count of [0, undefined]) {
      const { user } = setup({ sharedAdventureCount: count })
      await user.click(screen.getByRole('button', { name: 'Leave campaign' }))
      expect(
        screen.getByRole('group', { name: 'Confirm leaving the campaign' }),
      ).not.toHaveTextContent('shared adventure')
      cleanup()
    }
  })

  it('disables the controls and shows pending labels while a request is in flight', async () => {
    const { user } = setup({ isOwner: true })
    await user.click(screen.getByRole('button', { name: 'Remove player_two from the campaign' }))
    cleanup()
    // Re-render pending from an open confirmation.
    function Pending() {
      const [confirmation, setConfirmation] = useState<MembershipConfirmation | null>({
        type: 'remove',
        profileId: 'ally',
      })
      return (
        <CampaignPartyMembers
          campaignName="The Red Hand"
          confirmation={confirmation}
          error={null}
          isOwner
          onConfirmationChange={setConfirmation}
          onLeaveCampaign={vi.fn()}
          onRemoveMember={vi.fn()}
          onRetry={vi.fn()}
          pendingAction="remove"
          pendingProfileId="ally"
          roster={roster}
          status="success"
        />
      )
    }
    render(<Pending />)
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep player_two' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Remove this player from the campaign' }),
    ).toBeDisabled()
  })

  it('shows a pending leave label', () => {
    function Pending() {
      const [confirmation, setConfirmation] = useState<MembershipConfirmation | null>({
        type: 'leave',
      })
      return (
        <CampaignPartyMembers
          campaignName="The Red Hand"
          confirmation={confirmation}
          error={null}
          isOwner={false}
          onConfirmationChange={setConfirmation}
          onLeaveCampaign={vi.fn()}
          onRemoveMember={vi.fn()}
          onRetry={vi.fn()}
          pendingAction="leave"
          pendingProfileId={null}
          roster={roster}
          status="success"
        />
      )
    }
    render(<Pending />)
    expect(screen.getByRole('button', { name: 'Leaving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stay in campaign' })).toBeDisabled()
  })

  it('announces an error as an alert', () => {
    setup({
      isOwner: true,
      error: "We couldn't remove this player. Check your connection and try again.",
    })
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't remove this player.")
  })

  it('keeps the loading, error, and empty states', async () => {
    const loading = setup({ status: 'pending' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign members…')
    cleanup()

    const failed = setup({ status: 'error' })
    expect(screen.getByRole('alert')).toHaveTextContent('Campaign members could not be loaded.')
    await failed.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(failed.onRetry).toHaveBeenCalledTimes(1)
    cleanup()

    setup({ roster: [] })
    expect(screen.getByText('No member information is available.')).toBeVisible()
    expect(loading.onRetry).not.toHaveBeenCalled()
  })
})
