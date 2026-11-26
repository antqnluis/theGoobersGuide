import { CampPanel } from '../campaigns/camp/CampPanel'
import { VisionsDm } from './VisionsDm'
import './crafting.css'

/**
 * The Maker's Visions, the shrine stone beside the campfire (M04 plan W13, W14). Phase 2 holds
 * only the DM's side: libraries, packs, and browsing. The player's view of visions arrives with
 * the long rest, and until then the shrine is the campaign owner's alone.
 */
export function CampVisions({
  campaignId,
  userId,
  isOwner,
  enabled,
  onNotice,
}: {
  campaignId: string
  userId: string
  isOwner: boolean
  /** Loads once the area is first opened. */
  enabled: boolean
  onNotice: (message: string) => void
}) {
  return (
    <CampPanel
      headingId="camp-visions-heading"
      icon="eye"
      place="Shrine stone"
      title="The Maker’s Visions"
    >
      {isOwner ? (
        <VisionsDm campaignId={campaignId} enabled={enabled} onNotice={onNotice} userId={userId} />
      ) : (
        <p className="journal-status" role="status">
          The shrine is quiet. Visions come when the party rests.
        </p>
      )}
    </CampPanel>
  )
}
