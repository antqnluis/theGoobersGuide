import { describe, expect, it } from 'vitest'
import { getOrbitTarget, positionCampaignOrbit, stepCampaign } from './campaignOrbit'

const bounds = { left: 240, top: 80, width: 820, height: 500 }

describe('campaign orbit', () => {
  it('frames the first campaign as a preview without selecting it', () => {
    expect(getOrbitTarget([], null)).toBeNull()
    expect(positionCampaignOrbit([], null, bounds)).toEqual([])
    expect(getOrbitTarget(['first'], 'removed')).toBe('first')
    expect(positionCampaignOrbit(['first'], 'first', bounds)).toEqual([
      expect.objectContaining({ id: 'first', x: 650, y: 330, offset: 0 }),
    ])
  })

  it('places the only neighbor on the right without duplicating it', () => {
    const [focal, neighbor] = positionCampaignOrbit(['first', 'second'], 'second', bounds)
    expect(neighbor).toMatchObject({ id: 'first', offset: 1 })
    expect(neighbor.x).toBeGreaterThan(focal.x)
    expect(neighbor.y).toBeLessThan(focal.y)
    expect(neighbor.radius).toBeLessThan(focal.radius)
  })

  it('frames immediate neighbors in stable cyclic order and keeps room for labels and rings', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const phone = { left: 14, top: 180, width: 347, height: 200 }
    const slots = positionCampaignOrbit(ids, 'a', phone)
    expect(slots.map(({ id, offset }) => [id, offset])).toEqual([
      ['a', 0],
      ['e', -1],
      ['b', 1],
    ])
    for (const { x, y, radius } of slots) {
      const extent = radius * 1.82
      expect(x - extent).toBeGreaterThanOrEqual(phone.left)
      expect(x + extent).toBeLessThanOrEqual(phone.left + phone.width)
      expect(y - extent - 30).toBeGreaterThanOrEqual(phone.top)
      expect(y + extent).toBeLessThanOrEqual(phone.top + phone.height)
    }
    expect(positionCampaignOrbit(ids, 'a', { ...phone, height: 110 })).toHaveLength(1)
  })

  it('steps through the given order and wraps in both directions', () => {
    const ids = ['first', 'second', 'third']
    expect(stepCampaign([], null, 1)).toBeNull()
    expect(stepCampaign(ids, null, 1)).toBe('first')
    expect(stepCampaign(ids, null, -1)).toBe('third')
    expect(stepCampaign(ids, 'first', -1)).toBe('third')
    expect(stepCampaign(ids, 'third', 1)).toBe('first')
    expect(stepCampaign(ids, 'second', 1)).toBe('third')
  })
})
