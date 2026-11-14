import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CharacterCoins, type CoinActions } from './CharacterCoins'

afterEach(cleanup)

const characterId = '00000000-0000-4000-8000-000000000021'
const purse = { cp: 7, sp: 12, gp: 1234 }

function setup(overrides: Partial<CoinActions> = {}, withActions = true) {
  const actions: CoinActions = {
    adjustCurrency: vi.fn().mockResolvedValue(true),
    pendingAction: null,
    pendingCharacterId: null,
    ...overrides,
  }
  const onNotice = vi.fn()
  const view = render(
    <CharacterCoins
      actions={withActions ? actions : undefined}
      characterId={characterId}
      onNotice={onNotice}
      purse={purse}
    />,
  )
  return { actions, onNotice, user: userEvent.setup(), ...view }
}

describe('CharacterCoins balances', () => {
  it('shows each balance and the value in gold', () => {
    setup()
    const coin = (name: string) => document.querySelector(`[data-coin="${name}"]`)
    expect(coin('gp')).toHaveTextContent('Gold1,234 gp')
    expect(coin('sp')).toHaveTextContent('Silver12 sp')
    expect(coin('cp')).toHaveTextContent('Copper7 cp')
    expect(screen.getByText('≈ 1,235.27 gp in all')).toBeInTheDocument()
  })

  it('is read-only without actions', () => {
    setup({}, false)
    expect(document.querySelector('[data-coin="gp"]')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add or spend coins' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('CharacterCoins add and spend', () => {
  it('adds coins and announces them', async () => {
    const { actions, onNotice, user } = setup()
    await user.type(screen.getByLabelText(/Gold/), '5')
    await user.type(screen.getByLabelText(/Silver/), '3')
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: 0, sp: 3, gp: 5 })
    expect(onNotice).toHaveBeenCalledWith('Added 5 gp and 3 sp.')
    expect(screen.getByLabelText(/Gold/)).toHaveValue('')
  })

  it('spends coins as negative amounts', async () => {
    const { actions, onNotice, user } = setup()
    await user.type(screen.getByLabelText(/Silver/), '3')
    await user.type(screen.getByLabelText(/Copper/), '2')
    await user.click(screen.getByRole('button', { name: 'Spend coins' }))
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: -2, sp: -3, gp: -0 })
    expect(onNotice).toHaveBeenCalledWith('Spent 3 sp and 2 cp.')
  })

  it('lists three amounts with commas and an and', async () => {
    const { onNotice, user } = setup()
    await user.type(screen.getByLabelText(/Gold/), '1500')
    await user.type(screen.getByLabelText(/Silver/), '3')
    await user.type(screen.getByLabelText(/Copper/), '2')
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    expect(onNotice).toHaveBeenCalledWith('Added 1,500 gp, 3 sp and 2 cp.')
  })

  it('adds when Enter is pressed in a field', async () => {
    const { actions, user } = setup()
    await user.type(screen.getByLabelText(/Gold/), '4{Enter}')
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: 0, sp: 0, gp: 4 })
  })

  it('keeps what was typed and says nothing when the save fails', async () => {
    const { onNotice, user } = setup({ adjustCurrency: vi.fn().mockResolvedValue(false) })
    await user.type(screen.getByLabelText(/Gold/), '9')
    await user.click(screen.getByRole('button', { name: 'Spend coins' }))
    expect(screen.getByLabelText(/Gold/)).toHaveValue('9')
    expect(onNotice).not.toHaveBeenCalled()
  })
})

describe('CharacterCoins validation', () => {
  it('asks for an amount when every field is empty', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount for at least one coin.')
    expect(actions.adjustCurrency).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Gold/)).toHaveFocus()
  })

  it('marks and focuses the first field that is not a whole number', async () => {
    const { actions, user } = setup()
    await user.type(screen.getByLabelText(/Gold/), '5')
    await user.type(screen.getByLabelText(/Silver/), '1.5')
    await user.type(screen.getByLabelText(/Copper/), '-2')
    await user.click(screen.getByRole('button', { name: 'Spend coins' }))
    const silver = screen.getByLabelText(/Silver/)
    expect(silver).toHaveFocus()
    expect(silver).toBeInvalid()
    expect(silver).toHaveAccessibleDescription('Enter a whole number up to 9,999,999.')
    expect(screen.getByLabelText(/Copper/)).toBeInvalid()
    expect(actions.adjustCurrency).not.toHaveBeenCalled()
  })

  it('clears the errors when the input changes', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    await user.type(screen.getByLabelText(/Gold/), '1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CharacterCoins pending state', () => {
  it('shows the adding label and locks the fields while saving', async () => {
    const { rerender, user, actions, onNotice } = setup()
    await user.type(screen.getByLabelText(/Gold/), '2')
    // The label follows the button that was pressed.
    let resolve: (ok: boolean) => void = () => {}
    vi.mocked(actions.adjustCurrency).mockReturnValue(new Promise((done) => (resolve = done)))
    const click = user.click(screen.getByRole('button', { name: 'Add coins' }))
    await click
    rerender(
      <CharacterCoins
        actions={{ ...actions, pendingAction: 'currency', pendingCharacterId: characterId }}
        characterId={characterId}
        onNotice={onNotice}
        purse={purse}
      />,
    )
    expect(screen.getByRole('button', { name: 'Adding…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Spend coins' })).toBeDisabled()
    expect(screen.getByLabelText(/Gold/)).toBeDisabled()
    resolve(true)
  })

  it('is not affected by another character’s pending action', () => {
    setup({ pendingAction: 'currency', pendingCharacterId: 'someone-else' })
    expect(screen.getByRole('button', { name: 'Add coins' })).toBeEnabled()
  })
})
