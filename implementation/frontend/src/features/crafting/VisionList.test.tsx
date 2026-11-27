import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { daggerVision, oilVision, visionsDocument } from './craftingTestData'
import type { CharacterVisions } from './craftingTypes'
import { VisionList } from './VisionList'

afterEach(cleanup)

function setup(visions: CharacterVisions) {
  render(<VisionList onToggleSaved={vi.fn()} pending={false} visions={visions} />)
}

describe('VisionList', () => {
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

  it('lists visions, then fragments, then saved visions, each with its count', () => {
    setup(
      visionsDocument({
        saved: [{ ...oilVision, recipe_id: 'recipe-old', saved: true }],
      }),
    )
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual(['Visions (2)', 'Fragments (1)', 'Saved (1)'])
    const visions = within(screen.getByRole('heading', { name: 'Visions (2)' }).closest('section')!)
    expect(visions.getAllByRole('listitem')).toHaveLength(2)
    expect(visions.getByText('Wyvern Fang Dagger')).toBeVisible()
  })

  it('leaves out a group that has nothing in it', () => {
    setup(visionsDocument({ visions: [daggerVision], fragments: [], saved: [] }))
    expect(screen.queryByRole('heading', { name: /Fragments/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Saved/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Nothing stirred/)).not.toBeInTheDocument()
  })

  it('dates the last long rest', () => {
    setup(visionsDocument())
    expect(screen.getByText(/Last long rest: Nov 2[78], 2026/)).toBeVisible()
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
