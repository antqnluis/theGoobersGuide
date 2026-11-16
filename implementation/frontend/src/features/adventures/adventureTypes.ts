import type { Database } from '../../types/database'

type Tables = Database['public']['Tables']

export const adventureTypes = ['main', 'side', 'personal'] as const
export type AdventureType = (typeof adventureTypes)[number]

export const adventureStatuses = ['pending', 'in_progress', 'on_hold', 'completed'] as const
export type AdventureStatus = (typeof adventureStatuses)[number]

/** Who may read an adventure: its participants, the party (M6, read-only), or the campaign (main). */
export type AdventureVisibility = 'participants' | 'party' | 'campaign'

/** One adventure. `type`, `status`, and `visibility` are narrowed from the columns' text types. */
export type Adventure = Omit<Tables['adventures']['Row'], 'type' | 'status' | 'visibility'> & {
  type: AdventureType
  status: AdventureStatus
  visibility: AdventureVisibility
}

export type AdventureObjective = Tables['adventure_objectives']['Row']
export type AdventureUpdate = Tables['adventure_updates']['Row']

export const participantStatuses = ['proposed', 'invited', 'accepted', 'declined', 'left'] as const
export type ParticipantStatus = (typeof participantStatuses)[number]

/** A participant row with its status narrowed and the approvals the viewer may read (M6). */
export type AdventureParticipant = Omit<Tables['adventure_participants']['Row'], 'status'> & {
  status: ParticipantStatus
  approvals: { approver_id: string }[]
}

/**
 * What a list row keeps of each participant. Accepted rows are readable by everyone who can
 * read the adventure; the other statuses and the approvals only by its accepted participants.
 */
export type AdventureParticipantSummary = Pick<
  AdventureParticipant,
  'id' | 'character_id' | 'profile_id' | 'status' | 'share_consent' | 'approvals'
>

/** A list row: no description, with just enough of the children for the row's progress. */
export type AdventureSummary = Omit<Adventure, 'description'> & {
  participants: AdventureParticipantSummary[]
  objectives: { done: boolean }[]
}

/** An opened adventure with its objectives (creation order) and updates (newest first). */
export type AdventureDetail = Adventure & {
  participants: AdventureParticipant[]
  objectives: AdventureObjective[]
  updates: AdventureUpdate[]
}

/** An open invitation to one of the viewer's characters: all the invitee may know (D5). */
export type AdventureInvitation = {
  participant_id: string
  adventure_id: string
  title: string
  type: Exclude<AdventureType, 'main'>
  character_id: string
  invited_by: string | null
  invited_at: string
  shared_with_party: boolean
}

/** Private, waiting for the rest to agree, or visible to the party. */
export type ShareState = 'private' | 'requested' | 'shared'

/** Characters deleted with a character (D11): adventures only it is in, and shared ones it leaves. */
export type CharacterAdventureCounts = { sole: number; shared: number }

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
