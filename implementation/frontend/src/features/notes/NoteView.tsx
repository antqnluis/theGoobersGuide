import { useEffect, useRef, useState } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { noteAuthorLabel, noteEditedLabel } from './noteRules'
import type { Note } from './noteTypes'

type Confirming = 'private' | 'delete' | null

/**
 * One note, read-only: its text, who wrote and last edited it, and what the viewer may do.
 * Any member edits a shared note; only its author shares it, makes it private, or deletes it.
 */
export function NoteView({
  characters,
  error,
  headingRef,
  note,
  onBack,
  onDelete,
  onEdit,
  onVisibility,
  pendingAction,
  roster,
  userId,
}: {
  characters: readonly CharacterSummary[]
  /** The last failure's copy, shown above the controls. */
  error: string | null
  headingRef: React.Ref<HTMLHeadingElement>
  note: Note
  onBack: () => void
  /** Resolves to whether the note is gone. */
  onDelete: () => Promise<boolean>
  onEdit: () => void
  /** Resolves to whether the change took effect. */
  onVisibility: (visibility: 'private' | 'campaign') => Promise<boolean>
  pendingAction: 'visibility' | 'delete' | 'create' | 'save' | null
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

  const isAuthor = note.author_id === userId
  const shared = note.visibility === 'campaign'
  const busy = pendingAction !== null
  const character = note.character_id
    ? characters.find((candidate) => candidate.id === note.character_id)
    : undefined

  const cancelConfirm = () => {
    restoreRef.current = confirming
    setConfirming(null)
  }

  return (
    <section aria-labelledby="note-detail-heading" className="note-page">
      <header className="note-page__head">
        <button
          className="journal-button journal-button--ghost"
          disabled={busy}
          onClick={onBack}
          type="button"
        >
          Back to notes
        </button>
        <h3 id="note-detail-heading" ref={headingRef} tabIndex={-1}>
          {note.title}
        </h3>
        <ul aria-label="About this note" className="journal-chips">
          <li
            className={`journal-chip ${shared ? 'journal-chip--shared' : 'journal-chip--private'}`}
          >
            <PixelIcon name={shared ? 'eye' : 'lock'} />
            <span>{shared ? 'Shared with the campaign' : 'Only you'}</span>
          </li>
          {character && (
            <li className="journal-chip">
              <PixelIcon name="quill" />
              <span>About {character.name}</span>
            </li>
          )}
        </ul>
        <p className="note-page__meta">
          Written by {noteAuthorLabel(note.author_id, userId, roster)}
          {' · '}
          {noteEditedLabel(note, userId, roster)}
        </p>
      </header>

      {error && (
        <p className="journal-alert" role="alert">
          <PixelIcon name="flame" />
          {error}
        </p>
      )}

      {note.body ? (
        <div className="note-body">{note.body}</div>
      ) : (
        <p className="note-body note-body--empty">This note has no text yet.</p>
      )}

      {confirming === null && (
        <div className="journal-actions note-page__actions">
          <button className="journal-button" disabled={busy} onClick={onEdit} type="button">
            Edit note
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
              Delete note
            </button>
          )}
        </div>
      )}

      {confirming === 'private' && (
        <div
          aria-label={`Confirm making ${note.title} private`}
          className="journal-confirm"
          role="group"
        >
          <p>
            Members will no longer see <strong>{note.title}</strong>, including their edits.
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
        <div aria-label={`Confirm deleting ${note.title}`} className="journal-confirm" role="group">
          <p>
            Delete <strong>{note.title}</strong> permanently?{' '}
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
              {pendingAction === 'delete' ? 'Deleting…' : 'Yes, delete note'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={busy}
              onClick={cancelConfirm}
              type="button"
            >
              Keep note
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
