// The player's choice of camp background. By default the camp follows the
// campaign's own planet; a player can pin any of the six worlds instead. The
// choice is cosmetic and personal, so it lives only on this device, per campaign.

import type { CampKind, CampWorld } from './campPalette.ts'
import { hexToRgb, labToRgb, rgbToHex, rgbToLab } from './oklab.ts'

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

// A hue shift turns every colour of the world around the colour wheel, in whole
// degrees from -180 to 180. Like the background it is personal and per device.
export const hueRange = { min: -180, max: 180, step: 15 } as const

export function isHueShift(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= hueRange.min &&
    value <= hueRange.max
  )
}

const hueKey = (campaignId: string) => `camp-hue:${campaignId}`

/** The saved hue shift in degrees, or 0 when there is none or storage fails. */
export function readHue(storage: Storage | null, campaignId: string): number {
  try {
    const saved = Number(storage?.getItem(hueKey(campaignId)))
    return isHueShift(saved) ? saved : 0
  } catch {
    return 0
  }
}

export function writeHue(storage: Storage | null, campaignId: string, degrees: number) {
  try {
    if (degrees === 0) storage?.removeItem(hueKey(campaignId))
    else storage?.setItem(hueKey(campaignId), String(degrees))
  } catch {
    // Private windows and blocked storage: the choice just lasts for this visit.
  }
}

/** Turns a colour around the wheel in OKLab, keeping its lightness and chroma. */
export function rotateHue(hex: string, degrees: number) {
  const [lightness, a, b] = rgbToLab(hexToRgb(hex))
  const angle = (degrees * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return rgbToHex(labToRgb([lightness, a * cos - b * sin, a * sin + b * cos]))
}

/**
 * The world to draw: the planet's own, or its colours worn by the chosen
 * landscape, with every colour turned by the hue shift.
 */
export function worldFor(planet: CampWorld, background: CampBackground, hue = 0): CampWorld {
  const base = background === 'campaign' ? planet : { ...planet, kind: background }
  if (hue === 0) return base
  return {
    ...base,
    palette: base.palette.map((color) => rotateHue(color, hue)) as unknown as CampWorld['palette'],
    air: rotateHue(base.air, hue) as CampWorld['air'],
  }
}
