import { ViewTransition, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { listAccessibleCampaigns } from './campaignService'
import { useAuth } from '../auth/useAuth'

export function CampaignSelectorLayout() {
  const { session } = useAuth()
  return <CampaignSelector key={session?.user.id} userId={session?.user.id ?? ''} />
}

function CampaignSelector({ userId }: { userId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isCreating = Boolean(useMatch('/app/campaigns/new'))
  const selectedButtonRef = useRef<HTMLButtonElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const locationState = location.state as { campaignNotice?: string } | null
  const [notice] = useState(() =>
    locationState?.campaignNotice === 'deleted' ? 'Campaign deleted.' : null,
  )
  const campaignsQuery = useQuery({
    queryKey: ['campaigns', 'list', userId],
    queryFn: () => listAccessibleCampaigns(userId),
    enabled: Boolean(userId) && !isCreating,
  })

  useEffect(() => {
    if (locationState?.campaignNotice) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, locationState?.campaignNotice, navigate])

  const selectedCampaign = campaignsQuery.data?.find((campaign) => campaign.id === selectedId)

  if (campaignsQuery.isSuccess && selectedId && !selectedCampaign) {
    setSelectedId(null)
  }

  if (isCreating) {
    return <Outlet />
  }

  return (
    <section aria-labelledby="campaigns-heading" className="campaign-page">
      <div className="campaign-page__heading">
        <div>
          <h1 id="campaigns-heading">Your campaigns</h1>
          <p>Find your place in the story, or begin a new one.</p>
        </div>
        <Link className="auth-button campaign-create-link" to="/app/campaigns/new">
          Create campaign
        </Link>
      </div>

      {notice && (
        <p className="campaign-notice" role="status">
          {notice}
        </p>
      )}

      {campaignsQuery.isPending && (
        <p className="campaign-loading" role="status">
          Gathering your campaigns…
        </p>
      )}

      {campaignsQuery.isError && (
        <div className="campaign-state" role="alert">
          <h2>Your campaigns could not be loaded.</h2>
          <p>Check your connection and try again.</p>
          <button
            className="auth-button auth-button--secondary"
            onClick={() => campaignsQuery.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {campaignsQuery.isSuccess && campaignsQuery.data.length === 0 && (
        <div className="campaign-empty">
          <h2>Your next story starts here.</h2>
          <p>
            You do not have a campaign yet. Create one to give your group a shared place to begin.
          </p>
          <Link className="campaign-inline-link" to="/app/campaigns/new">
            Create your first campaign
          </Link>
        </div>
      )}

      {campaignsQuery.isSuccess && campaignsQuery.data.length > 0 && (
        <div className="campaign-selector">
          <ul aria-label="Campaign list" className="campaign-index">
            {campaignsQuery.data.map((campaign) => (
              <li key={campaign.id}>
                <button
                  aria-controls="campaign-selection"
                  aria-pressed={selectedId === campaign.id}
                  className="campaign-index__button"
                  onClick={() => setSelectedId(campaign.id)}
                  ref={selectedId === campaign.id ? selectedButtonRef : undefined}
                  type="button"
                >
                  {campaign.name}
                </button>
              </li>
            ))}
          </ul>
          <section
            aria-label="Campaign details"
            className="campaign-selection"
            id="campaign-selection"
          >
            <div aria-live="polite">
              {selectedCampaign ? (
                <>
                  <ViewTransition
                    default="none"
                    name={'campaign-title-' + selectedCampaign.id}
                    share="campaign-title-morph"
                  >
                    <h2>{selectedCampaign.name}</h2>
                  </ViewTransition>
                  <p>{selectedCampaign.description || 'No description yet.'}</p>
                  <p className="campaign-selection__role">
                    Your role:{' '}
                    <strong>{selectedCampaign.role === 'owner' ? 'Owner' : 'Member'}</strong>
                  </p>
                </>
              ) : (
                <>
                  <h2>Galaxy overview</h2>
                  <p>Select a campaign to see its details.</p>
                </>
              )}
            </div>
            {selectedCampaign && (
              <div className="campaign-selection__actions">
                <Link
                  className="auth-button"
                  state={{
                    campaignTransition: {
                      campaignId: selectedCampaign.id,
                      name: selectedCampaign.name,
                    },
                  }}
                  to={`/app/campaigns/${selectedCampaign.id}`}
                >
                  Open workspace
                </Link>
                <button
                  className="auth-button auth-button--secondary"
                  onClick={() => {
                    selectedButtonRef.current?.focus()
                    setSelectedId(null)
                  }}
                  type="button"
                >
                  Galaxy overview
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
