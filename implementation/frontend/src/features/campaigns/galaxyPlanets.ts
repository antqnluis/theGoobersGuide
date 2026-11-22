import { supabase } from '../../lib/supabase'
import type { PlanetAssignment } from './galaxyModel'

/**
 * The signed-in player's planet assignments: which of their planets each campaign occupies.
 * Row Level Security returns only the caller's own active rows, so a campaign they have
 * left or never joined never appears. Assignments only place campaigns; they grant nothing.
 */
export async function listGalaxyPlanets(): Promise<PlanetAssignment[]> {
  const { data, error } = await supabase.from('galaxy_planets').select('campaign_id,slot')
  if (error) throw error
  return data ?? []
}

/**
 * Moves the caller's campaign onto a free planet and returns the planet it ends on. A planet
 * that is already taken is not an error: nothing moves and the current planet comes back.
 */
export async function moveGalaxyPlanet(campaignId: string, slot: number): Promise<number> {
  const { data, error } = await supabase.rpc('move_galaxy_planet', {
    p_campaign_id: campaignId,
    p_slot: slot,
  })
  if (error) throw error
  return data
}

/** Reads the planet a link asks for (`?planet=3`): a whole number from 0, or null. */
export function parsePlanetParam(value: string | null) {
  if (value === null || !/^\d{1,5}$/.test(value)) return null
  return Number(value)
}

/** Shared by the galaxy, the camp's planet look, and the arrival prefetch. */
export function galaxyPlanetsOptions(userId: string) {
  return {
    queryKey: ['campaigns', 'planets', userId],
    queryFn: listGalaxyPlanets,
  }
}
