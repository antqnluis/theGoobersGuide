import type { Fragment } from './craftingTypes'

/**
 * A recipe the character holds only part of: the key materials they hold, and how many more
 * they have not found. The output, the other materials, and the costs stay hidden (plan W15).
 */
export function FragmentCard({ fragment }: { fragment: Fragment }) {
  return (
    <li className="vision-card vision-card--fragment" data-new={fragment.new || undefined}>
      <p className="vision-fragment__title">
        <span aria-hidden="true">Unknown item: ???</span>
        <span className="crafting-sr">Unknown item</span>
        {fragment.new && <span className="vision-badge">New</span>}
      </p>
      <p className="crafting-row__meta">
        You hold {fragment.held.length > 0 ? fragment.held.join(', ') : 'part of it'}.
      </p>
      <p className="crafting-row__meta">
        <span aria-hidden="true" className="vision-unknown">
          ??? ×{fragment.missing}
        </span>
        <span className="crafting-sr">
          {fragment.missing === 1
            ? '1 unknown key material'
            : `${fragment.missing} unknown key materials`}
        </span>
      </p>
    </li>
  )
}
