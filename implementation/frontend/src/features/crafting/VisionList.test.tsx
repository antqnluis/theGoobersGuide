import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daggerVision, oilVision, visionsDocument } from './craftingTestData'
import type { CharacterVisions } from './craftingTypes'
import { VisionList } from './VisionList'

afterEach(cleanup)
beforeEach(() => {
  window.localStorage.clear()
  // Reduced motion: a broken seal opens at once, so the tests don't wait on the crack.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
})

function list(visions: CharacterVisions) {
  return (
    <VisionList characterId="char-1" onToggleSaved={vi.fn()} pending={false} visions={visions} />
  )
}

function setup(visions: CharacterVisions) {
  const view = render(list(visions))
  return { ...view, user: userEvent.setup() }
}

/** The dagger and the Ember Salt fragment are new; the oil is not. */
const fresh = () => visionsDocument()

describe('VisionList states', () => {
  it('says so when the campaign has no crafting library', () => {
    setup(visionsDocument({ library_count: 0, last_rest_at: null, visions: [], fragments: [] }))
    expect(
      screen.getByText('Your DM hasn’t added a crafting library to this campaign.'),
    ).toBeVisible()
  })

  it('says visions come with a long rest before the party has rested', () => {
    setup(visionsDocument({ last_rest_at: null, visions: [], fragments: [] }))
    expect(
      screen.getByText('No visions yet. They come when the party takes a long rest.'),
    ).toBeVisible()
  })

  it('says nothing stirred when a rest brought nothing', () => {
    setup(visionsDocument({ visions: [], fragments: [], saved: [] }))
    expect(
      screen.getByText('Nothing stirred in your dreams. Carry new materials into your next rest.'),
    ).toBeVisible()
  })

  it('dates the last long rest', () => {
    setup(visionsDocument())
    expect(screen.getByText(/Last long rest: Nov 2[78], 2026/)).toBeVisible()
  })
})

