import { getNpc, getNpcPortraitUrl, isNpcUnavailable, listNpcs } from './npcService'

/** Every NPC query, for the membership cache. Under ['campaigns'] so transfers refresh it too. */
export const npcsPrefix = ['campaigns', 'npcs'] as const

export const npcsKey = (campaignId: string, userId: string) =>
  ['campaigns', 'npcs', campaignId, userId] as const

export const npcKey = (npcId: string, userId: string) =>
  ['campaigns', 'npcs', 'detail', npcId, userId] as const

/** The campaign's NPCs; `enabled` waits until the NPCs tab is first opened. */
export function npcsOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: npcsKey(campaignId, userId),
    queryFn: () => listNpcs(campaignId),
    enabled,
    // Realtime (useCampaignLive) refreshes this as others change it; refetching on focus stays as
    // the backstop for deletions and for entries that stopped being readable.
    refetchOnWindowFocus: true,
  }
}

/** A portrait's signed link. The path changes with every upload, so it is the whole key. */
export function npcPortraitOptions(path: string | null) {
  return {
    queryKey: ['campaigns', 'npcs', 'portrait', path] as const,
    queryFn: () => getNpcPortraitUrl(path ?? ''),
    enabled: Boolean(path),
    // Links last an hour; refresh well before they lapse.
    staleTime: 30 * 60 * 1000,
  }
}

/** One NPC with its text; `enabled` waits until an NPC is opened. */
export function npcOptions(npcId: string, userId: string, enabled = true) {
  return {
    queryKey: npcKey(npcId, userId),
    queryFn: () => getNpc(npcId),
    enabled,
    // An NPC that is gone will not come back.
    retry: (failures: number, error: unknown) => !isNpcUnavailable(error) && failures < 1,
    refetchOnWindowFocus: true,
  }
}
