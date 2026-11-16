import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from 'react'
import {
  availableLocations,
  campLocations,
  tent,
  waystone,
  waystoneHit,
  type CampLocation,
  type CampLocationId,
  type RosterMember,
} from './camp/campLayout'
import type { AdventurerAppearance } from './camp/adventurerAppearance'
import { figureSize, minNameUnit, overflowMarker, partyFigures } from './camp/campParty'
import {
  cameraToFrame,
  cameraToPlace,
  panelSideForWorldX,
  restCameraX,
  visibleWidth,
} from './camp/campCamera'
import { campRamps, type CampWorld } from './camp/campPalette'
import { hitRect, isInFrame, projectToDevice } from './camp/campProjection'
import type { RigFrame } from './camp/campRig'
import { useCampRig } from './camp/useCampRig'
import { useCampView, type CampMeasure } from './camp/useCampView'
import { useDestinationDialog } from './camp/useDestinationDialog'
import { CampSettings } from './camp/CampSettings'
import type { CampBackground } from './camp/campBackground'
import { ToastRegion } from './camp/CampToasts'
import type { CampToast } from './camp/useCampToasts'
import { UnsavedChangesDialog } from '../characters/UnsavedChangesDialog'
import './camp/camp.css'
import './camp/journal.css'

const CampLandscape = lazy(() => import('./camp/CampLandscape'))

/** How long the camera takes to frame a destination, and to come back. */
const openPanMs = 350
const closePanMs = 300
/** A wheel notch eases the camera over this long. */
const wheelPanMs = 160
/** A drag must travel this many CSS pixels before it pans instead of clicking. */
const dragThreshold = 6

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

/** What an unsaved-changes prompt calls the open page. */
function leaveName(id: CampLocationId | undefined) {
  if (id === 'notes') return 'the journal'
  if (id === 'adventures') return 'the map table'
  return 'the tent'
}

