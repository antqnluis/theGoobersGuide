/** "From handoff: <label>" on an objective or update a handoff created (H9). */
export function handoffTag(
  handoffId: string | null,
  labels: ReadonlyMap<string, string | null>,
): string | null {
  if (!handoffId) return null
  const label = labels.get(handoffId)
  return label ? `From handoff: ${label}` : 'From handoff'
}

export const noHandoffLabels: ReadonlyMap<string, string | null> = new Map()
