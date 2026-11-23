import type { ItemRarity } from './characterTypes'

/** The rarity's name as the inventory shows it, beside its colour. */
export const rarityLabels: Record<ItemRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  very_rare: 'Very rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
}

/** Common is the plain default, so a row names a rarity (and colours itself) only above it. */
export function isNotable(rarity: ItemRarity) {
  return rarity !== 'common'
}

/** A stored value as a rarity; anything unknown reads as common. */
export function toRarity(value: string | null | undefined): ItemRarity {
  return value && Object.hasOwn(rarityLabels, value) ? (value as ItemRarity) : 'common'
}
