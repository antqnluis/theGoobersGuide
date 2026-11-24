import { listCharacterImports } from './characterImportService'
import { listCharacterResources } from './resourceService'
import { listCharacterItems, listCoinTransactions } from './inventoryService'
import {
  getCharacterPortraitUrl,
  getCharacterSheet,
  listCampaignCharacters,
} from './characterService'

/** Key prefixes live under ['campaigns'] so ownership transfers invalidate them too. */
export const campaignCharactersKey = (campaignId: string, userId: string) =>
  ['campaigns', 'characters', campaignId, userId] as const

export const characterSheetKey = (characterId: string, userId: string) =>
  ['campaigns', 'characters', 'sheet', characterId, userId] as const

/** Every inventory query, for invalidation when membership changes (items are per character). */
export const characterItemsPrefix = ['campaigns', 'characters', 'items'] as const

/** Every tracker query, for invalidation when membership changes (trackers are per character). */
export const characterResourcesPrefix = ['campaigns', 'characters', 'resources'] as const

export const characterResourcesKey = (characterId: string, userId: string) =>
  ['campaigns', 'characters', 'resources', characterId, userId] as const

/** Every coin-log query, for invalidation when membership changes. */
export const coinLogPrefix = ['campaigns', 'characters', 'coin-log'] as const

export const coinLogKey = (characterId: string, userId: string) =>
  ['campaigns', 'characters', 'coin-log', characterId, userId] as const

/** Every import-history query, for invalidation when membership changes. */
export const characterImportsPrefix = ['campaigns', 'characters', 'imports'] as const

export const characterImportsKey = (characterId: string, userId: string) =>
  ['campaigns', 'characters', 'imports', characterId, userId] as const

/** Inventory rows. Under the characters prefix so leaving or removal marks them stale too. */
export const characterItemsKey = (characterId: string, userId: string) =>
  ['campaigns', 'characters', 'items', characterId, userId] as const

/** Every character the signed-in member may see in the campaign, oldest first. */
export function campaignCharactersOptions(campaignId: string, userId: string) {
  return {
    queryKey: campaignCharactersKey(campaignId, userId),
    queryFn: () => listCampaignCharacters(campaignId),
  }
}

/** A portrait's signed link. The path changes with every upload, so it is the whole key. */
export function characterPortraitOptions(path: string | null) {
  return {
    queryKey: ['campaigns', 'characters', 'portrait', path] as const,
    queryFn: () => getCharacterPortraitUrl(path ?? ''),
    enabled: Boolean(path),
    // Links last an hour; refresh well before they lapse.
    staleTime: 30 * 60 * 1000,
  }
}

export function characterSheetOptions(characterId: string, userId: string) {
  return {
    queryKey: characterSheetKey(characterId, userId),
    queryFn: () => getCharacterSheet(characterId),
  }
}

/** The character's items; pass `enabled: false` until the sheet itself is readable. */
export function characterItemsOptions(characterId: string, userId: string, enabled = true) {
  return {
    queryKey: characterItemsKey(characterId, userId),
    queryFn: () => listCharacterItems(characterId),
    enabled,
  }
}

/** The character's trackers; pass `enabled: false` until the sheet itself is readable. */
export function characterResourcesOptions(characterId: string, userId: string, enabled = true) {
  return {
    queryKey: characterResourcesKey(characterId, userId),
    queryFn: () => listCharacterResources(characterId),
    enabled,
  }
}

/** The recent coin changes; `enabled` waits until the log is opened. */
export function coinLogOptions(characterId: string, userId: string, enabled = true) {
  return {
    queryKey: coinLogKey(characterId, userId),
    queryFn: () => listCoinTransactions(characterId),
    enabled,
  }
}

/** A character's import history; `enabled` waits until the section is opened. */
export function characterImportsOptions(characterId: string, userId: string, enabled = true) {
  return {
    queryKey: characterImportsKey(characterId, userId),
    queryFn: () => listCharacterImports(characterId),
    enabled,
  }
}
