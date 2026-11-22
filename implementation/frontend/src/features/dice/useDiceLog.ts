import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { useRealtimeChanges, type LiveState } from '../../lib/useRealtimeChanges'
import { diceLogKey, diceLogOptions } from './diceQueries'
import { flattenLog, mergeRollIntoLog, toRollRecord, type DiceRollRecord } from './diceRules'

export type { LiveState }

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
  const remoteRef = useRef(onRemoteRoll)
  useEffect(() => {
    remoteRef.current = onRemoteRoll
  })

  const key = diceLogKey(campaignId, userId)
  const live = useRealtimeChanges({
    channel: `dice:${campaignId}`,
    scope: enabled ? `${campaignId}:${userId}` : '',
    subscriptions: [
      {
        table: 'dice_rolls',
        event: 'INSERT',
        filter: `campaign_id=eq.${campaignId}`,
        onChange: (change) => {
          const roll = toRollRecord(change.new as DiceRowPayload)
          queryClient.setQueryData(key, (data: Parameters<typeof mergeRollIntoLog>[0]) =>
            mergeRollIntoLog(data, roll),
          )
          if (roll.roller_id !== userId) remoteRef.current?.(roll)
        },
      },
    ],
    onJoin: () => void queryClient.invalidateQueries({ queryKey: key }),
  })
  const records = useMemo(() => flattenLog(query.data), [query.data])

  return {
    records,
    live,
    isLoading: query.isPending && enabled,
    isError: query.isError,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  }
}
