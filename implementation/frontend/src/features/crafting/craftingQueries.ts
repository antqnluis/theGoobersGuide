import {
  getCharacterVisions,
  getLastRest,
  getLibraryContent,
  listCampaignLibraries,
  listImports,
  listLibraries,
  searchCraftingItems,
} from './craftingService'

/** Every crafting query, for cache-wide refreshes. Under ['campaigns'] so transfers refresh it too. */
export const craftingPrefix = ['campaigns', 'crafting'] as const

export const librariesKey = (userId: string) =>
  ['campaigns', 'crafting', 'libraries', userId] as const

/** The DM's own libraries; `enabled` waits until the area is first opened. */
export function librariesOptions(userId: string, enabled = true) {
  return {
    queryKey: librariesKey(userId),
    queryFn: listLibraries,
    enabled,
    refetchOnWindowFocus: true,
  }
}

export const campaignLibrariesKey = (campaignId: string, userId: string) =>
  ['campaigns', 'crafting', 'enabled', campaignId, userId] as const

/** The libraries enabled on a campaign (its owner reads them). */
export function campaignLibrariesOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: campaignLibrariesKey(campaignId, userId),
    queryFn: () => listCampaignLibraries(campaignId),
    enabled,
    refetchOnWindowFocus: true,
  }
}

export const libraryContentKey = (libraryId: string, userId: string) =>
  ['campaigns', 'crafting', 'content', libraryId, userId] as const

/** Every item and recipe of one library, for browsing and for checking a pack against it. */
export function libraryContentOptions(libraryId: string, userId: string, enabled = true) {
  return {
    queryKey: libraryContentKey(libraryId, userId),
    queryFn: () => getLibraryContent(libraryId),
    enabled,
  }
}

export const libraryImportsKey = (libraryId: string, userId: string) =>
  ['campaigns', 'crafting', 'imports', libraryId, userId] as const

export function libraryImportsOptions(libraryId: string, userId: string, enabled = true) {
  return {
    queryKey: libraryImportsKey(libraryId, userId),
    queryFn: () => listImports(libraryId),
    enabled,
  }
}

/**
 * Everything a character's visions read from, for any user. Inventory edits invalidate it, so
 * counts and still to pay follow the inventory (plan W11).
 */
/** Every character's visions, for a rest that reaches the whole table. */
export const allVisionsPrefix = ['campaigns', 'crafting', 'visions'] as const

export const visionsPrefix = (characterId: string) =>
  ['campaigns', 'crafting', 'visions', characterId] as const

export const visionsKey = (characterId: string, userId: string) =>
  ['campaigns', 'crafting', 'visions', characterId, userId] as const

/** One character's visions; `enabled` waits for the camp and for the character. */
export function visionsOptions(characterId: string, userId: string, enabled = true) {
  return {
    queryKey: visionsKey(characterId, userId),
    queryFn: () => getCharacterVisions(characterId),
    enabled: enabled && Boolean(characterId),
    // Edits from another device show on refetch (plan C12).
    refetchOnWindowFocus: true,
  }
}

export const lastRestKey = (campaignId: string, userId: string) =>
  ['campaigns', 'crafting', 'rest', campaignId, userId] as const

/** The newest rest of the campaign, for the DM tab and for live refreshes. */
export function lastRestOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: lastRestKey(campaignId, userId),
    queryFn: () => getLastRest(campaignId),
    enabled,
    refetchOnWindowFocus: true,
  }
}

/** Catalogue suggestions for what a player is typing as an item's name. */
export const suggestionsKey = (characterId: string, query: string) =>
  ['campaigns', 'crafting', 'suggestions', characterId, query.trim().toLowerCase()] as const

export function suggestionsOptions(characterId: string, query: string, enabled: boolean) {
  return {
    queryKey: suggestionsKey(characterId, query),
    queryFn: () => searchCraftingItems(characterId, query),
    enabled,
    // Suggestions change only when the DM changes a library, so a short reuse is fine.
    staleTime: 30_000,
    retry: false,
  }
}
