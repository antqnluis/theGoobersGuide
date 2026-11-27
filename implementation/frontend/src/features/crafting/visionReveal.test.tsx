import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, useSealedCount, useSealedReveal } from './visionReveal'

const rest = '2026-11-27T21:04:00Z'
const ids = ['recipe-a', 'fragment-b']

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => window.localStorage.clear())

describe('useSealedReveal', () => {
  it('seals every new id until it is opened, and records what was', () => {
    const { result } = renderHook(() => useSealedReveal('char-1', rest, ids))
    expect([...result.current.sealed]).toEqual(ids)
    expect(result.current.total).toBe(2)

    act(() => result.current.open('recipe-a'))
    expect([...result.current.sealed]).toEqual(['fragment-b'])
    expect([...result.current.entering]).toEqual(['recipe-a'])
    expect(
      JSON.parse(window.localStorage.getItem(`goobers-visions-opened:char-1:${rest}`)!),
    ).toEqual(['recipe-a'])
  })

  it('opens everything at once, and replays by forgetting it', () => {
    const { result } = renderHook(() => useSealedReveal('char-1', rest, ids))
    act(() => result.current.openAll())
    expect(result.current.sealed.size).toBe(0)
    expect([...result.current.entering]).toEqual(ids)
    act(() => result.current.replay())
    expect(result.current.sealed.size).toBe(2)
    expect(result.current.entering.size).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })

  it('starts from what an earlier visit opened, with no entrance to play', () => {
    window.localStorage.setItem(
      `goobers-visions-opened:char-1:${rest}`,
      JSON.stringify(['recipe-a']),
    )
    const { result } = renderHook(() => useSealedReveal('char-1', rest, ids))
    expect([...result.current.sealed]).toEqual(['fragment-b'])
    expect(result.current.entering.size).toBe(0)
  })

  it('keeps one record per character and drops an earlier rest’s', () => {
    window.localStorage.setItem('goobers-visions-opened:char-1:old-rest', '["x"]')
    window.localStorage.setItem('goobers-visions-opened:char-2:old-rest', '["y"]')
    const { result } = renderHook(() => useSealedReveal('char-1', rest, ids))
    act(() => result.current.open('recipe-a'))
    expect(window.localStorage.getItem('goobers-visions-opened:char-1:old-rest')).toBeNull()
    expect(window.localStorage.getItem('goobers-visions-opened:char-2:old-rest')).not.toBeNull()
  })

  it('ignores a record it can’t read, and seals nothing without a rest', () => {
    window.localStorage.setItem(`goobers-visions-opened:char-1:${rest}`, '{not json')
    expect(renderHook(() => useSealedReveal('char-1', rest, ids)).result.current.sealed.size).toBe(
      2,
    )
    expect(renderHook(() => useSealedReveal('char-1', null, [])).result.current.sealed.size).toBe(0)
  })
})

describe('useSealedCount', () => {
  it('counts what is still sealed, and follows the list as seals break', () => {
    const count = renderHook(() => useSealedCount('char-1', rest, ids))
    const reveal = renderHook(() => useSealedReveal('char-1', rest, ids))
    expect(count.result.current).toBe(2)
    act(() => reveal.result.current.open('recipe-a'))
    expect(count.result.current).toBe(1)
    act(() => reveal.result.current.openAll())
    expect(count.result.current).toBe(0)
    act(() => reveal.result.current.replay())
    expect(count.result.current).toBe(2)
  })

  it('counts every new id when nothing can be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(renderHook(() => useSealedCount('char-1', rest, ids)).result.current).toBe(2)
    expect(renderHook(() => useSealedCount('char-1', null, [])).result.current).toBe(0)
  })
})

describe('prefersReducedMotion', () => {
  it('reads the system setting, and is false where there is none to read', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
    expect(prefersReducedMotion()).toBe(true)
    window.matchMedia = undefined as never
    expect(prefersReducedMotion()).toBe(false)
  })
})
