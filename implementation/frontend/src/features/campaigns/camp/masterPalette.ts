// The master palette every piece of camp art is authored in. It has no imports
// so the art pipeline can load it straight from Node.

export const biomeMaterials = ['sky', 'haze', 'ground', 'foliage', 'rock'] as const
export type BiomeMaterial = (typeof biomeMaterials)[number]

/** Four shades per ramp, darkest first. */
export const masterBiome: Record<BiomeMaterial, readonly string[]> = {
  sky: ['#0b1030', '#161c4a', '#26306a', '#3d4a8a'],
  haze: ['#2a3558', '#3a4a72', '#4e6088', '#6a7ea0'],
  ground: ['#1f2a17', '#2f4020', '#42592c', '#5f7a3c'],
  foliage: ['#10261f', '#173a2c', '#235240', '#33705a'],
  rock: ['#2a2830', '#3d3a44', '#58535c', '#7c7580'],
}

export const masterFixed: Record<string, readonly string[]> = {
  ink: ['#0a0810'],
  star: ['#cfd8ff', '#ffffff'],
  wood: ['#2b1a12', '#4a2e1c', '#6e4528', '#946036'],
  canvas: ['#3a3340', '#5a5060', '#8a7f86', '#c2b6a8'],
  brass: ['#6a4a1c', '#a07a2c', '#d6b050'],
  glow: ['#1f6a8a', '#2fa4c8', '#7fe0f0', '#d8fbff'],
  fire: ['#7a1e12', '#c0401a', '#f08a24', '#ffc857', '#fff1b0'],
  cloak0: ['#5a1f2a', '#8a2f3c', '#b84a52'],
  cloak1: ['#1f3a5a', '#2f5a8a', '#4a82b8'],
  cloak2: ['#2a4a2a', '#3e6e3e', '#5c9a58'],
  cloak3: ['#4a2a5a', '#6e3e8a', '#9458b8'],
  cloak4: ['#5a4a1f', '#8a722f', '#b8984a'],
  cloak5: ['#1f4a4a', '#2f6e6e', '#4a9a96'],
  cloak6: ['#5a3a1f', '#8a572f', '#b87c4a'],
  cloak7: ['#3a3a4a', '#585870', '#7c7c9a'],
  skin0: ['#6a3f2c', '#8e5a40', '#b47c5c'],
  skin1: ['#7a4a30', '#a06a48', '#c68e68'],
  skin2: ['#8a5a3a', '#b4805a', '#d8a47c'],
  skin3: ['#a06c4a', '#caa07a', '#e8c8a0'],
  skin4: ['#503022', '#704430', '#946048'],
}

/** Every colour the art pipeline may emit. */
export function masterColors(): string[] {
  return [...Object.values(masterBiome), ...Object.values(masterFixed)].flat()
}

/** Colours of the named materials, for restricting a layer to what it may use. */
export function colorsForMaterials(names: readonly string[]): string[] {
  const all: Record<string, readonly string[]> = { ...masterBiome, ...masterFixed }
  return names.flatMap((name) => {
    if (!all[name]) throw new Error(`Unknown material "${name}"`)
    return [...all[name]]
  })
}

/** Names of every material, biome and fixed. */
export const materialNames = [...Object.keys(masterBiome), ...Object.keys(masterFixed)]
