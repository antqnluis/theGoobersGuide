import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCharacterSheet } from '../characters/characterService'
import { character, sheet, userId } from '../characters/characterTestData'
import type { CharacterSummary } from '../characters/characterTypes'
import { CampaignPartyMembers } from './CampaignPartyMembers'
import type { CampaignRosterMember } from './campaignTypes'

vi.mock('../characters/characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../characters/characterService')>()),
  getCharacterSheet: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
})

const ally = '00000000-0000-4000-8000-000000000002'
const warden = '00000000-0000-4000-8000-000000000003'
const roster: CampaignRosterMember[] = [
  { profile_id: warden, role: 'owner', username: 'game_master' },
  { profile_id: userId, role: 'member', username: 'me_myself' },
  { profile_id: ally, role: 'member', username: 'player_two' },
]

function Harness({
  characters,
  status = 'success',
}: {
  characters: CharacterSummary[]
  status?: 'pending' | 'error' | 'success'
}) {
  const [sheetId, setSheetId] = useState<string | null>(null)
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CampaignPartyMembers
        campaignName="The Red Hand"
        characters={characters}
        charactersStatus={status}
        confirmation={null}
        error={null}
        isOwner={false}
        onConfirmationChange={vi.fn()}
        onLeaveCampaign={vi.fn()}
        onRemoveMember={vi.fn()}
        onRetry={vi.fn()}
        onSheetChange={setSheetId}
        pendingAction={null}
        pendingProfileId={null}
        roster={roster}
        sheetCharacterId={sheetId}
        status="success"
        userId={userId}
      />
    </QueryClientProvider>
  )
}

const sorrel = character({
  id: 'sorrel',
  owner_id: ally,
  name: 'Sorrel',
  species: 'Gnome',
  class_name: 'Wizard',
  level: 5,
  sheet_visibility: 'campaign',
})
const brand = character({ id: 'brand', owner_id: userId, name: 'Brand' })
const dray = character({ id: 'dray', owner_id: warden, name: 'Dray', sheet_visibility: 'private' })

describe('Party panel characters', () => {
  it('lists each in-party character and counts the members who have one', () => {
    render(<Harness characters={[sorrel, brand]} />)
    expect(screen.getByText('2 of 3 members have a character in the party.')).toBeVisible()
    expect(screen.getByText('Sorrel')).toBeVisible()
    expect(screen.getByText(/Level 5 Gnome Wizard/)).toBeVisible()
    expect(screen.getByText('No character in the party')).toBeVisible()
  })

  it('ignores retired, deceased, and out-of-party characters', () => {
    render(
      <Harness
        characters={[
          { ...sorrel, status: 'retired', in_party: false },
          { ...brand, in_party: false },
          { ...dray, status: 'deceased', in_party: false },
        ]}
      />,
    )
    expect(screen.getByText('0 of 3 members have a character in the party.')).toBeVisible()
    expect(screen.getAllByText('No character in the party')).toHaveLength(3)
    expect(screen.queryByText('Sorrel')).toBeNull()
  })

  it('shows no character lines or count until characters have loaded', () => {
    const pending = render(<Harness characters={[]} status="pending" />)
    expect(screen.queryByText(/character in the party/)).toBeNull()
    pending.unmount()
    render(<Harness characters={[]} status="error" />)
    expect(screen.queryByText(/character in the party/)).toBeNull()
    expect(screen.getByText('game_master')).toBeVisible()
  })

  it('offers View sheet for shared and own sheets only', () => {
    render(<Harness characters={[sorrel, brand, dray]} />)
    expect(screen.getByRole('button', { name: "View Sorrel's sheet" })).toBeVisible()
    expect(screen.getByRole('button', { name: "View Brand's sheet" })).toBeVisible()
    expect(screen.queryByRole('button', { name: /View Dray/ })).toBeNull()
  })

  it('opens a shared sheet read-only, then returns focus to its button', async () => {
    const user = userEvent.setup()
    render(<Harness characters={[sorrel]} />)
    const trigger = screen.getByRole('button', { name: "View Sorrel's sheet" })
    await user.click(trigger)

    expect(await screen.findByRole('heading', { name: 'Sorrel' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Vitals' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Edit character|Save/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'People in this campaign' })).toBeInTheDocument()
    expect(getCharacterSheet).toHaveBeenCalledWith('sorrel')

    await user.click(screen.getByRole('button', { name: 'Back to party' }))
    expect(screen.getByRole('button', { name: "View Sorrel's sheet" })).toHaveFocus()
  })

  it('says the sheet is gone when the character is no longer visible', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness characters={[sorrel]} />)
    await user.click(screen.getByRole('button', { name: "View Sorrel's sheet" }))
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeVisible()
    rerender(<Harness characters={[]} />)
    expect(screen.getByText('This sheet is no longer available.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Back to party' })).toBeVisible()
  })

  it('says the sheet is gone when its owner stops sharing it', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness characters={[sorrel]} />)
    await user.click(screen.getByRole('button', { name: "View Sorrel's sheet" }))
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeVisible()
    rerender(<Harness characters={[{ ...sorrel, sheet_visibility: 'private' }]} />)
    expect(screen.getByText('This sheet is no longer available.')).toBeVisible()
  })
})
