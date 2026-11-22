import { useEffect, useId, useRef, useState } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { AdventureObjectives } from './AdventureObjectives'
import { AdventureParticipants } from './AdventureParticipants'
import { AdventureSharing } from './AdventureSharing'
import { AdventureUpdates } from './AdventureUpdates'
import {
  adventureCharacterNames,
  adventureEditedLabel,
  adventureStatusLabel,
  adventureStatusLabels,
  adventureTypeLabels,
  acceptedParticipants,
  canArchive,
  canEdit,
  isArchived,
  isPartyReader,
  objectiveProgress,
  sharedByLabel,
} from './adventureRules'
import { adventureStatuses, type AdventureDetail, type AdventureStatus } from './adventureTypes'
import type { AdventureAction, AdventureResult } from './useAdventureActions'

type Roster = readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]

/**
 * One adventure: its details, status, objectives, and updates. Every editor changes the status
 * and keeps the checklist and log; only the creator archives or restores it, and an archived
 * adventure is read-only.
 */
export function AdventureView({
  adventure,
  characters,
  error,
  headingRef,
  onAddObjective,
  onApprove,
  onArchive,
  onBack,
  onCancel,
  onConsent,
  onEdit,
  onLeave,
  onPostUpdate,
  onPropose,
  onRemoveObjective,
  onRemoveUpdate,
  onRenameObjective,
  onRestore,
  onStatus,
  onToggleObjective,
  pendingAction,
  pendingId,
  roster,
  userId,
}: {
  adventure: AdventureDetail
  characters: readonly Pick<CharacterSummary, 'id' | 'name' | 'owner_id' | 'status'>[]
  /** The last failure's copy, shown above the controls. */
  error: string | null
  headingRef: React.Ref<HTMLHeadingElement>
  onAddObjective: (title: string) => Promise<AdventureResult<unknown>>
  onApprove: (participantId: string) => Promise<AdventureResult<unknown>>
  /** Rejects a proposal or withdraws an invitation. */
  onCancel: (participantId: string) => Promise<AdventureResult<unknown>>
  /** `true` gives the viewer's agreement to share with the party; `false` clears every agreement. */
  onConsent: (consent: boolean) => Promise<AdventureResult<unknown>>
  /** Resolves to whether the viewer left. */
  onLeave: () => Promise<boolean>
  onPropose: (characterId: string) => Promise<AdventureResult<unknown>>
  /** Resolves to whether the adventure was archived. */
  onArchive: () => Promise<boolean>
  onBack: () => void
  onEdit: () => void
  onPostUpdate: (body: string) => Promise<AdventureResult<unknown>>
  onRemoveObjective: (objectiveId: string) => Promise<AdventureResult<unknown>>
  onRemoveUpdate: (updateId: string) => Promise<AdventureResult<unknown>>
  onRenameObjective: (objectiveId: string, title: string) => Promise<AdventureResult<unknown>>
  onRestore: () => Promise<boolean>
  onStatus: (status: AdventureStatus) => Promise<AdventureResult<unknown>>
  onToggleObjective: (objectiveId: string, done: boolean) => Promise<AdventureResult<unknown>>
  pendingAction: AdventureAction | null
  pendingId: string | null
  roster: Roster
  userId: string
}) {
  const base = useId()
  const [confirming, setConfirming] = useState(false)
  const archiveRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)

  // Closing the confirmation returns focus to the control that opened it.
  useEffect(() => {
    if (!confirming && restoreFocusRef.current) {
      restoreFocusRef.current = false
      archiveRef.current?.focus()
    }
  }, [confirming])

  const archived = isArchived(adventure)
  const editable = canEdit(adventure, userId)
  const mayArchive = canArchive(adventure, userId)
  const busy = pendingAction !== null
  const statusBusy = pendingAction === 'status'
  const archiveBusy = pendingAction === 'archive'
  const main = adventure.type === 'main'
  // A member of the party reads a shared adventure without being in it (D7).
  const readOnly = isPartyReader(adventure, userId)
  const progress = objectiveProgress(adventure.objectives)
  const who = adventureCharacterNames(adventure, characters)
  const audience = main
    ? { shared: true, label: 'Every member' }
    : adventure.visibility === 'party'
      ? { shared: true, label: 'The party' }
      : {
          shared: false,
          label: acceptedParticipants(adventure).length > 1 ? 'Only the people in it' : 'Only you',
        }
  const statusNote = adventureStatusLabel(adventure, userId, roster)

  return (
    <section aria-labelledby="adventure-detail-heading" className="adventure-page">
      <header className="adventure-page__head">
        <button
          className="journal-button journal-button--ghost"
          disabled={busy}
          onClick={onBack}
          type="button"
        >
          Back to adventures
        </button>
        <h3 id="adventure-detail-heading" ref={headingRef} tabIndex={-1}>
          {adventure.title}
        </h3>
        <ul aria-label="About this adventure" className="journal-chips">
          <li className="journal-chip">
            <PixelIcon name="flag" />
            <span>{adventureTypeLabels[adventure.type]}</span>
          </li>
          <li
            className={`journal-chip ${audience.shared ? 'journal-chip--shared' : 'journal-chip--private'}`}
          >
            <PixelIcon name={audience.shared ? 'eye' : 'lock'} />
            <span>{audience.label}</span>
          </li>
          {who.map((name, index) => (
            <li className="journal-chip" key={index}>
              <PixelIcon name="tent" />
              <span>{name}</span>
            </li>
          ))}
          {archived && (
            <li className="journal-chip">
              <PixelIcon name="grave" />
              <span>Archived</span>
            </li>
          )}
        </ul>
        <p className="adventure-page__meta">{adventureEditedLabel(adventure, userId, roster)}</p>
        {readOnly && (
          <p className="adventure-page__readonly">
            {sharedByLabel(adventure, userId, roster)} Only the people in it can make changes.
          </p>
        )}
      </header>

      {error && (
        <p className="journal-alert" role="alert">
          <PixelIcon name="flame" />
          {error}
        </p>
      )}

      {archived && (
        <p className="journal-status">This adventure is archived. Restore it to make changes.</p>
      )}

      <div className="adventure-page__body">
        <div className="adventure-page__main">
          {readOnly ? (
            <p className="adventure-status">
              <strong>Status:</strong> {adventureStatusLabels[adventure.status]}
              {statusNote && <span className="adventure-status__note"> {statusNote}</span>}
            </p>
          ) : (
            <div className="journal-field adventure-status">
              <label htmlFor={`${base}-status`}>Status</label>
              <select
                aria-busy={statusBusy || undefined}
                className="journal-select"
                disabled={!editable || busy}
                id={`${base}-status`}
                onChange={(event) => void onStatus(event.target.value as AdventureStatus)}
                value={adventure.status}
              >
                {adventureStatuses.map((status) => (
                  <option key={status} value={status}>
                    {adventureStatusLabels[status]}
                  </option>
                ))}
              </select>
              {statusNote && <p className="adventure-status__note">{statusNote}</p>}
            </div>
          )}

          <dl className="adventure-facts">
            <div>
              <dt>Next step</dt>
              <dd className={adventure.next_step ? undefined : 'adventure-facts__empty'}>
                {adventure.next_step || 'None yet.'}
              </dd>
            </div>
            {adventure.reference && (
              <div>
                <dt>Reference</dt>
                <dd>{adventure.reference}</dd>
              </div>
            )}
            {progress.total > 0 && (
              <div>
                <dt>Objectives</dt>
                <dd>
                  {progress.done} of {progress.total} done
                </dd>
              </div>
            )}
          </dl>

          {adventure.description ? (
            <div className="adventure-description">{adventure.description}</div>
          ) : (
            <p className="adventure-description adventure-description--empty">
              This adventure has no description yet.
            </p>
          )}

          <AdventureObjectives
            editable={editable}
            objectives={adventure.objectives}
            readOnly={readOnly}
            onAdd={onAddObjective}
            onRemove={onRemoveObjective}
            onRename={onRenameObjective}
            onToggle={onToggleObjective}
            pendingAction={pendingAction}
            pendingId={pendingId}
            roster={roster}
            userId={userId}
          />

          <AdventureUpdates
            editable={editable}
            onPost={onPostUpdate}
            onRemove={onRemoveUpdate}
            pendingAction={pendingAction}
            pendingId={pendingId}
            roster={roster}
            updates={adventure.updates}
            userId={userId}
          />
        </div>
        {!main && (
          <div className="adventure-page__side">
            <AdventureParticipants
              adventure={adventure}
              characters={characters}
              onApprove={onApprove}
              onCancel={onCancel}
              onLeave={onLeave}
              onPropose={onPropose}
              pendingAction={pendingAction}
              pendingId={pendingId}
              roster={roster}
              userId={userId}
            />

            <AdventureSharing
              adventure={adventure}
              onConsent={onConsent}
              pendingAction={pendingAction}
              roster={roster}
              userId={userId}
            />
          </div>
        )}
      </div>

      {!confirming && (
        <div className="journal-actions adventure-page__actions">
          {editable && (
            <button className="journal-button" disabled={busy} onClick={onEdit} type="button">
              Edit details
            </button>
          )}
          {mayArchive &&
            (archived ? (
              <button
                aria-busy={archiveBusy || undefined}
                className="journal-button journal-button--secondary"
                disabled={busy}
                onClick={() => void onRestore()}
                type="button"
              >
                {archiveBusy ? 'Restoring…' : 'Restore adventure'}
              </button>
            ) : (
              <button
                className="journal-button journal-button--danger"
                disabled={busy}
                onClick={() => setConfirming(true)}
                ref={archiveRef}
                type="button"
              >
                Archive adventure
              </button>
            ))}
        </div>
      )}

      {confirming && (
        <div
          aria-label={`Confirm archiving ${adventure.title}`}
          className="journal-confirm"
          role="group"
        >
          <p>
            Archive <strong>{adventure.title}</strong>?{' '}
            {main
              ? 'Every member stops seeing it, and no one can change it. Only you can restore it.'
              : 'It moves to your Archived list, the party stops seeing it, and no one can change it until you restore it.'}
          </p>
          <div className="journal-actions">
            <button
              aria-busy={archiveBusy || undefined}
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={busy}
              onClick={async () => {
                const ok = await onArchive()
                if (!ok) {
                  restoreFocusRef.current = true
                  setConfirming(false)
                }
              }}
              type="button"
            >
              {archiveBusy ? 'Archiving…' : 'Yes, archive'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={busy}
              onClick={() => {
                restoreFocusRef.current = true
                setConfirming(false)
              }}
              type="button"
            >
              Keep adventure
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