export function CampaignCamp({
  title,
  notice,
  world,
  background,
  onBackgroundChange,
  hue,
  onHueChange,
  onLeave,
  roster,
  characterNames,
  appearances,
  landfallKey,
  isOwner,
  isDeleting,
  cancelDelete,
  overview,
  party,
  characters,
  adventures,
  notes,
  settings,
  partyDrawer,
  characterFolio = false,
  partyFolio = false,
  unsavedChanges = {},
  onDestinationChange,
  toasts = [],
  onDismissToast = () => {},
}: {
  title: ReactNode
  notice: string | null
  /** The campaign's planet: its type and palette colour the camp. */
  world: CampWorld
  /** The player's background choice, and how to change it. */
  background: CampBackground
  onBackgroundChange: (background: CampBackground) => void
  /** The player's hue shift in degrees, and how to change it. */
  hue: number
  onHueChange: (hue: number) => void
  /** Returns to the galaxy: the waystone's pointer shortcut (the header link is the accessible one). */
  onLeave: () => void
  /** The loaded roster; empty while loading, on error, or when none is available. */
  roster: readonly RosterMember[]
  /** Each player's active character's name, by profile id; players without one use their own name. */
  characterNames?: ReadonlyMap<string, string>
  /** Looks players saved for this campaign, by profile id; others keep the default look. */
  appearances?: ReadonlyMap<string, AdventurerAppearance>
  /**
   * Set only for a fresh arrival from the galaxy: the history entry's key, so the
   * landfall descent plays once for that arrival and never again.
   */
  landfallKey: string | null
  isOwner: boolean
  isDeleting: boolean
  cancelDelete: () => void
  overview: ReactNode
  party: ReactNode
  characters: ReactNode
  adventures: ReactNode
  notes: ReactNode
  settings: ReactNode
  /** A collapsible tab on the Party page's side (appearance), shown only there. */
  partyDrawer?: ReactNode
  /** My characters shows a full sheet, so its journal opens wide. */
  characterFolio?: boolean
  /** The Party panel shows a character's sheet, so it opens wide too. */
  partyFolio?: boolean
  /** Destinations whose open page holds edits that closing would lose. */
  unsavedChanges?: Partial<Record<CampLocationId, boolean>>
  /** Called with the open destination (or null when closed) each time it changes. */
  onDestinationChange?: (id: CampLocationId | null) => void
  /** Brief confirmations, shown inside the journal. */
  toasts?: readonly CampToast[]
  onDismissToast?: (id: number) => void
}) {
  const [artFailed, setArtFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<CampLocationId | null>(null)
  const [focused, setFocused] = useState<CampLocationId | null>(null)
  const campRef = useRef<HTMLElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const measure = useCampView(sceneRef)
  const rig = useCampRig(landfallKey)
  const measureRef = useRef<CampMeasure | null>(null)
  useLayoutEffect(() => {
    measureRef.current = measure
  }, [measure])
  const { active, bodyRef, close, closeRef, dialogRef, open } = useDestinationDialog({
    cancelDelete,
    isDeleting,
    isOwner,
    scope: campRef,
  })
  const [leaveAsked, setLeaveAsked] = useState(false)
  const destinationRef = useRef(onDestinationChange)
  useEffect(() => {
    destinationRef.current = onDestinationChange
  })
  const activeId = active?.id ?? null
  useEffect(() => {
    destinationRef.current?.(activeId)
  }, [activeId])
  const available = availableLocations(isOwner)
  const panelSide = active ? panelSideForWorldX(active.world.x) : 'right'
  // Every destination wears the leather journal (the folio, wider, for a sheet). The
  // variant outlives the close so the exit animation keeps the same look.
  const wantedVariant: 'journal' | 'folio' =
    active?.id === 'characters'
      ? characterFolio
        ? 'folio'
        : 'journal'
      : active?.id === 'party' && partyFolio
        ? 'folio'
        : 'journal'
  const folioOpen =
    active?.id === 'party' ? partyFolio : active?.id === 'characters' ? characterFolio : false
  const [lastVariant, setLastVariant] = useState<'journal' | 'folio' | undefined>(undefined)
  if (active && lastVariant !== wantedVariant) setLastVariant(wantedVariant)
  const variant = active ? wantedVariant : (lastVariant ?? 'journal')
  const guarded = active ? Boolean(unsavedChanges[active.id]) : false

  /** Closing with unsaved edits asks first. */
  function requestClose() {
    if (isDeleting) return
    if (guarded) {
      // An unsaved-changes question inside the journal already has the focus.
      if (!dialogRef.current?.querySelector('[data-unsaved-prompt]')) setLeaveAsked(true)
      return
    }
    close()
  }
  // A click on the dimmed scene around the journal closes it, the same as Back to camp
  // (so it asks first about unsaved edits and waits out a pending change). Both the press
  // and the release must land outside the page, so dragging a text selection past its
  // edge never closes it.
  const pressedOutsideRef = useRef(false)
  const isOutside = (event: { clientX: number; clientY: number }, dialog: HTMLElement) => {
    const box = dialog.getBoundingClientRect()
    return (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
  }
  const ramps = useMemo(() => campRamps(world), [world])
  const { figures, overflow } = useMemo(
    () => partyFigures(roster, characterNames, appearances),
    [roster, characterNames, appearances],
  )
  const highlight = hovered ?? focused ?? active?.id ?? null
  const onReady = useCallback(() => setReady(true), [])
  const onFail = useCallback(() => setArtFailed(true), [])

  // The same colours as the art, as a gradient for before it loads and if it fails.
  const sceneStyle = {
    '--camp-sky-top': ramps.sky[0],
    '--camp-sky-low': ramps.sky[3],
    '--camp-ground-top': ramps.ground[2],
    '--camp-ground-low': ramps.ground[0],
  } as CSSProperties

  /** Moves every scene button and name plate to where the camera now puts it. */
  const place = useCallback((frame: Pick<RigFrame, 'cameraX' | 'cameraY'>) => {
    const current = measureRef.current
    const scene = sceneRef.current
    if (!current || !scene) return
    const view = { ...current.view, cameraX: frame.cameraX, cameraY: frame.cameraY }
    const viewport = { width: current.cssWidth, height: current.cssHeight }
    for (const sign of scene.querySelectorAll<HTMLElement>('[data-camp-sign]')) {
      const location = campLocations.find(({ id }) => id === sign.dataset.location)
      if (!location) continue
      const rect = hitRect(location.world, location.hit, view, current.dpr)
      sign.style.left = `${rect.left}px`
      sign.style.top = `${rect.top}px`
      sign.style.width = `${rect.width}px`
      sign.style.height = `${rect.height}px`
      // Off-frame buttons leave the tab order and the click targets.
      sign.style.visibility = isInFrame(rect, viewport) ? 'visible' : 'hidden'
    }
    const stone = scene.querySelector<HTMLElement>('[data-camp-waystone]')
    if (stone) {
      const rect = hitRect(waystone, waystoneHit, view, current.dpr)
      stone.style.left = `${rect.left}px`
      stone.style.top = `${rect.top}px`
      stone.style.width = `${rect.width}px`
      stone.style.height = `${rect.height}px`
      stone.style.visibility = isInFrame(rect, viewport) ? 'visible' : 'hidden'
    }
    // The tent's lantern glow follows it across the scene.
    const tentFoot = projectToDevice(tent, view)
    scene.style.setProperty('--camp-tent-x', `${tentFoot.x / current.dpr}px`)
    scene.style.setProperty('--camp-tent-y', `${(tentFoot.y - 20 * view.scale) / current.dpr}px`)
    for (const plate of scene.querySelectorAll<HTMLElement>('[data-camp-name-at]')) {
      const [x, y] = (plate.dataset.campNameAt ?? '').split(',').map(Number)
      const foot = projectToDevice({ x, y }, view)
      plate.style.left = `${foot.x / current.dpr}px`
      plate.style.top = `${(foot.y - figureSize.height * view.scale) / current.dpr}px`
    }
  }, [])

  // Positions are written straight to the DOM each frame, never through state.
  useLayoutEffect(() => {
    place(rig.frame())
  })

  useEffect(() => {
    const root = campRef.current
    const apply = (frame: RigFrame) => {
      if (!root) return
      if (frame.moved) place(frame)
      const attributes: Record<string, string | null> = {
        'data-camera-x': String(frame.cameraX),
        'data-animating': String(frame.animating),
        'data-camp-landfall': frame.landfall,
      }
      for (const [name, value] of Object.entries(attributes)) {
        if (value === null) root.removeAttribute(name)
        else if (root.getAttribute(name) !== value) root.setAttribute(name, value)
      }
    }
    apply(rig.frame())
    return rig.subscribe(apply)
  }, [rig, place])

  useEffect(() => {
    if (ready) rig.beginLandfall()
  }, [ready, rig])

  useEffect(() => {
    rig.setPanelOpen(active !== null)
  }, [active, rig])

  // Frames a destination on the open side of its panel, and comes back on close.
  const cameraMemory = useRef<{
    measure: CampMeasure | null
    location: CampLocation | null
    before: number | null
    folio: boolean
  }>({ measure: null, location: null, before: null, folio: false })
  useLayoutEffect(() => {
    if (!measure) return
    const memory = cameraMemory.current
    const { view, cssWidth } = measure
    const visible = visibleWidth(view.deviceWidth, view.scale)
    rig.configure({ visible, visibleHeight: view.deviceHeight / view.scale })
    const rest = restCameraX(visible)
    const frameFor = (location: CampLocation) => {
      const panel = dialogRef.current?.offsetWidth ?? cssWidth
      return cameraToFrame({
        worldX: location.world.x,
        visible,
        panelFraction: Math.min(1, panel / cssWidth),
      })
    }
    if (memory.measure !== measure) {
      // First measure, or a resize or zoom: settle at rest (or the panel's frame)
      // without animating, and forget where the camera was before.
      rig.jumpTo((active && frameFor(active)) ?? rest)
      memory.before = null
    } else if (active !== memory.location) {
      if (active) {
        // Remember where the camera was heading, so reopening mid-pan returns to rest.
        memory.before ??= rig.targetX
        const target = frameFor(active)
        if (target !== null) rig.panTo(target, openPanMs)
      } else {
        rig.panTo(memory.before ?? rest, closePanMs)
        memory.before = null
      }
    } else if (active && memory.folio !== folioOpen) {
      // The journal opened wider or narrower: frame the place in what is left.
      const target = frameFor(active)
      if (target !== null) rig.panTo(target, openPanMs)
    }
    memory.measure = measure
    memory.location = active
    memory.folio = folioOpen
  }, [measure, active, folioOpen, rig, dialogRef])

  // Drag or swipe the panorama; a small movement is still a click.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !measure) return
    let drag: { pointer: number; startX: number; startCamera: number; moving: boolean } | null =
      null
    let suppressClick = false
    const { dpr, view } = measure
    const onDown = (event: PointerEvent) => {
      suppressClick = false
      if (!event.isPrimary || event.button !== 0) return
      drag = {
        pointer: event.pointerId,
        startX: event.clientX,
        startCamera: rig.cameraX,
        moving: false,
      }
    }
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return
      const travelled = event.clientX - drag.startX
      if (!drag.moving) {
        if (Math.abs(travelled) < dragThreshold) return
        drag.moving = true
        scene.setPointerCapture(event.pointerId)
        scene.dataset.dragging = ''
      }
      rig.dragTo(drag.startCamera - Math.round((travelled * dpr) / view.scale))
    }
    const onEnd = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return
      if (drag.moving) suppressClick = true
      drag = null
      delete scene.dataset.dragging
    }
    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }
    // The wheel scrolls the panorama sideways. A vertical wheel does so only where
    // the page itself cannot scroll, so the stacked phone layout keeps its scroll.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      const page = document.documentElement
      if (!horizontal && page.scrollHeight > page.clientHeight + 1) return
      const lineHeight = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scene.clientHeight : 1
      const delta = (horizontal ? event.deltaX : event.deltaY) * lineHeight
      if (delta === 0) return
      event.preventDefault()
      const base = Math.round((delta * dpr) / view.scale)
      // Small steps (a trackpad) follow the fingers; a wheel notch eases.
      if (Math.abs(delta) < 40) rig.dragTo(rig.cameraX + base)
      else rig.panTo(rig.targetX + base, wheelPanMs)
    }
    scene.addEventListener('wheel', onWheel, { passive: false })
    scene.addEventListener('pointerdown', onDown)
    scene.addEventListener('pointermove', onMove)
    scene.addEventListener('pointerup', onEnd)
    scene.addEventListener('pointercancel', onEnd)
    scene.addEventListener('click', onClick, true)
    return () => {
      scene.removeEventListener('wheel', onWheel)
      scene.removeEventListener('pointerdown', onDown)
      scene.removeEventListener('pointermove', onMove)
      scene.removeEventListener('pointerup', onEnd)
      scene.removeEventListener('pointercancel', onEnd)
      scene.removeEventListener('click', onClick, true)
      delete scene.dataset.dragging
    }
  }, [measure, rig])

  /** Brings a place into view when it is focused, as for a keyboard user on a phone. */
  function reveal(location: CampLocation) {
    const current = measureRef.current
    if (!current || active) return
    const view = { ...current.view, cameraX: rig.cameraX, cameraY: rig.cameraY }
    const rect = hitRect(location.world, location.hit, view, current.dpr)
    if (isInFrame(rect, { width: current.cssWidth, height: current.cssHeight })) return
    const visible = visibleWidth(current.view.deviceWidth, current.view.scale)
    rig.panTo(cameraToPlace(location.world.x, visible), openPanMs)
  }

  // Hovering or keyboard-focusing a destination outlines it in the scene.
  function attention(id: CampLocationId) {
    return {
      onBlur: () => setFocused(null),
      onFocus: (event: FocusEvent<HTMLButtonElement>) => {
        if (event.currentTarget.matches(':focus-visible')) setFocused(id)
      },
      onPointerEnter: () => setHovered(id),
      onPointerLeave: () => setHovered(null),
    }
  }

  const placeItems = available.map((location) => (
    <li key={location.id}>
      <button
        aria-haspopup="dialog"
        className="camp-places__destination"
        data-location={location.id}
        onClick={(event) => open(location, event.currentTarget)}
        type="button"
        {...attention(location.id)}
        onFocus={(event) => {
          attention(location.id).onFocus(event)
          reveal(location)
        }}
      >
        {location.label}
        <span>{location.place}</span>
      </button>
    </li>
  ))

  function sign(location: CampLocation) {
    // Placed by `place` from the camera; see there.
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
        type="button"
        {...attention(location.id)}
      >
        <span>{location.label}</span>
      </button>
    )
  }

  /** Name plates above each seated adventurer; decoration, since Party lists everyone. */
  function names() {
    if (!measure) return null
    const { view, dpr } = measure
    // Too small to read or keep apart: the Party panel still names everyone.
    const unit = view.scale / dpr
    if (unit < minNameUnit) return null
    const plate = (key: string, point: { x: number; y: number }, text: string, extra?: string) => (
      <span
        className="camp-name"
        data-camp-name={extra}
        data-camp-name-at={`${point.x},${point.y}`}
        key={key}
      >
        {text}
      </span>
    )
    return (
      <div
        aria-hidden="true"
        className="camp-names"
        style={{ '--camp-unit': `${unit}px` } as CSSProperties}
      >
        {figures.map((figure) => plate(figure.id, figure, figure.label))}
        {overflow > 0 && plate('overflow', overflowMarker, `+${overflow}`, 'overflow')}
      </div>
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
      <CampSettings
        background={background}
        hue={hue}
        onChange={onBackgroundChange}
        onHueChange={onHueChange}
      />
      <div className="camp__heading">
        {title}
        {/* Always mounted, so a screen reader announces text added to it. */}
        <p className="camp__notice" role="status">
          {notice && !active ? notice : null}
        </p>
      </div>

      <div className="camp-scene" ref={sceneRef} style={sceneStyle}>
        {!artFailed && measure && (
          <SceneBoundary onFailure={onFail}>
            <Suspense fallback={null}>
              <CampLandscape
                dpr={measure.dpr}
                rig={rig}
                figures={figures}
                highlight={highlight}
                onFail={onFail}
                onReady={onReady}
                view={measure.view}
                world={world}
              />
            </Suspense>
          </SceneBoundary>
        )}
        {!artFailed && ready && names()}
        {!artFailed && ready && available.map(sign)}
        {/* A pointer shortcut only: "Back to campaigns" in the header is the accessible route. */}
        {!artFailed && ready && (
          <button
            aria-hidden="true"
            className="camp-waystone"
            data-camp-waystone
            onClick={onLeave}
            tabIndex={-1}
            type="button"
          >
            <span>Back to campaigns</span>
          </button>
        )}
      </div>

      <nav aria-labelledby="camp-places-heading" className="camp-directory">
        <h2 id="camp-places-heading">Places</h2>
        <ul aria-label="Camp places">{placeItems}</ul>
      </nav>

      <dialog
        aria-labelledby={active ? `camp-${active.id}-heading` : undefined}
        className="camp-ledger"
        data-panel-side={panelSide}
        data-variant={variant}
        onCancel={(event) => {
          event.preventDefault()
          requestClose()
        }}
        onClick={(event) => {
          const outside =
            event.target === event.currentTarget && isOutside(event, event.currentTarget)
          if (outside && pressedOutsideRef.current) requestClose()
          pressedOutsideRef.current = false
        }}
        onPointerDown={(event) => {
          // Only the dialog itself is the target when the press is on its backdrop (or its
          // own padding), never on the page content or a nested prompt.
          pressedOutsideRef.current =
            event.target === event.currentTarget && isOutside(event, event.currentTarget)
        }}
        ref={dialogRef}
      >
        <div className="camp-ledger__layout">
          <header className="camp-ledger__bar">
            <button
              className="camp-ledger__back"
              disabled={isDeleting}
              onClick={requestClose}
              ref={closeRef}
              type="button"
            >
              Back to camp
            </button>
          </header>
          <div className="camp-ledger__body" ref={bodyRef}>
            <p className="camp-ledger__notice" role="status">
              {notice && active ? notice : null}
            </p>
            <section hidden={active?.id !== 'overview'}>{overview}</section>
            <section hidden={active?.id !== 'party'}>{party}</section>
            <section hidden={active?.id !== 'characters'}>{characters}</section>
            <section hidden={active?.id !== 'adventures'}>{adventures}</section>
            <section hidden={active?.id !== 'notes'}>{notes}</section>
            {isOwner && <section hidden={active?.id !== 'settings'}>{settings}</section>}
          </div>
        </div>
        {active?.id === 'party' && !partyFolio && partyDrawer}
        <ToastRegion onDismiss={onDismissToast} toasts={toasts} />
        {leaveAsked && guarded && (
          <div data-unsaved-prompt>
            <UnsavedChangesDialog
              discardLabel="Discard and leave"
              message={`You have edits that haven't been saved. Leaving ${leaveName(active?.id)} now will discard them.`}
              onDiscard={() => {
                setLeaveAsked(false)
                close()
              }}
              onKeep={() => setLeaveAsked(false)}
            />
          </div>
        )}
      </dialog>
    </section>
  )
}
