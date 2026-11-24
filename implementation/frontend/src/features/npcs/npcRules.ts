import type { NpcSummary } from './npcTypes'

/** An NPC without its body, for the list cache. */
export function summarizeNpc(npc: NpcSummary & { body?: string }): NpcSummary {
  return {
    id: npc.id,
    campaign_id: npc.campaign_id,
    author_id: npc.author_id,
    visibility: npc.visibility,
    name: npc.name,
    role: npc.role,
    location: npc.location,
    portrait_path: npc.portrait_path,
    updated_by: npc.updated_by,
    created_at: npc.created_at,
    updated_at: npc.updated_at,
  }
}

/** Newest edit first. Timestamps compare as instants, so offsets and precision cannot reorder. */
export function sortNpcs<T extends Pick<NpcSummary, 'updated_at' | 'id'>>(npcs: readonly T[]) {
  return [...npcs].sort(
    (a, b) =>
      Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/** Case-insensitive filter over name, role, and location; a blank query keeps everything. */
export function filterNpcs<T extends Pick<NpcSummary, 'name' | 'role' | 'location'>>(
  npcs: readonly T[],
  query: string,
) {
  const needle = query.trim().toLowerCase()
  return needle
    ? npcs.filter((npc) =>
        [npc.name, npc.role, npc.location].some((text) => text.toLowerCase().includes(needle)),
      )
    : [...npcs]
}

/**
 * The two list groups, each newest edit first. A private entry is always the reader's own
 * (RLS), so "Only you" needs no author check.
 */
export function groupNpcs<T extends Pick<NpcSummary, 'updated_at' | 'id' | 'visibility'>>(
  npcs: readonly T[],
) {
  const sorted = sortNpcs(npcs)
  return {
    shared: sorted.filter((npc) => npc.visibility === 'campaign'),
    onlyYou: sorted.filter((npc) => npc.visibility !== 'campaign'),
  }
}

/** "Innkeeper · Brightwater", or whichever of the two is set. */
export function npcSubtitle(npc: Pick<NpcSummary, 'role' | 'location'>) {
  return [npc.role, npc.location].filter(Boolean).join(' · ')
}
