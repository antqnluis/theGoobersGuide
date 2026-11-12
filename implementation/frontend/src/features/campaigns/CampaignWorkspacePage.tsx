import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ViewTransition, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { CampaignForm } from './CampaignForm'
import { deleteCampaign, getCampaign, getCampaignRoster, updateCampaign } from './campaignService'
import { toCampaignInput } from './campaignValidation'

export function CampaignWorkspacePage() {
  const { campaignId = '' } = useParams()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const restoreDeleteFocusRef = useRef(false)
  const routeState = location.state as {
    campaignCreated?: boolean
    campaignTransition?: { campaignId: string; name: string }
  } | null
  const campaignTransitionTitle =
    navigationType === 'PUSH' && routeState?.campaignTransition?.campaignId === campaignId
      ? routeState.campaignTransition.name
      : null
  const [notice, setNotice] = useState<string | null>(() =>
    routeState?.campaignCreated ? 'Campaign created.' : null,
  )
  const [mutationError, setMutationError] = useState<string | null>(null)

  const campaignQuery = useQuery({
    queryKey: ['campaigns', 'detail', campaignId, userId],
    queryFn: () => getCampaign(campaignId),
    enabled: Boolean(campaignId) && Boolean(userId),
  })
  const rosterQuery = useQuery({
    queryKey: ['campaigns', 'roster', campaignId, userId],
    queryFn: () => getCampaignRoster(campaignId),
    enabled: Boolean(campaignId) && Boolean(userId) && Boolean(campaignQuery.data),
  })
  const updateMutation = useMutation({
    mutationFn: (input: ReturnType<typeof toCampaignInput>) => updateCampaign(campaignId, input),
  })
  const deleteMutation = useMutation({ mutationFn: () => deleteCampaign(campaignId) })
  const campaign = campaignQuery.data
  const isOwner = Boolean(campaign && campaign.owner_id === session?.user.id)
  const roster = rosterQuery.data ?? []
  const currentRole = isOwner
    ? 'Owner'
    : roster.find((member) => member.profile_id === session?.user.id)?.role === 'owner'
      ? 'Owner'
      : 'Member'
  const ownerUsername =
    roster.find((member) => member.role === 'owner')?.username ?? 'Campaign owner'

  useEffect(() => {
    if (routeState?.campaignCreated) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, navigate, routeState?.campaignCreated])

  useEffect(() => {
    if (!isConfirmingDelete && restoreDeleteFocusRef.current) {
      restoreDeleteFocusRef.current = false
      deleteTriggerRef.current?.focus()
    }
  }, [isConfirmingDelete])

  const save = async (name: string, description: string) => {
    setMutationError(null)
    try {
      await updateMutation.mutateAsync(toCampaignInput(name, description))
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setIsEditing(false)
      setNotice('Campaign details saved.')
    } catch {
      setMutationError("We couldn't save these changes. Check your connection and try again.")
    }
  }

  const remove = async () => {
    setMutationError(null)
    try {
      await deleteMutation.mutateAsync()
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.removeQueries({ queryKey: ['campaigns', 'detail', campaignId, userId] })
      queryClient.removeQueries({ queryKey: ['campaigns', 'roster', campaignId, userId] })
      navigate('/app/campaigns', { state: { campaignNotice: 'deleted' } })
    } catch {
      setMutationError("We couldn't delete this campaign. Check your connection and try again.")
    }
  }

  if (campaignQuery.isPending) {
    return (
      <section className="campaign-page" aria-labelledby="workspace-loading-heading">
        {campaignTransitionTitle ? (
          <div className="campaign-workspace__heading campaign-workspace__heading--pending">
            <div className="campaign-workspace__story">
              <ViewTransition
                default="none"
                name={'campaign-title-' + campaignId}
                share="campaign-title-morph"
              >
                <h1 id="workspace-loading-heading">{campaignTransitionTitle}</h1>
              </ViewTransition>
              <p className="campaign-loading" role="status">
                Opening campaign workspace…
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="campaign-loading" role="status">
              Opening campaign workspace…
            </p>
            <h1 className="visually-hidden" id="workspace-loading-heading">
              Campaign workspace
            </h1>
          </>
        )}
      </section>
    )
  }

  if (campaignQuery.isError) {
    return (
      <section className="campaign-page campaign-state" aria-labelledby="workspace-error-heading">
        <h1 id="workspace-error-heading">This workspace could not be opened.</h1>
        <p>Check your connection and try again.</p>
        <button
          className="auth-button auth-button--secondary"
          onClick={() => campaignQuery.refetch()}
          type="button"
        >
          Try again
        </button>
        <Link className="campaign-back-link" to="/app/campaigns">
          Back to campaigns
        </Link>
      </section>
    )
  }

  if (!campaign) {
    return (
      <section className="campaign-page campaign-state" aria-labelledby="workspace-missing-heading">
        <h1 id="workspace-missing-heading">Campaign not available</h1>
        <p>This campaign may have been removed, or your account may not have access.</p>
        <Link className="campaign-inline-link" to="/app/campaigns">
          Return to your campaigns
        </Link>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="campaign-workspace-heading"
      className="campaign-page campaign-workspace"
    >
      <Link className="campaign-back-link" to="/app/campaigns">
        Back to campaigns
      </Link>
      {notice && (
        <p className="campaign-notice" role="status">
          {notice}
        </p>
      )}
      <div className="campaign-workspace__heading">
        <div className="campaign-workspace__story">
          <ViewTransition
            default="none"
            name={'campaign-title-' + campaign.id}
            share="campaign-title-morph"
          >
            <h1 id="campaign-workspace-heading">{campaign.name}</h1>
          </ViewTransition>
          <p>{campaign.description || 'No description has been added.'}</p>
        </div>
        <aside aria-label="Campaign details" className="campaign-workspace__margin">
          <p>
            <span>Your role</span>
            <strong>{currentRole}</strong>
          </p>
          <p>
            <span>Campaign owner</span>
            <strong>{ownerUsername}</strong>
          </p>
        </aside>
      </div>

      <section aria-labelledby="campaign-members-heading" className="campaign-members">
        <div className="campaign-section-heading">
          <h2 id="campaign-members-heading">People in this campaign</h2>
        </div>
        {rosterQuery.isPending && (
          <p className="campaign-loading" role="status">
            Loading campaign members…
          </p>
        )}
        {rosterQuery.isError && (
          <div className="campaign-inline-error" role="alert">
            <p>Campaign members could not be loaded.</p>
            <button
              className="campaign-text-button"
              onClick={() => rosterQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        )}
        {rosterQuery.isSuccess && roster.length === 0 && (
          <p className="campaign-members__empty">No member information is available.</p>
        )}
        {rosterQuery.isSuccess && roster.length > 0 && (
          <ul className="campaign-member-list">
            {roster.map((member) => (
              <li key={member.profile_id}>
                <span>
                  {member.username || (member.role === 'owner' ? 'Campaign owner' : 'Player')}
                </span>
                <span className="campaign-member-list__role">
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section aria-labelledby="campaign-settings-heading" className="campaign-settings">
          <h2 id="campaign-settings-heading">Campaign details</h2>
          {mutationError && (
            <p className="campaign-form__feedback" role="alert">
              {mutationError}
            </p>
          )}
          {isEditing ? (
            <CampaignForm
              initialDescription={campaign.description}
              initialName={campaign.name}
              isPending={updateMutation.isPending}
              onCancel={() => {
                setIsEditing(false)
                setMutationError(null)
              }}
              onSubmit={save}
              submitLabel="Save changes"
            />
          ) : !isConfirmingDelete ? (
            <div className="campaign-settings__actions">
              <button
                className="auth-button auth-button--secondary"
                onClick={() => {
                  setMutationError(null)
                  setIsEditing(true)
                }}
                type="button"
              >
                Edit details
              </button>
              <button
                className="campaign-danger-button"
                ref={deleteTriggerRef}
                onClick={() => {
                  setMutationError(null)
                  setIsConfirmingDelete(true)
                }}
                type="button"
              >
                Delete campaign
              </button>
            </div>
          ) : null}

          {isConfirmingDelete && (
            <div
              aria-label="Confirm campaign deletion"
              className="campaign-delete-confirm"
              role="group"
            >
              <p>
                Delete <strong>{campaign.name}</strong>? Its campaign details and member list will
                be removed.
              </p>
              <div className="campaign-settings__actions">
                <button
                  className="campaign-danger-button"
                  disabled={deleteMutation.isPending}
                  onClick={remove}
                  type="button"
                  autoFocus
                >
                  {deleteMutation.isPending ? 'Deleting campaign…' : 'Yes, delete campaign'}
                </button>
                <button
                  className="campaign-text-button"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    restoreDeleteFocusRef.current = true
                    setIsConfirmingDelete(false)
                  }}
                  type="button"
                >
                  Keep campaign
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  )
}
