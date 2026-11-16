import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { noteAuthorLabel, relativeTime } from '../notes/noteRules'
import type {
  Adventure,
  AdventureDetail,
  AdventureObjective,
  AdventureStatus,
  AdventureSummary,
  AdventureType,
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
      character_id: participant.character_id,
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
  'id' | 'updated_at' | 'type' | 'status' | 'archived_at' | 'created_by'
>

/**
 * The four list groups (D12), each most recently edited first. A completed adventure of any
 * type moves to "Completed", so "Main story" shows the storyline still in play. An archived
 * adventure is only ever the creator's own (RLS), and sits in "Archived" whatever its status.
 */
export function groupAdventures<T extends Groupable>(adventures: readonly T[], userId: string) {
  const sorted = sortAdventures(adventures)
  const live = sorted.filter((adventure) => adventure.archived_at === null)
  const active = live.filter((adventure) => adventure.status !== 'completed')
  return {
    mainStory: active.filter((adventure) => adventure.type === 'main'),
    yours: active
      .filter((adventure) => adventure.type !== 'main')
      // A stable sort keeps the newest-first order inside each status.
      .sort((a, b) => activeOrder[a.status] - activeOrder[b.status]),
    completed: live.filter((adventure) => adventure.status === 'completed'),
    archived: sorted.filter(
      (adventure) => adventure.archived_at !== null && adventure.created_by === userId,
    ),
  }
}

/** Objectives done out of total, for a row or the detail header. */
export function objectiveProgress(objectives: readonly Pick<AdventureObjective, 'done'>[]) {
  return { done: objectives.filter((objective) => objective.done).length, total: objectives.length }
}

export function isArchived(adventure: Pick<Adventure, 'archived_at'>) {
  return adventure.archived_at !== null
}

/** Only the creator archives or restores (D4); the database enforces it too. */
export function canArchive(adventure: Pick<Adventure, 'created_by'>, userId: string) {
  return adventure.created_by === userId
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

/** Names the characters of an adventure's participants, in participant order. */
export function adventureCharacterNames(
  adventure: Pick<AdventureSummary, 'participants'>,
  characters: readonly Pick<CharacterSummary, 'id' | 'name'>[],
) {
  return adventure.participants.map((participant) =>
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
