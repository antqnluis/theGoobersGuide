import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterCoins, type CoinActions } from './CharacterCoins'
import type { CoinTransaction } from './characterTypes'
import { listCoinTransactions } from './inventoryService'

vi.mock('./inventoryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventoryService')>()),
  listCoinTransactions: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const characterId = '00000000-0000-4000-8000-000000000021'
const userId = '00000000-0000-4000-8000-000000000001'
const purse = { cp: 7, sp: 12, gp: 1234 }

function setup(overrides: Partial<CoinActions> = {}, withActions = true, startingPurse = purse) {
  const actions: CoinActions = {
    adjustCurrency: vi.fn().mockResolvedValue(true),
    pendingAction: null,
    pendingCharacterId: null,
    ...overrides,
  }
  const onNotice = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <CharacterCoins
        actions={withActions ? actions : undefined}
        characterId={characterId}
        onNotice={onNotice}
        purse={startingPurse}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { actions, client, onNotice, user: userEvent.setup(), ...view }
}

describe('CharacterCoins balances', () => {
  it('shows each balance and the value in gold', () => {
    setup()
    const coin = (name: string) => document.querySelector(`[data-coin="${name}"]`)
    expect(coin('gp')).toHaveTextContent('Gold1,234 gp')
    expect(coin('sp')).toHaveTextContent('Silver12 sp')
    expect(coin('cp')).toHaveTextContent('Copper7 cp')
    expect(screen.getByText('Worth 1,235 gp, 2 sp and 7 cp in all')).toBeInTheDocument()
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
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: -2, sp: -3, gp: 0 })
    expect(onNotice).toHaveBeenCalledWith('Spent 3 sp and 2 cp.')
  })

  it('makes change from a larger coin when the one being spent is short', async () => {
    const { actions, onNotice, user } = setup({}, true, { cp: 0, sp: 0, gp: 3 })
    await user.type(screen.getByLabelText(/Silver/), '5')
    await user.click(screen.getByRole('button', { name: 'Spend coins' }))
    // Pay 1 gp, take 5 sp back.
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: 0, sp: 5, gp: -1 })
    expect(onNotice).toHaveBeenCalledWith('Spent 5 sp (made change from 1 gp).')
  })

  it('sends the plain amounts when the purse cannot cover them, so the database refuses', async () => {
    const { actions, onNotice, user } = setup({}, true, { cp: 0, sp: 1, gp: 0 })
    await user.type(screen.getByLabelText(/Gold/), '1')
    await user.click(screen.getByRole('button', { name: 'Spend coins' }))
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: 0, sp: 0, gp: -1 })
    expect(onNotice).toHaveBeenCalledWith('Spent 1 gp.')
  })

  it('does not convert when adding', async () => {
    const { actions, user } = setup({}, true, { cp: 0, sp: 0, gp: 3 })
    await user.type(screen.getByLabelText(/Silver/), '5')
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    expect(actions.adjustCurrency).toHaveBeenCalledWith(characterId, { cp: 0, sp: 5, gp: 0 })
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
    const { rerender, user, actions, client, onNotice } = setup()
    await user.type(screen.getByLabelText(/Gold/), '2')
    // The label follows the button that was pressed.
    let resolve: (ok: boolean) => void = () => {}
    vi.mocked(actions.adjustCurrency).mockReturnValue(new Promise((done) => (resolve = done)))
    const click = user.click(screen.getByRole('button', { name: 'Add coins' }))
    await click
    rerender(
      <QueryClientProvider client={client}>
        <CharacterCoins
          actions={{ ...actions, pendingAction: 'currency', pendingCharacterId: characterId }}
          characterId={characterId}
          onNotice={onNotice}
          purse={purse}
          userId={userId}
        />
      </QueryClientProvider>,
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

function transaction(overrides: Partial<CoinTransaction> = {}): CoinTransaction {
  return {
    id: 'tx-1',
    seq: 1,
    character_id: characterId,
    created_at: '2026-11-14T10:30:00+00:00',
    cp_delta: 0,
    sp_delta: 0,
    gp_delta: 10,
    cp_after: 0,
    sp_after: 0,
    gp_after: 10,
    ...overrides,
  }
}

describe('CharacterCoins recent transactions', () => {
  it('is collapsed and asks for nothing until it is opened', () => {
    setup()
    const details = screen.getByText('Recent transactions').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(listCoinTransactions).not.toHaveBeenCalled()
  })

  it('shows each change with its arithmetic, newest first, once opened', async () => {
    vi.mocked(listCoinTransactions).mockResolvedValue([
      transaction({
        id: 'b',
        seq: 2,
        sp_delta: 5,
        gp_delta: -1,
        sp_after: 5,
        gp_after: 2,
      }),
      transaction(),
    ])
    const { user } = setup()
    await user.click(screen.getByText('Recent transactions'))
    const list = await screen.findByRole('list', { name: 'Recent transactions' })
    const entries = within(list)
      .getAllByRole('listitem')
      .filter((entry) => entry.parentElement === list)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('Spent 5 sp (made change)')
    expect(entries[0]).toHaveTextContent('3 → 2 gp (−1)')
    expect(entries[0]).toHaveTextContent('0 → 5 sp (+5)')
    expect(entries[0]).toHaveTextContent('Purse after: 2 gp and 5 sp')
    expect(entries[1]).toHaveTextContent('Added 10 gp')
    expect(entries[1]).toHaveTextContent('0 → 10 gp (+10)')
    expect(entries[0].querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-11-14T10:30:00+00:00',
    )
    expect(listCoinTransactions).toHaveBeenCalledWith(characterId)
  })

  it('says when there are no transactions yet', async () => {
    vi.mocked(listCoinTransactions).mockResolvedValue([])
    const { user } = setup()
    await user.click(screen.getByText('Recent transactions'))
    expect(await screen.findByText('No transactions yet.')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    vi.mocked(listCoinTransactions).mockRejectedValueOnce(new Error('network'))
    const { user } = setup()
    await user.click(screen.getByText('Recent transactions'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The transactions could not be loaded.',
    )
    vi.mocked(listCoinTransactions).mockResolvedValue([transaction()])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Added 10 gp')).toBeInTheDocument()
  })

  it('is available to viewers who cannot change the purse', async () => {
    vi.mocked(listCoinTransactions).mockResolvedValue([transaction()])
    const { user } = setup({}, false)
    await user.click(screen.getByText('Recent transactions'))
    expect(await screen.findByText('Added 10 gp')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add or spend coins' })).not.toBeInTheDocument()
  })
})
