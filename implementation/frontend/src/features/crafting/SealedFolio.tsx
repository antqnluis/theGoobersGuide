import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './visionReveal'

/** How long the seal takes to crack before the folio unfurls. */
const breakMs = 520

const sealRows = [
  '...#####...',
  '..#######..',
  '.#########.',
  '###########',
  '###.....###',
  '##..###..##',
  '###.....###',
  '###########',
  '.#########.',
  '..#######..',
  '...#####...',
]

function SealArt({ half }: { half?: 'left' | 'right' }) {
  const cells: string[] = []
  sealRows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) if (row[x] === '#') cells.push(`M${x} ${y}h1v1h-1z`)
  })
  return (
    <svg
      aria-hidden="true"
      className="vision-seal__art"
      data-half={half}
      focusable="false"
      shapeRendering="crispEdges"
      viewBox="0 0 11 11"
    >
      <path d={cells.join('')} fill="currentColor" />
    </svg>
  )
}

/**
 * A new vision or fragment, sealed in wax until the player breaks it (M04 plan W17). The seal
 * cracks and bursts into embers, then the folio opens in its place. It names only what is behind
 * it, "a vision" or "a fragment", and `onBreak` runs once the crack has played.
 */
export function SealedFolio({
  kind,
  onBreak,
}: {
  kind: 'vision' | 'fragment'
  onBreak: () => void
}) {
  const [breaking, setBreaking] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  function breakSeal() {
    if (breaking) return
    if (prefersReducedMotion()) return onBreak()
    setBreaking(true)
    timer.current = window.setTimeout(onBreak, breakMs)
  }

  return (
    <li className="vision-sealed">
      <button
        aria-label={`Break the seal on a ${kind}`}
        className="vision-seal"
        data-breaking={breaking || undefined}
        data-kind={kind}
        onClick={breakSeal}
        type="button"
      >
        <span aria-hidden="true" className="vision-seal__wax">
          <SealArt half="left" />
          <SealArt half="right" />
          <span className="vision-seal__embers">
            {Array.from({ length: 8 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </span>
        <span className="vision-seal__words">
          <span className="vision-seal__title">
            {kind === 'vision' ? 'A vision stirs' : 'A fragment stirs'}
          </span>
          <span className="vision-seal__hint">Break the seal</span>
        </span>
      </button>
    </li>
  )
}
