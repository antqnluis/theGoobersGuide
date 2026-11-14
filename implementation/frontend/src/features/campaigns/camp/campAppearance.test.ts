import { describe, expect, it } from 'vitest'
import { adventurerAppearance } from './adventurerAppearance'
import { appearanceError, isValidAppearance, sameAppearance } from './campAppearance'

const look = { cloak: 1, skin: 2, headwear: 'hat', pack: 'quiver' } as const

describe('campAppearance', () => {
  it('accepts every look the camp can derive and rejects anything outside the lists', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      expect(isValidAppearance(adventurerAppearance(id))).toBe(true)
    }
    expect(isValidAppearance({ ...look, cloak: 8 })).toBe(false)
    expect(isValidAppearance({ ...look, cloak: -1 })).toBe(false)
    expect(isValidAppearance({ ...look, skin: 5 })).toBe(false)
    expect(isValidAppearance({ ...look, skin: 1.5 })).toBe(false)
    expect(isValidAppearance({ ...look, headwear: 'crown' as never })).toBe(false)
    expect(isValidAppearance({ ...look, pack: 'sword' as never })).toBe(false)
  })

  it('compares all four choices', () => {
    expect(sameAppearance(look, { ...look })).toBe(true)
    expect(sameAppearance(look, { ...look, pack: 'none' })).toBe(false)
    expect(sameAppearance(look, { ...look, cloak: 0 })).toBe(false)
  })

  it('maps known errors to copy and everything else to the fallback', () => {
    expect(appearanceError({ message: 'appearance_campaign_unavailable' }, 'x')).toBe(
      "You're no longer a member of this campaign.",
    )
    expect(appearanceError({ message: 'appearance_invalid' }, 'x')).toMatch(/Choose a cloak/)
    expect(appearanceError(new Error('network down'), 'fallback')).toBe('fallback')
  })
})
