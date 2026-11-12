import { expect, test } from 'vitest'
import { orderPlanets, planetAppearance } from './planetModel'
import type { CampaignListItem } from './campaignTypes'

test('keeps a campaign UUID on the same versioned appearance after a rename and insertion', () => {
  const original: CampaignListItem = {
    id: '00000000-0000-4000-8000-000000000011',
    owner_id: '00000000-0000-4000-8000-000000000001',
    name: 'First campaign',
    description: null,
    created_at: '2026-11-12T04:00:00Z',
    updated_at: '2026-11-12T04:00:00Z',
    role: 'owner',
  }
  const renamed = { ...original, name: 'Renamed campaign', updated_at: '2026-11-12T05:00:00Z' }
  const inserted = { ...original, id: '00000000-0000-4000-8000-000000000012' }
  const older = {
    ...original,
    id: '00000000-0000-4000-8000-000000000013',
    created_at: '2026-11-11T04:00:00Z',
  }

  const ordered = orderPlanets([inserted, renamed, older])
  expect(ordered).toEqual([older, renamed, inserted])
  expect(planetAppearance(ordered[1].id)).toEqual(planetAppearance(original.id))
  expect(planetAppearance(inserted.id)).not.toEqual(planetAppearance(original.id))
  expect(planetAppearance(original.id)).toEqual({
    type: 2,
    kind: 'volcanic',
    palette: ['#19131c', '#534143', '#8b574c', '#ffb048'],
    air: '#d27554',
    haze: 0.12,
    size: expect.closeTo(0.7604, 5),
    tilt: expect.closeTo(0.38305, 5),
    ring: false,
    ringInclination: expect.closeTo(1.15675, 5),
    seed: [expect.closeTo(37.13045, 5), expect.closeTo(0.58146, 5), expect.closeTo(20.02355, 5)],
    spin: expect.closeTo(0.07552, 5),
  })
})
