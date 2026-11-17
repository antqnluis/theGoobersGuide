import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from './characterTestData'
import type { CharacterAdventureCounts } from '../adventures/adventureTypes'
import type { CharacterSummary } from './characterTypes'
import { CharacterStatusControls, type CharacterConfirmation } from './CharacterStatusControls'
import type { CharacterAction } from './useCharacterActions'

afterEach(cleanup)

function Harness({
  subject,
  pendingAction = null,
  handlers,
  adventureCounts,
}: {
  subject: CharacterSummary
  adventureCounts?: CharacterAdventureCounts
  pendingAction?: CharacterAction | null
  handlers: Record<
    'onChangeStatus' | 'onChangeParty' | 'onChangeVisibility' | 'onDelete',
    () => void
  >
}) {
  const [confirmation, setConfirmation] = useState<CharacterConfirmation | null>(null)
  return (
    <CharacterStatusControls
      character={subject}
      confirmation={confirmation}
      onConfirmationChange={setConfirmation}
      pendingAction={pendingAction}
      pendingCharacterId={pendingAction ? subject.id : null}
      adventureCounts={adventureCounts}
      {...handlers}
    />
  )
}

function setup(
  subject = character(),
  pendingAction: CharacterAction | null = null,
  adventureCounts?: CharacterAdventureCounts,
) {
  const handlers = {
    onChangeStatus: vi.fn(),
    onChangeParty: vi.fn(),
    onChangeVisibility: vi.fn(),
    onDelete: vi.fn(),
  }
  render(
    <Harness
      adventureCounts={adventureCounts}
      handlers={handlers}
      pendingAction={pendingAction}
      subject={subject}
    />,
  )
  return { handlers, user: userEvent.setup() }
}

