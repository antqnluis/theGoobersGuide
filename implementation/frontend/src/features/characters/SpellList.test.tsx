import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SpellList } from './SpellList'

afterEach(cleanup)

describe('SpellList', () => {
  it('says so when nothing is recorded', () => {
    render(<SpellList text="" />)
    expect(screen.getByText('Nothing recorded.')).toBeInTheDocument()
  })

  it('shows a card per group with its slots, count, and spells', () => {
    render(
      <SpellList
        text={'Cantrips: Light, Mage Hand\n1st level (3 slots): Shield, Bless (concentration)'}
      />,
    )
    const cantrips = screen.getByRole('region', { name: 'Cantrips' })
    expect(within(cantrips).getByRole('heading', { name: 'Cantrips' })).toBeInTheDocument()
    expect(within(cantrips).getByText('2 spells')).toBeInTheDocument()
    expect(
      within(cantrips)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Light', 'Mage Hand'])

    const first = screen.getByRole('region', { name: '1st level' })
    expect(within(first).getByText('3 slots')).toBeInTheDocument()
    const bless = within(first).getByText('Bless').closest('li')
    expect(bless).toHaveTextContent('Bless(concentration)')
  })

  it('shows text it cannot place as written, and spells as plain text', () => {
    render(<SpellList text={'Spellcasting ability: Wisdom\n1st level: <b>Shield</b>'} />)
    expect(screen.getByText('Spellcasting ability: Wisdom')).toBeInTheDocument()
    expect(screen.getByText('<b>Shield</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('counts a single spell in the singular', () => {
    render(<SpellList text="Cantrips: Light" />)
    expect(screen.getByText('1 spell')).toBeInTheDocument()
  })
})
