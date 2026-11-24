import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterResource } from './characterTypes'
import { ResourceTrackers } from './ResourceTrackers'
import { listCharacterResources } from './resourceService'

vi.mock('./resourceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resourceService')>()),
  listCharacterResources: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const characterId = 'c1'
let n = 0
function resource(overrides: Partial<CharacterResource> = {}): CharacterResource {
  n += 1
  return {
    id: `r${n}`,
    character_id: characterId,
    kind: 'tracker',
    name: 'Ki',
    slot_level: null,
    die: null,
    maximum: 4,
    current: 3,
    reset: 'short',
    position: n,
    created_at: `2026-11-24T10:00:0${n % 10}+00:00`,
    updated_at: '2026-11-24T10:00:00+00:00',
    ...overrides,
  }
}

function setup(rows: CharacterResource[] | Error, withLive = true) {
  if (rows instanceof Error) vi.mocked(listCharacterResources).mockRejectedValue(rows)
  else vi.mocked(listCharacterResources).mockResolvedValue(rows)
  const live = { adjustResource: vi.fn().mockResolvedValue({}) }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ResourceTrackers
        characterId={characterId}
        live={withLive ? (live as never) : undefined}
        userId="u1"
      />
    </QueryClientProvider>,
  )
  return { live, user: userEvent.setup() }
}

describe('states', () => {
  it('shows a loading status, then the trackers', async () => {
    setup([resource()])
    expect(screen.getByRole('status')).toHaveTextContent('Loading trackers…')
    expect(await screen.findByRole('group', { name: 'Ki, 3 of 4 left' })).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    const { user } = setup(new Error('boom'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The trackers could not be loaded.')
    vi.mocked(listCharacterResources).mockResolvedValue([resource()])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('group', { name: 'Ki, 3 of 4 left' })).toBeInTheDocument()
  })

  it('tells the owner where trackers come from when there are none, and others nothing', async () => {
    setup([])
    expect(await screen.findByText(/No trackers yet/)).toBeInTheDocument()
    cleanup()
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ResourceTrackers characterId={characterId} userId="u2" />
      </QueryClientProvider>,
    )
    await vi.waitFor(() => expect(listCharacterResources).toHaveBeenCalledTimes(2))
    expect(container.querySelector('.trackers__empty')).toBeNull()
  })
})

describe('groups', () => {
  it('groups trackers as spell slots, hit dice, and features, in order', async () => {
    setup([
      resource({ name: 'Rage', maximum: 3, current: 3 }),
      resource({ kind: 'hit_dice', name: null, die: 8, maximum: 3, current: 2, reset: 'long' }),
      resource({
        kind: 'spell_slots',
        name: null,
        slot_level: 2,
        maximum: 2,
        current: 1,
        reset: 'long',
      }),
      resource({
        kind: 'spell_slots',
        name: null,
        slot_level: 1,
        maximum: 4,
        current: 4,
        reset: 'long',
      }),
    ])
    await screen.findByText('Spell slots')
    expect(
      screen.getAllByText(/^(Spell slots|Hit dice|Features)$/).map((el) => el.textContent),
    ).toEqual(['Spell slots', 'Hit dice', 'Features'])
    const slots = screen.getByText('Spell slots').closest('details')!
    expect(
      within(slots)
        .getAllByRole('group')
        .map((el) => el.getAttribute('aria-label')),
    ).toEqual(['1st level slots, 4 of 4 left', '2nd level slots, 1 of 2 left'])
    expect(screen.getByRole('group', { name: 'd8 hit dice, 2 of 3 left' })).toBeInTheDocument()
    expect(screen.getAllByText('Long rest')).toHaveLength(3)
    expect(screen.getByText('Short rest')).toBeInTheDocument()
  })

  it('leaves out a group with nothing in it', async () => {
    setup([resource()])
    await screen.findByText('Features')
    expect(screen.queryByText('Spell slots')).not.toBeInTheDocument()
    expect(screen.queryByText('Hit dice')).not.toBeInTheDocument()
  })
})

describe('using trackers', () => {
  it('a full pip spends one and an empty pip restores one', async () => {
    const ki = resource({ id: 'ki' })
    const { live, user } = setup([ki])
    const pips = await screen.findAllByRole('button', { name: /one Ki$/ })
    expect(pips).toHaveLength(4)
    expect(pips.map((pip) => pip.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'true',
      'false',
    ])
    await user.click(pips[0])
    expect(live.adjustResource).toHaveBeenLastCalledWith(characterId, 'ki', -1)
    await user.click(pips[3])
    expect(live.adjustResource).toHaveBeenLastCalledWith(characterId, 'ki', 1)
  })

  it('uses a counter above ten, and stops at the ends', async () => {
    const pool = resource({
      id: 'pool',
      name: 'Lay on Hands',
      maximum: 25,
      current: 25,
      reset: 'long',
    })
    const { live, user } = setup([pool])
    const group = await screen.findByRole('group', { name: 'Lay on Hands, 25 of 25 left' })
    expect(within(group).queryAllByRole('button', { name: /^(Use|Restore) one/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Restore one Lay on Hands' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Use one Lay on Hands' }))
    expect(live.adjustResource).toHaveBeenCalledWith(characterId, 'pool', -1)
  })

  it('disables the spend button on an empty counter', async () => {
    setup([resource({ name: 'Pool', maximum: 20, current: 0 })])
    expect(await screen.findByRole('button', { name: 'Use one Pool' })).toBeDisabled()
  })

  it('is display only without live actions, but still readable', async () => {
    setup([resource()], false)
    expect(await screen.findByText('Ki')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Ki, 3 of 4 left')).toBeInTheDocument()
  })

  it('shows a tracker with a maximum of 0 as none', async () => {
    setup([resource({ maximum: 0, current: 0 })])
    expect(await screen.findByText('None')).toBeInTheDocument()
  })
})