describe('CharacterStatusControls', () => {
  it('offers party, sharing, retire, mark deceased, and delete for an active character', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Leave the party' })).toBeInTheDocument()
    expect(screen.getByLabelText('Share sheet with campaign members')).not.toBeChecked()
    expect(screen.getByLabelText('Share sheet with campaign members')).toHaveAccessibleDescription(
      'Members can see this sheet, including coins and inventory.',
    )
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark deceased' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete character' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return to active' })).not.toBeInTheDocument()
  })

  it('joins and leaves the party without a confirmation', async () => {
    const out = setup(character({ in_party: false }))
    await out.user.click(screen.getByRole('button', { name: 'Join the party' }))
    expect(out.handlers.onChangeParty).toHaveBeenCalledWith(true)
  })

  it('hides the party control for retired and deceased characters', () => {
    setup(character({ status: 'retired', in_party: false }))
    expect(screen.queryByRole('button', { name: /the party/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark deceased' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument()
  })

  it('lets a deceased character be marked retired or returned to active', () => {
    setup(character({ status: 'deceased', in_party: false }))
    expect(screen.getByRole('button', { name: 'Mark retired' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to active' })).toBeInTheDocument()
  })

  it('toggles sharing directly, reflecting the current visibility', async () => {
    const out = setup(character({ sheet_visibility: 'campaign' }))
    const share = screen.getByLabelText('Share sheet with campaign members')
    expect(share).toBeChecked()
    await out.user.click(share)
    expect(out.handlers.onChangeVisibility).toHaveBeenCalledWith('private')
  })

  it.each([
    [
      'Retire',
      'retired',
      /Retire Brand\? They'll leave the party and be kept as history/,
      'Yes, retire',
    ],
    ['Mark deceased', 'deceased', /Mark Brand as deceased\?/, 'Yes, mark deceased'],
  ])('confirms %s inline before changing status', async (trigger, status, copy, yes) => {
    const out = setup()
    await out.user.click(screen.getByRole('button', { name: trigger }))
    const group = screen.getByRole('group', { name: `Confirm: ${trigger}` })
    expect(group).toHaveTextContent(copy)
    expect(screen.getByRole('button', { name: yes })).toHaveFocus()
    expect(out.handlers.onChangeStatus).not.toHaveBeenCalled()

    await out.user.click(screen.getByRole('button', { name: yes }))
    expect(out.handlers.onChangeStatus).toHaveBeenCalledWith(status)
  })

  it('confirms returning to active and says the party is not rejoined', async () => {
    const out = setup(character({ status: 'retired', in_party: false }))
    await out.user.click(screen.getByRole('button', { name: 'Return to active' }))
    expect(screen.getByRole('group')).toHaveTextContent("won't rejoin the party automatically")
    await out.user.click(screen.getByRole('button', { name: 'Yes, return to active' }))
    expect(out.handlers.onChangeStatus).toHaveBeenCalledWith('active')
  })

  it('cancelling a confirmation changes nothing and returns focus to its trigger', async () => {
    const out = setup()
    const trigger = screen.getByRole('button', { name: 'Retire' })
    await out.user.click(trigger)
    await out.user.click(screen.getByRole('button', { name: 'Keep Brand active' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retire' })).toHaveFocus()
    expect(out.handlers.onChangeStatus).not.toHaveBeenCalled()
  })

  it('confirms permanent deletion with the planned copy and buttons', async () => {
    const out = setup()
    await out.user.click(screen.getByRole('button', { name: 'Delete character' }))
    const group = screen.getByRole('group', { name: 'Confirm character deletion' })
    expect(group).toHaveTextContent(
      "Delete Brand permanently? Their sheet, inventory, and coins will be removed and this can't be undone. To keep them as history, retire them instead.",
    )
    expect(screen.getByRole('button', { name: 'Yes, delete character' })).toHaveFocus()
    expect(out.handlers.onDelete).not.toHaveBeenCalled()

    await out.user.click(screen.getByRole('button', { name: 'Keep Brand' }))
    expect(screen.getByRole('button', { name: 'Delete character' })).toHaveFocus()

    await out.user.click(screen.getByRole('button', { name: 'Delete character' }))
    await out.user.click(screen.getByRole('button', { name: 'Yes, delete character' }))
    expect(out.handlers.onDelete).toHaveBeenCalledTimes(1)
  })

  it('says what a delete does to adventures, each sentence only when its count is above zero', async () => {
    const cases: [{ sole: number; shared: number }, string][] = [
      [{ sole: 1, shared: 0 }, '1 adventure only it is in will be deleted.'],
      [{ sole: 3, shared: 0 }, '3 adventures only it is in will be deleted.'],
      [{ sole: 0, shared: 1 }, 'It will leave 1 shared adventure.'],
      [{ sole: 0, shared: 2 }, 'It will leave 2 shared adventures.'],
      [
        { sole: 1, shared: 2 },
        'It will leave 2 shared adventures. 1 adventure only it is in will be deleted.',
      ],
    ]
    for (const [counts, sentence] of cases) {
      const out = setup(character(), null, counts)
      await out.user.click(screen.getByRole('button', { name: 'Delete character' }))
      expect(screen.getByRole('group', { name: 'Confirm character deletion' })).toHaveTextContent(
        `removed and this can't be undone. ${sentence} To keep them as history, retire them instead.`,
      )
      cleanup()
    }
    for (const counts of [{ sole: 0, shared: 0 }, undefined]) {
      const out = setup(character(), null, counts)
      await out.user.click(screen.getByRole('button', { name: 'Delete character' }))
      expect(
        screen.getByRole('group', { name: 'Confirm character deletion' }),
      ).not.toHaveTextContent('adventure')
      cleanup()
    }
  })

  it('shows pending labels and disables everything while an action runs', async () => {
    const out = setup(character(), 'party')
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retire' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete character' })).toBeDisabled()
    expect(screen.getByLabelText('Share sheet with campaign members')).toBeDisabled()
    expect(out.handlers.onChangeParty).not.toHaveBeenCalled()
  })

  it('shows the deleting label while a delete runs', () => {
    render(
      <CharacterStatusControls
        character={character()}
        confirmation={{ type: 'delete', characterId: character().id }}
        onChangeParty={vi.fn()}
        onChangeStatus={vi.fn()}
        onChangeVisibility={vi.fn()}
        onConfirmationChange={vi.fn()}
        onDelete={vi.fn()}
        pendingAction="delete"
        pendingCharacterId={character().id}
      />,
    )
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep Brand' })).toBeDisabled()
  })

  it('ignores a confirmation that belongs to another character', () => {
    render(
      <CharacterStatusControls
        character={character()}
        confirmation={{ type: 'delete', characterId: 'someone-else' }}
        onChangeParty={vi.fn()}
        onChangeStatus={vi.fn()}
        onChangeVisibility={vi.fn()}
        onConfirmationChange={vi.fn()}
        onDelete={vi.fn()}
        pendingAction={null}
        pendingCharacterId={null}
      />,
    )
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
