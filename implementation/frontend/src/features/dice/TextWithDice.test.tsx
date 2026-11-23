import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpellList } from '../characters/SpellList'
import { unavailableDice } from './diceContext'
import { formatSpec } from './diceNotation'
import { DiceText } from './TextWithDice'
import { useDice } from './useDice'

vi.mock('./useDice', () => ({ useDice: vi.fn(), useDiceScope: vi.fn() }))

const rollMock = vi.fn()

beforeEach(() => {
  rollMock.mockReset()
  rollMock.mockResolvedValue({ ok: true })
  vi.mocked(useDice).mockReturnValue({ ...unavailableDice, inCampaign: true, roll: rollMock })
})
afterEach(cleanup)

describe('DiceText', () => {
  it('turns dice into chips and leaves every word as written', () => {
    const text = 'A bright streak deals 8d6 fire damage; heals 1d8 + 3 hit points.'
    const { container } = render(<DiceText text={text} />)
    expect(container).toHaveTextContent(text)
    expect(screen.getAllByRole('button').map((chip) => chip.textContent)).toEqual([
      '8d6',
      '1d8 + 3',
    ])
  })

  it('makes no chip for modifiers or prose that only looks like dice', () => {
    const text = 'A +5 longsword, a 3d printer, the d-day plan, AC 15, 2d6s.'
    const { container } = render(<DiceText text={text} />)
    expect(container).toHaveTextContent(text)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders plain text and nothing as they are', () => {
    const { container, rerender } = render(<DiceText text="No dice here." />)
    expect(container).toHaveTextContent('No dice here.')
    rerender(<DiceText text="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rolls a chip as yourself, with the text as its source and a label from its context', async () => {
    render(<DiceText context="Fireball" text="Deals 8d6 fire." />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Roll 8d6 for Fireball' }))
    expect(rollMock).toHaveBeenCalledTimes(1)
    const request = rollMock.mock.calls[0][0]
    expect(request).toMatchObject({
      label: 'Fireball — 8d6',
      source: 'text',
      characterId: null,
      mode: 'normal',
    })
    expect(formatSpec(request.spec)).toBe('8d6')
  })

  it('names your character on your own sheet’s text only', async () => {
    render(<DiceText characterId="ch-1" text="Sneak attack 3d6." />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Roll 3d6' }))
    expect(rollMock.mock.calls[0][0]).toMatchObject({ label: '3d6', characterId: 'ch-1' })
  })

  it('has the roll menu: advantage on a d20, private in a campaign', () => {
    render(<DiceText text="Roll a d20 to hit." />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roll d20' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Roll with advantage',
      'Roll with disadvantage',
      'Roll privately',
    ])
  })

  it('rolls a spaced notation once, normalised in its name', async () => {
    render(<DiceText text="Deals 2d6   +  3 force." />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Roll 2d6 + 3' }))
    expect(formatSpec(rollMock.mock.calls[0][0].spec)).toBe('2d6 + 3')
  })
})

describe('dice in the spell list', () => {
  const spells = `Cantrips: Fire Bolt (1d10 fire)\n1st level (4 slots): Cure Wounds (1d8 + 3 healing)\n3rd level (2 slots): Fireball (8d6 fire)`

  it('makes chips of dice in a spell’s detail, named for the spell', async () => {
    render(<SpellList characterId="ch-1" text={spells} />)
    const fireball = screen.getByRole('button', { name: 'Roll 8d6 for Fireball' })
    await userEvent.setup().click(fireball)
    expect(rollMock.mock.calls[0][0]).toMatchObject({
      label: 'Fireball — 8d6',
      characterId: 'ch-1',
      source: 'text',
    })
    expect(screen.getByRole('button', { name: 'Roll 1d10 for Fire Bolt' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Roll 1d8 + 3 for Cure Wounds' })).toBeVisible()
  })

  it('leaves dice as plain words when the text is not rollable', () => {
    render(
      <>
        <DiceText rollable={false} text="Deals 2d6 fire." />
        <SpellList rollable={false} text="Cantrips: Fire Bolt (1d10)" />
        <SpellList rollable={false} text="Wild surge: roll 1d100." />
      </>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Deals 2d6 fire.')).toBeVisible()
    expect(screen.getByText(/Wild surge: roll 1d100\./)).toBeVisible()
  })

  it('also reads dice in text it could not place', () => {
    render(<SpellList text="Wild surge on a natural 1: roll 1d100." />)
    expect(screen.getByRole('button', { name: 'Roll 1d100' })).toBeVisible()
  })
})
