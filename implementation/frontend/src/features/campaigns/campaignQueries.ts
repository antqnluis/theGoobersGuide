import { listAccessibleCampaigns } from './campaignService'

/** The signed-in player's campaign list, shared by the selector and the arrival prefetch. */
export function campaignListOptions(userId: string) {
  return {
    queryKey: ['campaigns', 'list', userId],
    queryFn: () => listAccessibleCampaigns(userId),
  }
}
