import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import { useRealtimeChanges, type ChangeSubscription } from './useRealtimeChanges'

type Handler = (payload: unknown) => void

const channels = vi.hoisted(
  () =>
    [] as {
      name: string
      specs: { event: string; schema: string; table: string; filter?: string }[]
      handlers: Handler[]
      status: ((status: string) => void) | null
    }[],
)

vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn((name: string) => {
      const record = {
        name,
        specs: [] as (typeof channels)[number]['specs'],
        handlers: [] as Handler[],
        status: null as ((status: string) => void) | null,
      }
      channels.push(record)
      const instance = {
        on: (_type: string, spec: (typeof record.specs)[number], handler: Handler) => {
          record.specs.push(spec)
          record.handlers.push(handler)
          return instance
        },
        subscribe: (callback: (status: string) => void) => {
          record.status = callback
          return instance
        },
        record,
      }
      return instance
    }),
    removeChannel: vi.fn(),
  },
}))

beforeEach(() => {
  channels.length = 0
  vi.mocked(supabase.removeChannel).mockClear()
})
afterEach(cleanup)

const onChange = vi.fn()
const subscriptions: ChangeSubscription[] = [
  { table: 'notes', event: 'INSERT', filter: 'campaign_id=eq.c1', onChange },
  { table: 'character_sheets', event: 'UPDATE', onChange },
]

describe('useRealtimeChanges', () => {
  it('opens one channel with a Postgres-changes listener per subscription', () => {
    renderHook(() => useRealtimeChanges({ channel: 'x', scope: 'a', subscriptions }))
    expect(channels).toHaveLength(1)
    expect(channels[0].name).toBe('x')
    expect(channels[0].specs).toEqual([
      { event: 'INSERT', schema: 'public', table: 'notes', filter: 'campaign_id=eq.c1' },
      { event: 'UPDATE', schema: 'public', table: 'character_sheets' },
    ])
  })

  it('hands a change to its own subscription', () => {
    const first = vi.fn()
    const second = vi.fn()
    renderHook(() =>
      useRealtimeChanges({
        channel: 'x',
        scope: 'a',
        subscriptions: [
          { table: 'notes', event: 'INSERT', onChange: first },
          { table: 'adventures', event: 'UPDATE', onChange: second },
        ],
      }),
    )
    act(() => channels[0].handlers[1]({ eventType: 'UPDATE', new: { id: 'a' } }))
    expect(second).toHaveBeenCalledWith({ eventType: 'UPDATE', new: { id: 'a' } })
    expect(first).not.toHaveBeenCalled()
  })

  it('calls the latest handler without reopening the channel', () => {
    const old = vi.fn()
    const next = vi.fn()
    const { rerender } = renderHook(
      ({ handler }) =>
        useRealtimeChanges({
          channel: 'x',
          scope: 'a',
          subscriptions: [{ table: 'notes', event: 'INSERT', onChange: handler }],
        }),
      { initialProps: { handler: old } },
    )
    rerender({ handler: next })
    act(() => channels[0].handlers[0]({ eventType: 'INSERT', new: {} }))
    expect(next).toHaveBeenCalledTimes(1)
    expect(old).not.toHaveBeenCalled()
    expect(channels).toHaveLength(1)
  })

  it('reports connecting, live, and paused, and calls onJoin each time it joins', () => {
    const onJoin = vi.fn()
    const { result } = renderHook(() =>
      useRealtimeChanges({ channel: 'x', scope: 'a', subscriptions, onJoin }),
    )
    expect(result.current).toBe('connecting')
    act(() => channels[0].status!('SUBSCRIBED'))
    expect(result.current).toBe('live')
    expect(onJoin).toHaveBeenCalledTimes(1)
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
      act(() => channels[0].status!(status))
      expect(result.current).toBe('paused')
    }
    act(() => channels[0].status!('SUBSCRIBED'))
    expect(result.current).toBe('live')
    expect(onJoin).toHaveBeenCalledTimes(2)
  })

  it('is off, with no channel, without a scope', () => {
    const { result } = renderHook(() =>
      useRealtimeChanges({ channel: 'x', scope: '', subscriptions }),
    )
    expect(result.current).toBe('off')
    expect(channels).toHaveLength(0)
  })

  it('closes the channel on unmount and ignores a status that arrives after', () => {
    const onJoin = vi.fn()
    const { unmount } = renderHook(() =>
      useRealtimeChanges({ channel: 'x', scope: 'a', subscriptions, onJoin }),
    )
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    act(() => channels[0].status!('SUBSCRIBED'))
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('moves to a new channel when the scope changes, starting from connecting', () => {
    const { result, rerender } = renderHook(
      ({ scope }) => useRealtimeChanges({ channel: 'x', scope, subscriptions }),
      { initialProps: { scope: 'a' } },
    )
    act(() => channels[0].status!('SUBSCRIBED'))
    expect(result.current).toBe('live')
    rerender({ scope: 'b' })
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(channels).toHaveLength(2)
    expect(result.current).toBe('connecting')
  })
})
