import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CampPanel } from '../campaigns/camp/CampPanel'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { UnsavedChangesDialog } from '../characters/UnsavedChangesDialog'
import { NoteEditor } from './NoteEditor'
import { NoteView } from './NoteView'
import { noteOptions, notesOptions } from './noteQueries'
import { filterNotes, groupNotes, noteAuthorLabel, noteEditedLabel } from './noteRules'
import { isNoteUnavailable } from './noteService'
import type { Note, NoteSummary } from './noteTypes'
import type { useNoteActions } from './useNoteActions'
import './notes.css'

/** Which screen of the notebook is showing. Owned by the workspace so closing the camp resets it. */
export type NoteScreen =
  { type: 'list' } | { type: 'new' } | { type: 'note'; id: string } | { type: 'edit'; id: string }

/** The "Notes" destination at the journal crates: list, read, write, share, and delete. */
export function CampNotes({
  actions,
  campaignId,
  characters,
  enabled,
  onDirtyChange,
  onNotice,
  onScreenChange,
  roster,
  screen,
  userId,
}: {
  actions: ReturnType<typeof useNoteActions>
  campaignId: string
  /** Every character the member may see; for the link and for naming it. */
  characters: readonly CharacterSummary[]
  /** True once the Notes destination has been opened, so nothing loads before it is needed. */
  enabled: boolean
  onDirtyChange?: (dirty: boolean) => void
  onNotice: (notice: string) => void
  onScreenChange: (screen: NoteScreen) => void
  roster: readonly CampaignRosterMember[]
  screen: NoteScreen
  userId: string
}) {
  const listQuery = useQuery(notesOptions(campaignId, userId, enabled))
  const openId = screen.type === 'note' ? screen.id : ''
  const detailQuery = useQuery(noteOptions(openId, userId, enabled && openId !== ''))
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<NoteScreen | null>(null)
  // A share or make-private that lost a race: the latest version is shown, and the change is not made.
  const [staleChange, setStaleChange] = useState(false)
  // The note an open editor started from, kept even if it disappears elsewhere meanwhile.
  const [editing, setEditing] = useState<Note | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const detailRef = useRef<HTMLHeadingElement>(null)
  const newRef = useRef<HTMLButtonElement>(null)
  const focusRowRef = useRef<string | null>(null)
  const firstRenderRef = useRef(true)
  // The note's heading takes focus once the note has loaded after being opened.
  const focusDetailRef = useRef(false)

  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])

  // Closing the browser tab with an unsaved note asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Moves focus to the new screen, after the first render. The editor focuses its own title.
  const screenKey = `${screen.type}:${'id' in screen ? screen.id : ''}`
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    if (screen.type === 'list') {
      const row = focusRowRef.current
        ? rootRef.current?.querySelector<HTMLElement>(`[data-note-id="${focusRowRef.current}"]`)
        : null
      focusRowRef.current = null
      ;(row ?? newRef.current ?? titleRef.current)?.focus()
    } else if (screen.type === 'note') {
      focusDetailRef.current = true
    }
    // `screen` is derived from `screenKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey])

  const loadedId = detailQuery.data?.id
  useEffect(() => {
    if (focusDetailRef.current && loadedId && screen.type === 'note') {
      focusDetailRef.current = false
      detailRef.current?.focus()
    }
  }, [loadedId, screen.type, screenKey])

  // A note that turns out to be gone: show the truth in the list too.
  const unavailable = detailQuery.isError && isNoteUnavailable(detailQuery.error)
  const { refetch: refetchList } = listQuery
  useEffect(() => {
    if (unavailable) void refetchList()
  }, [unavailable, refetchList])

  /** Goes to another screen; unsaved text asks first unless the caller just saved or left it. */
  function go(next: NoteScreen, options: { force?: boolean } = {}) {
    if (dirty && !options.force) {
      setPendingNav(next)
      return
    }
    actions.clearError()
    setStaleChange(false)
    if (next.type !== 'edit') setEditing(null)
    onScreenChange(next)
  }

  const names = useMemo(
    () => new Map(characters.map((character) => [character.id, character.name])),
    [characters],
  )

  const errorAlert = actions.error && (
    <p className="journal-alert" role="alert">
      <PixelIcon name="flame" />
      {actions.error}
    </p>
  )

  const note = detailQuery.data

  function backToList(from?: string) {
    focusRowRef.current = from ?? null
    go({ type: 'list' })
  }

  return (
    <CampPanel
      headingId="camp-notes-heading"
      headingRef={titleRef}
      icon="quill"
      place="Journal crates"
      title="Campaign notes"
    >
      <div className="camp-notes" data-screen={screen.type} ref={rootRef}>
        {screen.type === 'list' && (
          <NoteList
            error={errorAlert || null}
            filter={filter}
            names={names}
            newRef={newRef}
            notes={listQuery.data}
            onFilterChange={setFilter}
            onNew={() => go({ type: 'new' })}
            onOpen={(id) => go({ type: 'note', id })}
            onRetry={() => void listQuery.refetch()}
            roster={roster}
            status={listQuery.isError ? 'error' : listQuery.isSuccess ? 'success' : 'pending'}
            userId={userId}
          />
        )}

        {screen.type === 'new' && (
          <section aria-labelledby="note-new-heading" className="note-page">
            <h3 id="note-new-heading" tabIndex={-1}>
              New note
            </h3>
            <NoteEditor
              characters={characters}
              error={actions.error}
              isPending={actions.pendingAction === 'create'}
              mode="new"
              note={null}
              onCancel={() => backToList()}
              onDirtyChange={setDirty}
              onDismissError={actions.clearError}
              onSubmit={async (values) => {
                const result = await actions.create(values)
                if (result.ok) {
                  onNotice('Note created.')
                  setDirty(false)
                  go({ type: 'note', id: result.note.id }, { force: true })
                }
                return result
              }}
            />
          </section>
        )}

        {screen.type === 'note' && detailQuery.isPending && (
          <p className="journal-status" role="status">
            Loading the note…
          </p>
        )}
        {screen.type === 'note' && unavailable && (
          <div className="journal-status journal-status--error" role="alert">
            <p>This note is no longer available. It may have been made private or deleted.</p>
            <button
              className="journal-button journal-button--secondary"
              onClick={() => backToList()}
              type="button"
            >
              Back to notes
            </button>
          </div>
        )}
        {screen.type === 'note' && detailQuery.isError && !unavailable && (
          <div className="journal-status journal-status--error" role="alert">
            <p>This note could not be loaded.</p>
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void detailQuery.refetch()}
              type="button"
            >
              Try again
            </button>
            <button
              className="journal-button journal-button--ghost"
              onClick={() => backToList(screen.id)}
              type="button"
            >
              Back to notes
            </button>
          </div>
        )}
        {screen.type === 'note' && note && (
          <NoteView
            characters={characters}
            error={
              staleChange
                ? 'This note changed just now. The latest version is shown. Try again if you still want the change.'
                : actions.error
            }
            headingRef={detailRef}
            note={note}
            onBack={() => backToList(note.id)}
            onDelete={async () => {
              const gone = await actions.remove(note.id)
              if (gone) {
                onNotice('Note deleted.')
                focusRowRef.current = null
                go({ type: 'list' }, { force: true })
              }
              return gone
            }}
            onEdit={() => {
              setEditing(note)
              go({ type: 'edit', id: note.id }, { force: true })
            }}
            onVisibility={async (visibility) => {
              setStaleChange(false)
              const result = await actions.changeVisibility(note.id, visibility, note.updated_at)
              if (result.ok) {
                onNotice(
                  visibility === 'campaign'
                    ? 'Note shared with the campaign.'
                    : 'Note is now private.',
                )
                return true
              }
              // The hook has put the latest version in the cache; the change itself is not made.
              if (result.reason === 'conflict') {
                actions.clearError()
                setStaleChange(true)
              }
              return false
            }}
            pendingAction={actions.pendingAction}
            roster={roster}
            userId={userId}
          />
        )}

        {screen.type === 'edit' && (editing?.id === screen.id ? editing : note) && (
          <section aria-labelledby="note-edit-heading" className="note-page">
            <h3 id="note-edit-heading" tabIndex={-1}>
              Edit note
            </h3>
            <NoteEditor
              characters={characters}
              error={actions.error}
              isPending={actions.pendingAction === 'save'}
              key={screen.id}
              mode="edit"
              note={(editing?.id === screen.id ? editing : note) ?? null}
              onCancel={(reason) => {
                // Cancelling returns to the note, unless there is no note left to return to.
                if (reason === 'gone') backToList()
                else go({ type: 'note', id: screen.id })
              }}
              onDirtyChange={setDirty}
              onDismissError={actions.clearError}
              onSubmit={async (values, base) => {
                const result = await actions.save(
                  screen.id,
                  { title: values.title, body: values.body, character_id: values.character_id },
                  (base ?? editing ?? note)!.updated_at,
                )
                if (result.ok) {
                  onNotice('Note saved.')
                  setDirty(false)
                  go({ type: 'note', id: screen.id }, { force: true })
                }
                return result
              }}
            />
          </section>
        )}
        {screen.type === 'edit' && !(editing?.id === screen.id ? editing : note) && (
          <div className="journal-status">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => go({ type: 'note', id: screen.id }, { force: true })}
              type="button"
            >
              Open the note
            </button>
          </div>
        )}
      </div>

      {pendingNav && (
        <div data-unsaved-prompt>
          <UnsavedChangesDialog
            discardLabel="Discard and go back"
            message="You have edits that haven't been saved. Going back now will discard them."
            onDiscard={() => {
              const next = pendingNav
              setPendingNav(null)
              setDirty(false)
              go(next, { force: true })
            }}
            onKeep={() => setPendingNav(null)}
          />
        </div>
      )}
    </CampPanel>
  )
}

