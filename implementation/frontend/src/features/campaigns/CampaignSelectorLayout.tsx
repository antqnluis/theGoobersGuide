import {
  ViewTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { getCampaignMemberCount, listAccessibleCampaigns } from './campaignService'
import { getOrbitTarget, stepCampaign, type OrbitBounds } from './campaignOrbit'
import { orderPlanets } from './planetModel'
import { GalaxyBackdrop } from './GalaxyBackdrop'
import { useAuth } from '../auth/useAuth'
import './galaxy.css'

const compactViewport = '(max-width: 680px)'
const reducedMotion = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(reducedMotion)
  query?.addEventListener?.('change', onChange)
  return () => query?.removeEventListener?.('change', onChange)
}

function getReducedMotion() {
  return window.matchMedia?.(reducedMotion).matches ?? false
}

export function CampaignSelectorLayout() {
  const { session } = useAuth()
  return <CampaignSelector key={session?.user.id} userId={session?.user.id ?? ''} />
}

function CampaignSelector({ userId }: { userId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isCreating = Boolean(useMatch('/app/campaigns/new'))
  const selectedButtonRef = useRef<HTMLButtonElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [orbitBounds, setOrbitBounds] = useState<OrbitBounds | null>(null)
  const disclosureRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(() => !window.matchMedia?.(compactViewport).matches)
  const restoreFocusOnPauseRemoval = useCallback((button: HTMLButtonElement | null) => {
    if (!button) return
    return () => {
      if (document.activeElement === button) disclosureRef.current?.focus()
    }
  }, [])
  const [webglReady, setWebglReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const prefersReducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotion)
  const canPause = webglReady && !prefersReducedMotion
  const [selection, setSelection] = useState<{ id: string; direction?: -1 | 1 } | null>(null)
  const selectedId = selection?.id ?? null
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
  const detailsOpen = Boolean(selectedCampaign)

  useLayoutEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    function measure() {
      if (!scene) return
      const { left, top, width, height } = scene.getBoundingClientRect()
      setOrbitBounds((current) =>
        current?.left === left &&
        current.top === top &&
        current.width === width &&
        current.height === height
          ? current
          : { left, top, width, height },
      )
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(scene)
    const header = scene.closest('.galaxy-shell')?.querySelector('.workspace-header')
    if (header) observer?.observe(header)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [isCreating, detailsOpen, expanded])

  const planets = useMemo(() => orderPlanets(campaignsQuery.data), [campaignsQuery.data])
  const orbitIds = useMemo(() => planets.map(({ id }) => id), [planets])
  const memberCountQuery = useQuery({
    queryKey: ['campaigns', 'member-count', selectedCampaign?.id, userId],
    queryFn: () => getCampaignMemberCount(selectedCampaign!.id),
    enabled: Boolean(userId && selectedCampaign) && !isCreating,
  })
  const memberCount = memberCountQuery.data

  const selectCampaign = useCallback(
    (id: string, direction?: -1 | 1) => {
      setSelection({ id, direction })
      if (window.matchMedia?.(compactViewport).matches) {
        if (expanded && !direction) disclosureRef.current?.focus()
        setExpanded(false)
      }
    },
    [expanded],
  )

  function step(direction: -1 | 1) {
    const id = stepCampaign(orbitIds, selectedId, direction)
    if (id) selectCampaign(id, direction)
  }

  if (campaignsQuery.isSuccess && selectedId && !selectedCampaign) {
    setSelection(null)
  }

  return (
    <>
      <GalaxyBackdrop
        planets={planets}
        orbitBounds={orbitBounds}
        targetId={getOrbitTarget(orbitIds, selectedId)}
        interactive={!isCreating}
        motionReduced={prefersReducedMotion}
        paused={paused}
        onAvailabilityChange={setWebglReady}
        onSelect={selectCampaign}
        selectedId={selectedCampaign?.id ?? null}
        stepDirection={selection?.direction}
      />
      {isCreating ? (
        <div className="galaxy-create">
          <Outlet />
        </div>
      ) : (
        <section
          aria-labelledby="campaigns-heading"
          className="galaxy-controls"
          data-details-open={Boolean(selectedCampaign)}
        >
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
                          onClick={() => selectCampaign(campaign.id)}
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
            <div className="galaxy-index-actions">
              <Link className="galaxy-create-link" to="/app/campaigns/new">
                <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                Create campaign
              </Link>
              {canPause && (
                <button
                  aria-label="Pause ambient motion"
                  aria-pressed={paused}
                  className="galaxy-motion-toggle"
                  onClick={() => setPaused((value) => !value)}
                  ref={restoreFocusOnPauseRemoval}
                  title={paused ? 'Resume ambient motion' : 'Pause ambient motion'}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                    {paused ? (
                      <path d="M5 3.5 12 8l-7 4.5z" stroke="currentColor" strokeWidth="1.5" />
                    ) : (
                      <path d="M5.5 3.5v9m5-9v9" stroke="currentColor" strokeWidth="1.5" />
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div aria-hidden="true" className="galaxy-orbit-space" ref={sceneRef} />

          {planets.length > 1 && (
            <nav aria-label="Campaign orbit" className="galaxy-orbit-nav">
              <button className="galaxy-action" onClick={() => step(-1)} type="button">
                <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                  <path d="m10 4-4 4 4 4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                Previous campaign
              </button>
              <button className="galaxy-action" onClick={() => step(1)} type="button">
                Next campaign
                <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                  <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </nav>
          )}

          <div className="galaxy-details-slot">
            <p aria-live="polite" className="visually-hidden">
              {selectedCampaign ? `Selected campaign: ${selectedCampaign.name}` : 'Galaxy overview'}
            </p>
            {selectedCampaign && (
              <section aria-label="Campaign details" className="galaxy-details galaxy-surface">
                <div className="galaxy-details__copy" tabIndex={0}>
                  <ViewTransition
                    default="none"
                    key={selectedCampaign.id}
                    name={'campaign-title-' + selectedCampaign.id}
                    share="campaign-title-morph"
                  >
                    <h2>{selectedCampaign.name}</h2>
                  </ViewTransition>
                  <div className="galaxy-details__meta">
                    <p className="galaxy-role">
                      Your role:{' '}
                      <strong>{selectedCampaign.role === 'owner' ? 'Owner' : 'Member'}</strong>
                    </p>
                    <div className="galaxy-details__members">
                      <p role="status">
                        {memberCountQuery.isError
                          ? 'Member count unavailable'
                          : memberCount === undefined
                            ? 'Loading member count…'
                            : `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
                      </p>
                      {memberCountQuery.isError && (
                        <button
                          className="galaxy-action"
                          onClick={() => void memberCountQuery.refetch()}
                          type="button"
                        >
                          Retry count
                        </button>
                      )}
                    </div>
                  </div>
                  <p>{selectedCampaign.description || 'No description yet.'}</p>
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
                        ? (selectedButtonRef.current ?? disclosureRef.current)
                        : disclosureRef.current
                      returnFocus?.focus()
                      setSelection(null)
                    }}
                    type="button"
                  >
                    Return to galaxy overview
                  </button>
                </div>
              </section>
            )}
          </div>
        </section>
      )}
    </>
  )
}
