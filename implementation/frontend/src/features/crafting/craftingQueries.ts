import {
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
 * counts and still to pay follow the inventory (plan W11). Nothing reads it before Phase 4.
 */
export const visionsPrefix = (characterId: string) =>
  ['campaigns', 'crafting', 'visions', characterId] as const

export const visionsKey = (characterId: string, userId: string) =>
  ['campaigns', 'crafting', 'visions', characterId, userId] as const

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
