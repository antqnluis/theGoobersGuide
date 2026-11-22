import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastRegion } from './CampToasts'
import { toastMs, useCampToasts } from './useCampToasts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Harness() {
  const { toasts, push, dismiss } = useCampToasts()
  return (
    <>
      <button onClick={() => push('Character created.')} type="button">
        push
      </button>
      <ToastRegion onDismiss={dismiss} toasts={toasts} />
    </>
  )
}

describe('toasts', () => {
  it('announces through a polite live region that is always mounted', () => {
    render(<Harness />)
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    )
  })

  it('shows a message, then lets it go after a few seconds', () => {
    vi.useFakeTimers()
    render(<Harness />)
    act(() => screen.getByRole('button', { name: 'push' }).click())
    expect(screen.getByText('Character created.')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(toastMs + 10)
    })
    expect(screen.queryByText('Character created.')).not.toBeInTheDocument()
  })

  it('dismisses on request', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'push' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Character created.')).not.toBeInTheDocument()
  })

  it('holds a toast while it is hovered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'push' }))
    await user.hover(screen.getByText('Character created.'))
    act(() => {
      vi.advanceTimersByTime(toastMs * 2)
    })
    expect(screen.getByText('Character created.')).toBeInTheDocument()
    await user.unhover(screen.getByText('Character created.'))
    act(() => {
      vi.advanceTimersByTime(toastMs + 10)
    })
    expect(screen.queryByText('Character created.')).not.toBeInTheDocument()
  })

  it('keeps at most three toasts', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    for (let count = 0; count < 5; count += 1) {
      await user.click(screen.getByRole('button', { name: 'push' }))
    }
    expect(screen.getAllByText('Character created.')).toHaveLength(3)
  })
})
