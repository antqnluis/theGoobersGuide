import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CampPanel } from '../campaigns/camp/CampPanel'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { UnsavedChangesDialog } from '../characters/UnsavedChangesDialog'
import { AdventureCreateForm } from './AdventureCreateForm'
import { AdventureEditor } from './AdventureEditor'
import { AdventureInvitationCard } from './AdventureInvitationCard'
import { AdventureView } from './AdventureView'
import { adventureOptions, adventuresOptions, invitationsOptions } from './adventureQueries'
import {
  adventureCharacterName,
  adventureCharacterNames,
  adventureStatusLabels,
  adventureTypeLabels,
  defaultCharacterId,
  filterAdventures,
  filterInvitations,
  groupAdventures,
  objectiveProgress,
  ownCharacters,
  shareRequestLabel,
  waitingReasons,
} from './adventureRules'
import { isAdventureUnavailable } from './adventureService'
import type { AdventureDetail, AdventureInvitation, AdventureSummary } from './adventureTypes'
import type { AdventureAction, AdventureResult, useAdventureActions } from './useAdventureActions'
import './adventures.css'

/** Which screen of the board is showing. Owned by the workspace so closing the camp resets it. */
export type AdventureScreen =
  | { type: 'list' }
  | { type: 'new' }
  | { type: 'adventure'; id: string }
  | { type: 'edit'; id: string }

