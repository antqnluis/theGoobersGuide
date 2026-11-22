import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { noteAuthorLabel, relativeTime } from '../notes/noteRules'
import type {
  Adventure,
  AdventureDetail,
  AdventureInvitation,
  AdventureObjective,
  AdventureParticipantSummary,
  AdventureStatus,
  AdventureSummary,
  AdventureType,
  ShareState,
} from './adventureTypes'

type RosterEntry = Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>

export const adventureTypeLabels: Record<AdventureType, string> = {
  main: 'Main',
  side: 'Side',
  personal: 'Personal',
}

export const adventureStatusLabels: Record<AdventureStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
}

/** The list row for an adventure: no description, with the children reduced to what the row shows. */
export function summarizeAdventure(
  adventure: Adventure | AdventureSummary | AdventureDetail,
  children?: Pick<AdventureSummary, 'participants' | 'objectives'>,
): AdventureSummary {
  const source = adventure as Partial<AdventureDetail> & Partial<AdventureSummary>
  return {
    id: adventure.id,
    campaign_id: adventure.campaign_id,
    created_by: adventure.created_by,
    type: adventure.type,
    visibility: adventure.visibility,
    status: adventure.status,
    title: adventure.title,
    next_step: adventure.next_step,
    reference: adventure.reference,
    updated_by: adventure.updated_by,
    status_changed_at: adventure.status_changed_at,
    status_changed_by: adventure.status_changed_by,
    archived_at: adventure.archived_at,
    created_at: adventure.created_at,
    updated_at: adventure.updated_at,
    participants: (children?.participants ?? source.participants ?? []).map((participant) => ({
      id: participant.id,
      character_id: participant.character_id,
      profile_id: participant.profile_id,
      status: participant.status,
      share_consent: participant.share_consent,
      approvals: participant.approvals.map(({ approver_id }) => ({ approver_id })),
    })),
    objectives: (children?.objectives ?? source.objectives ?? []).map((objective) => ({
      done: objective.done,
    })),
  }
}

