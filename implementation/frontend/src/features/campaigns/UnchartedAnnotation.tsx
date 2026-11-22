import { useRef, type RefObject } from 'react'
import { Link } from 'react-router'
import { catalogueNumeral } from './orreryLayout'
import { LeaderLine } from './WorldAnnotation'

type UnchartedAnnotationProps = {
  /** The planet's slot: its catalogue numeral and the planet a new campaign is created on. */
  slot: number
  onReturn: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}

/**
 * The chart note for a planet no campaign sits on. It offers the one thing that can happen
 * there: creating a campaign, which starts on this planet when it is free.
 */
export function UnchartedAnnotation({ slot, onReturn, headingRef }: UnchartedAnnotationProps) {
  const plateRef = useRef<HTMLElement>(null)
  const numeral = catalogueNumeral(slot)

  return (
    <>
      <LeaderLine plateRef={plateRef} slot={slot} />
      <section
        aria-label="Uncharted world details"
        className="galaxy-details galaxy-plate"
        ref={plateRef}
      >
        <div className="galaxy-details__copy" tabIndex={0}>
          <h2 ref={headingRef} tabIndex={-1}>
            Uncharted World
          </h2>
          <div className="galaxy-details__meta">
            <p className="galaxy-catalogue">Chart entry {numeral}</p>
          </div>
          <p>An unexplored world awaiting its first adventure.</p>
        </div>
        <div className="galaxy-details__actions">
          <Link
            aria-label={`Create campaign on Uncharted World ${numeral}`}
            className="galaxy-action galaxy-action--primary"
            to={`/app/campaigns/new?planet=${slot}`}
          >
            Create campaign
          </Link>
          <button className="galaxy-action" onClick={onReturn} type="button">
            Return to galaxy overview
          </button>
        </div>
      </section>
    </>
  )
}
