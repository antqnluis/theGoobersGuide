import { describe, expect, it } from 'vitest'
import { leaderGap, leaderSegment } from './orreryLeader'

const plate = { left: 600, top: 100, right: 900, bottom: 400 }

describe('leaderSegment', () => {
  it('runs from the near edge of the plate to just outside the world', () => {
    const line = leaderSegment({ x: 300, y: 250, extent: 40 }, plate)!
    expect(line.x2).toBe(600)
    expect(line.y2).toBe(250)
    expect(line.x1).toBeCloseTo(300 + 40 + leaderGap)
    expect(line.y1).toBeCloseTo(250)
  })

  it('anchors at the plate corner when the world is diagonal to it', () => {
    const line = leaderSegment({ x: 300, y: 600, extent: 20 }, plate)!
    expect([line.x2, line.y2]).toEqual([600, 400])
  })

  it('slants along the straight line between the world and the plate', () => {
    const line = leaderSegment(
      { x: 0, y: 0, extent: 30 },
      { left: 300, top: 400, right: 500, bottom: 600 },
    )!
    expect(line.y1 / line.x1).toBeCloseTo(400 / 300)
  })

  it('draws nothing when the plate covers the world', () => {
    expect(leaderSegment({ x: 700, y: 200, extent: 30 }, plate)).toBeNull()
  })

  it('draws nothing when the plate is too near to need a pointer', () => {
    expect(leaderSegment({ x: 560, y: 250, extent: 36 }, plate)).toBeNull()
  })
})
