type Shape = { outline: string; facets: string }

/** Line drawings of each die's silhouette on a 40-unit square; only the polyhedra D&D uses are drawn. */
const shapes: Record<number, Shape> = {
  4: {
    outline: '20,4 37,34 3,34',
    facets: 'M20 4 24 34M3 34 30 22',
  },
  6: {
    outline: '20,3 35,11.5 35,28.5 20,37 5,28.5 5,11.5',
    facets: 'M5 11.5 20 20 35 11.5M20 20V37',
  },
  8: {
    outline: '20,3 36,20 20,37 4,20',
    facets: 'M4 20H36M20 3 12 20 20 37M20 3 28 20 20 37',
  },
  10: {
    outline: '20,3 36,17 20,37 4,17',
    facets: 'M4 17 20 22 36 17M20 22V37',
  },
  12: {
    outline: '20,3 37,15.5 30.5,35.5 9.5,35.5 3,15.5',
    facets:
      'M20 11 29.5 18 26 29H14L10.5 18ZM20 3V11M37 15.5 29.5 18M30.5 35.5 26 29M9.5 35.5 14 29M3 15.5 10.5 18',
  },
  20: {
    outline: '20,3 35,11.5 35,28.5 20,37 5,28.5 5,11.5',
    facets:
      'M20 12 29 27.5H11ZM20 12V3M20 12 5 11.5M20 12 35 11.5M29 27.5 35 28.5M29 27.5 20 37M11 27.5 5 28.5M11 27.5 20 37',
  },
}

/** A d100 is read off a ten-sided die; anything unusual gets a round pebble. */
function shapeFor(sides: number): Shape {
  if (sides === 100) return shapes[10]
  return (
    shapes[sides] ?? {
      outline: '20,3 30,6 36,15 36,26 30,34 20,37 10,34 4,26 4,15 10,6',
      facets: 'M20 3V37M4 20.5H36',
    }
  )
}

/**
 * The die a tile is while it is in the air. It is decoration: the tile's own number is what is
 * read, so this hides itself from assistive technology.
 */
export function DieGlyph({ sides, className }: { sides: number; className?: string }) {
  const shape = shapeFor(sides)
  return (
    <svg
      aria-hidden="true"
      className={className ?? 'dice-face__die'}
      focusable="false"
      viewBox="0 0 40 40"
    >
      <polygon className="dice-die__body" points={shape.outline} />
      <path className="dice-die__facets" d={shape.facets} />
    </svg>
  )
}