describe('VisionList sections', () => {
  it('lists visions, then fragments, then saved visions, each with its count', () => {
    setup(
      visionsDocument({
        visions: [{ ...daggerVision, new: false }, oilVision],
        fragments: [{ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 1 }],
        saved: [{ ...oilVision, recipe_id: 'recipe-old', saved: true }],
      }),
    )
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual(['Visions (2)', 'Fragments (1)', 'Saved (1)'])
    const visions = within(
      screen.getByRole('heading', { name: 'Visions (2)' }).closest('.vision-group')!,
    )
    expect(visions.getAllByRole('listitem')).toHaveLength(2)
    expect(visions.getByText('Wyvern Fang Dagger')).toBeVisible()
  })

  it('leaves out a group that has nothing in it', () => {
    setup(visionsDocument({ visions: [oilVision], fragments: [], saved: [] }))
    expect(screen.queryByRole('heading', { name: /Fragments/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Saved/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Nothing stirred/)).not.toBeInTheDocument()
  })

  it('shows saved visions even when a rest hid everything else', () => {
    setup(
      visionsDocument({
        visions: [],
        fragments: [],
        saved: [{ ...daggerVision, saved: true, new: false }],
      }),
    )
    expect(screen.queryByText(/Nothing stirred/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Saved (1)' })).toBeVisible()
  })
})

describe('sealed visions', () => {
  it('seals what the rest brought, and says only what is behind each seal', () => {
    setup(fresh())
    expect(screen.getByText('2 things stir from the rest')).toBeVisible()
    expect(
      screen.getByText('1 vision waits and 1 fragment waits behind wax.', { exact: false }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Break the seal on a vision' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Break the seal on a fragment' })).toBeVisible()
    // Nothing behind a seal is readable, but the old vision is just a card.
    expect(screen.queryByText('Wyvern Fang Dagger')).not.toBeInTheDocument()
    expect(screen.queryByText('Wyvern Fang', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('Venom Blade Oil')).toBeVisible()
  })

  it('never seals what is not new', () => {
    setup(visionsDocument({ visions: [oilVision], fragments: [] }))
    expect(screen.queryByRole('button', { name: /Break the seal/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/stir from the rest/)).not.toBeInTheDocument()
  })

  it('breaks one seal, shows that card, moves focus to it, and announces it', async () => {
    const { user } = setup(fresh())
    await user.click(screen.getByRole('button', { name: 'Break the seal on a vision' }))
    const card = screen.getByText('Wyvern Fang Dagger').closest('li')!
    expect(card).toHaveClass('vision-card--entering')
    // Its face lists every material, held of needed, without opening the recipe.
    expect(within(card).getByText('Wyvern Fang')).toBeVisible()
    expect(within(card).getByText('1 of 2')).toBeVisible()
    expect(screen.getByText('Vision revealed: Wyvern Fang Dagger.')).toBeInTheDocument()
    expect(card.querySelector('summary')).toHaveFocus()
    expect(screen.getByText('One thing stirs from the rest')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Break the seal on a fragment' })).toBeVisible()
  })

  it('breaks a fragment’s seal into the fragment, with its held names', async () => {
    const { user } = setup(fresh())
    await user.click(screen.getByRole('button', { name: 'Break the seal on a fragment' }))
    expect(screen.getByText('Unknown item: ???')).toBeInTheDocument()
    expect(screen.getByText('Wyvern Fang', { exact: true })).toBeVisible()
    expect(screen.getByText('Fragment revealed: unknown item.')).toBeInTheDocument()
  })

  it('breaks every seal at once, and then offers to replay the reveal', async () => {
    const { user } = setup(fresh())
    await user.click(screen.getByRole('button', { name: 'Break all seals' }))
    expect(screen.queryByRole('button', { name: /Break the seal/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/stir from the rest/)).not.toBeInTheDocument()
    expect(screen.getByText('Wyvern Fang Dagger')).toBeVisible()
    expect(screen.getByText('2 seals broken.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replay the reveal' })).toBeVisible()
  })

  it('replays the reveal by sealing the new ones again', async () => {
    const { user } = setup(fresh())
    await user.click(screen.getByRole('button', { name: 'Break all seals' }))
    await user.click(screen.getByRole('button', { name: 'Replay the reveal' }))
    expect(screen.getByRole('button', { name: 'Break the seal on a vision' })).toBeVisible()
    expect(screen.queryByText('Wyvern Fang Dagger')).not.toBeInTheDocument()
  })

  it('remembers what was opened for this character and this rest, across a reload', async () => {
    const first = setup(fresh())
    await first.user.click(screen.getByRole('button', { name: 'Break all seals' }))
    first.unmount()

    setup(fresh())
    expect(screen.queryByRole('button', { name: /Break the seal/ })).not.toBeInTheDocument()
    // Opened earlier, so no entrance plays again.
    expect(screen.getByText('Wyvern Fang Dagger').closest('li')).not.toHaveClass(
      'vision-card--entering',
    )
  })

  it('seals the next rest’s visions again, and forgets the last rest', async () => {
    const first = setup(fresh())
    await first.user.click(screen.getByRole('button', { name: 'Break all seals' }))
    expect(window.localStorage.length).toBe(1)

    first.rerender(list({ ...fresh(), last_rest_at: '2026-11-28T09:00:00Z' }))
    expect(screen.getByRole('button', { name: 'Break the seal on a vision' })).toBeVisible()
    first.unmount()
    expect(window.localStorage.length).toBe(1)
  })

  it('keeps each character’s seals apart', async () => {
    const first = setup(fresh())
    await first.user.click(screen.getByRole('button', { name: 'Break all seals' }))
    first.rerender(
      <VisionList characterId="char-2" onToggleSaved={vi.fn()} pending={false} visions={fresh()} />,
    )
    expect(screen.getByRole('button', { name: 'Break the seal on a vision' })).toBeVisible()
  })

  it('still works when the device keeps nothing', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { user } = setup(fresh())
    await user.click(screen.getByRole('button', { name: 'Break all seals' }))
    expect(screen.getByText('Wyvern Fang Dagger')).toBeVisible()
    vi.restoreAllMocks()
  })
})
