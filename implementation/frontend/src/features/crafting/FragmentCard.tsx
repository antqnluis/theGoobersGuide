import { useEffect, useRef, type CSSProperties } from 'react'
import { PixelIcon } from '../characters/PixelIcon'
import type { Fragment } from './craftingTypes'

/**
 * A recipe the character holds only part of: the key materials they hold, and how many more
 * they have not found. The output, the other materials, and the costs stay hidden (plan W15).
 */
export function FragmentCard({
  fragment,
  entering = false,
  focusOnEnter = false,
  enterDelay = 0,
}: {
  fragment: Fragment
  /** Just unsealed: the smudge clears and the held names ink in, once. */
  entering?: boolean
  focusOnEnter?: boolean
  enterDelay?: number
}) {
  const title = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (entering && focusOnEnter) title.current?.focus()
  }, [entering, focusOnEnter])
  return (
    <li
      className={
        entering
          ? 'journal-panel vision-card vision-card--fragment vision-card--entering'
          : 'journal-panel vision-card vision-card--fragment'
      }
      data-new={fragment.new || undefined}
      style={entering ? ({ '--enter-delay': `${enterDelay}ms` } as CSSProperties) : undefined}
    >
      <div className="vision-card__face">
        <p
          className="crafting-row__name"
          ref={title}
          tabIndex={entering && focusOnEnter ? -1 : undefined}
        >
          <span aria-hidden="true">Unknown item: ???</span>
          <span className="crafting-sr">Unknown item</span>
        </p>
        {fragment.new && (
          <span className="vision-face__chips">
            <span className="journal-chip journal-chip--new">
              <PixelIcon name="star" />
              New
            </span>
          </span>
        )}
        <span className="vision-face__pay crafting-row__meta">You hold part of this recipe.</span>
        <span className="vision-face__lines">
          {fragment.held.map((name) => (
            <span className="vision-face__line" data-have="enough" key={name}>
              <PixelIcon className="vision-have" name="check" />
              <span className="vision-face__material">{name}</span>
              <span className="vision-face__count">held</span>
            </span>
          ))}
          <span className="vision-face__line" data-have="short">
            <PixelIcon className="vision-have" name="cross" />
            <span aria-hidden="true" className="vision-face__material vision-unknown">
              ???
            </span>
            <span aria-hidden="true" className="vision-face__count">
              ×{fragment.missing}
            </span>
            <span className="crafting-sr">
              {fragment.missing === 1
                ? '1 unknown key material'
                : `${fragment.missing} unknown key materials`}
            </span>
          </span>
        </span>
      </div>
    </li>
  )
}
