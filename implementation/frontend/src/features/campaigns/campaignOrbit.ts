export type OrbitBounds = { left: number; top: number; width: number; height: number }

export const orbitLabelClearance = 30

export type OrbitSlot = { id: string; x: number; y: number; radius: number; offset: -1 | 0 | 1 }

export function getOrbitTarget(ids: readonly string[], selectedId: string | null) {
  return selectedId !== null && ids.includes(selectedId) ? selectedId : (ids[0] ?? null)
}

export function stepCampaign(ids: readonly string[], selectedId: string | null, direction: -1 | 1) {
  if (ids.length === 0) return null
  const index = selectedId === null ? -1 : ids.indexOf(selectedId)
  if (index < 0) return ids[direction === 1 ? 0 : ids.length - 1]
  return ids[(index + direction + ids.length) % ids.length]
}

export function positionCampaignOrbit(
  ids: readonly string[],
  targetId: string | null,
  { left, top, width, height }: OrbitBounds,
): OrbitSlot[] {
  if (targetId === null || width <= 0 || height <= 0) return []
  const index = ids.indexOf(targetId)
  if (index < 0) return []

  const x = left + width / 2
  const y = top + height / 2
  // Reserve the widest possible ring and a line for each planet's label.
  const extent = 1.82
  const showNeighbors = ids.length > 1 && width >= 280 && height >= 128
  const radius = Math.min(
    154,
    width * (showNeighbors ? 0.156 : 0.24),
    (height / 2 - orbitLabelClearance) / extent,
  )
  if (radius <= 0) return []

  const slots: OrbitSlot[] = [{ id: targetId, x, y, radius, offset: 0 }]
  if (!showNeighbors) return slots

  // Sample the two sides of an ellipse. The focal slot is at its nearest point.
  const angle = Math.PI / 3
  const dx = Math.sin(angle) * width * 0.4
  const dy = (1 - Math.cos(angle)) * Math.min(height * 0.28, radius * 1.45)
  const neighborRadius = radius * 0.52
  if (ids.length > 2) {
    slots.push({
      id: ids[(index + ids.length - 1) % ids.length],
      x: x - dx,
      y: y - dy,
      radius: neighborRadius,
      offset: -1,
    })
  }
  slots.push({
    id: ids[(index + 1) % ids.length],
    x: x + dx,
    y: y - dy,
    radius: neighborRadius,
    offset: 1,
  })
  return slots
}
