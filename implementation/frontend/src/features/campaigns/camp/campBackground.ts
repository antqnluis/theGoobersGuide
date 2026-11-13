// The player's choice of camp background. By default the camp follows the
// campaign's own planet; a player can pin any of the six worlds instead. The
// choice is cosmetic and personal, so it lives only on this device, per campaign.

import type { CampKind, CampWorld } from './campPalette.ts'

export type CampBackground = 'campaign' | CampKind

export const backgroundChoices: ReadonlyArray<{
  value: CampBackground
  label: string
  detail: string
}> = [
  { value: 'campaign', label: 'Campaign’s world', detail: 'Follows this campaign’s planet' },
  { value: 'terrestrial', label: 'Grass and pines', detail: 'Meadow under the pines' },
  { value: 'desert', label: 'Dunes', detail: 'Sand, cacti, and wind' },
  { value: 'volcanic', label: 'Ash and basalt', detail: 'Embers over black stone' },
  { value: 'frozen', label: 'Snow', detail: 'Frost, snowfall, and firs' },
  { value: 'rocky', label: 'Scree', detail: 'Boulders and drifting dust' },
  { value: 'gas', label: 'Cloud reef', detail: 'A highland above the clouds' },
]

const kinds = new Set<string>(backgroundChoices.map(({ value }) => value))

export function isCampBackground(value: unknown): value is CampBackground {
  return typeof value === 'string' && kinds.has(value)
}

const storageKey = (campaignId: string) => `camp-background:${campaignId}`

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The saved choice, or the campaign's own world when there is none or storage fails. */
export function readBackground(storage: Storage | null, campaignId: string): CampBackground {
  try {
    const saved = storage?.getItem(storageKey(campaignId))
    return isCampBackground(saved) ? saved : 'campaign'
  } catch {
    return 'campaign'
  }
}

export function writeBackground(
  storage: Storage | null,
  campaignId: string,
  background: CampBackground,
) {
  try {
    if (background === 'campaign') storage?.removeItem(storageKey(campaignId))
    else storage?.setItem(storageKey(campaignId), background)
  } catch {
    // Private windows and blocked storage: the choice just lasts for this visit.
  }
}

/** The world to draw: the planet's own, or its colours worn by the chosen landscape. */
export function worldFor(planet: CampWorld, background: CampBackground): CampWorld {
  return background === 'campaign' ? planet : { ...planet, kind: background }
}
