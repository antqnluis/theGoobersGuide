// A seeded, cosmetic-only look for each party member's pixel adventurer. It is
// derived from the profile id alone and carries no class, level, or stats.

export const cloakCount = 8
export const skinCount = 5
export const headwear = ['hood', 'hat', 'cap', 'bare'] as const
export const packs = ['satchel', 'bedroll', 'quiver', 'none'] as const

export type AdventurerAppearance = {
  /** Index of the cloak colour ramp, 0 to cloakCount - 1. */
  cloak: number
  /** Index of the skin colour ramp, 0 to skinCount - 1. */
  skin: number
  headwear: (typeof headwear)[number]
  pack: (typeof packs)[number]
}

// FNV-1a with its own salt, so adventurers never correlate with planets.
function hash(text: string) {
  let value = 2166136261
  for (const character of text) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  }
  return value >>> 0
}

export function adventurerAppearance(profileId: string): AdventurerAppearance {
  let seed = hash(`camp-adventurer-v1:${profileId}`)
  function pick(count: number) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return Math.floor((seed / 4294967296) * count)
  }
  return {
    cloak: pick(cloakCount),
    skin: pick(skinCount),
    headwear: headwear[pick(headwear.length)],
    pack: packs[pick(packs.length)],
  }
}
