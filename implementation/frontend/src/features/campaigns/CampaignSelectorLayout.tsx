import { startTransition, ViewTransition, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { listAccessibleCampaigns } from './campaignService'
import { GalaxyBackdrop } from './GalaxyBackdrop'
import { useAuth } from '../auth/useAuth'
import './galaxy.css'

const compactViewport = '(max-width: 680px)'

export function CampaignSelectorLayout() {
  const { session } = useAuth()
  return <CampaignSelector key={session?.user.id} userId={session?.user.id ?? ''} />
}

function CampaignSelector({ userId }: { userId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isCreating = Boolean(useMatch('/app/campaigns/new'))
  const selectedButtonRef = useRef<HTMLButtonElement>(null)
  const disclosureRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(() => !window.matchMedia?.(compactViewport).matches)
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

  return (
    <>
      <GalaxyBackdrop />
      {isCreating ? (
        <div className="galaxy-create">
          <Outlet />
        </div>
      ) : (
        <section aria-labelledby="campaigns-heading" className="galaxy-controls">
          <div
            className="galaxy-index galaxy-surface"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && expanded) {
                disclosureRef.current?.focus()
                setExpanded(false)
              }
            }}
          >
            <h1 id="campaigns-heading">
              <button
                aria-controls="galaxy-campaign-list"
                aria-expanded={expanded}
                className="galaxy-disclosure"
                onClick={() => setExpanded(!expanded)}
                ref={disclosureRef}
                type="button"
              >
                Your campaigns
                <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                  <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </h1>

            {notice && (
              <p className="galaxy-notice" role="status">
                {notice}
              </p>
            )}
            <div className="galaxy-list-reveal" data-expanded={expanded} id="galaxy-campaign-list">
              <div aria-hidden={!expanded} className="galaxy-list-scroll" inert={!expanded}>
                {campaignsQuery.isPending && (
                  <p className="galaxy-list-message" role="status">
                    Gathering your campaigns…
                  </p>
                )}
                {campaignsQuery.isError && (
                  <div className="galaxy-list-message" role="alert">
                    <h2>Your campaigns could not be loaded.</h2>
                    <p>Check your connection and try again.</p>
                    <button
                      className="galaxy-action"
                      onClick={() => campaignsQuery.refetch()}
                      type="button"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {campaignsQuery.isSuccess && campaignsQuery.data.length === 0 && (
                  <div className="galaxy-list-message">
                    <h2>Your next story starts here.</h2>
                    <p>Create a campaign to give your group a shared place to begin.</p>
                  </div>
                )}
                {campaignsQuery.isSuccess && campaignsQuery.data.length > 0 && (
                  <ul aria-label="Campaign list" className="galaxy-list">
                    {campaignsQuery.data.map((campaign) => (
                      <li key={campaign.id}>
                        <button
                          aria-pressed={selectedId === campaign.id}
                          className="galaxy-list-button"
                          onClick={() => {
                            setSelectedId(campaign.id)
                            if (window.matchMedia?.(compactViewport).matches) {
                              disclosureRef.current?.focus()
                              setExpanded(false)
                            }
                          }}
                          ref={selectedId === campaign.id ? selectedButtonRef : undefined}
                          type="button"
                        >
                          {campaign.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <Link className="galaxy-create-link" to="/app/campaigns/new">
              <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Create campaign
            </Link>
          </div>

          <div className="galaxy-details-slot">
            <p aria-live="polite" className="visually-hidden">
              {selectedCampaign ? `Selected campaign: ${selectedCampaign.name}` : 'Galaxy overview'}
            </p>
            {selectedCampaign && (
              <ViewTransition default="none" exit="galaxy-details-exit">
                <section aria-label="Campaign details" className="galaxy-details galaxy-surface">
                  <div className="galaxy-details__copy" tabIndex={0}>
                    <ViewTransition
                      default="none"
                      name={'campaign-title-' + selectedCampaign.id}
                      share="campaign-title-morph"
                    >
                      <h2>{selectedCampaign.name}</h2>
                    </ViewTransition>
                    <p>{selectedCampaign.description || 'No description yet.'}</p>
                    {selectedCampaign.role && (
                      <p className="galaxy-role">
                        Your role:{' '}
                        <strong>{selectedCampaign.role === 'owner' ? 'Owner' : 'Member'}</strong>
                      </p>
                    )}
                  </div>
                  <div className="galaxy-details__actions">
                    <Link
                      className="galaxy-action galaxy-action--primary"
                      state={{
                        campaignTransition: {
                          campaignId: selectedCampaign.id,
                          name: selectedCampaign.name,
                        },
                      }}
                      to={`/app/campaigns/${selectedCampaign.id}`}
                    >
                      Enter campaign
                    </Link>
                    <button
                      className="galaxy-action"
                      onClick={() => {
                        const returnFocus = expanded
                          ? selectedButtonRef.current
                          : disclosureRef.current
                        returnFocus?.focus()
                        startTransition(() => setSelectedId(null))
                      }}
                      type="button"
                    >
                      Return to galaxy overview
                    </button>
                  </div>
                </section>
              </ViewTransition>
            )}
          </div>
        </section>
      )}
    </>
  )
}
