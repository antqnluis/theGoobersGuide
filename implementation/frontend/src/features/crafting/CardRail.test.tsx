import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardRail } from './CardRail'

afterEach(cleanup)
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never
})

/** jsdom has no layout, so the row's measurements are set by hand. */
function size(element: HTMLElement, { client, scroll, left = 0 }: Record<string, number>) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: client })
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scroll })
  element.scrollLeft = left
  element.scrollBy = vi.fn() as never
}

function setup(width: { client: number; scroll: number; left?: number }) {
  render(
    <CardRail title="Visions (3)">
      <li>One</li>
      <li>Two</li>
      <li>Three</li>
    </CardRail>,
  )
  const row = screen.getByRole('region', { name: 'Visions (3)' })
  size(row, width)
  act(() => void fireEvent.scroll(row))
  return { row, user: userEvent.setup() }
}

describe('CardRail', () => {
  it('names its heading and its focusable scrolling region, and lists the cards', () => {
    setup({ client: 800, scroll: 800 })
    expect(screen.getByRole('heading', { name: 'Visions (3)' })).toBeVisible()
    const row = screen.getByRole('region', { name: 'Visions (3)' })
    expect(row).toHaveAttribute('tabindex', '0')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows no arrows when every card fits', () => {
    setup({ client: 800, scroll: 800 })
    expect(screen.queryByRole('button', { name: /Scroll Visions/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region').getAttribute('data-more')).toBe('')
  })

  it('shows both arrows when cards overflow, the way back disabled at the start', () => {
    setup({ client: 400, scroll: 1000 })
    expect(screen.getByRole('button', { name: 'Scroll Visions (3) back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scroll Visions (3) forward' })).toBeEnabled()
    expect(screen.getByRole('region').getAttribute('data-more')).toBe('after')
  })

  it('disables the way forward at the end, and marks more before', () => {
    setup({ client: 400, scroll: 1000, left: 600 })
    expect(screen.getByRole('button', { name: 'Scroll Visions (3) forward' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scroll Visions (3) back' })).toBeEnabled()
    expect(screen.getByRole('region').getAttribute('data-more')).toBe('before')
  })

  it('scrolls most of a row’s width each press, smoothly', async () => {
    const { row, user } = setup({ client: 400, scroll: 1000 })
    await user.click(screen.getByRole('button', { name: 'Scroll Visions (3) forward' }))
    expect(row.scrollBy).toHaveBeenCalledWith({ left: 340, behavior: 'smooth' })
  })

  it('scrolls back, and jumps instead of gliding under reduced motion', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
    const { row, user } = setup({ client: 400, scroll: 1000, left: 300 })
    await user.click(screen.getByRole('button', { name: 'Scroll Visions (3) back' }))
    expect(row.scrollBy).toHaveBeenCalledWith({ left: -340, behavior: 'auto' })
  })

  it('marks the cards for the narrower fragment size', () => {
    render(
      <CardRail size="slim" title="Fragments (1)">
        <li>One</li>
      </CardRail>,
    )
    expect(screen.getByRole('list')).toHaveAttribute('data-size', 'slim')
  })
})
