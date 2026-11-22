import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiceScope } from './diceContext'
import { DiceDock } from './DiceDock'
import { DiceProvider } from './DiceProvider'
import type { DiceRollRecord } from './diceRules'
import { listRolls, rollInCampaign } from './diceService'
import { useDice, useDiceScope } from './useDice'

type InsertHandler = (payload: { new: unknown }) => void
type StatusHandler = (status: string) => void

const channel = vi.hoisted(() => ({
  onInsert: null as InsertHandler | null,
  onStatus: null as StatusHandler | null,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const instance = {
        on: (_type: string, _filter: unknown, handler: InsertHandler) => {
          channel.onInsert = handler
          return instance
        },
        subscribe: (handler: StatusHandler) => {
          channel.onStatus = handler
          queueMicrotask(() => handler('SUBSCRIBED'))
          return instance
        },
      }
      return instance
    }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('./diceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./diceService')>()),
  rollInCampaign: vi.fn(),
  listRolls: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const me = '00000000-0000-4000-8000-000000000001'
const mira = '00000000-0000-4000-8000-000000000002'
const miraCharacter = '00000000-0000-4000-8000-000000000021'

const scope: DiceScope = {
  campaignId,
  userId: me,
  memberNames: new Map([
    [me, 'Me'],
    [mira, 'Mira'],
  ]),
  characterNames: new Map([[miraCharacter, 'Sable']]),
}

let counter = 0
function stored(overrides: Partial<DiceRollRecord> = {}): DiceRollRecord {
  counter += 1
  return {
    id: `roll-${counter}`,
    campaign_id: campaignId,
    roller_id: me,
    character_id: null,
    visibility: 'campaign',
    source: 'tray',
    label: null,
    expression: '1d20',
    terms: [{ kind: 'dice', sign: 1, count: 1, sides: 20 }],
    dice: [[{ value: 12, kept: true }]],
    total: 12,
    created_at: new Date(2026, 10, 22, 14, 30, counter).toISOString(),
    ...overrides,
  }
}

/** Answers `roll_dice` with a stored roll that reflects what was asked. */
function answerRolls() {
  vi.mocked(rollInCampaign).mockImplementation(async (input) =>
    stored({
      visibility: input.visibility,
      source: input.source,
      label: input.label,
      character_id: input.characterId,
      terms: input.spec.terms,
      dice: input.spec.terms.map((term) =>
        term.kind === 'dice'
          ? Array.from({ length: term.count }, (_, index) => ({ value: index + 7, kept: true }))
          : [],
      ),
      total: 19,
    }),
  )
}

function Scope({ value }: { value: DiceScope | null }) {
  useDiceScope(value)
  return null
}

/** A stand-in for a sheet's roll button, so a roll can be made with the tray shut. */
function SheetRoll() {
  const dice = useDice()
  return (
    <button
      onClick={() => void dice.roll({ text: '1d20 + 5', label: 'Stealth check', source: 'skill' })}
      type="button"
    >
      Roll Stealth
    </button>
  )
}

function renderDock(value: DiceScope | null = scope) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DiceProvider>
        <Scope value={value} />
        <SheetRoll />
        <DiceDock />
      </DiceProvider>
    </QueryClientProvider>,
  )
}

async function openTray(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: /^Dice/ }))
  return { user, tray: screen.getByRole('region', { name: 'Dice tray' }) }
}

beforeEach(() => {
  channel.onInsert = null
  channel.onStatus = null
  vi.mocked(rollInCampaign).mockReset()
  vi.mocked(listRolls).mockReset()
  vi.mocked(listRolls).mockResolvedValue([])
})

afterEach(() => cleanup())

