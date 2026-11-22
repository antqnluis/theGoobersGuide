import { useId, useRef, useState, type FormEvent } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { updateAuthorLabel } from './adventureRules'
import type { AdventureUpdate } from './adventureTypes'
import {
  adventureLimits,
  charactersLeft,
  normalizeUpdateBody,
  validateUpdateBody,
} from './adventureValidation'
import { relativeTime } from '../notes/noteRules'
import type { AdventureAction, AdventureResult } from './useAdventureActions'

/**
 * The adventure's log, newest first. It only grows (D9): editors add updates, and an author
 * deletes their own while the adventure is editable. Nobody edits one.
 */
export function AdventureUpdates({
  editable,
  onPost,
  onRemove,
  pendingAction,
  pendingId,
  roster,
  updates,
  userId,
}: {
  editable: boolean
  onPost: (body: string) => Promise<AdventureResult<unknown>>
  onRemove: (updateId: string) => Promise<AdventureResult<unknown>>
  pendingAction: AdventureAction | null
  pendingId: string | null
  roster: readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]
  updates: readonly AdventureUpdate[]
  userId: string
}) {
  const base = useId()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const now = new Date()
  const busy = pendingAction === 'update-add' || pendingAction === 'update-delete'
  const left = charactersLeft(draft, adventureLimits.update)

  async function post(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const found = validateUpdateBody(draft)
    setProblem(found)
    if (found) {
      draftRef.current?.focus()
      return
    }
    const result = await onPost(normalizeUpdateBody(draft))
    if (result.ok) setDraft('')
    draftRef.current?.focus()
  }

  return (
    <section aria-labelledby={`${base}-heading`} className="adventure-block">
      <h4 className="journal-section-title" id={`${base}-heading`}>
        <PixelIcon name="quill" />
        Updates
      </h4>

      {editable && (
        <form className="update-add" noValidate onSubmit={(event) => void post(event)}>
          <div className="journal-field">
            <label htmlFor={`${base}-new`}>Write an update</label>
            <textarea
              aria-describedby={
                [problem ? `${base}-error` : undefined, left !== null ? `${base}-count` : undefined]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={problem ? 'true' : undefined}
              className="journal-input"
              disabled={pendingAction === 'update-add'}
              id={`${base}-new`}
              onChange={(event) => {
                setDraft(event.target.value)
                setProblem(null)
              }}
              ref={draftRef}
              rows={3}
              value={draft}
            />
            {left !== null && (
              <p className="adventure-count" data-over={left < 0 || undefined} id={`${base}-count`}>
                {left >= 0
                  ? `${left.toLocaleString('en-US')} characters left`
                  : `${(-left).toLocaleString('en-US')} characters over the limit`}
              </p>
            )}
            {problem && (
              <p className="journal-error" id={`${base}-error`}>
                {problem}
              </p>
            )}
          </div>
          <button
            aria-busy={pendingAction === 'update-add' || undefined}
            className="journal-button journal-button--secondary"
            disabled={busy}
            type="submit"
          >
            {pendingAction === 'update-add' ? 'Posting…' : 'Post update'}
          </button>
        </form>
      )}

      {updates.length === 0 ? (
        <p className="adventure-block__empty">No updates yet.</p>
      ) : (
        <ul className="update-list">
          {updates.map((update) => (
            <li className="update-row" key={update.id}>
              <p className="update-row__meta">
                <span>{updateAuthorLabel(update.author_id, userId, roster)}</span>
                <span>{relativeTime(update.created_at, now)}</span>
              </p>
              <p className="update-row__body">{update.body}</p>
              {editable && update.author_id === userId && (
                <button
                  aria-busy={
                    (busy && pendingId === update.id && pendingAction === 'update-delete') ||
                    undefined
                  }
                  aria-label={`Delete update from ${relativeTime(update.created_at, now)}`}
                  className="journal-button journal-button--danger"
                  disabled={busy}
                  onClick={() => void onRemove(update.id)}
                  type="button"
                >
                  {busy && pendingId === update.id && pendingAction === 'update-delete'
                    ? 'Deleting…'
                    : 'Delete'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
