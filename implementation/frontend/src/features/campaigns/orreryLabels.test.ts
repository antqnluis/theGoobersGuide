import { describe, expect, it } from 'vitest'
import { labelGap, placeLabels, type LabelAnchor } from './orreryLabels'

const bounds = { left: 100, top: 50, width: 600, height: 400 }

function anchor(id: string, x: number, y: number, extra: Partial<LabelAnchor> = {}): LabelAnchor {
  return { id, x, y, extent: 20, width: 80, height: 20, ...extra }
}

describe('world labels', () => {
  it('centers a label above its world', () => {
    expect(placeLabels([anchor('a', 400, 250)], bounds)).toEqual([
      { id: 'a', left: 360, top: 250 - 20 - labelGap - 20 },
    ])
  })

  it('keeps a label inside the scene and drops it below when there is no room above', () => {
    const [edge] = placeLabels([anchor('a', 110, 250)], bounds)
    expect(edge.left).toBe(bounds.left)

    const [low] = placeLabels([anchor('a', 400, 80)], bounds)
    expect(low.top).toBe(80 + 20 + labelGap)
  })

  it('leaves out a world outside the scene or a label wider than it', () => {
    expect(placeLabels([anchor('a', 90, 250), anchor('b', 400, 460)], bounds)).toEqual([])
    expect(placeLabels([anchor('a', 400, 250, { width: 700 })], bounds)).toEqual([])
    expect(placeLabels([anchor('a', 400, 250, { width: 0 })], bounds)).toEqual([])
  })

  it('gives way to earlier labels, other worlds, and obstacles in order of priority', () => {
    const pair = [anchor('first', 400, 250), anchor('second', 410, 252)]
    expect(placeLabels(pair, bounds)).toEqual([
      { id: 'first', left: 360, top: 204 },
      { id: 'second', left: 370, top: 252 + 20 + labelGap },
    ])
    // A third world under the pair leaves the second label nowhere to go.
    const crowded = [...pair, anchor('third', 405, 290)]
    expect(placeLabels(crowded, bounds).map(({ id }) => id)).toEqual(['first', 'third'])

    // A label may not cover a neighbouring world either way up.
    const stacked = [anchor('low', 400, 300), anchor('high', 400, 250)]
    expect(placeLabels(stacked, bounds)).toEqual([
      { id: 'low', left: 360, top: 300 + 20 + labelGap },
      { id: 'high', left: 360, top: 250 - 20 - labelGap - 20 },
    ])

    const star = { left: 350, right: 450, top: 180, bottom: 240 }
    expect(placeLabels([anchor('a', 400, 250)], bounds, [star])).toEqual([
      { id: 'a', left: 360, top: 250 + 20 + labelGap },
    ])
  })

  it('pins the focused label above its world whatever is behind it', () => {
    const star = { left: 350, right: 450, top: 180, bottom: 240 }
    const anchors = [anchor('focus', 400, 250, { pinned: true }), anchor('other', 405, 215)]
    expect(placeLabels(anchors, bounds, [star])).toEqual([{ id: 'focus', left: 360, top: 204 }])
    // With no room above, a pinned label is hidden instead of moving below.
    expect(placeLabels([anchor('focus', 400, 80, { pinned: true })], bounds)).toEqual([])
  })
})
