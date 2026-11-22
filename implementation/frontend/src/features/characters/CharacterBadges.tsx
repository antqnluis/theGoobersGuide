import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { characterPortraitOptions } from './characterQueries'
import { describeLifecycle } from './characterDisplay'
import type { CharacterSummary } from './characterTypes'
import { PixelIcon, type PixelIconName } from './PixelIcon'

const lifecycleIcon: Record<CharacterSummary['status'], PixelIconName> = {
  active: 'star',
  retired: 'flag',
  deceased: 'grave',
}

/**
 * The character's picture in a brass-ringed medallion, or their initial without one.
 * Dimmed once they are in the chronicle. Decorative: the name always sits beside it.
 */
export function CharacterMedallion({
  character,
  size = 64,
}: {
  character: Pick<CharacterSummary, 'name' | 'status'> & { portrait_path?: string | null }
  size?: number
}) {
  const path = character.portrait_path ?? null
  const link = useQuery(characterPortraitOptions(path))
  // A picture that fails to load (a lapsed link, a removed file) falls back to the initial.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const url = link.data && failedFor !== link.data ? link.data : null
  return (
    <span
      aria-hidden="true"
      className="journal-medallion"
      data-fallen={character.status === 'deceased' || undefined}
      style={{ '--medallion': `${size}px` } as React.CSSProperties}
    >
      {url ? (
        <img alt="" onError={() => setFailedFor(url)} src={url} />
      ) : (
        (Array.from(character.name.trim())[0]?.toUpperCase() ?? '?')
      )}
    </span>
  )
}

/**
 * Lifecycle (active, retired, deceased) and party membership are different facts, so
 * each gets its own badge. Sharing is optional.
 */
export function CharacterBadges({
  character,
  showSharing = false,
}: {
  character: Pick<
    CharacterSummary,
    'status' | 'status_changed_at' | 'in_party' | 'sheet_visibility'
  >
  showSharing?: boolean
}) {
  return (
    <ul aria-label="Character standing" className="journal-chips">
      <li className={`journal-chip journal-chip--${character.status}`}>
        <PixelIcon name={lifecycleIcon[character.status]} />
        <span>{describeLifecycle(character)}</span>
      </li>
      <li
        className={`journal-chip ${character.in_party ? 'journal-chip--party' : 'journal-chip--away'}`}
      >
        <PixelIcon name={character.in_party ? 'lantern' : 'tent'} />
        <span>{character.in_party ? 'In the party' : 'Not in the party'}</span>
      </li>
      {showSharing && (
        <li
          className={`journal-chip ${character.sheet_visibility === 'campaign' ? 'journal-chip--shared' : 'journal-chip--private'}`}
        >
          <PixelIcon name={character.sheet_visibility === 'campaign' ? 'eye' : 'lock'} />
          <span>
            {character.sheet_visibility === 'campaign' ? 'Sheet shared' : 'Sheet private'}
          </span>
        </li>
      )}
    </ul>
  )
}
