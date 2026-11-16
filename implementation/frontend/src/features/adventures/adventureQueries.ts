import { getAdventure, isAdventureUnavailable, listAdventures } from './adventureService'

/** Every adventure query, for the membership cache. Under ['campaigns'] so transfers refresh it too. */
export const adventuresPrefix = ['campaigns', 'adventures'] as const

export const adventuresKey = (campaignId: string, userId: string) =>
  ['campaigns', 'adventures', campaignId, userId] as const

export const adventureKey = (adventureId: string, userId: string) =>
  ['campaigns', 'adventures', 'detail', adventureId, userId] as const

/** The campaign's adventures; `enabled` waits until the Adventures destination is first opened. */
export function adventuresOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: adventuresKey(campaignId, userId),
    queryFn: () => listAdventures(campaignId),
    enabled,
    // Without Realtime (M7), refetch on focus and on opening so shared edits show up.
    refetchOnWindowFocus: true,
  }
}

/** One adventure with its children; `enabled` waits until an adventure is opened. */
export function adventureOptions(adventureId: string, userId: string, enabled = true) {
  return {
    queryKey: adventureKey(adventureId, userId),
    queryFn: () => getAdventure(adventureId),
    enabled,
    // Like the app's other queries it retries once, but an adventure that is gone will not come back.
    retry: (failures: number, error: unknown) => !isAdventureUnavailable(error) && failures < 1,
    refetchOnWindowFocus: true,
  }
}
