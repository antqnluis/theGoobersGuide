import {
  getLibraryContent,
  listCampaignLibraries,
  listImports,
  listLibraries,
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
