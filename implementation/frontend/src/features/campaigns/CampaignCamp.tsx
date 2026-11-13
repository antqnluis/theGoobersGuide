import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { availableLocations, type CampLocation } from './camp/campLayout'
import { panelSideForWorldX } from './camp/campCamera'
import { campRamps, type CampWorld } from './camp/campPalette'
import { hitRect, isInFrame } from './camp/campProjection'
import { useCampView } from './camp/useCampView'
import { useDestinationDialog } from './camp/useDestinationDialog'
import './camp/camp.css'

const CampLandscape = lazy(() => import('./camp/CampLandscape'))

/** Reports a failed chunk or render so the camp falls back to its gradient. */
class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFailure()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function CampaignCamp({
  title,
  notice,
  world,
  isOwner,
  isDeleting,
  cancelDelete,
  overview,
  party,
  settings,
}: {
  title: ReactNode
  notice: string | null
  /** The campaign's planet: its type and palette colour the camp. */
  world: CampWorld
  isOwner: boolean
  isDeleting: boolean
  cancelDelete: () => void
  overview: ReactNode
  party: ReactNode
  settings: ReactNode
}) {
  const [artFailed, setArtFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const campRef = useRef<HTMLElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const measure = useCampView(sceneRef)
  const { active, bodyRef, close, closeRef, dialogRef, open } = useDestinationDialog({
    cancelDelete,
    isDeleting,
    isOwner,
    scope: campRef,
  })
  const available = availableLocations(isOwner)
  const panelSide = active ? panelSideForWorldX(active.world.x) : 'right'
  const ramps = useMemo(() => campRamps(world), [world])
  const onReady = useCallback(() => setReady(true), [])
  const onFail = useCallback(() => setArtFailed(true), [])

  // The same colours as the art, as a gradient for before it loads and if it fails.
  const sceneStyle = {
    '--camp-sky-top': ramps.sky[0],
    '--camp-sky-low': ramps.sky[3],
    '--camp-ground-top': ramps.ground[2],
    '--camp-ground-low': ramps.ground[0],
  } as CSSProperties

  const placeItems = available.map((location) => (
    <li key={location.id}>
      <button
        aria-haspopup="dialog"
        className="camp-places__destination"
        data-location={location.id}
        onClick={(event) => open(location, event.currentTarget)}
        type="button"
      >
        {location.label}
        <span>{location.place}</span>
      </button>
    </li>
  ))

  function sign(location: CampLocation) {
    if (!measure) return null
    const rect = hitRect(location.world, location.hit, measure.view, measure.dpr)
    const inFrame = isInFrame(rect, { width: measure.cssWidth, height: measure.cssHeight })
    return (
      <button
        aria-haspopup="dialog"
        className="camp-sign"
        data-active={active?.id === location.id || undefined}
        data-location={location.id}
        data-camp-sign
        data-plate={location.plate}
        data-plate-align={location.plateAlign}
        key={location.id}
        onClick={(event) => open(location, event.currentTarget)}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          // Off-frame buttons leave the tab order and the click targets.
          visibility: inFrame ? 'visible' : 'hidden',
        }}
        type="button"
      >
        <span>{location.label}</span>
      </button>
    )
  }

  return (
    <section
      aria-labelledby="campaign-workspace-heading"
      className="camp"
      data-art-failed={artFailed || undefined}
      data-camp-ready={ready || undefined}
      data-camp-state={active?.id ?? 'idle'}
      data-camp-world={world.kind}
      ref={campRef}
    >
      <div className="camp__heading">
        {title}
        {notice && !active && (
          <p className="camp__notice" role="status">
            {notice}
          </p>
        )}
      </div>

      <div className="camp-scene" ref={sceneRef} style={sceneStyle}>
        {!artFailed && measure && (
          <SceneBoundary onFailure={onFail}>
            <Suspense fallback={null}>
              <CampLandscape
                dpr={measure.dpr}
                onFail={onFail}
                onReady={onReady}
                view={measure.view}
                world={world}
              />
            </Suspense>
          </SceneBoundary>
        )}
        {!artFailed && ready && available.map(sign)}
      </div>

      <nav aria-labelledby="camp-places-heading" className="camp-directory">
        <h2 id="camp-places-heading">Places</h2>
        <ul aria-label="Camp places">{placeItems}</ul>
      </nav>

      <dialog
        aria-labelledby={active ? `camp-${active.id}-heading` : undefined}
        className="camp-ledger"
        data-panel-side={panelSide}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        ref={dialogRef}
      >
        <div className="camp-ledger__layout">
          <header className="camp-ledger__bar">
            <button
              className="camp-ledger__back"
              disabled={isDeleting}
              onClick={close}
              ref={closeRef}
              type="button"
            >
              Back to camp
            </button>
          </header>
          <div className="camp-ledger__body" ref={bodyRef}>
            {notice && active && (
              <p className="camp-ledger__notice" role="status">
                {notice}
              </p>
            )}
            <section hidden={active?.id !== 'overview'}>{overview}</section>
            <section hidden={active?.id !== 'party'}>{party}</section>
            {isOwner && <section hidden={active?.id !== 'settings'}>{settings}</section>}
          </div>
        </div>
      </dialog>
    </section>
  )
}
