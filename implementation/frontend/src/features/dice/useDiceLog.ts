import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { diceLogKey, diceLogOptions } from './diceQueries'
import { flattenLog, mergeRollIntoLog, toRollRecord, type DiceRollRecord } from './diceRules'

export type LiveState = 'off' | 'connecting' | 'live' | 'paused'

type DiceRowPayload = Parameters<typeof toRollRecord>[0]

/**
 * The campaign's shared roll log: the first page by query, then Realtime inserts merged in by id.
 * Each time the channel (re)joins it refetches, because a roll made while it was joining or
 * paused would otherwise be missed.
 */
export function useDiceLog({
  campaignId,
  userId,
  onRemoteRoll,
}: {
  campaignId: string
  userId: string
  /** Called for each live roll made by someone else. */
  onRemoteRoll?: (roll: DiceRollRecord) => void
}) {
  const enabled = Boolean(campaignId) && Boolean(userId)
  const queryClient = useQueryClient()
  const query = useInfiniteQuery(diceLogOptions(campaignId, userId, enabled))
  const channelKey = enabled ? `${campaignId}:${userId}` : ''
  const [live, setLive] = useState<{ key: string; state: LiveState }>({ key: '', state: 'off' })
  const remoteRef = useRef(onRemoteRoll)
  useEffect(() => {
    remoteRef.current = onRemoteRoll
  })

  useEffect(() => {
    if (!channelKey) return
    const key = diceLogKey(campaignId, userId)
    let closed = false
    const channel = supabase
      .channel(`dice:${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dice_rolls',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const roll = toRollRecord(payload.new as DiceRowPayload)
          queryClient.setQueryData(key, (data: Parameters<typeof mergeRollIntoLog>[0]) =>
            mergeRollIntoLog(data, roll),
          )
          if (roll.roller_id !== userId) remoteRef.current?.(roll)
        },
      )
      .subscribe((status) => {
        if (closed) return
        if (status === 'SUBSCRIBED') {
          setLive({ key: channelKey, state: 'live' })
          void queryClient.invalidateQueries({ queryKey: key })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLive({ key: channelKey, state: 'paused' })
        }
      })

    return () => {
      closed = true
      void supabase.removeChannel(channel)
    }
  }, [campaignId, channelKey, queryClient, userId])

  const records = useMemo(() => flattenLog(query.data), [query.data])
  const state: LiveState = !channelKey ? 'off' : live.key === channelKey ? live.state : 'connecting'

  return {
    records,
    live: state,
    isLoading: query.isPending && enabled,
    isError: query.isError,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  }
}
