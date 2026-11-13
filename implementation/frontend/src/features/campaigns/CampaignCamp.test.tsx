import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planetAppearance } from './planetModel'
import { CampaignCamp } from './CampaignCamp'

// jsdom has no canvas, so the lazy scene is replaced by nothing here; the real
// renderer is covered by the draw-plan tests and the browser tests.
vi.mock('./camp/CampLandscape', () => ({ default: () => null }))

afterEach(cleanup)

function renderCamp({ isOwner = true, cancelDelete = vi.fn() } = {}) {
  render(
    <CampaignCamp
      cancelDelete={cancelDelete}
      isDeleting={false}
      isOwner={isOwner}
      notice={null}
      landfallKey={null}
      roster={[]}
      world={planetAppearance('camp-test')}
      overview={<h2 id="camp-overview-heading">The Red Hand</h2>}
      party={<h2 id="camp-party-heading">People in this campaign</h2>}
      settings={<h2 id="camp-settings-heading">Campaign settings</h2>}
      title={<h1 id="campaign-workspace-heading">The Red Hand</h1>}
    />,
  )
  return { cancelDelete }
}

describe('CampaignCamp destinations', () => {
  it('opens a destination, focuses Back to camp, and restores focus to the opener', async () => {
    const user = userEvent.setup()
    const { cancelDelete } = renderCamp()
    const scene = screen.getByRole('button', { name: /Party\s*Bedroll circle/ })

    await user.click(scene)
    expect(screen.getByRole('button', { name: 'Back to camp' })).toHaveFocus()
    expect(document.querySelector('[data-camp-state]')).toHaveAttribute('data-camp-state', 'party')

    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(scene).toHaveFocus()
    expect(cancelDelete).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-camp-state]')).toHaveAttribute('data-camp-state', 'idle')
  })

  it('restores focus to the Places entry when it opened the destination', async () => {
    const user = userEvent.setup()
    renderCamp()
    const places = screen.getByRole('navigation', { name: 'Places' })
    const entry = within(places).getByRole('button', { name: /Overview\s*Campfire/ })

    await user.click(entry)
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(entry).toHaveFocus()
  })

  it('names Places entries by label and object, and hides settings from members', () => {
    renderCamp({ isOwner: false })
    expect(screen.getAllByRole('list', { name: 'Camp places', hidden: true })).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: /Party\s*Bedroll circle/ }).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Campaign settings/ })).not.toBeInTheDocument()
  })
})

describe('CampaignCamp frame loop cleanup', () => {
  const pending = new Set<number>()
  let nextHandle = 1
  let added = 0
  let removed = 0

  beforeEach(() => {
    pending.clear()
    added = 0
    removed = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
      const handle = nextHandle++
      pending.add(handle)
      return handle
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
      pending.delete(handle)
    })
    const add = document.addEventListener.bind(document)
    const remove = document.removeEventListener.bind(document)
    vi.spyOn(document, 'addEventListener').mockImplementation((...args: Parameters<typeof add>) => {
      if (args[0] === 'visibilitychange') added += 1
      return add(...args)
    })
    vi.spyOn(document, 'removeEventListener').mockImplementation(
      (...args: Parameters<typeof remove>) => {
        if (args[0] === 'visibilitychange') removed += 1
        return remove(...args)
      },
    )
  })

  afterEach(() => vi.restoreAllMocks())

  it('leaves no frame, timer, or listener behind across 50 mounts', () => {
    for (let round = 0; round < 50; round += 1) {
      const { unmount } = render(
        <CampaignCamp
          cancelDelete={vi.fn()}
          isDeleting={false}
          isOwner
          landfallKey={round % 2 === 0 ? `entry-${round}` : null}
          notice={null}
          roster={[]}
          world={planetAppearance('camp-test')}
          overview={<h2 id="camp-overview-heading">Overview</h2>}
          party={<h2 id="camp-party-heading">Party</h2>}
          settings={<h2 id="camp-settings-heading">Settings</h2>}
          title={<h1 id="campaign-workspace-heading">The Red Hand</h1>}
        />,
      )
      expect(pending.size).toBeLessThanOrEqual(1)
      unmount()
      expect(pending.size).toBe(0)
    }
    expect(added).toBeGreaterThan(0)
    expect(removed).toBe(added)
  })
})
