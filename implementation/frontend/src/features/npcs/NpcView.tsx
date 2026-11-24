import { useEffect, useRef, useState } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { DiceText } from '../dice/TextWithDice'
import { noteAuthorLabel, noteEditedLabel } from '../notes/noteRules'
import { NpcMedallion } from './NpcMedallion'
import { NpcPortraitEditor } from './NpcPortraitEditor'
import { npcSubtitle } from './npcRules'
import type { Npc } from './npcTypes'
import type { NpcAction, useNpcActions } from './useNpcActions'

type Confirming = 'private' | 'delete' | null

/**
 * One NPC, read-only: its text, who logged and last edited it, and what the viewer may do.
 * Any member edits a shared NPC; only its author shares, makes it private, or deletes it.
 */
export function NpcView({
  actions,
  error,
  headingRef,
  npc,
  onBack,
  onDelete,
  onEdit,
  onNotice,
  onVisibility,
  pictureRef,
  pendingAction,
  roster,
  userId,
}: {
  /** The portrait controls, shown to the author only. */
  actions: Pick<
    ReturnType<typeof useNpcActions>,
    'setPortrait' | 'clearPortrait' | 'pendingAction' | 'pendingNpcId'
  >
  /** The last failure's copy, shown above the controls. */
  error: string | null
  headingRef: React.Ref<HTMLHeadingElement>
  npc: Npc
  onBack: () => void
  /** Resolves to whether the NPC is gone. */
  onDelete: () => Promise<boolean>
  onEdit: () => void
  onNotice: (notice: string) => void
  /** Where focus goes to offer the picture, right after the NPC is created. */
  pictureRef?: React.Ref<HTMLButtonElement>
  /** Resolves to whether the change took effect. */
  onVisibility: (visibility: 'private' | 'campaign') => Promise<boolean>
  pendingAction: NpcAction | null
  roster: readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]
  userId: string
}) {
  const [confirming, setConfirming] = useState<Confirming>(null)
  const shareRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<Confirming>(null)

  // Closing a confirmation returns focus to the control that opened it.
  useEffect(() => {
    if (confirming === null && restoreRef.current) {
      const target = restoreRef.current === 'private' ? shareRef.current : deleteRef.current
      restoreRef.current = null
      target?.focus()
    }
  }, [confirming])

  const isAuthor = npc.author_id === userId
  const shared = npc.visibility === 'campaign'
  const busy = pendingAction !== null
  const subtitle = npcSubtitle(npc)

  const cancelConfirm = () => {
    restoreRef.current = confirming
    setConfirming(null)
  }

  return (
    <section aria-labelledby="npc-detail-heading" className="note-page">
      <header className="note-page__head">
        <button
          className="journal-button journal-button--ghost"
          disabled={busy}
          onClick={onBack}
          type="button"
        >
          Back to NPCs
        </button>
        <div className="npc-identity">
          <div className="npc-identity__portrait">
            <NpcMedallion npc={npc} size={96} />
            {isAuthor && (
              <NpcPortraitEditor
                actions={actions}
                buttonRef={pictureRef}
                npc={npc}
                onNotice={onNotice}
              />
            )}
          </div>
          <div className="npc-identity__text">
            <h3 id="npc-detail-heading" ref={headingRef} tabIndex={-1}>
              {npc.name}
            </h3>
            {subtitle && <p className="npc-identity__subtitle">{subtitle}</p>}
            <ul aria-label="About this NPC" className="journal-chips">
              <li
                className={`journal-chip ${shared ? 'journal-chip--shared' : 'journal-chip--private'}`}
              >
                <PixelIcon name={shared ? 'eye' : 'lock'} />
                <span>{shared ? 'Shared with the campaign' : 'Only you'}</span>
              </li>
            </ul>
            <p className="note-page__meta">
              Logged by {noteAuthorLabel(npc.author_id, userId, roster)}
              {' · '}
              {noteEditedLabel(npc, userId, roster)}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <p className="journal-alert" role="alert">
          <PixelIcon name="flame" />
          {error}
        </p>
      )}

      {npc.body ? (
        <div className="note-body">
          <DiceText context={npc.name || undefined} text={npc.body} />
        </div>
      ) : (
        <p className="note-body note-body--empty">Nothing written about this NPC yet.</p>
      )}

      {confirming === null && (
        <div className="journal-actions note-page__actions">
          <button className="journal-button" disabled={busy} onClick={onEdit} type="button">
            Edit NPC
          </button>
          {isAuthor && (
            <button
              aria-busy={pendingAction === 'visibility' || undefined}
              className="journal-button journal-button--secondary"
              disabled={busy}
              onClick={() => {
                if (shared) setConfirming('private')
                else void onVisibility('campaign')
              }}
              ref={shareRef}
              type="button"
            >
              {pendingAction === 'visibility'
                ? 'Saving…'
                : shared
                  ? 'Make private'
                  : 'Share with the campaign'}
            </button>
          )}
          {isAuthor && (
            <button
              className="journal-button journal-button--danger"
              disabled={busy}
              onClick={() => setConfirming('delete')}
              ref={deleteRef}
              type="button"
            >
              Delete NPC
            </button>
          )}
        </div>
      )}

      {confirming === 'private' && (
        <div
          aria-label={`Confirm making ${npc.name} private`}
          className="journal-confirm"
          role="group"
        >
          <p>
            Members will no longer see <strong>{npc.name}</strong>, including their edits.
          </p>
          <div className="journal-actions">
            <button
              aria-busy={pendingAction === 'visibility' || undefined}
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={busy}
              onClick={async () => {
                const ok = await onVisibility('private')
                if (ok) setConfirming(null)
              }}
              type="button"
            >
              {pendingAction === 'visibility' ? 'Saving…' : 'Yes, make private'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={busy}
              onClick={cancelConfirm}
              type="button"
            >
              Keep shared
            </button>
          </div>
        </div>
      )}

      {confirming === 'delete' && (
        <div aria-label={`Confirm deleting ${npc.name}`} className="journal-confirm" role="group">
          <p>
            Delete <strong>{npc.name}</strong> permanently?{' '}
            {shared ? 'Every member loses it, including their edits. ' : ''}
            This can&rsquo;t be undone.
          </p>
          <div className="journal-actions">
            <button
              aria-busy={pendingAction === 'delete' || undefined}
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={busy}
              onClick={async () => {
                await onDelete()
              }}
              type="button"
            >
              {pendingAction === 'delete' ? 'Deleting…' : 'Yes, delete NPC'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={busy}
              onClick={cancelConfirm}
              type="button"
            >
              Keep NPC
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
