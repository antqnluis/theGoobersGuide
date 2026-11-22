import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import { galaxyPlanetsOptions, listGalaxyPlanets } from './galaxyPlanets'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

function selecting(result: { data: unknown; error: unknown }) {
  const select = vi.fn(() => Promise.resolve(result))
  vi.mocked(supabase.from).mockReturnValue({ select } as never)
  return select
}

beforeEach(() => vi.mocked(supabase.from).mockReset())

describe('galaxy planets', () => {
  it('reads the caller’s campaign to slot assignments', async () => {
    const rows = [
      { campaign_id: 'a', slot: 0 },
      { campaign_id: 'b', slot: 4 },
    ]
    const select = selecting({ data: rows, error: null })

    await expect(listGalaxyPlanets()).resolves.toEqual(rows)
    expect(supabase.from).toHaveBeenCalledWith('galaxy_planets')
    expect(select).toHaveBeenCalledWith('campaign_id,slot')
  })

  it('treats no rows as no assignments', async () => {
    selecting({ data: null, error: null })
    await expect(listGalaxyPlanets()).resolves.toEqual([])
  })

  it('throws the database error so the galaxy can fall back', async () => {
    const error = { code: '42501', message: 'denied' }
    selecting({ data: null, error })
    await expect(listGalaxyPlanets()).rejects.toBe(error)
  })

  it('shares one query key per player, under the campaigns prefix that mutations invalidate', () => {
    expect(galaxyPlanetsOptions('user-1').queryKey).toEqual(['campaigns', 'planets', 'user-1'])
    expect(galaxyPlanetsOptions('user-2').queryKey).not.toEqual(
      galaxyPlanetsOptions('user-1').queryKey,
    )
  })
})