/** Newest edit first. Timestamps compare as instants, so offsets and precision cannot reorder. */
export function sortAdventures<T extends Pick<AdventureSummary, 'updated_at' | 'id'>>(
  adventures: readonly T[],
) {
  return [...adventures].sort(
    (a, b) =>
      Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/** Case-insensitive title filter; a blank query keeps everything. */
export function filterAdventures<T extends Pick<AdventureSummary, 'title'>>(
  adventures: readonly T[],
  query: string,
) {
  const needle = query.trim().toLowerCase()
  return needle
    ? adventures.filter((adventure) => adventure.title.toLowerCase().includes(needle))
    : [...adventures]
}

/** Where a status sorts inside "Your adventures" (D12): in progress, then pending, then on hold. */
const activeOrder: Record<AdventureStatus, number> = {
  in_progress: 0,
  pending: 1,
  on_hold: 2,
  completed: 3,
}

type Groupable = Pick<
  AdventureSummary,
  | 'id'
  | 'updated_at'
  | 'type'
  | 'status'
  | 'archived_at'
  | 'created_by'
  | 'visibility'
  | 'participants'
>

type Participation = Pick<AdventureSummary, 'participants'>

/** The viewer's accepted participation, or null: a party viewer, or a main adventure's reader. */
export function myParticipation<
  P extends Pick<AdventureParticipantSummary, 'profile_id' | 'status'>,
>(adventure: { participants: readonly P[] }, userId: string): P | null {
  return (
    adventure.participants.find(
      (participant) => participant.profile_id === userId && participant.status === 'accepted',
    ) ?? null
  )
}

/** Accepted participants, the only rows everyone who can read the adventure sees. */
export function acceptedParticipants<
  P extends Pick<AdventureParticipantSummary, 'status'>,
>(adventure: { participants: readonly P[] }) {
  return adventure.participants.filter((participant) => participant.status === 'accepted')
}

/** Private, waiting for the rest to agree, or shared with the party (D6). Main is never shared. */
export function shareState(
  adventure: Pick<Adventure, 'type' | 'visibility'> & Participation,
): ShareState {
  if (adventure.type === 'main') return 'private'
  if (adventure.visibility === 'party') return 'shared'
  return acceptedParticipants(adventure).some((participant) => participant.share_consent)
    ? 'requested'
    : 'private'
}

/** A proposal the viewer, as an accepted participant, has not approved yet (D3). */
export function needsMyApproval(
  participant: Pick<AdventureParticipantSummary, 'status' | 'approvals'>,
  userId: string,
) {
  return (
    participant.status === 'proposed' &&
    !participant.approvals.some((approval) => approval.approver_id === userId)
  )
}

/** A share request the viewer, as an accepted participant, has not agreed to (D6). */
export function needsMyConsent(
  adventure: Pick<Adventure, 'type' | 'visibility' | 'archived_at'> & Participation,
  userId: string,
) {
  const mine = myParticipation(adventure, userId)
  return (
    adventure.archived_at === null &&
    mine !== null &&
    !mine.share_consent &&
    shareState(adventure) === 'requested'
  )
}

export type WaitingReason =
  { kind: 'approval'; participant: AdventureParticipantSummary } | { kind: 'consent' }

/** Why an adventure is in "Waiting for you": proposals to approve and a share request (D13). */
export function waitingReasons(
  adventure: Pick<Adventure, 'type' | 'visibility' | 'archived_at'> & Participation,
  userId: string,
): WaitingReason[] {
  if (adventure.archived_at !== null || myParticipation(adventure, userId) === null) return []
  const reasons: WaitingReason[] = adventure.participants
    .filter((participant) => needsMyApproval(participant, userId))
    .map((participant) => ({ kind: 'approval', participant }))
  if (needsMyConsent(adventure, userId)) reasons.push({ kind: 'consent' })
  return reasons
}

/**
 * The board's groups (§5.3, changing M5 D12), each most recently edited first, and each
 * adventure in exactly one. "Waiting for you" takes precedence over the rest. A completed
 * adventure of any type moves to "Completed". An archived adventure sits in "Archived": the
 * viewer's own main adventure, or a personal or side adventure they are in (D10). Adventures
 * shared with the party that the viewer is not in are read-only, in "Shared with the party".
 */
export function groupAdventures<T extends Groupable>(adventures: readonly T[], userId: string) {
  const sorted = sortAdventures(adventures)
  const live = sorted.filter((adventure) => adventure.archived_at === null)
  const waiting = live.filter((adventure) => waitingReasons(adventure, userId).length > 0)
  const rest = live.filter((adventure) => !waiting.includes(adventure))
  const active = rest.filter((adventure) => adventure.status !== 'completed')
  const mine = (adventure: T) => myParticipation(adventure, userId) !== null
  return {
    waiting,
    mainStory: active.filter((adventure) => adventure.type === 'main'),
    yours: active
      .filter((adventure) => adventure.type !== 'main' && mine(adventure))
      // A stable sort keeps the newest-first order inside each status.
      .sort((a, b) => activeOrder[a.status] - activeOrder[b.status]),
    shared: active.filter((adventure) => adventure.type !== 'main' && !mine(adventure)),
    completed: rest.filter((adventure) => adventure.status === 'completed'),
    archived: sorted.filter(
      (adventure) =>
        adventure.archived_at !== null &&
        (adventure.type === 'main' ? adventure.created_by === userId : mine(adventure)),
    ),
  }
}

/** Invitations whose title matches the board's filter; a blank query keeps everything. */
export function filterInvitations(invitations: readonly AdventureInvitation[], query: string) {
  const needle = query.trim().toLowerCase()
  return needle
    ? invitations.filter((invitation) => invitation.title.toLowerCase().includes(needle))
    : [...invitations]
}

/** Objectives done out of total, for a row or the detail header. */
export function objectiveProgress(objectives: readonly Pick<AdventureObjective, 'done'>[]) {
  return { done: objectives.filter((objective) => objective.done).length, total: objectives.length }
}

export function isArchived(adventure: Pick<Adventure, 'archived_at'>) {
  return adventure.archived_at !== null
}

/**
 * Who archives and restores (D10). Main: its creator. Personal and side: the creator while an
 * accepted participant, and any accepted participant once the creator is not one. The database
 * enforces it too.
 */
export function canArchive(
  adventure: Pick<Adventure, 'created_by' | 'type'> & Participation,
  userId: string,
) {
  if (adventure.type === 'main') return adventure.created_by === userId
  if (myParticipation(adventure, userId) === null) return false
  if (adventure.created_by === userId) return true
  return !acceptedParticipants(adventure).some(
    (participant) => participant.profile_id === adventure.created_by,
  )
}

/**
 * Whether the viewer may change the adventure: a main adventure, or one they are accepted in,
 * and not archived. The party audience reads only (D7).
 */
export function canEdit(
  adventure: Pick<Adventure, 'type' | 'archived_at'> & Participation,
  userId: string,
) {
  if (adventure.archived_at !== null) return false
  return adventure.type === 'main' || myParticipation(adventure, userId) !== null
}

type RosterProfile = Pick<CampaignRosterMember, 'profile_id'>

/**
 * Characters that may be proposed (D1, D2): active, owned by another current member, whose
 * owner has no live participation (proposed, invited, or accepted) in the adventure.
 */
export function invitableCharacters<C extends Pick<CharacterSummary, 'id' | 'owner_id' | 'status'>>(
  characters: readonly C[],
  adventure: Participation,
  roster: readonly RosterProfile[],
  userId: string,
) {
  const members = new Set(roster.map((member) => member.profile_id))
  const live = new Set(
    adventure.participants
      .filter((participant) => ['proposed', 'invited', 'accepted'].includes(participant.status))
      .map((participant) => participant.profile_id),
  )
  return characters.filter(
    (character) =>
      character.status === 'active' &&
      character.owner_id !== userId &&
      members.has(character.owner_id) &&
      !live.has(character.owner_id),
  )
}

/** The accepted participants who have not approved a proposal yet. */
export function missingApprovals(
  participant: Pick<AdventureParticipantSummary, 'approvals'>,
  adventure: Participation,
) {
  return acceptedParticipants(adventure).filter(
    (accepted) =>
      !participant.approvals.some((approval) => approval.approver_id === accepted.profile_id),
  )
}

/**
 * The state of a non-accepted participant: "Waiting for 2 approvals", "Waiting for Mira's
 * answer", "Declined", or "Left". An accepted participant has none.
 */
export function participantLabel(
  participant: Pick<AdventureParticipantSummary, 'status' | 'approvals' | 'profile_id'>,
  adventure: Participation,
  userId: string,
  roster: readonly RosterEntry[],
) {
  switch (participant.status) {
    case 'proposed': {
      const count = missingApprovals(participant, adventure).length
      return `Waiting for ${count} ${count === 1 ? 'approval' : 'approvals'}`
    }
    case 'invited':
      return `Waiting for ${who(participant.profile_id, userId, roster)}'s answer`
    case 'declined':
      return 'Declined'
    case 'left':
      return 'Left'
    default:
      return null
  }
}

/** "Invited by Mira"; a deleted inviter (null) reads as a former member. */
export function inviterLabel(
  invitedBy: string | null,
  userId: string,
  roster: readonly RosterEntry[],
) {
  return `Invited by ${invitedBy === null ? 'a former member' : who(invitedBy, userId, roster)}`
}

/** Personal and side adventures switch freely; main never changes type (D2). */
export function selectableTypes(type: AdventureType): AdventureType[] {
  return type === 'main' ? ['main'] : ['personal', 'side']
}

/** Characters the viewer owns, for the create form. The database accepts any status (D3). */
export function ownCharacters<T extends Pick<CharacterSummary, 'owner_id'>>(
  characters: readonly T[],
  userId: string,
) {
  return characters.filter((character) => character.owner_id === userId)
}

/** The viewer's active character, else nothing: with none active the player chooses. */
export function defaultCharacterId(
  characters: readonly Pick<CharacterSummary, 'id' | 'owner_id' | 'status'>[],
  userId: string,
) {
  return (
    characters.find((character) => character.owner_id === userId && character.status === 'active')
      ?.id ?? null
  )
}

/** The participant's character name, or "A character" when the viewer cannot see it (§5.3). */
export function adventureCharacterName(
  characterId: string,
  characters: readonly Pick<CharacterSummary, 'id' | 'name'>[],
) {
  return characters.find((character) => character.id === characterId)?.name ?? 'A character'
}

/** Names the characters of an adventure's accepted participants, in participant order. */
export function adventureCharacterNames(
  adventure: Pick<AdventureSummary, 'participants'>,
  characters: readonly Pick<CharacterSummary, 'id' | 'name'>[],
) {
  return acceptedParticipants(adventure).map((participant) =>
    adventureCharacterName(participant.character_id, characters),
  )
}

function who(id: string, userId: string, roster: readonly RosterEntry[]) {
  return id === userId ? 'you' : noteAuthorLabel(id, userId, roster)
}

/**
 * "Edited by Mira, 2 hours ago". A deleted editor's account (null) shows only the time, and a
 * member who has left reads as a former member.
 */
export function adventureEditedLabel(
  adventure: Pick<Adventure, 'updated_by' | 'updated_at'>,
  userId: string,
  roster: readonly RosterEntry[],
  now: Date = new Date(),
) {
  const when = relativeTime(adventure.updated_at, now)
  if (adventure.updated_by === null) return `Edited ${when}`
  return `Edited by ${who(adventure.updated_by, userId, roster)}, ${when}`
}

const statusVerbs: Record<AdventureStatus, string> = {
  pending: 'Set to pending',
  in_progress: 'Set to in progress',
  on_hold: 'Put on hold',
  completed: 'Completed',
}

/** "Completed by Mira, 2 days ago"; null while the status has never been changed. */
export function adventureStatusLabel(
  adventure: Pick<Adventure, 'status' | 'status_changed_at' | 'status_changed_by'>,
  userId: string,
  roster: readonly RosterEntry[],
  now: Date = new Date(),
) {
  if (adventure.status_changed_at === null) return null
  const when = relativeTime(adventure.status_changed_at, now)
  const verb = statusVerbs[adventure.status]
  if (adventure.status_changed_by === null) return `${verb} ${when}`
  return `${verb} by ${who(adventure.status_changed_by, userId, roster)}, ${when}`
}

/** "Done by Mira, 2 days ago" for a ticked objective; null when it is not ticked. */
export function objectiveDoneLabel(
  objective: Pick<AdventureObjective, 'done' | 'completed_by' | 'completed_at'>,
  userId: string,
  roster: readonly RosterEntry[],
  now: Date = new Date(),
) {
  if (!objective.done || objective.completed_at === null) return null
  const when = relativeTime(objective.completed_at, now)
  if (objective.completed_by === null) return `Done ${when}`
  return `Done by ${who(objective.completed_by, userId, roster)}, ${when}`
}

/** Who posted an update: "You", the member's name, or a former member. */
export function updateAuthorLabel(
  authorId: string,
  userId: string,
  roster: readonly RosterEntry[],
) {
  return noteAuthorLabel(authorId, userId, roster)
}

/** Writes a changed adventure row onto a cached detail, keeping the children it was read with. */
export function mergeAdventure(detail: AdventureDetail, row: Adventure): AdventureDetail {
  return { ...detail, ...row }
}

/** "Mira wants to share this with the party": who has agreed to a share request, besides the viewer. */
export function shareRequestLabel(
  adventure: Participation,
  userId: string,
  roster: readonly RosterEntry[],
) {
  const names = acceptedParticipants(adventure)
    .filter((participant) => participant.share_consent && participant.profile_id !== userId)
    .map((participant) => noteAuthorLabel(participant.profile_id, userId, roster))
  if (names.length === 0) return 'Someone wants to share this with the party'
  const list = new Intl.ListFormat('en', { type: 'conjunction' }).format(names)
  return `${list} ${names.length === 1 ? 'wants' : 'want'} to share this with the party`
}

/**
 * Whether the viewer reads a personal or side adventure only because it is shared with the
 * party (D7): they are not an accepted participant. Main adventures are never read-only here.
 */
export function isPartyReader(adventure: Pick<Adventure, 'type'> & Participation, userId: string) {
  return adventure.type !== 'main' && myParticipation(adventure, userId) === null
}

/**
 * Personal and side adventures the viewer is accepted in with at least one other accepted
 * participant: the threads leaving the campaign takes them out of (D9).
 */
export function sharedThreadCount(
  adventures: readonly (Pick<Adventure, 'type'> & Participation)[],
  userId: string,
) {
  return adventures.filter(
    (adventure) =>
      adventure.type !== 'main' &&
      myParticipation(adventure, userId) !== null &&
      acceptedParticipants(adventure).length > 1,
  ).length
}

/** "Shared with the party by Mira and Bram." for the party's read-only view. */
export function sharedByLabel(
  adventure: Participation,
  userId: string,
  roster: readonly RosterEntry[],
) {
  const names = acceptedParticipants(adventure).map((participant) =>
    noteAuthorLabel(participant.profile_id, userId, roster),
  )
  if (names.length === 0) return 'Shared with the party.'
  return `Shared with the party by ${new Intl.ListFormat('en', { type: 'conjunction' }).format(names)}.`
}
