import { expect, test } from 'vitest'
import { orderPlanets, planetAppearance, planetAppearanceForSlot } from './planetModel'
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

test('the six starter planets are six distinct kinds, in a fixed order', () => {
  const starters = [0, 1, 2, 3, 4, 5].map(planetAppearanceForSlot)
  expect(starters.map(({ kind }) => kind)).toEqual([
    'terrestrial',
    'desert',
    'volcanic',
    'gas',
    'frozen',
    'rocky',
  ])
  expect(new Set(starters.map(({ palette }) => palette.join())).size).toBe(6)
})

test('a planet slot keeps its look, and slots look different from one another', () => {
  for (const slot of [0, 3, 5, 6, 7, 25]) {
    expect(planetAppearanceForSlot(slot)).toEqual(planetAppearanceForSlot(slot))
  }
  const looks = Array.from({ length: 12 }, (_, slot) =>
    JSON.stringify(planetAppearanceForSlot(slot)),
  )
  expect(new Set(looks).size).toBe(12)
  // Slot looks do not borrow from the campaign UUID look.
  expect(planetAppearanceForSlot(2)).not.toEqual(
    planetAppearance('00000000-0000-4000-8000-000000000011'),
  )
})

test('slots beyond the starters are seeded and always valid', () => {
  for (let slot = 6; slot < 60; slot++) {
    const look = planetAppearanceForSlot(slot)
    expect(['terrestrial', 'desert', 'volcanic', 'gas', 'frozen', 'rocky']).toContain(look.kind)
    expect(look.palette).toHaveLength(4)
    expect(look.size).toBeGreaterThan(0.6)
    expect(look.size).toBeLessThanOrEqual(1)
  }
})

test('pins the look of the first planet and of a seeded one', () => {
  expect(planetAppearanceForSlot(0)).toMatchInlineSnapshot(`
    {
      "air": "#72c8ff",
      "haze": 0.34,
      "kind": "terrestrial",
      "palette": [
        "#092a52",
        "#278b9e",
        "#526d32",
        "#c7ad76",
      ],
      "ring": true,
      "ringInclination": 1.2071462331269869,
      "seed": [
        11.590499011799693,
        33.059558309149,
        46.98647865932435,
      ],
      "size": 0.9063149316227064,
      "spin": 0.10152130049187691,
      "tilt": -0.25459914138773454,
      "type": 0,
    }
  `)
  expect(planetAppearanceForSlot(6)).toMatchInlineSnapshot(`
    {
      "air": "#d27554",
      "haze": 0.12,
      "kind": "volcanic",
      "palette": [
        "#19131c",
        "#534143",
        "#8b574c",
        "#ffb048",
      ],
      "ring": false,
      "ringInclination": 1.3425125848664903,
      "seed": [
        47.24492884334177,
        34.87490588100627,
        54.40352438762784,
      ],
      "size": 0.7512180099443067,
      "spin": 0.06366079078521579,
      "tilt": -0.3937842495157383,
      "type": 2,
    }
  `)
})
