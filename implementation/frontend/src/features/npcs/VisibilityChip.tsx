import { PixelIcon } from '../characters/PixelIcon'

/** Who can read an entry: an icon and words on a tinted chip, never colour alone. */
export function VisibilityChip({ visibility }: { visibility: 'private' | 'campaign' }) {
  const shared = visibility === 'campaign'
  return (
    <span className={`journal-chip ${shared ? 'journal-chip--shared' : 'journal-chip--private'}`}>
      <PixelIcon name={shared ? 'eye' : 'lock'} />
      {shared ? 'Shared' : 'Only you'}
    </span>
  )
}
