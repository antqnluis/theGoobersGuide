import {
  countAdventureRequests,
  countCharacterAdventures,
  getAdventure,
  isAdventureUnavailable,
  listAdventures,
  listInvitations,
} from './adventureService'

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

export const invitationsKey = (campaignId: string, userId: string) =>
  ['campaigns', 'adventures', 'invitations', campaignId, userId] as const

/** The caller's open invitations; the board's "Waiting for you" group reads them. */
export function invitationsOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: invitationsKey(campaignId, userId),
    queryFn: () => listInvitations(campaignId),
    enabled,
    refetchOnWindowFocus: true,
  }
}

export const requestCountKey = (campaignId: string, userId: string) =>
  ['campaigns', 'adventures', 'requests', campaignId, userId] as const

/**
 * How many requests wait for the caller (D13): read when the camp opens and on focus. A failed
 * read shows no count, so it never retries loudly or blocks the camp.
 */
export function requestCountOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: requestCountKey(campaignId, userId),
    queryFn: () => countAdventureRequests(campaignId),
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
  }
}

export const characterAdventureCountKey = (characterId: string, userId: string) =>
  ['campaigns', 'adventures', 'character-count', characterId, userId] as const

/** What deleting a character does to adventures (D11); read when the confirmation opens. */
export function characterAdventureCountOptions(
  characterId: string,
  userId: string,
  enabled = true,
) {
  return {
    queryKey: characterAdventureCountKey(characterId, userId),
    queryFn: () => countCharacterAdventures(characterId),
    enabled,
    // A stale count could understate what a delete removes, so read it afresh each time.
    staleTime: 0,
    gcTime: 0,
  }
}
