import {
  useCallback,
  useEffectEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { campaignListOptions } from './campaignQueries'
import { getCampaignMemberCount } from './campaignService'
import type { SceneBounds } from './orreryCamera'
import { getOrbitTarget, stepCampaign } from './orreryLayout'
import { orderPlanets } from './planetModel'
import { GalaxyBackdrop } from './GalaxyBackdrop'
import { WorldAnnotation } from './WorldAnnotation'
import { WorldLedger, compactViewport } from './WorldLedger'
import { useArrival } from '../arrival/useArrival'
import { useAuth } from '../auth/useAuth'
import './galaxy.css'

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
  const { flight, stage, reportGalaxy } = useArrival()
  const location = useLocation()
  const navigate = useNavigate()
  const isCreating = Boolean(useMatch('/app/campaigns/new'))
  const selectedButtonRef = useRef<HTMLButtonElement>(null)
  const viewCampaignRef = useRef<HTMLButtonElement>(null)
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null)
  const openedFromOverviewAction = useRef(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [orbitBounds, setOrbitBounds] = useState<SceneBounds | null>(null)
  const disclosureRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(() => !window.matchMedia?.(compactViewport).matches)
  const [webglReady, setWebglReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const prefersReducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotion)
  const canPause = webglReady && !prefersReducedMotion
  const arriving = stage !== 'idle' && stage !== 'fading'
  const changeAvailability = useCallback(
    (ready: boolean) => {
      setWebglReady(ready)
      reportGalaxy(ready)
    },
    [reportGalaxy],
  )
  const [selection, setSelection] = useState<{ id: string; direction?: -1 | 1 } | null>(null)
  const selectedId = selection?.id ?? null
  const locationState = location.state as { campaignNotice?: string } | null
  const [notice] = useState(() =>
    locationState?.campaignNotice === 'deleted' ? 'Campaign deleted.' : null,
  )
  const campaignsQuery = useQuery({
    ...campaignListOptions(userId),
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
  const orbitTarget = getOrbitTarget(orbitIds, selectedId)
  const overviewCampaign = detailsOpen ? null : planets[0]

  useLayoutEffect(() => {
    if (!openedFromOverviewAction.current || isCreating) return
    if (detailsOpen) {
      detailsHeadingRef.current?.focus({ preventScroll: true })
    } else {
      const returnFocus = viewCampaignRef.current ?? disclosureRef.current
      returnFocus?.focus({ preventScroll: true })
      openedFromOverviewAction.current = false
    }
  }, [detailsOpen, isCreating])

  const memberCountQuery = useQuery({
    queryKey: ['campaigns', 'member-count', selectedCampaign?.id, userId],
    queryFn: () => getCampaignMemberCount(selectedCampaign!.id),
    enabled: Boolean(userId && selectedCampaign) && !isCreating,
  })
  const memberCount = memberCountQuery.data

  const selectCampaign = useCallback(
    (id: string, direction?: -1 | 1) => {
      openedFromOverviewAction.current = false
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

  function returnToOverview() {
    const returnFocus = expanded
      ? (selectedButtonRef.current ?? disclosureRef.current)
      : disclosureRef.current
    if (!openedFromOverviewAction.current) returnFocus?.focus()
    setSelection(null)
  }

  // Arrow keys travel between worlds and Escape pulls back to the chart, unless
  // the key already belongs to something the person is working in.
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (isCreating || event.defaultPrevented) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, dialog, [contenteditable="true"]')) return
    if (event.key === 'Escape' && selectedCampaign) {
      event.preventDefault()
      returnToOverview()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (orbitIds.length < 2) return
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKey(event)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  if (campaignsQuery.isSuccess && selectedId && !selectedCampaign) {
    setSelection(null)
  }

  return (
    <>
      <GalaxyBackdrop
        planets={planets}
        orbitBounds={orbitBounds}
        targetId={orbitTarget}
        interactive={!isCreating && !arriving}
        motionReduced={prefersReducedMotion}
        paused={paused}
        arrival={flight}
        onAvailabilityChange={changeAvailability}
        onSelect={selectCampaign}
        selectedId={selectedCampaign?.id ?? null}
        memberCount={memberCount}
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
          <WorldLedger
            canPause={canPause}
            disclosureRef={disclosureRef}
            expanded={expanded}
            notice={notice}
            onExpandedChange={setExpanded}
            onRetry={() => void campaignsQuery.refetch()}
            onSelect={selectCampaign}
            onTogglePause={() => setPaused((value) => !value)}
            paused={paused}
            planets={planets}
            selectedButtonRef={selectedButtonRef}
            selectedId={selectedId}
            userId={userId}
            status={
              campaignsQuery.isPending ? 'pending' : campaignsQuery.isError ? 'error' : 'ready'
            }
          />

          <div aria-hidden="true" className="galaxy-orbit-space" ref={sceneRef} />

          <div className="galaxy-orbit-controls">
            {overviewCampaign && <p className="galaxy-prompt">Choose a world to approach</p>}
            {overviewCampaign && (
              <button
                className="galaxy-action galaxy-action--primary galaxy-view-campaign"
                onClick={() => {
                  selectCampaign(overviewCampaign.id)
                  openedFromOverviewAction.current = true
                }}
                ref={viewCampaignRef}
                type="button"
              >
                <span>View {overviewCampaign.name}</span>
              </button>
            )}
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
          </div>

          <div className="galaxy-details-slot">
            <p aria-live="polite" className="visually-hidden">
              {selectedCampaign ? `Selected campaign: ${selectedCampaign.name}` : 'Galaxy overview'}
            </p>
            {selectedCampaign && (
              <WorldAnnotation
                campaign={selectedCampaign}
                headingRef={detailsHeadingRef}
                index={planets.indexOf(selectedCampaign)}
                memberCount={memberCount}
                memberCountFailed={memberCountQuery.isError}
                onRetryMemberCount={() => void memberCountQuery.refetch()}
                onReturn={returnToOverview}
              />
            )}
          </div>
        </section>
      )}
    </>
  )
}
