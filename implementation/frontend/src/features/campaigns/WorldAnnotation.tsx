import { ViewTransition, useEffect, useRef, type RefObject } from 'react'
import { Link } from 'react-router'
import type { CampaignListItem } from './campaignTypes'
import { catalogueNumeral, planetKey } from './orreryLayout'
import { leaderSegment } from './orreryLeader'

type WorldAnnotationProps = {
  campaign: CampaignListItem
  /** The campaign's planet, for the catalogue numeral and the leader line. */
  slot: number
  /** Members of the campaign, or undefined while the count loads. */
  memberCount: number | undefined
  memberCountFailed: boolean
  onRetryMemberCount: () => void
  onReturn: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}

function memberText(count: number | undefined, failed: boolean) {
  if (failed) return 'Member count unavailable'
  if (count === undefined) return 'Loading member count…'
  return `${count} ${count === 1 ? 'member' : 'members'}`
}

/**
 * The chart note for the focused world: an ink plate with the campaign's name,
 * role, member count, and actions, joined to the world by a leader line.
 */
export function WorldAnnotation({
  campaign,
  slot,
  memberCount,
  memberCountFailed,
  onRetryMemberCount,
  onReturn,
  headingRef,
}: WorldAnnotationProps) {
  const plateRef = useRef<HTMLElement>(null)

  return (
    <>
      <LeaderLine plateRef={plateRef} slot={slot} />
      <section aria-label="Campaign details" className="galaxy-details galaxy-plate" ref={plateRef}>
        <div className="galaxy-details__copy" tabIndex={0}>
          <ViewTransition
            default="none"
            key={campaign.id}
            name={'campaign-title-' + campaign.id}
            share="campaign-title-morph"
          >
            <h2 ref={headingRef} tabIndex={-1}>
              {campaign.name}
            </h2>
          </ViewTransition>
          <div className="galaxy-details__meta">
            <p className="galaxy-role">
              Your role: <strong>{campaign.role === 'owner' ? 'Owner' : 'Member'}</strong>
            </p>
            <p className="galaxy-catalogue">Chart entry {catalogueNumeral(slot)}</p>
            <div className="galaxy-details__members">
              <p role="status">{memberText(memberCount, memberCountFailed)}</p>
              {memberCountFailed && (
                <button className="galaxy-action" onClick={onRetryMemberCount} type="button">
                  Retry count
                </button>
              )}
            </div>
          </div>
          <p>{campaign.description || 'No description yet.'}</p>
        </div>
        <div className="galaxy-details__actions">
          <Link
            className="galaxy-action galaxy-action--primary"
            state={{ campaignTransition: { campaignId: campaign.id, name: campaign.name } }}
            to={`/app/campaigns/${campaign.id}`}
          >
            Enter campaign
          </Link>
          <button className="galaxy-action" onClick={onReturn} type="button">
            Return to galaxy overview
          </button>
        </div>
      </section>
    </>
  )
}

/**
 * One hairline from the plate to the world's limb. The scene writes each
 * world's projected position onto its label, so the line follows the world in
 * the same frames the labels do without the scene knowing about it.
 */
export function LeaderLine({
  slot,
  plateRef,
}: {
  slot: number
  plateRef: RefObject<HTMLElement | null>
}) {
  const key = planetKey(slot)
  const lineRef = useRef<SVGLineElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    let frame = 0
    let label: Element | null = null
    let shown = false
    let drawn = ''

    function hide() {
      if (!shown) return
      lineRef.current?.setAttribute('visibility', 'hidden')
      dotRef.current?.setAttribute('visibility', 'hidden')
      shown = false
      drawn = ''
    }

    function tick() {
      frame = requestAnimationFrame(tick)
      const line = lineRef.current
      const dot = dotRef.current
      const plate = plateRef.current
      if (!line || !dot || !plate) return
      if (!label?.isConnected) {
        label = document.querySelector(`.galaxy-planet-label[data-planet-key="${key}"]`)
      }
      const { planetX, planetY, planetExtent } = (label as HTMLElement | null)?.dataset ?? {}
      if (planetX === undefined || planetY === undefined || planetExtent === undefined) {
        hide()
        return
      }
      const box = plate.getBoundingClientRect()
      const segment = leaderSegment(
        { x: Number(planetX), y: Number(planetY), extent: Number(planetExtent) },
        { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      )
      if (!segment) {
        hide()
        return
      }
      const next = [segment.x1, segment.y1, segment.x2, segment.y2]
        .map((value) => value.toFixed(1))
        .join(' ')
      if (drawn === next) return
      drawn = next
      line.setAttribute('x1', segment.x1.toFixed(1))
      line.setAttribute('y1', segment.y1.toFixed(1))
      line.setAttribute('x2', segment.x2.toFixed(1))
      line.setAttribute('y2', segment.y2.toFixed(1))
      dot.setAttribute('cx', segment.x2.toFixed(1))
      dot.setAttribute('cy', segment.y2.toFixed(1))
      if (!shown) {
        line.setAttribute('visibility', 'visible')
        dot.setAttribute('visibility', 'visible')
        shown = true
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [key, plateRef])

  return (
    <svg aria-hidden="true" className="galaxy-leader" key={key}>
      <line pathLength={1} ref={lineRef} visibility="hidden" />
      <circle r="2.5" ref={dotRef} visibility="hidden" />
    </svg>
  )
}
