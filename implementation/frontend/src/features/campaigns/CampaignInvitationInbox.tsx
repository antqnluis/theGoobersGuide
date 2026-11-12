import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, type KeyboardEvent } from 'react'
import {
  campaignInvitationError,
  incomingInvitationsOptions,
  isInvitationUnavailable,
  respondToCampaignInvitation,
} from './campaignInvitations'
import { campaignListOptions } from './campaignQueries'

type CampaignInvitationInboxProps = {
  userId: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export function CampaignInvitationInbox({
  userId,
  expanded,
  onExpandedChange,
}: CampaignInvitationInboxProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const options = incomingInvitationsOptions(userId)
  const invitations = useQuery(options)
  const count = invitations.data?.length ?? 0

  const response = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      respondToCampaignInvitation(id, accept),
    onSettled: async (_data, error, { accept }) => {
      if (!error || isInvitationUnavailable(error)) {
        if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: options.queryKey }),
        accept && queryClient.invalidateQueries({ queryKey: campaignListOptions(userId).queryKey }),
      ])
    },
  })

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      onExpandedChange(false)
      triggerRef.current?.focus()
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation()
  }

  return (
    <section className="galaxy-invitations" onKeyDown={handleKey}>
      <h2 className="galaxy-invitations__heading">
        <button
          aria-controls="galaxy-invitations-panel"
          aria-expanded={expanded}
          className="galaxy-disclosure"
          onClick={() => {
            if (!expanded) void invitations.refetch()
            onExpandedChange(!expanded)
          }}
          ref={triggerRef}
          type="button"
        >
          My invitations
          {count > 0 && <span className="galaxy-invitations__count">({count})</span>}
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </h2>
      <div
        className="galaxy-list-reveal galaxy-invitations__reveal"
        data-expanded={expanded}
        id="galaxy-invitations-panel"
      >
        <div
          aria-hidden={!expanded}
          className="galaxy-list-scroll"
          inert={!expanded}
          ref={panelRef}
        >
          {invitations.isPending && (
            <p className="galaxy-list-message" role="status">
              Loading invitations…
            </p>
          )}
          {invitations.isError && (
            <div className="galaxy-list-message" role="alert">
              <p>Invitations could not be loaded.</p>
              <button
                className="galaxy-action"
                onClick={() => void invitations.refetch()}
                type="button"
              >
                Try again
              </button>
            </div>
          )}
          {invitations.isSuccess && count === 0 && (
            <p className="galaxy-list-message">You have no pending invitations.</p>
          )}
          {response.isError && (
            <p className="galaxy-list-message galaxy-invitations__error" role="alert">
              {campaignInvitationError(
                response.error,
                "We couldn't respond to this invitation. Try again.",
              )}
            </p>
          )}
          {count > 0 && (
            <ul aria-label="Pending invitations" className="galaxy-invitations__list">
              {invitations.data?.map((invitation) => (
                <li key={invitation.id}>
                  <strong>{invitation.campaign_name}</strong>
                  <p>From {invitation.inviter_username ?? 'the campaign owner'}</p>
                  <div className="galaxy-invitations__actions">
                    {([true, false] as const).map((accept) => {
                      const action = accept ? 'Accept' : 'Decline'
                      const isResponding =
                        response.isPending &&
                        response.variables.id === invitation.id &&
                        response.variables.accept === accept
                      return (
                        <button
                          aria-disabled={response.isPending}
                          aria-label={`${action} invitation to ${invitation.campaign_name}`}
                          className={
                            accept ? 'galaxy-action galaxy-action--primary' : 'galaxy-action'
                          }
                          key={action}
                          onClick={() => {
                            if (!response.isPending) {
                              response.mutate({ id: invitation.id, accept })
                            }
                          }}
                          type="button"
                        >
                          {isResponding ? (accept ? 'Accepting…' : 'Declining…') : action}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p
        className={expanded && response.isSuccess ? 'galaxy-notice' : 'visually-hidden'}
        role="status"
      >
        {response.isSuccess &&
          (response.variables.accept
            ? 'Invitation accepted. The campaign is in Your campaigns.'
            : 'Invitation declined.')}
      </p>
    </section>
  )
}
