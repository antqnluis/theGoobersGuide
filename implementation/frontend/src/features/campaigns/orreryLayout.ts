// World-space layout of the orrery: the hearth star sits at the origin and every
// campaign is a world on a ring in the XZ plane. Pure geometry, no rendering.

export const maxRings = 8

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
  /** Position in the oldest-first order: the catalogue number, starting at 0. */
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

// A world's place on its ring comes from its own UUID, so it stays put when
// other campaigns are renamed, created, or removed.
function phaseFromId(id: string) {
  let hash = 2166136261
  for (const character of `campaign-orbit-v1:${id}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  // Finish with an avalanche step so near-identical ids land far apart.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  hash ^= hash >>> 16
  return ((hash >>> 0) / 4294967296) * Math.PI * 2
}

/**
 * How many worlds each ring carries. Up to `maxRings` campaigns get a ring
 * each. Beyond that, each extra world joins the ring that stays least crowded
 * per unit of arc once it arrives, so longer outer rings fill first and no
 * ring ever carries more than the ring outside it.
 */
export function ringCounts(total: number) {
  const counts = Array.from({ length: Math.min(Math.max(total, 0), maxRings) }, () => 1)
  for (let placed = counts.length; placed < total; placed++) {
    let roomiest = counts.length - 1
    for (let ring = roomiest - 1; ring >= 0; ring--) {
      const crowding = (counts[ring] + 1) / ringRadius(ring)
      if (crowding < (counts[roomiest] + 1) / ringRadius(roomiest)) roomiest = ring
    }
    counts[roomiest]++
  }
  return counts
}

/**
 * Lays out campaigns given oldest first: the oldest orbits closest to the
 * hearth and newer ones sit farther out, so ring order and list order agree.
 * Worlds sharing a ring are spaced evenly around it.
 */
export function orreryLayout(ids: readonly string[]): OrreryLayout {
  const rings = ringCounts(ids.length).map((count, ring) => ({
    radius: ringRadius(ring),
    period: ringPeriod(ring),
    count,
  }))
  const worlds: OrreryWorld[] = []
  for (const [ring, { radius, period, count }] of rings.entries()) {
    const first = worlds.length
    const base = phaseFromId(ids[first])
    for (let seat = 0; seat < count; seat++) {
      const index = first + seat
      worlds.push({
        id: ids[index],
        index,
        ring,
        radius,
        phase: (base + (seat * Math.PI * 2) / count) % (Math.PI * 2),
        period,
      })
    }
  }
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
