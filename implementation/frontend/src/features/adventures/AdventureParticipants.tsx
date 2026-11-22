import { useEffect, useId, useRef, useState } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { CharacterSummary } from '../characters/characterTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { noteAuthorLabel } from '../notes/noteRules'
import {
  acceptedParticipants,
  adventureCharacterName,
  invitableCharacters,
  myParticipation,
  needsMyApproval,
  participantLabel,
} from './adventureRules'
import type { AdventureDetail, AdventureParticipant, ParticipantStatus } from './adventureTypes'
import type { AdventureAction, AdventureResult } from './useAdventureActions'

type Roster = readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]
type Character = Pick<CharacterSummary, 'id' | 'name' | 'owner_id' | 'status'>

/** D12: ten live participations (proposed, invited, or accepted) per adventure. */
const liveLimit = 10
const liveStatuses: readonly ParticipantStatus[] = ['proposed', 'invited', 'accepted']
const statusOrder: Record<ParticipantStatus, number> = {
  accepted: 0,
  proposed: 1,
  invited: 2,
  declined: 3,
  left: 4,
}

type Confirmation =
  | { type: 'reject' | 'withdraw'; participant: AdventureParticipant }
  | { type: 'invite'; characterId: string }
  | { type: 'leave' }

/**
 * The people in a personal or side adventure (M6): accepted characters, invitations still
 * waiting for approval or an answer, and those who declined or left. An accepted participant
 * proposes characters, approves, rejects, withdraws, and leaves; everyone else only reads the
 * accepted characters. Every destructive or sending action asks first, with focus on its confirm
 * button, and focus returns to the control that opened it.
 */
