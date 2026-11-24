import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { CampPanel } from '../campaigns/camp/CampPanel'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { UnsavedChangesDialog } from '../characters/UnsavedChangesDialog'
import '../notes/notes.css'
import { NpcEditor } from './NpcEditor'
import { NpcMedallion } from './NpcMedallion'
import { VisibilityChip } from './VisibilityChip'
import { NpcView } from './NpcView'
import { npcOptions, npcsOptions } from './npcQueries'
import { filterNpcs, groupNpcs, npcSubtitle } from './npcRules'
import { isNpcUnavailable } from './npcService'
import type { Npc, NpcSummary } from './npcTypes'
import type { useNpcActions } from './useNpcActions'
import './npcs.css'

/** Which screen of the NPC log is showing. Owned by the workspace so closing the camp resets it. */
export type NpcScreen =
  { type: 'list' } | { type: 'new' } | { type: 'npc'; id: string } | { type: 'edit'; id: string }

/** The "NPCs" tab at the journal crates: list, read, write, share, and delete. */
export function CampNpcs({
  actions,
  campaignId,
  enabled,
  filter,
  onDirtyChange,
  onFilterChange,
  onNotice,
  onScreenChange,
  roster,
  screen,
  tabs,
  userId,
}: {
  actions: ReturnType<typeof useNpcActions>
  campaignId: string
  /** True once the tab has been opened, so nothing loads before it is needed. */
  enabled: boolean
  /** The filter text, kept by the workspace so it survives a visit to the Notes tab. */
  filter: string
  onFilterChange: (filter: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onNotice: (notice: string) => void
  onScreenChange: (screen: NpcScreen) => void
  roster: readonly CampaignRosterMember[]
  screen: NpcScreen
  /** The Notes / NPCs switch, shown above the list. */
  tabs: React.ReactNode
  userId: string
}) {
  const listQuery = useQuery(npcsOptions(campaignId, userId, enabled))
  const openId = screen.type === 'npc' ? screen.id : ''
  const detailQuery = useQuery(npcOptions(openId, userId, enabled && openId !== ''))
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<NpcScreen | null>(null)
  // A share or make-private that lost a race: the latest version is shown, and the change is not made.
  const [staleChange, setStaleChange] = useState(false)
  // The NPC an open editor started from, kept even if it disappears elsewhere meanwhile.
  const [editing, setEditing] = useState<Npc | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const detailRef = useRef<HTMLHeadingElement>(null)
  const pictureRef = useRef<HTMLButtonElement>(null)
  // An NPC just created: its page opens with the picture button focused, to offer a picture.
  const justCreatedRef = useRef<string | null>(null)
  const newRef = useRef<HTMLButtonElement>(null)
  const focusRowRef = useRef<string | null>(null)
  const firstRenderRef = useRef(true)
  const focusDetailRef = useRef(false)

  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])

  // Closing the browser tab with an unsaved NPC asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Moves focus to the new screen, after the first render. The editor focuses its own name.
  const screenKey = `${screen.type}:${'id' in screen ? screen.id : ''}`
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    if (screen.type === 'list') {
      const row = focusRowRef.current
        ? rootRef.current?.querySelector<HTMLElement>(`[data-npc-id="${focusRowRef.current}"]`)
        : null
      focusRowRef.current = null
      ;(row ?? newRef.current ?? titleRef.current)?.focus()
    } else if (screen.type === 'npc') {
      focusDetailRef.current = true
    }
    // `screen` is derived from `screenKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey])

  const loadedId = detailQuery.data?.id
  useEffect(() => {
    if (focusDetailRef.current && loadedId && screen.type === 'npc') {
      focusDetailRef.current = false
      const offerPicture = justCreatedRef.current === loadedId
      justCreatedRef.current = null
      ;(offerPicture ? (pictureRef.current ?? detailRef.current) : detailRef.current)?.focus()
    }
  }, [loadedId, screen.type, screenKey])

  // An NPC that turns out to be gone: show the truth in the list too.
  const unavailable = detailQuery.isError && isNpcUnavailable(detailQuery.error)
  const { refetch: refetchList } = listQuery
  useEffect(() => {
    if (unavailable) void refetchList()
  }, [unavailable, refetchList])

  /** Goes to another screen; unsaved text asks first unless the caller just saved or left it. */
  function go(next: NpcScreen, options: { force?: boolean } = {}) {
    if (dirty && !options.force) {
      setPendingNav(next)
      return
    }
    actions.clearError()
    setStaleChange(false)
    if (next.type !== 'edit') setEditing(null)
    onScreenChange(next)
  }

  const errorAlert = actions.error && (
    <p className="journal-alert" role="alert">
      <PixelIcon name="flame" />
      {actions.error}
    </p>
  )

  const npc = detailQuery.data

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
      title="Notes & NPCs"
    >
      <div className="camp-notes" data-screen={screen.type} ref={rootRef}>
        {screen.type === 'list' && (
          <>
            {tabs}
            <NpcList
              error={errorAlert || null}
              filter={filter}
              newRef={newRef}
              npcs={listQuery.data}
              onFilterChange={onFilterChange}
              onNew={() => go({ type: 'new' })}
              onOpen={(id) => go({ type: 'npc', id })}
              onRetry={() => void listQuery.refetch()}
              status={listQuery.isError ? 'error' : listQuery.isSuccess ? 'success' : 'pending'}
            />
          </>
        )}

        {screen.type === 'new' && (
          <section aria-labelledby="npc-new-heading" className="note-page">
            <h3 id="npc-new-heading" tabIndex={-1}>
              New NPC
            </h3>
            <NpcEditor
              error={actions.error}
              isPending={actions.pendingAction === 'create'}
              mode="new"
              npc={null}
              onCancel={() => backToList()}
              onDirtyChange={setDirty}
              onDismissError={actions.clearError}
              onSubmit={async (values) => {
                const result = await actions.create(values)
                if (result.ok) {
                  justCreatedRef.current = result.npc.id
                  onNotice('NPC added.')
                  setDirty(false)
                  go({ type: 'npc', id: result.npc.id }, { force: true })
                }
                return result
              }}
            />
          </section>
        )}

        {screen.type === 'npc' && detailQuery.isPending && (
          <p className="journal-status" role="status">
            Loading the NPC…
          </p>
        )}
        {screen.type === 'npc' && unavailable && (
          <div className="journal-status journal-status--error" role="alert">
            <p>This NPC is no longer available. It may have been made private or deleted.</p>
            <button
              className="journal-button journal-button--secondary"
              onClick={() => backToList()}
              type="button"
            >
              Back to NPCs
            </button>
          </div>
        )}
        {screen.type === 'npc' && detailQuery.isError && !unavailable && (
          <div className="journal-status journal-status--error" role="alert">
            <p>This NPC could not be loaded.</p>
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
              Back to NPCs
            </button>
          </div>
        )}
        {screen.type === 'npc' && npc && (
          <NpcView
            actions={actions}
            error={
              staleChange
                ? 'This NPC changed just now. The latest version is shown. Try again if you still want the change.'
                : actions.error
            }
            headingRef={detailRef}
            pictureRef={pictureRef}
            npc={npc}
            onBack={() => backToList(npc.id)}
            onDelete={async () => {
              const gone = await actions.remove(npc.id, npc.portrait_path)
              if (gone) {
                onNotice('NPC deleted.')
                focusRowRef.current = null
                go({ type: 'list' }, { force: true })
              }
              return gone
            }}
            onNotice={onNotice}
            onEdit={() => {
              setEditing(npc)
              go({ type: 'edit', id: npc.id }, { force: true })
            }}
            onVisibility={async (visibility) => {
              setStaleChange(false)
              const result = await actions.changeVisibility(npc.id, visibility, npc.updated_at)
              if (result.ok) {
                onNotice(
                  visibility === 'campaign'
                    ? 'NPC shared with the campaign.'
                    : 'NPC is now private.',
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

        {screen.type === 'edit' && (editing?.id === screen.id ? editing : npc) && (
          <section aria-labelledby="npc-edit-heading" className="note-page">
            <h3 id="npc-edit-heading" tabIndex={-1}>
              Edit NPC
            </h3>
            <NpcEditor
              error={actions.error}
              isPending={actions.pendingAction === 'save'}
              key={screen.id}
              mode="edit"
              npc={(editing?.id === screen.id ? editing : npc) ?? null}
              onCancel={(reason) => {
                // Cancelling returns to the NPC, unless there is none left to return to.
                if (reason === 'gone') backToList()
                else go({ type: 'npc', id: screen.id })
              }}
              onDirtyChange={setDirty}
              onDismissError={actions.clearError}
              onSubmit={async (values, base) => {
                const result = await actions.save(
                  screen.id,
                  {
                    name: values.name,
                    role: values.role,
                    location: values.location,
                    body: values.body,
                  },
                  (base ?? editing ?? npc)!.updated_at,
                )
                if (result.ok) {
                  onNotice('NPC saved.')
                  setDirty(false)
                  go({ type: 'npc', id: screen.id }, { force: true })
                }
                return result
              }}
            />
          </section>
        )}
        {screen.type === 'edit' && !(editing?.id === screen.id ? editing : npc) && (
          <div className="journal-status">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => go({ type: 'npc', id: screen.id }, { force: true })}
              type="button"
            >
              Open the NPC
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

function NpcList({
  error,
  filter,
  newRef,
  npcs,
  onFilterChange,
  onNew,
  onOpen,
  onRetry,
  status,
}: {
  error: React.ReactNode
  filter: string
  newRef: React.Ref<HTMLButtonElement>
  npcs: NpcSummary[] | undefined
  onFilterChange: (value: string) => void
  onNew: () => void
  onOpen: (id: string) => void
  onRetry: () => void
  status: 'pending' | 'error' | 'success'
}) {
  const all = npcs ?? []
  const shown = filterNpcs(all, filter)
  const groups = groupNpcs(shown)

  const group = (id: string, heading: string, rows: NpcSummary[], emptyText: string) => (
    <section aria-labelledby={id} className="note-group">
      <h3 className="journal-section-title" id={id}>
        <PixelIcon name={id === 'npcs-shared-heading' ? 'eye' : 'lock'} />
        {heading}
      </h3>
      {rows.length === 0 ? (
        <p className="note-group__empty">{emptyText}</p>
      ) : (
        <ul aria-label={heading} className="npc-gallery">
          {rows.map((row) => (
            <li className="npc-tile" key={row.id}>
              <NpcMedallion npc={row} size={72} />
              <button
                className="npc-tile__open"
                data-npc-id={row.id}
                onClick={() => onOpen(row.id)}
                type="button"
              >
                {row.name}
              </button>
              {npcSubtitle(row) && <p className="npc-tile__subtitle">{npcSubtitle(row)}</p>}
              <VisibilityChip visibility={row.visibility} />
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
          Loading the NPCs…
        </p>
      )}
      {status === 'error' && (
        <div className="journal-status journal-status--error" role="alert">
          <p>The NPCs could not be loaded.</p>
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
            {all.length > 0 && (
              <div className="journal-field note-toolbar__filter">
                <label htmlFor="npcs-filter">Filter by name, role, or place</label>
                <input
                  autoComplete="off"
                  className="journal-input"
                  id="npcs-filter"
                  onChange={(event) => onFilterChange(event.target.value)}
                  type="search"
                  value={filter}
                />
              </div>
            )}
            <button className="journal-button" onClick={onNew} ref={newRef} type="button">
              <PixelIcon name="quill" />
              New NPC
            </button>
          </div>
          {all.length === 0 ? (
            <div className="journal-status note-empty">
              <PixelIcon name="lantern" />
              <p>No NPCs yet. Log the first person you meet.</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="journal-status note-empty" role="status">
              No NPCs match &ldquo;{filter.trim()}&rdquo;.
            </p>
          ) : (
            <>
              {group(
                'npcs-shared-heading',
                'Shared with the campaign',
                groups.shared,
                'Nothing shared yet.',
              )}
              {group('npcs-private-heading', 'Only you', groups.onlyYou, 'No private NPCs.')}
            </>
          )}
        </>
      )}
    </>
  )
}
