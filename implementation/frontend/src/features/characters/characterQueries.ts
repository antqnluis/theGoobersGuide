import { getCharacterSheet, listCampaignCharacters } from './characterService'

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

export function characterSheetOptions(characterId: string, userId: string) {
  return {
    queryKey: characterSheetKey(characterId, userId),
    queryFn: () => getCharacterSheet(characterId),
  }
}