export function AdventureParticipants({
  adventure,
  characters,
  onApprove,
  onCancel,
  onLeave,
  onPropose,
  pendingAction,
  pendingId,
  roster,
  userId,
}: {
  adventure: AdventureDetail
  /** Every character the member may see: it names participants and fills the picker. */
  characters: readonly Character[]
  onApprove: (participantId: string) => Promise<AdventureResult<unknown>>
  onCancel: (participantId: string) => Promise<AdventureResult<unknown>>
  /** Resolves to whether the viewer left. */
  onLeave: () => Promise<boolean>
  onPropose: (characterId: string) => Promise<AdventureResult<unknown>>
  pendingAction: AdventureAction | null
  pendingId: string | null
  roster: Roster
  userId: string
}) {
  const base = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [choice, setChoice] = useState('')
  const restoreRef = useRef(false)

  const mine = myParticipation(adventure, userId)
  const archived = adventure.archived_at !== null
  const interactive = mine !== null && !archived
  const accepted = acceptedParticipants(adventure)
  const live = adventure.participants.filter((row) => liveStatuses.includes(row.status))
  const invitable = invitableCharacters(characters, adventure, roster, userId)
  const atLimit = live.length >= liveLimit
  const busy = pendingAction !== null
  // The opening controls stay in place, but wait while a confirmation is open.
  const locked = busy || confirmation !== null

  // Closing a confirmation returns focus to its opener, or to the heading when that is gone.
  useEffect(() => {
    if (confirmation || !restoreRef.current) return
    restoreRef.current = false
    const opener = openerRef.current
    ;(opener?.isConnected && !opener.hasAttribute('disabled')
      ? opener
      : headingRef.current
    )?.focus()
  }, [confirmation])

  const player = (profileId: string) => noteAuthorLabel(profileId, userId, roster)
  const characterName = (id: string) => adventureCharacterName(id, characters)

  function ask(next: Confirmation, opener: HTMLElement) {
    openerRef.current = opener
    setConfirmation(next)
  }

  function close() {
    restoreRef.current = true
    setConfirmation(null)
  }

  /** Runs a write, then closes the confirmation whatever the outcome: the error shows above. */
  async function settle(task: Promise<AdventureResult<unknown>>) {
    const result = await task
    restoreRef.current = true
    setConfirmation(null)
    if (result.ok) setChoice('')
  }

  const approvers = accepted.filter((row) => row.profile_id !== userId)
  const rows = [...adventure.participants].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  )

  function actions(row: AdventureParticipant) {
    if (!interactive) return null
    const pending = pendingId === row.id
    if (row.status === 'proposed') {
      return (
        <>
          {needsMyApproval(row, userId) && (
            <button
              aria-busy={(pending && pendingAction === 'approve') || undefined}
              aria-label={`Approve ${characterName(row.character_id)} joining`}
              className="journal-button journal-button--secondary"
              disabled={locked}
              onClick={() => void onApprove(row.id)}
              type="button"
            >
              {pending && pendingAction === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          )}
          <button
            aria-label={`Reject ${characterName(row.character_id)}`}
            className="journal-button journal-button--ghost"
            disabled={locked}
            onClick={(event) => ask({ type: 'reject', participant: row }, event.currentTarget)}
            type="button"
          >
            Reject
          </button>
        </>
      )
    }
    if (row.status === 'invited') {
      return (
        <button
          aria-label={`Withdraw the invitation to ${characterName(row.character_id)}`}
          className="journal-button journal-button--ghost"
          disabled={locked}
          onClick={(event) => ask({ type: 'withdraw', participant: row }, event.currentTarget)}
          type="button"
        >
          Withdraw
        </button>
      )
    }
    if (
      (row.status === 'declined' || row.status === 'left') &&
      !atLimit &&
      invitable.some((character) => character.id === row.character_id)
    ) {
      return (
        <button
          aria-label={`Invite ${characterName(row.character_id)} again`}
          className="journal-button journal-button--secondary"
          disabled={locked}
          onClick={(event) =>
            ask({ type: 'invite', characterId: row.character_id }, event.currentTarget)
          }
          type="button"
        >
          Invite again
        </button>
      )
    }
    return null
  }

  function confirmationBox() {
    if (!confirmation) return null
    const confirmId = `${base}-confirm`
    let message: React.ReactNode
    let confirmLabel: string
    let danger = false
    let run: () => Promise<void>
    let busyLabel: string

    if (confirmation.type === 'invite') {
      const character = characters.find((item) => item.id === confirmation.characterId)
      const name = character?.name ?? 'This character'
      const owner = character ? player(character.owner_id) : 'their player'
      message =
        approvers.length === 0 ? (
          <>
            Invite <strong>{name}</strong>? {owner} will see the invitation right away.
          </>
        ) : (
          <>
            Invite <strong>{name}</strong>? Everyone in this adventure must approve first:{' '}
            {approvers.map((row) => player(row.profile_id)).join(', ')}. {owner} sees nothing until
            then.
          </>
        )
      confirmLabel = approvers.length === 0 ? 'Send invitation' : 'Ask for approval'
      busyLabel = 'Sending…'
      run = () => settle(onPropose(confirmation.characterId))
    } else if (confirmation.type === 'leave') {
      message = (
        <>
          Leave <strong>{adventure.title}</strong>? You lose access at once, and coming back needs a
          new invitation.
        </>
      )
      confirmLabel = 'Yes, leave'
      busyLabel = 'Leaving…'
      danger = true
      run = async () => {
        const left = await onLeave()
        if (!left) close()
      }
    } else {
      const name = characterName(confirmation.participant.character_id)
      const owner = player(confirmation.participant.profile_id)
      const withdraw = confirmation.type === 'withdraw'
      message = withdraw ? (
        <>
          Withdraw the invitation to <strong>{name}</strong>? It disappears from {owner}&rsquo;s
          list.
        </>
      ) : (
        <>
          Reject <strong>{name}</strong>? {owner} never sees this proposal.
        </>
      )
      confirmLabel = withdraw ? 'Yes, withdraw' : 'Yes, reject'
      busyLabel = withdraw ? 'Withdrawing…' : 'Rejecting…'
      danger = true
      run = () => settle(onCancel(confirmation.participant.id))
    }

    const working =
      busy && ['propose', 'leave', 'cancel'].includes(pendingAction ?? '') ? busyLabel : null
    return (
      <div aria-label="Confirm" className="journal-confirm" id={confirmId} role="group">
        <p>{message}</p>
        <div className="journal-actions">
          <button
            aria-busy={working !== null || undefined}
            autoFocus
            className={`journal-button ${danger ? 'journal-button--solid-danger' : ''}`}
            disabled={busy}
            onClick={() => void run()}
            type="button"
          >
            {working ?? confirmLabel}
          </button>
          <button
            className="journal-button journal-button--ghost"
            disabled={busy}
            onClick={close}
            type="button"
          >
            Never mind
          </button>
        </div>
      </div>
    )
  }

  const mayLeave = interactive && accepted.length > 1

  return (
    <section aria-labelledby={`${base}-heading`} className="adventure-block adventure-participants">
      <h4 className="journal-section-title" id={`${base}-heading`} ref={headingRef} tabIndex={-1}>
        <PixelIcon name="tent" />
        Participants
      </h4>

      <ul className="participant-list">
        {rows.map((row) => {
          const state =
            row.status === 'accepted' ? null : participantLabel(row, adventure, userId, roster)
          return (
            <li className="participant-row" data-status={row.status} key={row.id}>
              <p className="participant-row__who">
                <strong>{characterName(row.character_id)}</strong>
                <span>{player(row.profile_id)}</span>
              </p>
              {state && <p className="participant-row__state">{state}</p>}
              {row.status === 'accepted' && row.share_consent && (
                <p className="participant-row__state">Agrees to share with the party</p>
              )}
              <div className="journal-actions participant-row__actions">{actions(row)}</div>
            </li>
          )
        })}
      </ul>

      {interactive && (
        <div className="participant-invite">
          {atLimit ? (
            <p className="adventure-block__empty">
              An adventure can have up to 10 characters, invitations included.
            </p>
          ) : invitable.length === 0 ? (
            <p className="adventure-block__empty">
              No other player has a character that can be invited.
            </p>
          ) : (
            <div className="journal-field">
              <label htmlFor={`${base}-pick`}>Invite a character</label>
              <div className="journal-actions">
                <select
                  className="journal-select"
                  disabled={locked}
                  id={`${base}-pick`}
                  onChange={(event) => setChoice(event.target.value)}
                  value={choice}
                >
                  <option value="">Choose a character…</option>
                  {invitable.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name} ({player(character.owner_id)})
                    </option>
                  ))}
                </select>
                <button
                  className="journal-button"
                  disabled={locked || choice === ''}
                  onClick={(event) =>
                    ask({ type: 'invite', characterId: choice }, event.currentTarget)
                  }
                  type="button"
                >
                  Invite
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmationBox()}

      {mayLeave && (
        <div className="journal-actions">
          <button
            className="journal-button journal-button--danger"
            disabled={locked}
            onClick={(event) => ask({ type: 'leave' }, event.currentTarget)}
            type="button"
          >
            Leave adventure
          </button>
        </div>
      )}
    </section>
  )
}
