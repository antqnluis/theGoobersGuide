import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CampSettings, campHeaderSlotId } from './CampSettings'

function Shell() {
  // The slot and the settings mount in the same commit, as in the app shell.
  return (
    <>
      <div id={campHeaderSlotId} />
      <CampSettings background="campaign" hue={0} onChange={() => {}} onHueChange={() => {}} />
    </>
  )
}

afterEach(cleanup)

describe('CampSettings', () => {
  it('puts the gear in the header slot even when they mount together', () => {
    const { container } = render(<Shell />)
    const slot = container.querySelector(`#${campHeaderSlotId}`)
    expect(slot).toContainElement(screen.getByRole('button', { name: 'Camp background settings' }))
  })

  it('stays inline when there is no header slot', () => {
    const { container } = render(
      <CampSettings background="campaign" hue={0} onChange={() => {}} onHueChange={() => {}} />,
    )
    expect(container).toContainElement(
      screen.getByRole('button', { name: 'Camp background settings' }),
    )
  })
})
