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
