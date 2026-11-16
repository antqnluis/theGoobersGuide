import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { noteKey, notesKey } from './noteQueries'
import { summarizeNote } from './noteRules'
import {
  createNote,
  deleteNote,
  isNoteConflict,
  isNoteUnavailable,
  noteError,
  saveNote,
  setNoteVisibility,
} from './noteService'
import type { Note, NoteCreateValues, NoteSummary, NoteValues, NoteVisibility } from './noteTypes'

export type NoteAction = 'create' | 'save' | 'visibility' | 'delete'

/**
 * How a write ended, so the surface decides what follows (opening the note, moving focus,
 * keeping the writer's text). A conflict carries the latest version for "Load latest".
 */
export type NoteResult =
  | { ok: true; note: Note }
  | { ok: false; reason: 'conflict'; latest: Note }
  | { ok: false; reason: 'unavailable' | 'failed' }

const fallbackCopy: Record<NoteAction, string> = {
  create: "We couldn't save this note. Check your connection and try again.",
  save: "We couldn't save this note. Check your connection and try again.",
  visibility: "We couldn't change who can see this note. Check your connection and try again.",
  delete: "We couldn't delete this note. Check your connection and try again.",
}

/**
 * Note mutations for one campaign. Called once by the workspace so mutation state survives
 * the Notes page unmounting. Authorization stays in the database; failures surface as safe
 * copy. Writes update the caches at once and refresh the list in the background.
 */
export function useNoteActions(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ action: NoteAction; noteId: string | null }>()

  const listKey = notesKey(campaignId, userId)
  const clearError = useCallback(() => setError(null), [])

  const patchList = (edit: (notes: NoteSummary[]) => NoteSummary[]) =>
    queryClient.setQueryData<NoteSummary[]>(listKey, (notes) => (notes ? edit(notes) : notes))

  /** Puts a written note in both caches and refreshes the list in the background. */
  const settle = (note: Note) => {
    queryClient.setQueryData(noteKey(note.id, userId), note)
    const summary = summarizeNote(note)
    patchList((notes) =>
      notes.some((row) => row.id === note.id)
        ? notes.map((row) => (row.id === note.id ? summary : row))
        : [summary, ...notes],
    )
    void queryClient.invalidateQueries({ queryKey: listKey })
  }

  /** The note is gone for this member: forget it and show the truth. */
  const dropNote = (noteId: string) => {
    queryClient.removeQueries({ queryKey: noteKey(noteId, userId) })
    patchList((notes) => notes.filter((row) => row.id !== noteId))
    void queryClient.invalidateQueries({ queryKey: listKey })
  }

  async function run(
    action: NoteAction,
    noteId: string | null,
    task: () => Promise<Note>,
  ): Promise<NoteResult> {
    setError(null)
    setPending({ action, noteId })
    try {
      return { ok: true, note: await task() }
    } catch (failure) {
      setError(noteError(failure, fallbackCopy[action]))
      if (isNoteConflict(failure)) {
        // The writer's text stays in the editor; the cache learns the latest version.
        queryClient.setQueryData(noteKey(failure.latest.id, userId), failure.latest)
        patchList((notes) =>
          notes.map((row) => (row.id === failure.latest.id ? summarizeNote(failure.latest) : row)),
        )
        void queryClient.invalidateQueries({ queryKey: listKey })
        return { ok: false, reason: 'conflict', latest: failure.latest }
      }
      if (isNoteUnavailable(failure)) {
        if (noteId) dropNote(noteId)
        else void queryClient.invalidateQueries({ queryKey: listKey })
        // The membership may be gone too: the campaign's own queries decide what shows.
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'detail', campaignId, userId],
        })
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'roster', campaignId, userId],
        })
        return { ok: false, reason: 'unavailable' }
      }
      return { ok: false, reason: 'failed' }
    } finally {
      setPending(undefined)
    }
  }

  const create = (values: NoteCreateValues) =>
    run('create', null, async () => {
      const note = await createNote(campaignId, values)
      settle(note)
      return note
    })

  const save = (noteId: string, values: NoteValues, previousUpdatedAt: string) =>
    run('save', noteId, async () => {
      const note = await saveNote(noteId, values, previousUpdatedAt)
      settle(note)
      return note
    })

  const changeVisibility = (
    noteId: string,
    visibility: NoteVisibility,
    previousUpdatedAt: string,
  ) =>
    run('visibility', noteId, async () => {
      const note = await setNoteVisibility(noteId, visibility, previousUpdatedAt)
      settle(note)
      return note
    })

  /** Resolves to whether the note is gone (deleted now, or already unavailable). */
  const remove = async (noteId: string) => {
    setError(null)
    setPending({ action: 'delete', noteId })
    try {
      await deleteNote(noteId)
      dropNote(noteId)
      return true
    } catch (failure) {
      setError(noteError(failure, fallbackCopy.delete))
      if (isNoteUnavailable(failure)) {
        dropNote(noteId)
        return true
      }
      return false
    } finally {
      setPending(undefined)
    }
  }

  return {
    error,
    clearError,
    pendingAction: pending?.action ?? null,
    pendingNoteId: pending?.noteId ?? null,
    create,
    save,
    changeVisibility,
    remove,
  }
}
