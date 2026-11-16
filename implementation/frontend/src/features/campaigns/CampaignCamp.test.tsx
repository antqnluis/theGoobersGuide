import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planetAppearance } from './planetModel'
import { CampaignCamp } from './CampaignCamp'
import type { CampLocationId } from './camp/campLayout'

type UnsavedChanges = Partial<Record<CampLocationId, boolean>>

// jsdom has no canvas, so the lazy scene is replaced by nothing here; the real
// renderer is covered by the draw-plan tests and the browser tests.
vi.mock('./camp/CampLandscape', () => ({ default: () => null }))

afterEach(cleanup)

function campElement({
  isOwner = true,
  isDeleting = false,
  cancelDelete = vi.fn(),
  unsavedChanges = {},
}: {
  isOwner?: boolean
  isDeleting?: boolean
  cancelDelete?: () => void
  unsavedChanges?: UnsavedChanges
} = {}) {
  return (
    <CampaignCamp
      cancelDelete={cancelDelete}
      unsavedChanges={unsavedChanges}
      isDeleting={isDeleting}
      isOwner={isOwner}
      notice={null}
      background="campaign"
      onBackgroundChange={vi.fn()}
      hue={0}
      onHueChange={vi.fn()}
      onLeave={vi.fn()}
      landfallKey={null}
      roster={[]}
      world={planetAppearance('camp-test')}
      overview={<h2 id="camp-overview-heading">The Red Hand</h2>}
      party={<h2 id="camp-party-heading">People in this campaign</h2>}
      characters={<h2 id="camp-characters-heading">My characters</h2>}
      notes={<h2 id="camp-notes-heading">Campaign notes</h2>}
      settings={<h2 id="camp-settings-heading">Campaign settings</h2>}
      title={<h1 id="campaign-workspace-heading">The Red Hand</h1>}
    />
  )
}

function renderCamp(options: Parameters<typeof campElement>[0] = {}) {
  const cancelDelete = options.cancelDelete ?? vi.fn()
  const view = render(campElement({ ...options, cancelDelete }))
  return { ...view, cancelDelete }
}

describe('CampaignCamp unsaved characters', () => {
  async function openTent(hasUnsavedChanges: boolean) {
    const user = userEvent.setup()
    const out = renderCamp({ unsavedChanges: { characters: hasUnsavedChanges } })
    await user.click(screen.getByRole('button', { name: /My characters\s*Tent/ }))
    return { ...out, user }
  }

  it('asks before closing the tent with unsaved edits, and stays if told to', async () => {
    const { cancelDelete, user } = await openTent(true)
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(cancelDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(document.querySelector('[data-camp-state]')).toHaveAttribute(
      'data-camp-state',
      'characters',
    )
  })

  it('closes once the player discards', async () => {
    const { cancelDelete, user } = await openTent(true)
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(cancelDelete).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-camp-state]')).toHaveAttribute('data-camp-state', 'idle')
  })

  it('closes straight away with nothing to lose', async () => {
    const { cancelDelete, user } = await openTent(false)
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(cancelDelete).toHaveBeenCalledTimes(1)
  })
})

describe('CampaignCamp unsaved notes', () => {
  async function openCrates(unsavedChanges: UnsavedChanges) {
    const user = userEvent.setup()
    const out = renderCamp({ unsavedChanges })
    await user.click(screen.getByRole('button', { name: /Notes\s*Journal crates/ }))
    return { ...out, user }
  }

  it('asks in the journal’s own words before closing with an unsaved note', async () => {
    const { cancelDelete, user } = await openCrates({ notes: true })
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(cancelDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/Leaving the journal now will discard them/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(cancelDelete).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-camp-state]')).toHaveAttribute('data-camp-state', 'idle')
  })

  it('does not ask for a destination other than the one with edits', async () => {
    // Unsaved character edits do not guard the notes page, and the reverse.
    const { cancelDelete, user } = await openCrates({ characters: true })
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(cancelDelete).toHaveBeenCalledTimes(1)
  })

  it('closes straight away with nothing to lose', async () => {
    const { cancelDelete, user } = await openCrates({})
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(cancelDelete).toHaveBeenCalledTimes(1)
  })
})

const pendingCamp = (isDeleting: boolean) => campElement({ isDeleting })

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

  it('cannot be closed while a campaign or membership change is pending', async () => {
    const user = userEvent.setup()
    const { rerender } = renderCamp()
    await user.click(screen.getByRole('button', { name: /Party\s*Bedroll circle/ }))
    const state = () => document.querySelector('[data-camp-state]')

    rerender(pendingCamp(true))
    expect(screen.getByRole('button', { name: 'Back to camp' })).toBeDisabled()
    document.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(state()).toHaveAttribute('data-camp-state', 'party')

    rerender(pendingCamp(false))
    expect(screen.getByRole('button', { name: 'Back to camp' })).toBeEnabled()
    document.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }))
    await vi.waitFor(() => expect(state()).toHaveAttribute('data-camp-state', 'idle'))
  })

  it('opens the tent as My characters for everyone, and cannot close while a character change is pending', async () => {
    const user = userEvent.setup()
    const { rerender } = renderCamp({ isOwner: false })
    const entry = within(screen.getByRole('navigation', { name: 'Places' })).getByRole('button', {
      name: /My characters\s*Tent/,
    })

    await user.click(entry)
    const state = () => document.querySelector('[data-camp-state]')
    expect(state()).toHaveAttribute('data-camp-state', 'characters')
    expect(screen.getByRole('dialog', { name: 'My characters' })).toBeVisible()

    // The workspace folds a pending character action into isDeleting.
    rerender(pendingCamp(true))
    expect(screen.getByRole('button', { name: 'Back to camp' })).toBeDisabled()
    document.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(state()).toHaveAttribute('data-camp-state', 'characters')

    rerender(pendingCamp(false))
    await user.click(screen.getByRole('button', { name: 'Back to camp' }))
    expect(state()).toHaveAttribute('data-camp-state', 'idle')
    expect(entry).toHaveFocus()
  })

  it('opens the journal crates as Notes for everyone', async () => {
    const user = userEvent.setup()
    renderCamp({ isOwner: false })
    const entry = within(screen.getByRole('navigation', { name: 'Places' })).getByRole('button', {
      name: /Notes\s*Journal crates/,
    })

    await user.click(entry)
    expect(document.querySelector('[data-camp-state]')).toHaveAttribute('data-camp-state', 'notes')
    expect(screen.getByRole('dialog', { name: 'Campaign notes' })).toBeVisible()

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
          background="campaign"
          onBackgroundChange={vi.fn()}
          hue={0}
          onHueChange={vi.fn()}
          onLeave={vi.fn()}
          landfallKey={round % 2 === 0 ? `entry-${round}` : null}
          notice={null}
          roster={[]}
          world={planetAppearance('camp-test')}
          overview={<h2 id="camp-overview-heading">Overview</h2>}
          party={<h2 id="camp-party-heading">Party</h2>}
          characters={<h2 id="camp-characters-heading">Characters</h2>}
          notes={<h2 id="camp-notes-heading">Notes</h2>}
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
