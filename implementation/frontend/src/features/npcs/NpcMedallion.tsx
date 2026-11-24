import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { npcPortraitOptions } from './npcQueries'
import type { NpcSummary } from './npcTypes'

/**
 * The NPC's picture in a brass-ringed medallion, or their initial without one. Decorative:
 * the name always sits beside it.
 */
export function NpcMedallion({
  npc,
  size = 48,
}: {
  npc: Pick<NpcSummary, 'name' | 'portrait_path'>
  size?: number
}) {
  const path = npc.portrait_path ?? null
  const link = useQuery(npcPortraitOptions(path))
  // A picture that fails to load (a lapsed link, a removed file) falls back to the initial.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const url = link.data && failedFor !== link.data ? link.data : null
  return (
    <span
      aria-hidden="true"
      className="journal-medallion npc-medallion"
      style={{ '--medallion': `${size}px` } as React.CSSProperties}
    >
      {url ? (
        <img alt="" onError={() => setFailedFor(url)} src={url} />
      ) : (
        (Array.from(npc.name.trim())[0]?.toUpperCase() ?? '?')
      )}
    </span>
  )
}
