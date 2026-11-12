import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AuthField } from '../auth/AuthField'
import { isValidUsername } from '../auth/authValidation'
import {
  campaignInvitationError,
  cancelCampaignInvitation,
  isInvitationUnavailable,
  outgoingInvitationsOptions,
  sendCampaignInvitation,
} from './campaignInvitations'

export function CampaignOutgoingInvitations({
  campaignId,
  userId,
}: {
  campaignId: string
  userId: string
}) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [notice, setNotice] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingListRef = useRef<HTMLUListElement>(null)
  const queryClient = useQueryClient()
  const options = outgoingInvitationsOptions(campaignId, userId)
  const invitations = useQuery(options)
  const refresh = () => queryClient.invalidateQueries({ queryKey: options.queryKey })
  const send = useMutation({
    mutationFn: (target: string) => sendCampaignInvitation(campaignId, target),
    onSuccess: async () => {
      closeForm()
      setNotice('Invitation sent.')
      await refresh()
    },
    onError: () => refresh(),
  })
  const cancel = useMutation({
    mutationFn: cancelCampaignInvitation,
    onSettled: async (_data, error) => {
      if (!error || isInvitationUnavailable(error)) {
        if (pendingListRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
      }
      if (!error) setNotice('Invitation cancelled.')
      await refresh()
    },
  })

  useEffect(() => {
    if (isFormOpen) inputRef.current?.focus()
  }, [isFormOpen])

  function closeForm() {
    setIsFormOpen(false)
    setUsername('')
    setFieldError('')
    triggerRef.current?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (send.isPending) return

    const target = username.trim()
    if (!isValidUsername(target)) {
      setFieldError('Enter a username with 3–24 letters, numbers, or underscores.')
      inputRef.current?.focus()
      return
    }
    setNotice('')
    setFieldError('')
    send.mutate(target)
  }

  return (
    <div className="campaign-invitations">
      <button
        aria-controls="campaign-invite-form"
        aria-expanded={isFormOpen}
        className="auth-button auth-button--secondary"
        onClick={() => {
          if (send.isPending) return
          if (isFormOpen) closeForm()
          else {
            send.reset()
            setIsFormOpen(true)
          }
        }}
        ref={triggerRef}
        type="button"
      >
        Invite player
      </button>

      <div hidden={!isFormOpen} id="campaign-invite-form">
        <form className="campaign-invitations__form" onSubmit={submit}>
          <AuthField
            autoCapitalize="none"
            autoComplete="off"
            error={fieldError}
            id="campaign-invite-username"
            label="Player username"
            onChange={(event) => {
              setUsername(event.target.value)
              setFieldError('')
              if (send.isError) send.reset()
            }}
            readOnly={send.isPending}
            ref={inputRef}
            spellCheck={false}
            value={username}
          />
          {send.isError && (
            <p className="campaign-form__feedback" role="alert">
              {campaignInvitationError(send.error, "We couldn't send the invitation. Try again.")}
            </p>
          )}
          <div className="campaign-form__actions">
            <button className="auth-button" disabled={send.isPending} type="submit">
              {send.isPending ? 'Sending…' : 'Send invitation'}
            </button>
            <button
              className="auth-button auth-button--secondary"
              disabled={send.isPending}
              onClick={closeForm}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <p className={notice ? 'campaign-notice' : 'visually-hidden'} role="status">
        {notice}
      </p>
      <section aria-labelledby="campaign-outgoing-heading">
        <h3 id="campaign-outgoing-heading">Pending invitations</h3>
        {invitations.isPending && <p role="status">Loading invitations…</p>}
        {invitations.isError && (
          <div className="campaign-inline-error" role="alert">
            <p>Pending invitations could not be loaded.</p>
            <button
              className="campaign-text-button"
              onClick={() => void invitations.refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        )}
        {cancel.isError && (
          <p className="campaign-form__feedback" role="alert">
            {campaignInvitationError(
              cancel.error,
              "We couldn't cancel this invitation. Try again.",
            )}
          </p>
        )}
        {invitations.isSuccess && invitations.data.length === 0 && (
          <p className="campaign-members__empty">No pending invitations.</p>
        )}
        {Boolean(invitations.data?.length) && (
          <ul className="campaign-member-list" ref={pendingListRef}>
            {invitations.data?.map((invitation) => (
              <li key={invitation.id}>
                <span>{invitation.recipient_username}</span>
                <button
                  aria-disabled={cancel.isPending}
                  aria-label={`Cancel invitation for ${invitation.recipient_username}`}
                  className="campaign-text-button"
                  onClick={() => {
                    if (cancel.isPending) return
                    setNotice('')
                    cancel.mutate(invitation.id)
                  }}
                  type="button"
                >
                  {cancel.isPending && cancel.variables === invitation.id
                    ? 'Cancelling…'
                    : 'Cancel invitation'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
