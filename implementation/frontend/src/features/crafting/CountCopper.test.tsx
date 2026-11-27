import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CountCopper } from './CountCopper'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never
})

describe('CountCopper', () => {
  it('is just the amount when it does not animate', () => {
    const { container } = render(<CountCopper animate={false} value={11000} />)
    expect(container).toHaveTextContent('110 gp')
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  it('counts up in steps and lands on the amount, naming the final amount to screen readers', () => {
    const { container } = render(<CountCopper animate value={11000} />)
    expect(screen.getByText('110 gp', { selector: '.crafting-sr' })).toBeInTheDocument()
    const shown = () => container.querySelector('[aria-hidden]')?.textContent
    expect(shown()).toBe('0 gp')
    act(() => void vi.advanceTimersByTime(300))
    const mid = shown()
    expect(mid).not.toBe('0 gp')
    expect(mid).not.toBe('110 gp')
    act(() => void vi.advanceTimersByTime(900))
    expect(container.querySelector('[aria-hidden]')).toBeNull()
    expect(container).toHaveTextContent('110 gp')
  })

  it('shows the amount at once under reduced motion, and for nothing', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
    const { container, rerender } = render(<CountCopper animate value={11000} />)
    expect(container.querySelector('[aria-hidden]')).toBeNull()
    expect(container).toHaveTextContent('110 gp')
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never
    rerender(<CountCopper animate value={0} />)
    expect(container).toHaveTextContent('0 gp')
  })
})
