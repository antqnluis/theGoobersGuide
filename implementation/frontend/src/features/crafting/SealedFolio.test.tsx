import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SealedFolio } from './SealedFolio'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(kind: 'vision' | 'fragment' = 'vision', reduced = false) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as never
  const onBreak = vi.fn()
  render(
    <ul>
      <SealedFolio kind={kind} onBreak={onBreak} />
    </ul>,
  )
  return { onBreak, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) }
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))

describe('SealedFolio', () => {
  it('names only what is behind the seal, for a vision and for a fragment', () => {
    setup('vision')
    expect(screen.getByRole('button', { name: 'Break the seal on a vision' })).toBeVisible()
    expect(screen.getByText('A vision stirs')).toBeVisible()
    cleanup()
    setup('fragment')
    expect(screen.getByRole('button', { name: 'Break the seal on a fragment' })).toBeVisible()
    expect(screen.getByText('A fragment stirs')).toBeVisible()
  })

  it('cracks first, then opens once the crack has played', async () => {
    const { onBreak, user } = setup()
    const button = screen.getByRole('button', { name: 'Break the seal on a vision' })
    await user.click(button)
    expect(button).toHaveAttribute('data-breaking')
    expect(onBreak).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(530))
    expect(onBreak).toHaveBeenCalledOnce()
  })

  it('opens at once under reduced motion, with no crack', async () => {
    const { onBreak, user } = setup('vision', true)
    await user.click(screen.getByRole('button', { name: 'Break the seal on a vision' }))
    expect(onBreak).toHaveBeenCalledOnce()
  })

  it('opens only once however often it is pressed during the crack', async () => {
    const { onBreak, user } = setup()
    const button = screen.getByRole('button', { name: 'Break the seal on a vision' })
    await user.click(button)
    await user.click(button)
    act(() => void vi.advanceTimersByTime(600))
    expect(onBreak).toHaveBeenCalledOnce()
  })

  it('opens nothing when it is taken away during the crack', async () => {
    const { onBreak, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Break the seal on a vision' }))
    cleanup()
    act(() => void vi.advanceTimersByTime(600))
    expect(onBreak).not.toHaveBeenCalled()
  })
})
