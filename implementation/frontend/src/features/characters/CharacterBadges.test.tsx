import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CharacterBadges } from './CharacterBadges'
import { character } from './characterTestData'

afterEach(cleanup)

describe('CharacterBadges', () => {
  it('shows lifecycle and party as separate badges', () => {
    render(<CharacterBadges character={character({ status: 'retired', in_party: false })} />)
    const list = screen.getByRole('list', { name: 'Character standing' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText(/^Retired /)).toBeInTheDocument()
    expect(within(list).getByText('Not in the party')).toBeInTheDocument()
  })

  it('shows an active character in the party, and sharing on request', () => {
    render(<CharacterBadges character={character({ sheet_visibility: 'campaign' })} showSharing />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('In the party')).toBeInTheDocument()
    expect(screen.getByText('Sheet shared')).toBeInTheDocument()
  })
})