describe('outside a campaign', () => {
  it('rolls on this device and says it is not saved', async () => {
    renderDock(null)
    const { user, tray } = await openTray()
    expect(within(tray).getByText('On this device only — not saved')).toBeInTheDocument()
    expect(within(tray).getByText('Nothing rolled yet')).toBeInTheDocument()
    expect(within(tray).queryByLabelText('Only I can see my rolls')).not.toBeInTheDocument()

    await user.click(within(tray).getByRole('button', { name: 'd6' }))
    expect((await within(tray).findAllByText('Not saved')).length).toBeGreaterThan(0)
    expect(rollInCampaign).not.toHaveBeenCalled()
    const log = within(tray).getByRole('heading', { name: 'This device' }).parentElement!
    expect(within(log).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})

describe('rolling at the table', () => {
  it('sends a typed roll with advantage applied to the d20', async () => {
    answerRolls()
    renderDock()
    const { user, tray } = await openTray()
    await user.type(within(tray).getByRole('textbox', { name: 'Roll' }), '1d20 + 5')
    await user.click(within(tray).getByRole('radio', { name: 'Advantage' }))
    await user.click(within(tray).getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(rollInCampaign).toHaveBeenCalledTimes(1))
    const input = vi.mocked(rollInCampaign).mock.calls[0][0]
    expect(input.campaignId).toBe(campaignId)
    expect(input.visibility).toBe('campaign')
    expect(input.source).toBe('tray')
    expect(input.spec.terms[0]).toMatchObject({
      sides: 20,
      count: 2,
      keep: { mode: 'high', count: 1 },
    })
    expect((await within(tray).findAllByText('Total')).length).toBeGreaterThan(0)
  })

  it('shows no numbers while the server answers, then the roll', async () => {
    let finish: (roll: DiceRollRecord) => void = () => {}
    vi.mocked(rollInCampaign).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    renderDock()
    const { user, tray } = await openTray()
    await user.click(within(tray).getByRole('button', { name: 'd8' }))

    expect(within(tray).getByText('Rolling…')).toBeInTheDocument()
    expect(within(tray).getByRole('button', { name: 'd8' })).toBeDisabled()
    expect(within(tray).queryAllByText('Total')).toHaveLength(0)

    await act(async () => finish(stored({ expression: '1d8', total: 6 })))
    expect(within(tray).queryByText('Rolling…')).not.toBeInTheDocument()
    expect(within(tray).getAllByText('6').length).toBeGreaterThan(0)
  })

  it('rolls a quick die without the mode unless it is a d20', async () => {
    answerRolls()
    renderDock()
    const { user, tray } = await openTray()
    await user.click(within(tray).getByRole('radio', { name: 'Disadvantage' }))
    await user.click(within(tray).getByRole('button', { name: 'd6' }))
    await waitFor(() => expect(rollInCampaign).toHaveBeenCalledTimes(1))
    expect(vi.mocked(rollInCampaign).mock.calls[0][0].spec.terms).toEqual([
      { kind: 'dice', sign: 1, count: 1, sides: 6 },
    ])
    await user.click(within(tray).getByRole('button', { name: 'd20' }))
    await waitFor(() => expect(rollInCampaign).toHaveBeenCalledTimes(2))
    expect(vi.mocked(rollInCampaign).mock.calls[1][0].spec.terms[0]).toMatchObject({
      count: 2,
      keep: { mode: 'low', count: 1 },
    })
  })

  it('rolls privately when asked', async () => {
    answerRolls()
    renderDock()
    const { user, tray } = await openTray()
    await user.click(within(tray).getByRole('checkbox', { name: 'Only I can see my rolls' }))
    await user.click(within(tray).getByRole('button', { name: 'd4' }))
    await waitFor(() => expect(rollInCampaign).toHaveBeenCalled())
    expect(vi.mocked(rollInCampaign).mock.calls[0][0].visibility).toBe('self')
    expect((await within(tray).findAllByText('Only you')).length).toBeGreaterThan(0)
  })

  it('refuses a roll it cannot read, or an advantage it cannot apply, before calling the server', async () => {
    renderDock()
    const { user, tray } = await openTray()
    const input = within(tray).getByRole('textbox', { name: 'Roll' })
    await user.type(input, '2x6')
    await user.click(within(tray).getByRole('button', { name: 'Roll' }))
    expect(await within(tray).findByRole('alert')).toHaveTextContent('Expected')

    await user.clear(input)
    await user.type(input, '2d6')
    expect(within(tray).queryByRole('alert')).not.toBeInTheDocument()
    await user.click(within(tray).getByRole('radio', { name: 'Advantage' }))
    await user.click(within(tray).getByRole('button', { name: 'Roll' }))
    expect(await within(tray).findByRole('alert')).toHaveTextContent('single d20')
    expect(rollInCampaign).not.toHaveBeenCalled()
  })

  it('disables Roll for an empty expression', async () => {
    renderDock()
    const { tray } = await openTray()
    expect(within(tray).getByRole('button', { name: 'Roll' })).toBeDisabled()
  })

  it('repeats the last roll', async () => {
    answerRolls()
    renderDock()
    const { user, tray } = await openTray()
    const again = within(tray).getByRole('button', { name: 'Roll again' })
    expect(again).toBeDisabled()
    await user.click(within(tray).getByRole('button', { name: 'd10' }))
    await waitFor(() => expect(again).toBeEnabled())
    await user.click(again)
    await waitFor(() => expect(rollInCampaign).toHaveBeenCalledTimes(2))
    expect(vi.mocked(rollInCampaign).mock.calls[1][0].spec).toEqual(
      vi.mocked(rollInCampaign).mock.calls[0][0].spec,
    )
  })
})

describe('when a roll fails', () => {
  it('shows the problem and retries', async () => {
    vi.mocked(rollInCampaign).mockRejectedValueOnce({
      code: 'P0001',
      message: 'dice_rate_limited',
    })
    answerRolls()
    renderDock()
    const { user, tray } = await openTray()
    await user.click(within(tray).getByRole('button', { name: 'd12' }))
    const alert = await within(tray).findByRole('alert')
    expect(alert).toHaveTextContent('Slow down — too many rolls at once.')
    expect(within(tray).queryByRole('button', { name: 'Roll on this device' })).toBeNull()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(rollInCampaign).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(tray).queryByRole('alert')).not.toBeInTheDocument())
    expect(within(tray).getAllByText('Total').length).toBeGreaterThan(0)
  })

  it('offers a private roll on this device when the table cannot be reached', async () => {
    vi.mocked(rollInCampaign).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderDock()
    const { user, tray } = await openTray()
    await user.click(within(tray).getByRole('button', { name: 'd6' }))
    const alert = await within(tray).findByRole('alert')
    expect(alert).toHaveTextContent("Can't reach the table.")

    await user.click(within(alert).getByRole('button', { name: 'Roll on this device' }))
    expect((await within(tray).findAllByText('Not saved')).length).toBeGreaterThan(0)
    expect(within(tray).queryByRole('alert')).not.toBeInTheDocument()
    expect(rollInCampaign).toHaveBeenCalledTimes(1)
  })

  it('can be dismissed', async () => {
    vi.mocked(rollInCampaign).mockRejectedValueOnce({ code: 'XX000', message: 'boom' })
    renderDock()
    const { user, tray } = await openTray()
    await user.click(within(tray).getByRole('button', { name: 'd6' }))
    const alert = await within(tray).findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't roll. Try again.")
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(within(tray).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the log', () => {
  it('says it is loading, then shows names, characters, and times', async () => {
    let finish: (rolls: DiceRollRecord[]) => void = () => {}
    vi.mocked(listRolls).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    renderDock()
    const { tray } = await openTray()
    expect(within(tray).getByText('Loading the table’s rolls…')).toBeInTheDocument()

    await act(async () =>
      finish([
        stored({
          roller_id: mira,
          character_id: miraCharacter,
          label: 'Stealth check',
          expression: '1d20 + 5',
          terms: [
            { kind: 'dice', sign: 1, count: 1, sides: 20 },
            { kind: 'constant', sign: 1, value: 5 },
          ],
          dice: [[{ value: 20, kept: true }], []],
          total: 25,
        }),
        stored({ visibility: 'self' }),
      ]),
    )
    const log = within(tray).getByRole('heading', { name: 'At the table' }).parentElement!
    expect(await within(log).findByText('Mira')).toBeInTheDocument()
    expect(within(log).getByText(/as Sable/)).toBeInTheDocument()
    expect(within(log).getByText('Natural 20')).toBeInTheDocument()
    expect(within(log).getByText('Only you')).toBeInTheDocument()
    expect(within(log).getByText('You')).toBeInTheDocument()
  })

  it('says the table is quiet when there are no rolls', async () => {
    renderDock()
    const { tray } = await openTray()
    expect(await within(tray).findByText(/The table is quiet/)).toBeInTheDocument()
  })

  it('offers another try when the log cannot load', async () => {
    vi.mocked(listRolls).mockRejectedValueOnce(new Error('offline'))
    renderDock()
    const { user, tray } = await openTray()
    expect(await within(tray).findByText('Couldn’t load the table’s rolls.')).toBeInTheDocument()
    vi.mocked(listRolls).mockResolvedValueOnce([stored()])
    await user.click(within(tray).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(within(tray).queryByText(/Couldn’t load/)).not.toBeInTheDocument())
  })

  it('shows a roll made by someone else as it arrives, once', async () => {
    renderDock()
    const { tray } = await openTray()
    await within(tray).findByText(/The table is quiet/)
    const live = stored({ roller_id: mira, total: 17, label: 'Perception check' })
    await act(async () => channel.onInsert?.({ new: live }))
    await act(async () => channel.onInsert?.({ new: live }))
    const log = within(tray).getByRole('heading', { name: 'At the table' }).parentElement!
    expect(within(log).getAllByText(/Perception check/)).toHaveLength(1)
    expect(within(log).getByText('Mira')).toBeInTheDocument()
  })

  it('shows when live updates pause and come back', async () => {
    renderDock()
    const { tray } = await openTray()
    expect(await within(tray).findByText('Live with the table')).toBeInTheDocument()
    await act(async () => channel.onStatus?.('CHANNEL_ERROR'))
    expect(within(tray).getByText('Live updates paused')).toBeInTheDocument()
    await act(async () => channel.onStatus?.('SUBSCRIBED'))
    expect(within(tray).getByText('Live with the table')).toBeInTheDocument()
    // Rejoining refetches the first page, so a roll made while paused is not lost.
    expect(vi.mocked(listRolls).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('counts rolls by others while the tray is shut, and clears the count on opening', async () => {
    renderDock()
    const user = userEvent.setup()
    await waitFor(() => expect(channel.onInsert).not.toBeNull())
    expect(screen.queryByText(/new roll/)).not.toBeInTheDocument()
    await act(async () => channel.onInsert?.({ new: stored({ roller_id: mira }) }))
    await act(async () => channel.onInsert?.({ new: stored({ roller_id: mira }) }))
    expect(screen.getByText('2 new rolls at the table')).toBeInTheDocument()
    // Your own roll in another tab is not "new" to you.
    await act(async () => channel.onInsert?.({ new: stored({ roller_id: me }) }))
    expect(screen.getByText('2 new rolls at the table')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Dice/ }))
    expect(screen.queryByText(/new rolls? at the table/)).not.toBeInTheDocument()
  })

  it('announces others’ rolls only while the tray is open', async () => {
    renderDock()
    const { user, tray } = await openTray()
    const announcement = screen.getByRole('status', { name: '' })
    await act(async () =>
      channel.onInsert?.({ new: stored({ roller_id: mira, label: 'Insight', total: 14 }) }),
    )
    expect(announcement).toHaveTextContent('Mira rolled Insight: 14.')

    await user.click(within(tray).getByRole('button', { name: 'Close' }))
    await act(async () =>
      channel.onInsert?.({ new: stored({ roller_id: mira, label: 'Athletics', total: 9 }) }),
    )
    expect(announcement).not.toHaveTextContent('Athletics')
  })
})

describe('the dock', () => {
  it('peeks at a roll made from the sheet while the tray is shut, and opens from it', async () => {
    answerRolls()
    renderDock()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Roll Stealth' }))
    const peek = await screen.findByRole('button', { name: /Stealth check/ })
    expect(peek).toHaveTextContent('19')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'You rolled Stealth check: 19.',
    )
    expect(rollInCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Stealth check', source: 'skill' }),
    )

    await user.click(peek)
    expect(screen.getByRole('region', { name: 'Dice tray' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stealth check/ })).not.toBeInTheDocument()
  })

  it('shows a failed roll with a retry even when the tray is shut', async () => {
    vi.mocked(rollInCampaign).mockRejectedValueOnce({
      code: '42501',
      message: 'not_a_member',
    })
    renderDock()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Roll Stealth' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("You're no longer in this campaign.")
  })

  it('opens and closes with R, but not while typing', async () => {
    answerRolls()
    renderDock()
    const user = userEvent.setup()
    await user.keyboard('r')
    const tray = screen.getByRole('region', { name: 'Dice tray' })
    const input = within(tray).getByRole('textbox', { name: 'Roll' })
    await user.click(input)
    await user.keyboard('r')
    expect(input).toHaveValue('r')
    expect(screen.getByRole('region', { name: 'Dice tray' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Roll Stealth' }))
    await user.keyboard('r')
    expect(screen.queryByRole('region', { name: 'Dice tray' })).not.toBeInTheDocument()
  })

  it('moves focus into the tray on opening, and back to the button on Escape', async () => {
    renderDock()
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: /^Dice/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Dice tray' })).toHaveFocus()

    const stopped = vi.fn((event: KeyboardEvent) => event.stopPropagation())
    document.addEventListener('keydown', stopped)
    await user.keyboard('{Escape}')
    document.removeEventListener('keydown', stopped)
    expect(screen.queryByRole('region', { name: 'Dice tray' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders inside the journal dialog while one is open', async () => {
    function Journal() {
      const dice = useDice()
      return (
        <dialog data-testid="journal" open ref={(element) => dice.setHost(element)}>
          journal
        </dialog>
      )
    }
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <DiceProvider>
          <Journal />
          <DiceDock />
        </DiceProvider>
      </QueryClientProvider>,
    )
    const journal = screen.getByTestId('journal')
    await waitFor(() =>
      expect(within(journal).getByRole('button', { name: /^Dice/ })).toBeInTheDocument(),
    )
    expect(journal.querySelector('.dice-dock')).toHaveAttribute('data-host', 'journal')
  })
})
