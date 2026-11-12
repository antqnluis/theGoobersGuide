import { ViewTransition, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'
import { listAccessibleCampaigns } from './campaignService'
import { useAuth } from '../auth/useAuth'

export function CampaignDashboardPage() {
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const userId = session?.user.id ?? ''
  const locationState = location.state as { campaignNotice?: string } | null
  const [notice] = useState(() =>
    locationState?.campaignNotice === 'deleted' ? 'Campaign deleted.' : null,
  )
  const campaignsQuery = useQuery({
    queryKey: ['campaigns', 'list', userId],
    queryFn: () => listAccessibleCampaigns(userId),
    enabled: Boolean(userId),
  })

  useEffect(() => {
    if (locationState?.campaignNotice) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, locationState?.campaignNotice, navigate])

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
        <ul aria-label="Campaign list" className="campaign-index">
          {campaignsQuery.data.map((campaign) => (
            <li className="campaign-index__row" key={campaign.id}>
              <div className="campaign-index__story">
                <ViewTransition
                  default="none"
                  name={'campaign-title-' + campaign.id}
                  share="campaign-title-morph"
                >
                  <h2>
                    <Link
                      state={{
                        campaignTransition: { campaignId: campaign.id, name: campaign.name },
                      }}
                      to={`/app/campaigns/${campaign.id}`}
                    >
                      {campaign.name}
                    </Link>
                  </h2>
                </ViewTransition>
                <p>{campaign.description || 'No description yet.'}</p>
              </div>
              <div className="campaign-index__margin">
                <span className="campaign-index__role">
                  Your role: <strong>{campaign.role === 'owner' ? 'Owner' : 'Member'}</strong>
                </span>
                <Link
                  className="campaign-inline-link"
                  state={{
                    campaignTransition: { campaignId: campaign.id, name: campaign.name },
                  }}
                  to={`/app/campaigns/${campaign.id}`}
                >
                  Open workspace
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
