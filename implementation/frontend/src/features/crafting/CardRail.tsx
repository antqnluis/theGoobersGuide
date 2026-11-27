import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PixelIcon } from '../characters/PixelIcon'
import { prefersReducedMotion } from './visionReveal'

type More = { before: boolean; after: boolean }

/**
 * One group of cards laid side by side in a row that scrolls sideways when there are more than
 * fit. The heading and the two arrow keys sit above it; the arrows appear only when there is
 * somewhere to go, and the row's edges fade where more cards wait. The row itself is a focusable
 * region, so the arrow keys scroll it from the keyboard too.
 */
export function CardRail({
  title,
  intro,
  size = 'card',
  children,
}: {
  title: string
  intro?: ReactNode
  /** `card` for full folios, `slim` for the narrower fragments. */
  size?: 'card' | 'slim'
  children: ReactNode
}) {
  const headingId = useId()
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState<More>({ before: false, after: false })

  const measure = useCallback(() => {
    const element = scroller.current
    if (!element) return
    const before = element.scrollLeft > 4
    const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 4
    setMore((current) =>
      current.before === before && current.after === after ? current : { before, after },
    )
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    observer?.observe(element)
    // Cards opening and closing change what overflows.
    for (const child of element.children) observer?.observe(child)
    const mutations =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => measure())
    mutations?.observe(element, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      mutations?.disconnect()
    }
  }, [measure])

  function page(direction: 1 | -1) {
    const element = scroller.current
    if (!element) return
    element.scrollBy({
      left: direction * Math.max(160, element.clientWidth * 0.85),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  const scrolls = more.before || more.after

  return (
    <div aria-labelledby={headingId} className="vision-group" role="group">
      <div className="vision-group__head">
        <h3 className="journal-section-title" id={headingId}>
          {title}
        </h3>
        {scrolls && (
          <div className="vision-group__keys">
            <button
              aria-label={`Scroll ${title} back`}
              className="vision-key journal-button journal-button--secondary"
              disabled={!more.before}
              onClick={() => page(-1)}
              type="button"
            >
              <PixelIcon className="vision-key__arrow vision-key__arrow--back" name="chevron" />
            </button>
            <button
              aria-label={`Scroll ${title} forward`}
              className="vision-key journal-button journal-button--secondary"
              disabled={!more.after}
              onClick={() => page(1)}
              type="button"
            >
              <PixelIcon className="vision-key__arrow" name="chevron" />
            </button>
          </div>
        )}
      </div>
      {intro}
      <div
        aria-labelledby={headingId}
        className="vision-rail__scroller"
        data-more={[more.before && 'before', more.after && 'after'].filter(Boolean).join(' ')}
        onScroll={measure}
        ref={scroller}
        role="region"
        tabIndex={0}
      >
        <ul className="vision-rail" data-size={size}>
          {children}
        </ul>
      </div>
    </div>
  )
}
