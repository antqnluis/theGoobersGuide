import { memberName } from '../campaigns/memberName'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { Note, NoteSummary } from './noteTypes'

/** A note without its body, for the list cache. */
export function summarizeNote(note: Note | NoteSummary): NoteSummary {
  return {
    id: note.id,
    campaign_id: note.campaign_id,
    author_id: note.author_id,
    visibility: note.visibility,
    title: note.title,
    character_id: note.character_id,
    updated_by: note.updated_by,
    created_at: note.created_at,
    updated_at: note.updated_at,
  }
}

/** Newest edit first. Timestamps compare as instants, so offsets and precision cannot reorder. */
export function sortNotes<T extends Pick<NoteSummary, 'updated_at' | 'id'>>(notes: readonly T[]) {
  return [...notes].sort(
    (a, b) =>
      Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/** Case-insensitive title filter; a blank query keeps everything. */
export function filterNotes<T extends Pick<NoteSummary, 'title'>>(
  notes: readonly T[],
  query: string,
) {
  const needle = query.trim().toLowerCase()
  return needle ? notes.filter((note) => note.title.toLowerCase().includes(needle)) : [...notes]
}

/**
 * The two list groups (D7), each newest edit first. A private note is always the reader's own
 * (RLS), so "Only you" needs no author check.
 */
export function groupNotes<T extends Pick<NoteSummary, 'updated_at' | 'id' | 'visibility'>>(
  notes: readonly T[],
) {
  const sorted = sortNotes(notes)
  return {
    shared: sorted.filter((note) => note.visibility === 'campaign'),
    onlyYou: sorted.filter((note) => note.visibility !== 'campaign'),
  }
}

/** Who wrote a note: "You", the member's name, or a former member (§5.3). */
export function noteAuthorLabel(
  authorId: string,
  userId: string,
  roster: readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[],
) {
  if (authorId === userId) return 'You'
  const member = roster.find((row) => row.profile_id === authorId)
  return member ? memberName(member) : 'A former member'
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

/** "just now", "5 minutes ago", "2 hours ago". Future stamps (clock skew) read as "just now". */
export function relativeTime(iso: string, now: Date = new Date()) {
  const seconds = Math.round((now.getTime() - Date.parse(iso)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now'
  const [unit, size] = units.find(([, size]) => seconds >= size) ?? units[units.length - 1]
  return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(
    -Math.floor(seconds / size),
    unit,
  )
}

/**
 * "Edited by Mira, 2 hours ago". A deleted editor's account (null) shows only the time, and a
 * member who has left reads as a former member.
 */
export function noteEditedLabel(
  note: Pick<NoteSummary, 'updated_by' | 'updated_at'>,
  userId: string,
  roster: readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[],
  now: Date = new Date(),
) {
  const when = relativeTime(note.updated_at, now)
  if (note.updated_by === null) return `Edited ${when}`
  const who = note.updated_by === userId ? 'you' : noteAuthorLabel(note.updated_by, userId, roster)
  return `Edited by ${who}, ${when}`
}
