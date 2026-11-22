import { infiniteQueryOptions } from '@tanstack/react-query'
import { listRolls, logPageSize } from './diceService'

/** The campaign's roll log. Includes the user because private rolls differ per player. */
export const diceLogKey = (campaignId: string, userId: string) =>
  ['dice', campaignId, userId, 'log'] as const

export function diceLogOptions(campaignId: string, userId: string, enabled = true) {
  return infiniteQueryOptions({
    queryKey: diceLogKey(campaignId, userId),
    queryFn: ({ pageParam }) => listRolls(campaignId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.length === logPageSize ? last[last.length - 1].created_at : undefined,
    enabled,
  })
}