/** The "Adventures" destination at the map table: list, read, write, track, and archive. */
export function CampAdventures({
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
  actions: ReturnType<typeof useAdventureActions>
  campaignId: string
  /** Every character the member may see; for naming a participant and for the create form. */
  characters: readonly CharacterSummary[]
  /** True once the Adventures destination has been opened, so nothing loads before it is needed. */
  enabled: boolean
  onDirtyChange?: (dirty: boolean) => void
  onNotice: (notice: string) => void
  onScreenChange: (screen: AdventureScreen) => void
  roster: readonly CampaignRosterMember[]
  screen: AdventureScreen
  userId: string
}) {
  const listQuery = useQuery(adventuresOptions(campaignId, userId, enabled))
  const openId = screen.type === 'adventure' ? screen.id : ''
  const detailQuery = useQuery(adventureOptions(openId, userId, enabled && openId !== ''))
  const invitationsQuery = useQuery(invitationsOptions(campaignId, userId, enabled))
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<AdventureScreen | null>(null)
  // The adventure an open editor started from, kept even if it disappears elsewhere meanwhile.
  const [editing, setEditing] = useState<AdventureDetail | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const detailRef = useRef<HTMLHeadingElement>(null)
  const newRef = useRef<HTMLButtonElement>(null)
  const focusRowRef = useRef<string | null>(null)
  const firstRenderRef = useRef(true)
  // The adventure's heading takes focus once it has loaded after being opened.
  const focusDetailRef = useRef(false)

  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])

  // Closing the browser tab with an unsaved form asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Moves focus to the new screen, after the first render. The forms focus their own title.
  const screenKey = `${screen.type}:${'id' in screen ? screen.id : ''}`
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    if (screen.type === 'list') {
      const row = focusRowRef.current
        ? rootRef.current?.querySelector<HTMLElement>(
            `[data-adventure-id="${focusRowRef.current}"]`,
          )
        : null
      focusRowRef.current = null
      ;(row ?? newRef.current ?? titleRef.current)?.focus()
    } else if (screen.type === 'adventure') {
      focusDetailRef.current = true
    }
    // `screen` is derived from `screenKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey])

  const loadedId = detailQuery.data?.id
  useEffect(() => {
    if (focusDetailRef.current && loadedId && screen.type === 'adventure') {
      focusDetailRef.current = false
      detailRef.current?.focus()
    }
  }, [loadedId, screen.type, screenKey])

  // An adventure that turns out to be gone: show the truth in the list too.
  const unavailable = detailQuery.isError && isAdventureUnavailable(detailQuery.error)
  const { refetch: refetchList } = listQuery
  useEffect(() => {
    if (unavailable) void refetchList()
  }, [unavailable, refetchList])

  /** Goes to another screen; unsaved text asks first unless the caller just saved or left it. */
  function go(next: AdventureScreen, options: { force?: boolean } = {}) {
    if (dirty && !options.force) {
      setPendingNav(next)
      return
    }
    actions.clearError()
    if (next.type !== 'edit') setEditing(null)
    onScreenChange(next)
  }

  const errorAlert = actions.error && (
    <p className="journal-alert" role="alert">
      <PixelIcon name="flame" />
      {actions.error}
    </p>
  )

  const adventure = detailQuery.data
  const mine = ownCharacters(characters, userId)

  function backToList(from?: string) {
    focusRowRef.current = from ?? null
    go({ type: 'list' })
  }

  const editBase = screen.type === 'edit' ? (editing?.id === screen.id ? editing : adventure) : null

  return (
    <CampPanel
      headingId="camp-adventures-heading"
      headingRef={titleRef}
      icon="flag"
      place="Map table"
      title="Adventures"
    >
      <div className="camp-adventures" data-screen={screen.type} ref={rootRef}>
        {screen.type === 'list' && (
          <AdventureList
            adventures={listQuery.data}
            characters={characters}
            error={errorAlert || null}
            filter={filter}
            invitations={invitationsQuery.data}
            invitationsStatus={
              invitationsQuery.isError
                ? 'error'
                : invitationsQuery.isSuccess
                  ? 'success'
                  : 'pending'
            }
            newRef={newRef}
            onFilterChange={setFilter}
            onNew={() => go({ type: 'new' })}
            onOpen={(id) => go({ type: 'adventure', id })}
            onRespond={async (invitation, accept, keepShared) => {
              const result = await actions.respond(invitation, accept, keepShared)
              if (result.ok) {
                onNotice(accept ? 'You joined the adventure.' : 'Invitation declined.')
                if (accept) go({ type: 'adventure', id: invitation.adventure_id }, { force: true })
              }
              return result
            }}
            onRetry={() => void listQuery.refetch()}
            onRetryInvitations={() => void invitationsQuery.refetch()}
            pendingAction={actions.pendingAction}
            pendingId={actions.pendingId}
            roster={roster}
            status={listQuery.isError ? 'error' : listQuery.isSuccess ? 'success' : 'pending'}
            userId={userId}
          />
        )}

        {screen.type === 'new' && (
          <section aria-labelledby="adventure-new-heading" className="adventure-page">
            <h3 id="adventure-new-heading" tabIndex={-1}>
              New adventure
            </h3>
            <AdventureCreateForm
              defaultCharacterId={defaultCharacterId(mine, userId)}
              error={actions.error}
              isPending={actions.pendingAction === 'create'}
              myCharacters={mine}
              onCancel={() => backToList()}
              onDirtyChange={setDirty}
              onDismissError={actions.clearError}
              onSubmit={async (values) => {
                const result = await actions.create(values)
                if (result.ok) {
                  onNotice('Adventure created.')
                  setDirty(false)
                  go({ type: 'adventure', id: result.value.id }, { force: true })
                }
                return result
              }}
            />
          </section>
        )}

        {screen.type === 'adventure' && detailQuery.isPending && (
          <p className="journal-status" role="status">
            Loading the adventure…
          </p>
        )}
        {screen.type === 'adventure' && unavailable && (
          <div className="journal-status journal-status--error" role="alert">
            <p>This adventure is no longer available. It may have been archived.</p>
            <button
              className="journal-button journal-button--secondary"
              onClick={() => backToList()}
              type="button"
            >
              Back to adventures
            </button>
          </div>
        )}
        {screen.type === 'adventure' && detailQuery.isError && !unavailable && (
          <div className="journal-status journal-status--error" role="alert">
            <p>This adventure could not be loaded.</p>
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
              Back to adventures
            </button>
          </div>
        )}
        {screen.type === 'adventure' && adventure && (
          <AdventureView
            adventure={adventure}
            characters={characters}
            error={actions.error}
            headingRef={detailRef}
            onAddObjective={(title) => actions.addObjective(adventure.id, title)}
            onApprove={(participantId) => actions.approve(adventure.id, participantId)}
            onArchive={async () => {
              const result = await actions.archive(adventure.id)
              if (result.ok) {
                onNotice('Adventure archived.')
                focusRowRef.current = adventure.id
                go({ type: 'list' }, { force: true })
              }
              return result.ok
            }}
            onBack={() => backToList(adventure.id)}
            onCancel={(participantId) => actions.cancel(adventure.id, participantId)}
            onConsent={async (consent) => {
              const result = await actions.setConsent(adventure.id, consent)
              if (result.ok) {
                onNotice(consent ? 'Your agreement was saved.' : 'Sharing with the party is off.')
              }
              return result
            }}
            onEdit={() => {
              setEditing(adventure)
              go({ type: 'edit', id: adventure.id }, { force: true })
            }}
            onLeave={async () => {
              const result = await actions.leave(adventure.id)
              if (result.ok) {
                onNotice('You left the adventure.')
                go({ type: 'list' }, { force: true })
              }
              return result.ok
            }}
            onPostUpdate={(body) => actions.postUpdate(adventure.id, body)}
            onPropose={async (characterId) => {
              const result = await actions.propose(adventure.id, characterId)
              if (result.ok) onNotice('Invitation proposed.')
              return result
            }}
            onRemoveObjective={(objectiveId) => actions.removeObjective(adventure.id, objectiveId)}
            onRemoveUpdate={(updateId) => actions.removeUpdate(adventure.id, updateId)}
            onRenameObjective={(objectiveId, title) =>
              actions.editObjective(adventure.id, objectiveId, title)
            }
            onRestore={async () => {
              const result = await actions.restore(adventure.id)
              if (result.ok) onNotice('Adventure restored.')
              return result.ok
            }}
            onStatus={(status) => actions.changeStatus(adventure.id, status)}
            onToggleObjective={(objectiveId, done) =>
              actions.toggleObjective(adventure.id, objectiveId, done)
            }
            pendingAction={actions.pendingAction}
            pendingId={actions.pendingId}
            roster={roster}
            userId={userId}
          />
        )}

        {screen.type === 'edit' && editBase && (
          <section aria-labelledby="adventure-edit-heading" className="adventure-page">
            <h3 id="adventure-edit-heading" tabIndex={-1}>
              Edit adventure
            </h3>
            <AdventureEditor
              adventure={editBase}
              error={actions.error}
              isPending={actions.pendingAction === 'save'}
              key={screen.id}
              onCancel={(reason) => {
                // Cancelling returns to the adventure, unless there is none left to return to.
                if (reason === 'gone') backToList()
                else go({ type: 'adventure', id: screen.id })
              }}
              onDirtyChange={setDirty}
              onDismissError={actions.clearError}
              onSubmit={async (values, base) => {
                const result = await actions.save(screen.id, values, base.updated_at)
                if (result.ok) {
                  onNotice('Adventure saved.')
                  setDirty(false)
                  go({ type: 'adventure', id: screen.id }, { force: true })
                }
                return result
              }}
            />
          </section>
        )}
        {screen.type === 'edit' && !editBase && (
          <div className="journal-status">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => go({ type: 'adventure', id: screen.id }, { force: true })}
              type="button"
            >
              Open the adventure
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

function AdventureList({
  adventures,
  characters,
  error,
  filter,
  invitations,
  invitationsStatus,
  newRef,
  onFilterChange,
  onNew,
  onOpen,
  onRespond,
  onRetry,
  onRetryInvitations,
  pendingAction,
  pendingId,
  roster,
  status,
  userId,
}: {
  adventures: AdventureSummary[] | undefined
  characters: readonly Pick<CharacterSummary, 'id' | 'name'>[]
  error: ReactNode
  filter: string
  invitations: AdventureInvitation[] | undefined
  invitationsStatus: 'pending' | 'error' | 'success'
  newRef: React.Ref<HTMLButtonElement>
  onFilterChange: (value: string) => void
  onNew: () => void
  onOpen: (id: string) => void
  onRespond: (
    invitation: AdventureInvitation,
    accept: boolean,
    keepShared: boolean,
  ) => Promise<AdventureResult<unknown>>
  onRetry: () => void
  onRetryInvitations: () => void
  pendingAction: AdventureAction | null
  pendingId: string | null
  roster: readonly CampaignRosterMember[]
  status: 'pending' | 'error' | 'success'
  userId: string
}) {
  const all = adventures ?? []
  const shown = filterAdventures(all, filter)
  const groups = groupAdventures(shown, userId)
  const invited = filterInvitations(invitations ?? [], filter)
  const waitingCount = invited.length + groups.waiting.length
  const anything = all.length > 0 || (invitations ?? []).length > 0

  const row = (item: AdventureSummary) => {
    const progress = objectiveProgress(item.objectives)
    const names = adventureCharacterNames(item, characters)
    const reasons = groups.waiting.includes(item)
      ? waitingReasons(item, userId).map((reason) =>
          reason.kind === 'approval'
            ? `Approve ${adventureCharacterName(reason.participant.character_id, characters)} joining`
            : shareRequestLabel(item, userId, roster),
        )
      : []
    return (
      <li className="adventure-row" key={item.id}>
        <button
          className="adventure-row__open"
          data-adventure-id={item.id}
          onClick={() => onOpen(item.id)}
          type="button"
        >
          {item.title}
        </button>
        <p className="adventure-row__meta">
          <span>{adventureTypeLabels[item.type]}</span>
          <span>{adventureStatusLabels[item.status]}</span>
          {names.length > 0 && <span>{names.join(', ')}</span>}
          {groups.shared.includes(item) && <span>Read-only</span>}
          {progress.total > 0 && (
            <span>
              {progress.done} of {progress.total} objectives
            </span>
          )}
        </p>
        {reasons.map((reason) => (
          <p className="adventure-row__waiting" key={reason}>
            <PixelIcon name="flame" />
            {reason}
          </p>
        ))}
        {item.next_step && <p className="adventure-row__next">Next: {item.next_step}</p>}
      </li>
    )
  }

  const group = (id: string, heading: string, rows: AdventureSummary[], emptyText: string) => (
    <section aria-labelledby={id} className="adventure-group">
      <h3 className="journal-section-title" id={id}>
        <PixelIcon name="flag" />
        {heading}
      </h3>
      {rows.length === 0 ? (
        <p className="adventure-group__empty">{emptyText}</p>
      ) : (
        <ul className="adventure-list">{rows.map(row)}</ul>
      )}
    </section>
  )

  return (
    <>
      {error}
      {status === 'pending' && (
        <p className="journal-status" role="status">
          Loading the adventures…
        </p>
      )}
      {status === 'error' && (
        <div className="journal-status journal-status--error" role="alert">
          <p>The adventures could not be loaded.</p>
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
          <div className="journal-actions adventure-toolbar">
            <button className="journal-button" onClick={onNew} ref={newRef} type="button">
              <PixelIcon name="flag" />
              New adventure
            </button>
            {all.length > 0 && (
              <div className="journal-field adventure-toolbar__filter">
                <label htmlFor="adventures-filter">Filter by title</label>
                <input
                  autoComplete="off"
                  className="journal-input"
                  id="adventures-filter"
                  onChange={(event) => onFilterChange(event.target.value)}
                  type="search"
                  value={filter}
                />
              </div>
            )}
          </div>
          {!anything && invitationsStatus === 'pending' ? (
            <p className="journal-status" role="status">
              Loading your invitations…
            </p>
          ) : !anything && invitationsStatus !== 'error' ? (
            <p className="journal-status adventure-empty">No adventures yet. Start one.</p>
          ) : shown.length === 0 && invited.length === 0 && invitationsStatus !== 'error' ? (
            <p className="journal-status adventure-empty" role="status">
              No adventures match &ldquo;{filter.trim()}&rdquo;.
            </p>
          ) : (
            <>
              {(waitingCount > 0 || invitationsStatus === 'error') && (
                <section aria-labelledby="adventures-waiting-heading" className="adventure-group">
                  <h3 className="journal-section-title" id="adventures-waiting-heading">
                    <PixelIcon name="flame" />
                    Waiting for you
                  </h3>
                  {invitationsStatus === 'error' && (
                    <div className="journal-status journal-status--error" role="alert">
                      <p>Your invitations could not be loaded.</p>
                      <button
                        className="journal-button journal-button--secondary"
                        onClick={onRetryInvitations}
                        type="button"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                  {waitingCount > 0 && (
                    <ul className="adventure-list">
                      {invited.map((invitation) => (
                        <AdventureInvitationCard
                          characters={characters}
                          invitation={invitation}
                          key={invitation.participant_id}
                          onRespond={onRespond}
                          pendingAction={pendingAction}
                          pendingId={pendingId}
                          roster={roster}
                          userId={userId}
                        />
                      ))}
                      {groups.waiting.map(row)}
                    </ul>
                  )}
                </section>
              )}
              {group(
                'adventures-main-heading',
                'Main story',
                groups.mainStory,
                'No main story under way.',
              )}
              {group(
                'adventures-yours-heading',
                'Your adventures',
                groups.yours,
                'No personal or side adventures under way.',
              )}
              {groups.shared.length > 0 &&
                group('adventures-shared-heading', 'Shared with the party', groups.shared, '')}
              {groups.completed.length > 0 &&
                group('adventures-done-heading', 'Completed', groups.completed, '')}
              {groups.archived.length > 0 && (
                <details className="adventure-archived">
                  <summary>Archived ({groups.archived.length})</summary>
                  <ul className="adventure-list">{groups.archived.map(row)}</ul>
                </details>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
