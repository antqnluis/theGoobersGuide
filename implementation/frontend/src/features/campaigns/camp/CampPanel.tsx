import type { ReactNode, Ref } from 'react'
import { PixelIcon, type PixelIconName } from '../../characters/PixelIcon'

/**
 * A journal page for the camp's Overview, Party, and Campaign settings: padding, an
 * eyebrow naming the place in camp, and the page title, in the same leather-and-parchment
 * language as My characters. Everything inside uses the `journal-*` primitives, or the
 * older `campaign-*` controls, which the journal skin restyles under `.camp-panel`.
 */
export function CampPanel({
  icon,
  place,
  headingId,
  headingRef,
  title,
  children,
}: {
  icon: PixelIconName
  /** Where in camp this page is, e.g. "Campfire". */
  place: string
  headingId: string
  headingRef?: Ref<HTMLHeadingElement>
  title: ReactNode
  children: ReactNode
}) {
  return (
    <div className="camp-panel">
      <p className="journal-eyebrow camp-panel__eyebrow">
        <PixelIcon name={icon} />
        {place}
      </p>
      <h2 id={headingId} ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </div>
  )
}
