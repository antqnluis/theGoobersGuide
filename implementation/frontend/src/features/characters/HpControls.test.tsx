import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { d20Spec } from '../dice/diceSpecs'
import { HpControls } from './HpControls'

afterEach(cleanup)

const characterId = 'c1'
const hp = { max_hp: 20, current_hp: 12, temp_hp: 0 }
const change = (overrides = {}) => ({
  current_hp: 9,
  temp_hp: 0,
  death_save_successes: 0,
  death_save_failures: 0,
  damage_taken: 3,
  concentration: null,
  updated_at: 'stamp',
  ...overrides,
})

function setup(props: Partial<React.ComponentProps<typeof HpControls>> = {}) {
  const live = { changeHp: vi.fn().mockResolvedValue(change()) }
  render(<HpControls characterId={characterId} hp={hp} live={live as never} {...props} />)
  return { live, user: userEvent.setup() }
}

describe('HpControls display', () => {
  it('shows current, maximum, and temporary HP', () => {
    render(<HpControls characterId={characterId} hp={{ ...hp, temp_hp: 4 }} />)
    const group = screen.getByRole('group', { name: 'Hit points' })
    expect(group).toHaveTextContent('12 / 20')
    expect(group).toHaveTextContent('+4 temp')
  })

  it('has no controls without live actions', () => {
    render(<HpControls characterId={characterId} hp={hp} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()
  })

  it('says when HP is not set, and leaves only temporary HP usable', () => {
    setup({ hp: { max_hp: null, current_hp: null, temp_hp: 0 } })
    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Damage' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Heal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Temp HP' })).toBeEnabled()
    expect(screen.getByText(/Set maximum and current HP in Edit character/)).toBeInTheDocument()
  })
})

describe('HpControls taps', () => {
  it.each([
    ['Damage', 'damage'],
    ['Heal', 'heal'],
    ['Temp HP', 'temp'],
  ])('%s sends the typed amount and clears the field', async (name, kind) => {
    const { live, user } = setup()
    await user.type(screen.getByLabelText('Amount'), '7')
    await user.click(screen.getByRole('button', { name }))
    expect(live.changeHp).toHaveBeenCalledWith(characterId, kind, 7)
    expect(screen.getByLabelText('Amount')).toHaveValue('')
    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('announces what happened', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Amount'), '3')
    await user.click(screen.getByRole('button', { name: 'Damage' }))
    expect(await screen.findByText('Took 3 damage. 9 hit points.')).toBeInTheDocument()
  })

  it('refuses an amount that is not a whole number from 1 to 9,999', async () => {
    const { live, user } = setup()
    for (const text of ['', '0', 'abc', '1.5', '10000']) {
      await user.clear(screen.getByLabelText('Amount'))
      if (text) await user.type(screen.getByLabelText('Amount'), text)
      await user.click(screen.getByRole('button', { name: 'Heal' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a whole number from 1 to 9,999.',
      )
    }
    expect(live.changeHp).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '2')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says nothing when the call failed', async () => {
    const { live, user } = setup()
    live.changeHp.mockResolvedValue(undefined)
    await user.type(screen.getByLabelText('Amount'), '3')
    await user.click(screen.getByRole('button', { name: 'Damage' }))
    expect(screen.queryByText(/hit points\./)).not.toBeInTheDocument()
  })
})

describe('HpControls concentration prompt', () => {
  const roll = (dc: number) => ({
    label: `Concentration save (DC ${dc})`,
    spec: d20Spec(2),
    source: 'save' as const,
    characterId,
  })

  it('offers the save after damage while concentrating, with the DC from the damage', async () => {
    const { live, user } = setup({ concentrationRoll: roll })
    live.changeHp.mockResolvedValue(change({ damage_taken: 8, concentration: 'Bless' }))
    await user.type(screen.getByLabelText('Amount'), '8')
    await user.click(screen.getByRole('button', { name: 'Damage' }))
    expect(await screen.findByText(/Concentrating on/)).toBeInTheDocument()
    expect(screen.getByText(/Constitution save, DC 10/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Roll Concentration save (DC 10)' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Concentrating on/)).not.toBeInTheDocument()
  })

  it('uses half the damage when that is higher than 10', async () => {
    const live = {
      changeHp: vi.fn().mockResolvedValue(change({ damage_taken: 30, concentration: 'Bless' })),
    }
    const user = userEvent.setup()
    render(
      <HpControls
        characterId={characterId}
        concentrationRoll={roll}
        hp={hp}
        live={live as never}
      />,
    )
    await user.type(screen.getByLabelText('Amount'), '30')
    await user.click(screen.getByRole('button', { name: 'Damage' }))
    expect(await screen.findByText(/Constitution save, DC 15/)).toBeInTheDocument()
    expect(screen.getByText('Bless')).toBeInTheDocument()
  })

  it('stays quiet when no damage got past temp HP, or nothing is being concentrated on', async () => {
    const live = { changeHp: vi.fn() }
    const user = userEvent.setup()
    render(<HpControls characterId={characterId} hp={hp} live={live as never} />)
    live.changeHp.mockResolvedValue(change({ damage_taken: 0, concentration: 'Bless' }))
    await user.type(screen.getByLabelText('Amount'), '2')
    await user.click(screen.getByRole('button', { name: 'Damage' }))
    live.changeHp.mockResolvedValue(change({ damage_taken: 5, concentration: null }))
    await user.type(screen.getByLabelText('Amount'), '5')
    await user.click(screen.getByRole('button', { name: 'Damage' }))
    expect(screen.queryByText(/Concentrating on/)).not.toBeInTheDocument()
  })
})