function NoteList({
  error,
  filter,
  names,
  newRef,
  notes,
  onFilterChange,
  onNew,
  onOpen,
  onRetry,
  roster,
  status,
  userId,
}: {
  error: React.ReactNode
  filter: string
  names: ReadonlyMap<string, string>
  newRef: React.Ref<HTMLButtonElement>
  notes: NoteSummary[] | undefined
  onFilterChange: (value: string) => void
  onNew: () => void
  onOpen: (id: string) => void
  onRetry: () => void
  roster: readonly CampaignRosterMember[]
  status: 'pending' | 'error' | 'success'
  userId: string
}) {
  const all = notes ?? []
  const shown = filterNotes(all, filter)
  const groups = groupNotes(shown)
  const now = new Date()

  const group = (id: string, heading: string, rows: NoteSummary[], emptyText: string) => (
    <section aria-labelledby={id} className="note-group">
      <h3 className="journal-section-title" id={id}>
        <PixelIcon name={id === 'notes-shared-heading' ? 'eye' : 'lock'} />
        {heading}
      </h3>
      {rows.length === 0 ? (
        <p className="note-group__empty">{emptyText}</p>
      ) : (
        <ul className="note-list">
          {rows.map((row) => (
            <li className="note-row" key={row.id}>
              <button
                className="note-row__open"
                data-note-id={row.id}
                onClick={() => onOpen(row.id)}
                type="button"
              >
                {row.title}
              </button>
              <p className="note-row__meta">
                <span>{noteAuthorLabel(row.author_id, userId, roster)}</span>
                <span>{noteEditedLabel(row, userId, roster, now)}</span>
                {row.character_id && names.get(row.character_id) && (
                  <span>About {names.get(row.character_id)}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <>
      {error}
      {status === 'pending' && (
        <p className="journal-status" role="status">
          Loading the notes…
        </p>
      )}
      {status === 'error' && (
        <div className="journal-status journal-status--error" role="alert">
          <p>The notes could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {status === 'success' && (
        <>
          <div className="journal-actions note-toolbar">
            <button className="journal-button" onClick={onNew} ref={newRef} type="button">
              <PixelIcon name="quill" />
              New note
            </button>
            {all.length > 0 && (
              <div className="journal-field note-toolbar__filter">
                <label htmlFor="notes-filter">Filter by title</label>
                <input
                  autoComplete="off"
                  className="journal-input"
                  id="notes-filter"
                  onChange={(event) => onFilterChange(event.target.value)}
                  type="search"
                  value={filter}
                />
              </div>
            )}
          </div>
          {all.length === 0 ? (
            <p className="journal-status note-empty">No notes yet. Write the first one.</p>
          ) : shown.length === 0 ? (
            <p className="journal-status note-empty" role="status">
              No notes match &ldquo;{filter.trim()}&rdquo;.
            </p>
          ) : (
            <>
              {group(
                'notes-shared-heading',
                'Shared with the campaign',
                groups.shared,
                'Nothing shared yet.',
              )}
              {group('notes-private-heading', 'Only you', groups.onlyYou, 'No private notes.')}
            </>
          )}
        </>
      )}
    </>
  )
}
