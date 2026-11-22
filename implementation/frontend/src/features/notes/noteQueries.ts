import { getNote, isNoteUnavailable, listNotes } from './noteService'

/** Every notes query, for the membership cache. Under ['campaigns'] so transfers refresh it too. */
export const notesPrefix = ['campaigns', 'notes'] as const

export const notesKey = (campaignId: string, userId: string) =>
  ['campaigns', 'notes', campaignId, userId] as const

export const noteKey = (noteId: string, userId: string) =>
  ['campaigns', 'notes', 'detail', noteId, userId] as const

/** The campaign's notes; `enabled` waits until the Notes destination is first opened. */
export function notesOptions(campaignId: string, userId: string, enabled = true) {
  return {
    queryKey: notesKey(campaignId, userId),
    queryFn: () => listNotes(campaignId),
    enabled,
    // Realtime (useCampaignLive) refreshes this as others change it; refetching on focus stays as
    // the backstop for deletions and for notes that stopped being readable.
    refetchOnWindowFocus: true,
  }
}

/** One note with its body; `enabled` waits until a note is opened. */
export function noteOptions(noteId: string, userId: string, enabled = true) {
  return {
    queryKey: noteKey(noteId, userId),
    queryFn: () => getNote(noteId),
    enabled,
    // Like the app's other queries it retries once, but a note that is gone will not come back.
    retry: (failures: number, error: unknown) => !isNoteUnavailable(error) && failures < 1,
    refetchOnWindowFocus: true,
  }
}
