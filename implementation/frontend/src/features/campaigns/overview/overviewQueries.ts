import { getOverview } from './overviewService'

/** Under ['campaigns'] so a membership change refreshes it too. */
export const overviewKey = (campaignId: string, userId: string) =>
  ['campaigns', 'overview', campaignId, userId] as const

export function overviewOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: overviewKey(campaignId, userId),
    queryFn: () => getOverview(campaignId),
    enabled,
    // Realtime (useCampaignLive) refreshes this as the owner edits it; refetching on focus stays
    // as the backstop.
    refetchOnWindowFocus: true,
  }
}
