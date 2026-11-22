import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type LiveState = 'off' | 'connecting' | 'live' | 'paused'

/** The part of a Postgres-changes payload the app reads. `new` is the row after the change. */
export type RowChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
}

export type ChangeSubscription = {
  table: string
  /** Never subscribe to DELETE: delete events carry no row the database policy has checked. */
  event: 'INSERT' | 'UPDATE' | '*'
  /** A column filter such as `campaign_id=eq.<id>`; only one column, `eq`, is supported by Realtime. */
  filter?: string
  onChange: (change: RowChange) => void
}

/**
 * One Realtime channel of Postgres changes, with a state the UI can show. The database checks the
 * subscriber's select policy per row, so only rows this player may read arrive. Each time the
 * channel (re)joins, `onJoin` runs: a change made while it was joining or paused is never replayed,
 * so callers refetch there.
 *
 * `scope` names what the subscription is for (for example the campaign and user); a new scope
 * closes the channel and opens another. Pass an empty scope, or `enabled: false`, for none.
 * `subscriptions` and `onJoin` may change every render; they are read when an event arrives.
 */
export function useRealtimeChanges({
  channel,
  scope,
  subscriptions,
  onJoin,
}: {
  channel: string
  scope: string
  subscriptions: readonly ChangeSubscription[]
  onJoin?: () => void
}): LiveState {
  const [live, setLive] = useState<{ scope: string; state: LiveState }>({ scope: '', state: 'off' })
  const latest = useRef({ subscriptions, onJoin })
  useEffect(() => {
    latest.current = { subscriptions, onJoin }
  })

  useEffect(() => {
    if (!scope) return
    let closed = false
    let joined = supabase.channel(channel)
    latest.current.subscriptions.forEach((subscription, index) => {
      const spec = {
        event: subscription.event,
        schema: 'public',
        table: subscription.table,
        ...(subscription.filter ? { filter: subscription.filter } : {}),
      } as { event: 'INSERT'; schema: string; table: string; filter?: string }
      joined = joined.on('postgres_changes', spec, (payload) => {
        latest.current.subscriptions[index]?.onChange(payload as unknown as RowChange)
      })
    })
    joined.subscribe((status) => {
      if (closed) return
      if (status === 'SUBSCRIBED') {
        setLive({ scope, state: 'live' })
        latest.current.onJoin?.()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setLive({ scope, state: 'paused' })
      }
    })

    return () => {
      closed = true
      void supabase.removeChannel(joined)
    }
  }, [channel, scope])

  if (!scope) return 'off'
  return live.scope === scope ? live.state : 'connecting'
}
