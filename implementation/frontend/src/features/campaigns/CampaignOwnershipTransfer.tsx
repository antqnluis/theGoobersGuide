import { useId, useState } from 'react'
import type { CampaignRosterMember } from './campaignTypes'
import { memberName } from './memberName'
import type { MembershipAction, MembershipConfirmation } from './useCampaignMembership'

type CampaignOwnershipTransferProps = {
  campaignName: string
  roster: CampaignRosterMember[]
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  confirmation: MembershipConfirmation | null
  onConfirmationChange: (confirmation: MembershipConfirmation | null) => void
  pendingAction: MembershipAction | null
  /** Failure copy for a transfer attempt. */
  error: string | null
  onTransfer: (profileId: string, name: string) => void
}

/** Owner-only: hand the campaign to another member, behind an inline confirmation. */
export function CampaignOwnershipTransfer({
  campaignName,
  roster,
  status,
  onRetry,
  confirmation,
  onConfirmationChange,
  pendingAction,
  error,
  onTransfer,
}: CampaignOwnershipTransferProps) {
  const [choice, setChoice] = useState('')
  const groupName = useId()
  const members = roster.filter((member) => member.role !== 'owner')
  const busy = pendingAction !== null
  const target =
    confirmation?.type === 'transfer'
      ? members.find((member) => member.profile_id === confirmation.profileId)
      : undefined

  return (
    <section aria-labelledby="camp-transfer-heading" className="campaign-transfer">
      <h3 id="camp-transfer-heading">Transfer ownership</h3>
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
      {status === 'success' && members.length === 0 && (
        <p className="campaign-members__empty">Invite a player before you transfer ownership.</p>
      )}
      {status === 'success' && members.length > 0 && !target && (
        <>
          <fieldset className="campaign-transfer__choices" disabled={busy}>
            <legend>Choose the new owner</legend>
            {members.map((member) => (
              <label key={member.profile_id}>
                <input
                  checked={choice === member.profile_id}
                  name={groupName}
                  onChange={() => setChoice(member.profile_id)}
                  type="radio"
                  value={member.profile_id}
                />
                <span>{memberName(member)}</span>
              </label>
            ))}
          </fieldset>
          <div className="campaign-settings__actions">
            <button
              className="auth-button auth-button--secondary"
              disabled={!choice || busy}
              onClick={() => onConfirmationChange({ type: 'transfer', profileId: choice })}
              type="button"
            >
              Transfer ownership
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="campaign-form__feedback" role="alert">
          {error}
        </p>
      )}

      {target && (
        <div
          aria-label="Confirm ownership transfer"
          className="campaign-delete-confirm"
          role="group"
        >
          <p>
            Make <strong>{memberName(target)}</strong> the owner of <strong>{campaignName}</strong>?
            You'll become a regular member and will no longer be able to edit, delete, or invite
            players to this campaign.
          </p>
          <div className="campaign-settings__actions">
            <button
              autoFocus
              className="campaign-danger-button"
              disabled={busy}
              onClick={() => onTransfer(target.profile_id, memberName(target))}
              type="button"
            >
              {pendingAction === 'transfer' ? 'Transferring…' : 'Yes, transfer ownership'}
            </button>
            <button
              className="campaign-text-button"
              disabled={busy}
              onClick={() => onConfirmationChange(null)}
              type="button"
            >
              Keep ownership
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
