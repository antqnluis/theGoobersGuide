import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampaignCamp } from './CampaignCamp'

afterEach(cleanup)

function renderCamp({ isOwner = true, cancelDelete = vi.fn() } = {}) {
  render(
    <CampaignCamp
      cancelDelete={cancelDelete}
      isDeleting={false}
      isOwner={isOwner}
      notice={null}
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
    const scene = screen.getAllByRole('button', { name: 'Party' })[0]

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
    expect(screen.getAllByRole('list', { name: 'Camp places', hidden: true })).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: /Party\s*Bedroll circle/ }).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Campaign settings/ })).not.toBeInTheDocument()
  })
})
