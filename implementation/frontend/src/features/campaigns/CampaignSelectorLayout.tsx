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
import { buildGalaxy, type GalaxyPlanet } from './galaxyModel'
import { galaxyPlanetsOptions } from './galaxyPlanets'
import type { SceneBounds } from './orreryCamera'
import { catalogueNumeral, planetKey, stepCampaign } from './orreryLayout'
import { GalaxyBackdrop } from './GalaxyBackdrop'
import { UnchartedAnnotation } from './UnchartedAnnotation'
import { WorldAnnotation } from './WorldAnnotation'
import { WorldLedger, compactViewport, type ClaimedPlanet } from './WorldLedger'
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
  // A selection is a planet, whether or not a campaign sits on it.
  const [selection, setSelection] = useState<{ slot: number; direction?: -1 | 1 } | null>(null)
  const locationState = location.state as { campaignNotice?: string } | null
  const [notice] = useState(() =>
    locationState?.campaignNotice === 'deleted'
      ? 'Campaign deleted.'
      : locationState?.campaignNotice === 'left'
        ? 'You left the campaign.'
        : null,
  )
  const campaignsQuery = useQuery({
    ...campaignListOptions(userId),
    enabled: Boolean(userId) && !isCreating,
  })
  // Assignments only place campaigns. While they load, or if they fail, campaigns take
  // oldest-first planets, and the ledger never depends on them.
  const planetsQuery = useQuery({
    ...galaxyPlanetsOptions(userId),
    enabled: Boolean(userId) && !isCreating,
  })

  useEffect(() => {
    if (locationState?.campaignNotice) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, locationState?.campaignNotice, navigate])

  const galaxy = useMemo(
    () => buildGalaxy(campaignsQuery.data, planetsQuery.data),
    [campaignsQuery.data, planetsQuery.data],
  )
  const claimedPlanets = useMemo(
    () => galaxy.filter((planet): planet is ClaimedPlanet => planet.campaign !== null),
    [galaxy],
  )
  const selectedPlanet: GalaxyPlanet | undefined = selection ? galaxy[selection.slot] : undefined
  const selectedCampaign = selectedPlanet?.campaign ?? null
  const detailsOpen = Boolean(selectedPlanet)

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

  const orbitKeys = useMemo(() => galaxy.map(({ slot }) => planetKey(slot)), [galaxy])
  // The overview centres on the first campaign, or on planet I while there are none. Its
  // action waits for the campaign list, so it never offers a planet that is about to be claimed.
  const overviewFocus = claimedPlanets[0] ?? galaxy[0]
  const focalSlot = selectedPlanet?.slot ?? overviewFocus.slot
  const overviewPlanet = detailsOpen || campaignsQuery.data === undefined ? null : overviewFocus

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

  const selectPlanet = useCallback(
    (slot: number, direction?: -1 | 1) => {
      openedFromOverviewAction.current = false
      setSelection({ slot, direction })
      if (window.matchMedia?.(compactViewport).matches) {
        if (expanded && !direction) disclosureRef.current?.focus()
        setExpanded(false)
      }
    },
    [expanded],
  )

  function step(direction: -1 | 1) {
    const key = stepCampaign(orbitKeys, planetKey(focalSlot), direction)
    if (key) selectPlanet(orbitKeys.indexOf(key), direction)
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
    if (event.key === 'Escape' && selectedPlanet) {
      event.preventDefault()
      returnToOverview()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (orbitKeys.length < 2) return
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKey(event)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // The galaxy only shrinks when its outermost planet is released, which can strand a selection.
  if (selection && !selectedPlanet) {
    setSelection(null)
  }

  return (
    <>
      <GalaxyBackdrop
        planets={galaxy}
        orbitBounds={orbitBounds}
        targetSlot={focalSlot}
        interactive={!isCreating && !arriving}
        motionReduced={prefersReducedMotion}
        paused={paused}
        arrival={flight}
        onAvailabilityChange={changeAvailability}
        onSelect={selectPlanet}
        selectedSlot={selectedPlanet?.slot ?? null}
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
          data-details-open={detailsOpen}
        >
          <WorldLedger
            canPause={canPause}
            disclosureRef={disclosureRef}
            expanded={expanded}
            notice={notice}
            onExpandedChange={setExpanded}
            onRetry={() => void campaignsQuery.refetch()}
            onSelect={selectPlanet}
            onTogglePause={() => setPaused((value) => !value)}
            paused={paused}
            planets={claimedPlanets}
            selectedButtonRef={selectedButtonRef}
            selectedSlot={selectedPlanet?.slot ?? null}
            userId={userId}
            status={
              campaignsQuery.isPending ? 'pending' : campaignsQuery.isError ? 'error' : 'ready'
            }
          />

          <div aria-hidden="true" className="galaxy-orbit-space" ref={sceneRef} />

          <div className="galaxy-orbit-controls">
            {overviewPlanet && <p className="galaxy-prompt">Choose a world to approach</p>}
            {overviewPlanet && (
              <button
                className="galaxy-action galaxy-action--primary galaxy-view-campaign"
                onClick={() => {
                  selectPlanet(overviewPlanet.slot)
                  openedFromOverviewAction.current = true
                }}
                ref={viewCampaignRef}
                type="button"
              >
                <span>
                  View{' '}
                  {overviewPlanet.campaign?.name ??
                    `Uncharted World ${catalogueNumeral(overviewPlanet.slot)}`}
                </span>
              </button>
            )}
            {galaxy.length > 1 && (
              <nav aria-label="World orbit" className="galaxy-orbit-nav">
                <button className="galaxy-action" onClick={() => step(-1)} type="button">
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                    <path d="m10 4-4 4 4 4" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Previous world
                </button>
                <button className="galaxy-action" onClick={() => step(1)} type="button">
                  Next world
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
                    <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </nav>
            )}
          </div>

          <div className="galaxy-details-slot">
            <p aria-live="polite" className="visually-hidden">
              {selectedCampaign
                ? `Selected campaign: ${selectedCampaign.name}`
                : selectedPlanet
                  ? `Selected world: Uncharted World ${catalogueNumeral(selectedPlanet.slot)}`
                  : 'Galaxy overview'}
            </p>
            {selectedPlanet && !selectedCampaign && (
              <UnchartedAnnotation
                headingRef={detailsHeadingRef}
                onReturn={returnToOverview}
                slot={selectedPlanet.slot}
              />
            )}
            {selectedPlanet && selectedCampaign && (
              <WorldAnnotation
                campaign={selectedCampaign}
                headingRef={detailsHeadingRef}
                slot={selectedPlanet.slot}
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
