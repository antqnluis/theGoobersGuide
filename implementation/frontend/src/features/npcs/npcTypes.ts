import type { Database } from '../../types/database'

type Tables = Database['public']['Tables']

export const npcVisibilities = ['private', 'campaign'] as const
export type NpcVisibility = (typeof npcVisibilities)[number]

/** One NPC entry with its text. `visibility` is narrowed from the column's text type. */
export type Npc = Omit<Tables['npcs']['Row'], 'visibility'> & { visibility: NpcVisibility }

/** A list row: everything but the body. */
export type NpcSummary = Omit<Npc, 'body'>

/** An NPC as typed into the editor. */
export type NpcInput = {
  name: string
  role: string
  location: string
  body: string
  visibility: NpcVisibility
}

/** The fields any editor may save: visibility is saved separately, by the author only. */
export type NpcValues = {
  name: string
  role: string
  location: string
  body: string
}

/** What a new NPC is created with. */
export type NpcCreateValues = NpcValues & { visibility: NpcVisibility }
