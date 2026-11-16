import type { Database } from '../../types/database'

type Tables = Database['public']['Tables']

export const adventureTypes = ['main', 'side', 'personal'] as const
export type AdventureType = (typeof adventureTypes)[number]

export const adventureStatuses = ['pending', 'in_progress', 'on_hold', 'completed'] as const
export type AdventureStatus = (typeof adventureStatuses)[number]

/** M5 uses two audiences; M6 adds the party. */
export type AdventureVisibility = 'participants' | 'campaign'

/** One adventure. `type`, `status`, and `visibility` are narrowed from the columns' text types. */
export type Adventure = Omit<Tables['adventures']['Row'], 'type' | 'status' | 'visibility'> & {
  type: AdventureType
  status: AdventureStatus
  visibility: AdventureVisibility
}

export type AdventureObjective = Tables['adventure_objectives']['Row']
export type AdventureUpdate = Tables['adventure_updates']['Row']
export type AdventureParticipant = Tables['adventure_participants']['Row']

/** A list row: no description, with just enough of the children for the row's progress. */
export type AdventureSummary = Omit<Adventure, 'description'> & {
  participants: { character_id: string }[]
  objectives: { done: boolean }[]
}

/** An opened adventure with its objectives (creation order) and updates (newest first). */
export type AdventureDetail = Adventure & {
  participants: AdventureParticipant[]
  objectives: AdventureObjective[]
  updates: AdventureUpdate[]
}

/** The details form as typed. The type is editable between personal and side only. */
export type AdventureInput = {
  title: string
  type: AdventureType
  description: string
  nextStep: string
  reference: string
}

/** The columns the details form writes. */
export type AdventureValues = {
  title: string
  type: AdventureType
  description: string
  next_step: string
  reference: string
}

/** The create form as typed: a character for personal and side adventures, none for main. */
export type AdventureCreateInput = {
  title: string
  type: AdventureType
  characterId: string | null
  nextStep: string
}

/** The arguments `create_adventure` takes besides the campaign. */
export type AdventureCreateValues = {
  type: AdventureType
  title: string
  character_id: string | null
  next_step: string
}
