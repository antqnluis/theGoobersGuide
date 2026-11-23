import { describe, expect, it } from 'vitest'
import { itemRarities } from './characterTypes'
import { isNotable, rarityLabels, toRarity } from './itemRarity'

describe('item rarity', () => {
  it('names every rarity, in order, in words', () => {
    expect(itemRarities.map((rarity) => rarityLabels[rarity])).toEqual([
      'Common',
      'Uncommon',
      'Rare',
      'Very rare',
      'Legendary',
      'Artifact',
    ])
  })

  it('treats only the steps above common as notable', () => {
    expect(itemRarities.filter(isNotable)).toEqual([
      'uncommon',
      'rare',
      'very_rare',
      'legendary',
      'artifact',
    ])
  })

  it('reads an unknown or missing stored value as common', () => {
    expect(toRarity('rare')).toBe('rare')
    expect(toRarity('mythic')).toBe('common')
    expect(toRarity('toString')).toBe('common')
    expect(toRarity(null)).toBe('common')
  })
})
