import { useEffect, useRef, type ReactNode } from 'react'
import type { MembershipAction, MembershipConfirmation } from './useCampaignMembership'
import { memberName } from './memberName'
import type { CampaignRosterMember } from './campaignTypes'

type CampaignPartyMembersProps = {
  campaignName: string
  isOwner: boolean
  roster: CampaignRosterMember[]
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  confirmation: MembershipConfirmation | null
  onConfirmationChange: (confirmation: MembershipConfirmation | null) => void
  pendingAction: MembershipAction | null
  pendingProfileId: string | null
  /** Failure copy for a leave or remove attempt. */
  error: string | null
  onLeaveCampaign: () => void
  onRemoveMember: (profileId: string, name: string) => void
  /** Owner-only controls that follow the list (invitations). */
  children?: ReactNode
}

/**
 * The Party panel: who is in the campaign, with leave (members) and remove
 * (owner) behind an inline confirmation, the same pattern as campaign deletion.
 */
export function CampaignPartyMembers({
  campaignName,
  isOwner,
  roster,
  status,
  onRetry,
  confirmation,
  onConfirmationChange,
  pendingAction,
  pendingProfileId,
  error,
  onLeaveCampaign,
  onRemoveMember,
  children,
}: CampaignPartyMembersProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const restoreFocusRef = useRef<string | null>(null)
  const previousConfirmationRef = useRef<MembershipConfirmation | null>(null)
  const busy = pendingAction !== null
  const hasOtherMembers = roster.some((member) => member.role !== 'owner')

  // Cancelling returns focus to the control that opened the confirmation. A finished
  // removal leaves focus on a vanished button, so it moves somewhere stable instead.
  useEffect(() => {
    const previous = previousConfirmationRef.current
    previousConfirmationRef.current = confirmation
    if (confirmation) return
    const root = rootRef.current
    const key = restoreFocusRef.current
    restoreFocusRef.current = null
    if (key) {
      root?.querySelector<HTMLElement>(`[data-membership-trigger="${CSS.escape(key)}"]`)?.focus()
    } else if (previous?.type === 'remove' && root?.closest('dialog')?.open) {
      const invite = root.querySelector<HTMLElement>('[aria-controls="campaign-invite-form"]')
      ;(invite ?? headingRef.current)?.focus()
    }
  }, [confirmation])

  function cancel(key: string) {
    restoreFocusRef.current = key
    onConfirmationChange(null)
  }

  return (
    <div ref={rootRef}>
      <h2 id="camp-party-heading" ref={headingRef} tabIndex={-1}>
        People in this campaign
      </h2>
      {status === 'pending' && (
        <p className="campaign-loading" role="status">
          Loading campaign members…
        </p>
      )}
      {status === 'error' && (
        <div className="campaign-inline-error" role="alert">
          <p>Campaign members could not be loaded.</p>
          <button className="campaign-text-button" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      )}
      {status === 'success' && roster.length === 0 && (
        <p className="campaign-members__empty">No member information is available.</p>
      )}
      {status === 'success' && roster.length > 0 && (
        <ul className="campaign-member-list">
          {roster.map((member) => {
            const name = memberName(member)
            const confirmingRemoval =
              confirmation?.type === 'remove' && confirmation.profileId === member.profile_id
            const removing = busy && pendingProfileId === member.profile_id
            return (
              <li
                className={confirmingRemoval ? 'campaign-member-list__row--confirming' : undefined}
                key={member.profile_id}
              >
                <span>
                  {member.username || (member.role === 'owner' ? 'Campaign owner' : 'Player')}
                </span>
                <span className="campaign-member-list__role">
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </span>
                {isOwner && member.role !== 'owner' && !confirmingRemoval && (
                  <button
                    aria-label={`Remove ${name} from the campaign`}
                    className="campaign-text-button"
                    data-membership-trigger={member.profile_id}
                    disabled={busy}
                    onClick={() =>
                      onConfirmationChange({ type: 'remove', profileId: member.profile_id })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                )}
                {confirmingRemoval && (
                  <div
                    aria-label={`Confirm removal of ${name}`}
                    className="campaign-delete-confirm"
                    role="group"
                  >
                    <p>
                      Remove <strong>{name}</strong> from <strong>{campaignName}</strong>? They'll
                      lose access until you invite them again.
                    </p>
                    <div className="campaign-settings__actions">
                      <button
                        autoFocus
                        className="campaign-danger-button"
                        disabled={busy}
                        onClick={() => onRemoveMember(member.profile_id, name)}
                        type="button"
                      >
                        {removing ? 'Removing…' : 'Yes, remove'}
                      </button>
                      <button
                        className="campaign-text-button"
                        disabled={busy}
                        onClick={() => cancel(member.profile_id)}
                        type="button"
                      >
                        Keep {name}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="campaign-form__feedback" role="alert">
          {error}
        </p>
      )}

      {isOwner && status === 'success' && hasOtherMembers && (
        <p className="campaign-members__empty">
          To leave this campaign, transfer ownership in Campaign settings first.
        </p>
      )}

      {!isOwner && confirmation?.type !== 'leave' && (
        <div className="campaign-settings__actions">
          <button
            className="campaign-danger-button"
            data-membership-trigger="leave"
            disabled={busy}
            onClick={() => onConfirmationChange({ type: 'leave' })}
            type="button"
          >
            Leave campaign
          </button>
        </div>
      )}
      {!isOwner && confirmation?.type === 'leave' && (
        <div
          aria-label="Confirm leaving the campaign"
          className="campaign-delete-confirm"
          role="group"
        >
          <p>
            Leave <strong>{campaignName}</strong>? You'll lose access until the owner invites you
            again.
          </p>
          <div className="campaign-settings__actions">
            <button
              autoFocus
              className="campaign-danger-button"
              disabled={busy}
              onClick={onLeaveCampaign}
              type="button"
            >
              {pendingAction === 'leave' ? 'Leaving…' : 'Yes, leave campaign'}
            </button>
            <button
              className="campaign-text-button"
              disabled={busy}
              onClick={() => cancel('leave')}
              type="button"
            >
              Stay in campaign
            </button>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
