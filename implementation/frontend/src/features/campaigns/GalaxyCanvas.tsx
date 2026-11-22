import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'

import type { GalaxyProps } from './GalaxyBackdrop'
import { DeepSpace } from './DeepSpace'
import { kindleBoost, type HearthBoost } from './hearthBoost'
import { HearthStar } from './HearthStar'
import { OrbitRings, type RingHighlight } from './OrbitRings'
import { OrreryWorlds } from './OrreryWorlds'
import { cameraFov, glideDuration, type ArrivalFlight, type SpaceMotion } from './orreryCamera'
import { catalogueNumeral, galaxyLayout, planetKey } from './orreryLayout'

// The rig places the camera before the first frame is drawn.
const cameraOptions = { position: [0, 12, 30] as const, fov: cameraFov, near: 0.1, far: 400 }

function GalaxyScene({
  animate,
  spaceMotion,
  arrival,
  onContextLost,
}: {
  animate: boolean
  spaceMotion: RefObject<SpaceMotion>
  arrival: RefObject<ArrivalFlight>
  onContextLost: () => void
}) {
  const canvas = useThree((state) => state.gl.domElement)
  const boost = useRef<HearthBoost>({ value: 1 })

  // Signing in from the doorway, the hearth takes to you as the sky it had dissolves.
  useFrame(() => {
    const flight = arrival.current
    boost.current.value =
      flight.from && flight.phase === 'flying' ? kindleBoost(flight.progress * glideDuration) : 1
  })

  useEffect(() => {
    canvas.addEventListener('webglcontextlost', onContextLost)
    return () => canvas.removeEventListener('webglcontextlost', onContextLost)
  }, [canvas, onContextLost])

  return (
    <>
      <DeepSpace animate={animate} spaceMotion={spaceMotion} />
      <HearthStar animate={animate} boost={boost} />
    </>
  )
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

export default function GalaxyCanvas({
  planets,
  orbitBounds,
  targetSlot,
  interactive,
  motionReduced,
  paused,
  onAvailabilityChange,
  onSelect,
  selectedSlot,
  memberCount,
  arrival,
}: GalaxyProps) {
  const labels = useRef<HTMLDivElement>(null)
  const spaceMotion = useRef<SpaceMotion>({ offset: 0, streak: 0, radial: 0 })
  const highlight = useRef<RingHighlight>({ focus: -1, hover: -1 })
  // The layout depends only on how many planets there are, so claiming one never moves or
  // remounts any of them.
  const layout = useMemo(() => galaxyLayout(planets.length), [planets.length])
  const claimed = useMemo(() => planets.map(({ campaign }) => campaign !== null), [planets])
  const claimedRings = useMemo(() => {
    const rings = layout.rings.map(() => false)
    for (const { ring, index } of layout.worlds) rings[ring] ||= claimed[index] ?? false
    return rings
  }, [layout, claimed])

  const [contextLost, setContextLost] = useState(false)
  const handleContextLost = useCallback(() => {
    setContextLost(true)
    onAvailabilityChange(false)
  }, [onAvailabilityChange])
  const isVisible = useSyncExternalStore(subscribeToVisibility, () => !document.hidden)
  const animate = isVisible && !motionReduced && !paused

  if (contextLost) return null

  return (
    <>
      <Canvas
        camera={cameraOptions}
        dpr={[1, 1.5]}
        frameloop={isVisible ? (animate ? 'always' : 'demand') : 'never'}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute('data-galaxy-ready', '')
          onAvailabilityChange(true)
        }}
      >
        <GalaxyScene
          animate={animate}
          spaceMotion={spaceMotion}
          arrival={arrival}
          onContextLost={handleContextLost}
        />
        <OrbitRings
          arrival={arrival}
          claimedRings={claimedRings}
          highlight={highlight}
          rings={layout.rings}
        />
        <OrreryWorlds
          animate={animate}
          arrival={arrival}
          bounds={orbitBounds}
          claimed={claimed}
          extent={layout.extent}
          highlight={highlight}
          interactive={interactive}
          labels={labels}
          moonCount={memberCount}
          motionReduced={motionReduced}
          onSelect={onSelect}
          selectedSlot={selectedSlot}
          spaceMotion={spaceMotion}
          visible={isVisible}
          worlds={layout.worlds}
        />
      </Canvas>
      <div className="galaxy-planet-labels" ref={labels}>
        {planets.map(({ slot, campaign }) => (
          <span
            className="galaxy-planet-label"
            data-campaign-id={campaign?.id}
            data-catalogue={catalogueNumeral(slot)}
            data-claimed={campaign !== null}
            data-focal={slot === targetSlot}
            data-planet-key={planetKey(slot)}
            data-selected={slot === selectedSlot}
            key={slot}
            style={orbitBounds ? { maxWidth: `min(12rem, ${orbitBounds.width}px)` } : undefined}
          >
            {campaign ? campaign.name : 'Uncharted'}
          </span>
        ))}
      </div>
    </>
  )
}
