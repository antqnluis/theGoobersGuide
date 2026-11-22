import type { CampaignListItem } from './campaignTypes.ts'
import { orderPlanets } from './planetModel.ts'

/** Every galaxy has at least this many planets, whether or not a campaign sits on them. */
export const minPlanets = 6

/** One planet slot: the campaign on it, or null while it is uncharted. */
export type GalaxyPlanet = {
  slot: number
  campaign: CampaignListItem | null
}

/** A stored campaign -> planet assignment (the active rows of `galaxy_planets`). */
export type PlanetAssignment = {
  campaign_id: string
  slot: number
}

/**
 * Combines the campaigns a player can reach with their stored planet assignments.
 * Membership stays the only source of access: the campaign list decides which campaigns
 * exist, and assignments only decide where they sit.
 *
 * - Assignments for campaigns missing from the list (stale) are ignored.
 * - Two campaigns claiming one slot, or a bad slot, keep the older campaign in place and
 *   treat the other as unassigned.
 * - Listed campaigns without a usable assignment (a race between the two queries, or no
 *   assignments at all because that query is loading or failed) take the lowest free
 *   slots, oldest first. This is for display only.
 * - The galaxy has `minPlanets` planets, and grows to cover the outermost occupied slot,
 *   so it shrinks again once that planet is released.
 */
export function buildGalaxy(
  campaigns: CampaignListItem[] | undefined,
  assignments: readonly PlanetAssignment[] | null | undefined,
): GalaxyPlanet[] {
  const ordered = orderPlanets(campaigns)
  const requested = new Map(
    (assignments ?? []).map((assignment) => [assignment.campaign_id, assignment.slot]),
  )

  const placed = new Map<number, CampaignListItem>()
  const unplaced: CampaignListItem[] = []
  for (const campaign of ordered) {
    const slot = requested.get(campaign.id)
    if (slot !== undefined && Number.isInteger(slot) && slot >= 0 && !placed.has(slot)) {
      placed.set(slot, campaign)
    } else {
      unplaced.push(campaign)
    }
  }

  let free = 0
  for (const campaign of unplaced) {
    while (placed.has(free)) free++
    placed.set(free, campaign)
  }

  const highest = Math.max(-1, ...placed.keys())
  return Array.from({ length: Math.max(minPlanets, highest + 1) }, (_, slot) => ({
    slot,
    campaign: placed.get(slot) ?? null,
  }))
}
