import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeSubscription } from '../../lib/useRealtimeChanges'
import { useCampaignLive } from './useCampaignLive'

const live = vi.hoisted(() => ({
  options: null as null | {
    channel: string
    scope: string
    subscriptions: readonly ChangeSubscription[]
    onJoin?: () => void
  },
}))

vi.mock('../../lib/useRealtimeChanges', () => ({
  useRealtimeChanges: (options: NonNullable<typeof live.options>) => {
    live.options = options
    return 'live'
  },
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const adventureId = '00000000-0000-4000-8000-000000000051'

const adventuresList = ['campaigns', 'adventures', campaignId, userId]
const adventureDetail = ['campaigns', 'adventures', 'detail', adventureId, userId]
const requests = ['campaigns', 'adventures', 'requests', campaignId, userId]
const invitations = ['campaigns', 'adventures', 'invitations', campaignId, userId]
const notesList = ['campaigns', 'notes', campaignId, userId]
const noteDetail = ['campaigns', 'notes', 'detail', 'n1', userId]
const sheet = (id: string) => ['campaigns', 'characters', 'sheet', id, userId]

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

function setup(enabled = true) {
  const spy = vi.spyOn(client, 'invalidateQueries')
  renderHook(() => useCampaignLive(campaignId, userId, enabled), { wrapper })
  return spy
}

/** Delivers a change to the subscription for this table and event. */
function emit(table: string, event: 'INSERT' | 'UPDATE', row: Record<string, unknown>) {
  const subscription = live.options!.subscriptions.find(
    (entry) => entry.table === table && entry.event === event,
  )
  if (!subscription) throw new Error(`no subscription for ${event} on ${table}`)
  act(() => subscription.onChange({ eventType: event, new: row }))
}

const settle = () => act(() => vi.advanceTimersByTime(300))
const keysOf = (spy: ReturnType<typeof setup>) =>
  spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))

beforeEach(() => {
  vi.useFakeTimers()
  client = new QueryClient()
  live.options = null
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('what it subscribes to', () => {
  it('watches sheets, notes, and adventures, inserts and updates only, scoped to the campaign', () => {
    setup()
    const options = live.options!
    expect(options.channel).toBe(`campaign-live:${campaignId}`)
    expect(options.scope).toBe(`${campaignId}:${userId}`)
    const seen = options.subscriptions.map((entry) => `${entry.table}:${entry.event}`).sort()
    expect(seen).toEqual([
      'adventure_handoffs:INSERT',
      'adventure_objectives:INSERT',
      'adventure_objectives:UPDATE',
      'adventure_participants:INSERT',
      'adventure_participants:UPDATE',
      'adventure_updates:INSERT',
      'adventures:INSERT',
      'adventures:UPDATE',
      'character_sheets:UPDATE',
      'notes:INSERT',
      'notes:UPDATE',
    ])
    expect(options.subscriptions.some((entry) => entry.event === '*')).toBe(false)
    for (const entry of options.subscriptions) {
      if (
        ['notes', 'adventures', 'adventure_participants', 'adventure_handoffs'].includes(
          entry.table,
        )
      ) {
        expect(entry.filter).toBe(`campaign_id=eq.${campaignId}`)
      }
    }
  })

  it('is off until the campaign has loaded', () => {
    setup(false)
    expect(live.options!.scope).toBe('')
  })
})

describe('refreshing what changed', () => {
  it('refetches a sheet that changed', () => {
    const spy = setup()
    emit('character_sheets', 'UPDATE', { character_id: 'c1' })
    settle()
    expect(keysOf(spy)).toEqual([JSON.stringify(sheet('c1'))])
  })

  it('refetches the notes list and the note', () => {
    const spy = setup()
    emit('notes', 'UPDATE', { id: 'n1' })
    settle()
    expect(keysOf(spy).sort()).toEqual(
      [JSON.stringify(noteDetail), JSON.stringify(notesList)].sort(),
    )
  })

  it('refetches an adventure, the list, and the requests when an adventure or a participant changes', () => {
    const spy = setup()
    emit('adventures', 'INSERT', { id: adventureId })
    settle()
    expect(keysOf(spy).sort()).toEqual(
      [adventureDetail, adventuresList, invitations, requests]
        .map((key) => JSON.stringify(key))
        .sort(),
    )
    spy.mockClear()
    emit('adventure_participants', 'UPDATE', { adventure_id: adventureId })
    settle()
    expect(keysOf(spy)).toContain(JSON.stringify(adventuresList))
    expect(keysOf(spy)).toContain(JSON.stringify(requests))
  })

  it('refetches only the open adventure for an update, unless the list already shows it', () => {
    const spy = setup()
    emit('adventure_updates', 'INSERT', { adventure_id: adventureId })
    settle()
    expect(keysOf(spy)).toEqual([JSON.stringify(adventureDetail)])

    spy.mockClear()
    client.setQueryData(adventuresList, [{ id: adventureId }])
    emit('adventure_objectives', 'UPDATE', { adventure_id: adventureId })
    settle()
    expect(keysOf(spy).sort()).toEqual(
      [adventureDetail, adventuresList].map((key) => JSON.stringify(key)).sort(),
    )
  })

  it('refetches the adventure and its sources when a handoff source arrives', () => {
    const spy = setup()
    emit('adventure_handoffs', 'INSERT', { adventure_id: adventureId })
    settle()
    expect(keysOf(spy).sort()).toEqual(
      [adventureDetail, ['campaigns', 'adventures', 'handoffs', adventureId, userId]]
        .map((key) => JSON.stringify(key))
        .sort(),
    )
    spy.mockClear()
    emit('adventure_handoffs', 'INSERT', {})
    settle()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not refetch the list for another campaign’s objective', () => {
    const spy = setup()
    client.setQueryData(adventuresList, [{ id: 'someone-else' }])
    emit('adventure_objectives', 'INSERT', { adventure_id: adventureId })
    settle()
    expect(keysOf(spy)).toEqual([JSON.stringify(adventureDetail)])
  })

  it('ignores an event without the ids it needs', () => {
    const spy = setup()
    emit('character_sheets', 'UPDATE', {})
    emit('adventure_updates', 'INSERT', {})
    settle()
    expect(spy).not.toHaveBeenCalled()
  })

  it('refetches once for a burst of changes', () => {
    const spy = setup()
    for (let i = 0; i < 5; i += 1) emit('notes', 'UPDATE', { id: 'n1' })
    emit('character_sheets', 'UPDATE', { character_id: 'c1' })
    emit('character_sheets', 'UPDATE', { character_id: 'c1' })
    expect(spy).not.toHaveBeenCalled()
    settle()
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('waits for the burst to settle rather than refetching per event', () => {
    const spy = setup()
    emit('notes', 'UPDATE', { id: 'n1' })
    act(() => vi.advanceTimersByTime(100))
    expect(spy).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(spy).toHaveBeenCalled()
  })

  it('drops pending refetches when it unmounts', () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = renderHook(() => useCampaignLive(campaignId, userId, true), { wrapper })
    emit('notes', 'UPDATE', { id: 'n1' })
    unmount()
    settle()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('joining the channel', () => {
  it('refetches what was loaded before the join, not what was just read', () => {
    vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
    client.setQueryData(notesList, [])
    vi.setSystemTime(new Date('2026-11-22T12:00:10Z'))
    client.setQueryData(adventuresList, [])
    const spy = setup()
    act(() => live.options!.onJoin!())

    const calls = spy.mock.calls
    const [notes, adventures, sheets] = calls.map(([filters]) => filters!)
    expect(calls).toHaveLength(3)
    expect(notes.queryKey).toEqual(['campaigns', 'notes'])
    expect(adventures.queryKey).toEqual(['campaigns', 'adventures'])
    expect(sheets.queryKey).toEqual(['campaigns', 'characters', 'sheet'])

    const matches = (filters: typeof notes) =>
      client
        .getQueryCache()
        .findAll({ queryKey: filters.queryKey, predicate: filters.predicate as never })
        .map((query) => JSON.stringify(query.queryKey))
    expect(matches(notes)).toEqual([JSON.stringify(notesList)])
    expect(matches(adventures)).toEqual([])
  })
})
