import type { CampaignListItem } from './campaignTypes'

// Each type has its own mineral or atmospheric colors. The two palettes give
// campaigns of the same type different climates without losing their identity.
const worlds = [
  {
    kind: 'terrestrial',
    palettes: [
      ['#092a52', '#278b9e', '#526d32', '#c7ad76'],
      ['#152f56', '#307c9b', '#287053', '#bc9164'],
    ],
    air: '#72c8ff',
    haze: 0.34,
    size: 0.91,
  },
  {
    kind: 'desert',
    palettes: [
      ['#52281f', '#a95633', '#dd9c57', '#f4d29b'],
      ['#49312e', '#91624a', '#c39868', '#f2d7a1'],
    ],
    air: '#edaa74',
    haze: 0.19,
    size: 0.84,
  },
  {
    kind: 'volcanic',
    palettes: [
      ['#19131c', '#534143', '#8b574c', '#ffb048'],
      ['#1b1617', '#4f3939', '#815748', '#ff8e35'],
    ],
    air: '#d27554',
    haze: 0.12,
    size: 0.87,
  },
  {
    kind: 'gas',
    palettes: [
      ['#554271', '#9e6d8a', '#d9a987', '#f8dec1'],
      ['#253c5b', '#467e9a', '#92b4bf', '#dfddd1'],
    ],
    air: '#afbfff',
    haze: 0.28,
    size: 1,
  },
  {
    kind: 'frozen',
    palettes: [
      ['#254863', '#568fae', '#b5d2df', '#eef3ed'],
      ['#394564', '#778eb2', '#c4c7df', '#f3eff7'],
    ],
    air: '#a5d9ff',
    haze: 0.24,
    size: 0.83,
  },
  {
    kind: 'rocky',
    palettes: [
      ['#302b33', '#67606a', '#9f9289', '#d5c0a6'],
      ['#39312c', '#746454', '#a89b80', '#c9bfaa'],
    ],
    air: '#b9a18e',
    haze: 0,
    size: 0.77,
  },
] as const

export function planetAppearance(id: string) {
  let seed = 2166136261
  for (const character of `campaign-planet-v1:${id}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  }

  function next() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }

  const type = Math.floor(next() * worlds.length)
  const world = worlds[type]
  const palette = world.palettes[Math.floor(next() * world.palettes.length)]
  const size = world.size * (0.85 + next() * 0.15)
  const tilt = (next() - 0.5) * 1.45
  const ring = next() < (world.kind === 'gas' ? 0.72 : 0.19)

  return {
    type,
    kind: world.kind,
    palette,
    air: world.air,
    haze: world.haze,
    size,
    tilt,
    ring,
    ringInclination: 0.92 + next() * 0.45,
    seed: [next() * 58, next() * 58, next() * 58],
    spin: 0.06 + next() * 0.1,
  }
}

export function orderPlanets(campaigns: CampaignListItem[] | undefined) {
  return (campaigns ?? []).toSorted(
    (first, second) =>
      Date.parse(first.created_at) - Date.parse(second.created_at) ||
      first.id.localeCompare(second.id),
  )
}
