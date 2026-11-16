import { useEffect, useId, useRef, useState } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { relativeTime } from '../notes/noteRules'
import { adventureCharacterName, adventureTypeLabels, inviterLabel } from './adventureRules'
import type { AdventureInvitation } from './adventureTypes'
import type { AdventureAction, AdventureResult } from './useAdventureActions'

type Roster = readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]

/**
 * An invitation to one of the viewer's characters. It shows only what the invitee may know
 * before accepting (D5): the title, type, inviter, character, and whether the adventure is
 * shared with the party. Accepting a shared adventure asks whether to keep it shared (D6); the
 * box starts unticked, and leaving it unticked makes the adventure private for everyone.
 * Declining asks first, with focus on its confirm button and back on Decline when dismissed.
 */
export function AdventureInvitationCard({
  characters,
  invitation,
  now,
  onRespond,
  pendingAction,
  pendingId,
  roster,
  userId,
}: {
  characters: readonly Pick<CharacterSummary, 'id' | 'name'>[]
  invitation: AdventureInvitation
  now?: Date
  onRespond: (
    invitation: AdventureInvitation,
    accept: boolean,
    keepShared: boolean,
  ) => Promise<AdventureResult<unknown>>
  pendingAction: AdventureAction | null
  pendingId: string | null
  roster: Roster
  userId: string
}) {
  const base = useId()
  const [keepShared, setKeepShared] = useState(false)
  const [declining, setDeclining] = useState(false)
  const declineRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef(false)

  useEffect(() => {
    if (declining || !restoreRef.current) return
    restoreRef.current = false
    declineRef.current?.focus()
  }, [declining])

  const busy = pendingAction !== null
  const mine = pendingId === invitation.participant_id
  const accepting = mine && pendingAction === 'respond'
  const characterName = adventureCharacterName(invitation.character_id, characters)

  return (
    <li
      className="adventure-row adventure-invitation"
      data-invitation-id={invitation.participant_id}
    >
      <p className="adventure-invitation__title">
        <PixelIcon name="quill" />
        <strong>{invitation.title}</strong>
      </p>
      <p className="adventure-row__meta">
        <span>{adventureTypeLabels[invitation.type]}</span>
        <span>For {characterName}</span>
        <span>{inviterLabel(invitation.invited_by, userId, roster)}</span>
        <span>{relativeTime(invitation.invited_at, now)}</span>
      </p>

      {invitation.shared_with_party && (
        <div className="adventure-invitation__keep">
          <div className="journal-check">
            <input
              checked={keepShared}
              disabled={busy || declining}
              id={`${base}-keep`}
              onChange={(event) => setKeepShared(event.target.checked)}
              type="checkbox"
            />
            <label htmlFor={`${base}-keep`}>Keep it shared with the party</label>
          </div>
          <p className="adventure-block__empty">
            This adventure is shared with the party. If you leave this unticked, it becomes private
            for everyone in it.
          </p>
        </div>
      )}

      <div className="journal-actions">
        <button
          aria-busy={accepting || undefined}
          aria-label={`Accept the invitation to ${invitation.title}`}
          className="journal-button"
          disabled={busy || declining}
          onClick={() => void onRespond(invitation, true, keepShared)}
          type="button"
        >
          {accepting ? 'Joining…' : 'Accept'}
        </button>
        <button
          aria-label={`Decline the invitation to ${invitation.title}`}
          className="journal-button journal-button--ghost"
          disabled={busy || declining}
          onClick={() => setDeclining(true)}
          ref={declineRef}
          type="button"
        >
          Decline
        </button>
      </div>

      {declining && (
        <div
          aria-label={`Confirm declining ${invitation.title}`}
          className="journal-confirm"
          role="group"
        >
          <p>
            Decline <strong>{invitation.title}</strong>? The people in it can invite {characterName}{' '}
            again.
          </p>
          <div className="journal-actions">
            <button
              aria-busy={(mine && pendingAction === 'respond') || undefined}
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={busy}
              onClick={async () => {
                const result = await onRespond(invitation, false, false)
                if (!result.ok) {
                  restoreRef.current = true
                  setDeclining(false)
                }
              }}
              type="button"
            >
              {mine && pendingAction === 'respond' ? 'Declining…' : 'Yes, decline'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={busy}
              onClick={() => {
                restoreRef.current = true
                setDeclining(false)
              }}
              type="button"
            >
              Keep invitation
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
