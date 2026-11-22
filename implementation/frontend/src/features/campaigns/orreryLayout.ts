// World-space layout of the orrery: the hearth star sits at the origin and every planet
// of the galaxy is a world on a ring in the XZ plane. Pure geometry, no rendering.

export const maxRings = 8

/** Radius of the hearth's visible disc. */
export const hearthRadius = 0.62

const innerRadius = 3.4
const ringSpacing = 2.2
// Below 1 the gaps tighten outward, so eight rings stay within one overview.
const ringFalloff = 0.88
const innerPeriod = 240

export type OrreryRing = {
  radius: number
  /** Seconds for one revolution. Outer rings turn more slowly. */
  period: number
  count: number
}

export type OrreryWorld = {
  id: string
  /** The planet slot: the catalogue number, starting at 0. */
  index: number
  ring: number
  radius: number
  /** Angle on the ring at time zero, in radians. */
  phase: number
  period: number
}

export type OrreryLayout = {
  worlds: OrreryWorld[]
  rings: OrreryRing[]
  /** Radius of the outermost occupied ring, or 0 for an empty orrery. */
  extent: number
}

export function ringRadius(ring: number) {
  return innerRadius + ringSpacing * ring ** ringFalloff
}

function ringPeriod(ring: number) {
  return (innerPeriod * ringRadius(ring)) / innerRadius
}

// A world's place on its ring comes from a stable key (its planet slot), so it stays put
// when other planets are claimed, released, or added.
function phaseFromKey(key: string) {
  let hash = 2166136261
  for (const character of key) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  // Finish with an avalanche step so near-identical keys land far apart.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  hash ^= hash >>> 16
  return ((hash >>> 0) / 4294967296) * Math.PI * 2
}

/**
 * How many worlds each ring carries. Up to `maxRings` planets get a ring
 * each. Beyond that, each extra world joins the ring that stays least crowded
 * per unit of arc once it arrives, so longer outer rings fill first and no
 * ring ever carries more than the ring outside it.
 */
export function ringCounts(total: number) {
  const counts = Array.from({ length: Math.min(Math.max(total, 0), maxRings) }, () => 1)
  for (let placed = counts.length; placed < total; placed++) {
    counts[roomiestRing(counts)]++
  }
  return counts
}

/** The ring the next world beyond `maxRings` joins, given how many each ring carries now. */
function roomiestRing(counts: readonly number[]) {
  let roomiest = counts.length - 1
  for (let ring = roomiest - 1; ring >= 0; ring--) {
    const crowding = (counts[ring] + 1) / ringRadius(ring)
    if (crowding < (counts[roomiest] + 1) / ringRadius(roomiest)) roomiest = ring
  }
  return roomiest
}

/** Scene key of a planet slot, in the place a campaign id takes in `orreryLayout`. */
export function planetKey(slot: number) {
  return `planet-${slot}`
}

// Later planets on a shared ring sit a golden angle from the previous one, so no seat
// depends on how many planets the ring ends up carrying.
const goldenAngle = Math.PI * (3 - Math.sqrt(5))

/**
 * Lays out a galaxy of `count` planets by slot. Slots 0 to `maxRings - 1` each get their
 * own ring, innermost first. Later slots join rings by the same crowding rule as
 * `ringCounts`, which looks only at the planets before them, and take their place on the
 * ring from their slot rather than from how many share it. Adding a planet therefore never
 * moves an existing one: the galaxy only grows or shrinks at its outer edge.
 */
export function galaxyLayout(count: number): OrreryLayout {
  const total = Math.max(Math.floor(count), 0)
  const counts: number[] = []
  const firstSlot: number[] = []
  const worlds: OrreryWorld[] = []
  for (let slot = 0; slot < total; slot++) {
    const ring = slot < maxRings ? slot : roomiestRing(counts)
    if (ring === counts.length) {
      counts.push(0)
      firstSlot.push(slot)
    }
    const seat = counts[ring]++
    worlds.push({
      id: planetKey(slot),
      index: slot,
      ring,
      radius: ringRadius(ring),
      phase:
        (phaseFromKey(`galaxy-orbit-v1:slot-${firstSlot[ring]}`) + seat * goldenAngle) %
        (Math.PI * 2),
      period: ringPeriod(ring),
    })
  }
  const rings = counts.map((ringCount, ring) => ({
    radius: ringRadius(ring),
    period: ringPeriod(ring),
    count: ringCount,
  }))
  return { worlds, rings, extent: rings.at(-1)?.radius ?? 0 }
}

/** Angle of a world on its ring after `seconds` of ambient orbiting. */
export function orbitAngle({ phase, period }: Pick<OrreryWorld, 'phase' | 'period'>, seconds = 0) {
  return phase + (seconds / period) * Math.PI * 2
}

/** World-space position, with the hearth at the origin and the orbits in the XZ plane. */
export function orbitPosition(
  world: Pick<OrreryWorld, 'radius' | 'phase' | 'period'>,
  seconds = 0,
): [number, number, number] {
  const angle = orbitAngle(world, seconds)
  return [Math.cos(angle) * world.radius, 0, Math.sin(angle) * world.radius]
}

/** The world the scene treats as focal: the selected one, or the innermost while nothing is selected. */
export function getOrbitTarget(ids: readonly string[], selectedId: string | null) {
  return selectedId !== null && ids.includes(selectedId) ? selectedId : (ids[0] ?? null)
}

/** Steps outward (1) or inward (-1) through the orbit order, wrapping at both ends. */
export function stepCampaign(ids: readonly string[], selectedId: string | null, direction: -1 | 1) {
  const target = getOrbitTarget(ids, selectedId)
  if (target === null) return null
  const index = ids.indexOf(target)
  return ids[(index + direction + ids.length) % ids.length]
}

const numerals = [
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
] as const

/** Catalogue numeral for a world's place in the orbit order: 0 is I, 1 is II. */
export function catalogueNumeral(index: number) {
  let rest = index + 1
  let numeral = ''
  for (const [symbol, value] of numerals) {
    while (rest >= value) {
      numeral += symbol
      rest -= value
    }
  }
  return numeral
}
