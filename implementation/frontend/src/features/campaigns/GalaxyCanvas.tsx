import { Canvas, useThree } from '@react-three/fiber'
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
import { CampaignPlanets } from './CampaignPlanets'
import { DeepSpace } from './DeepSpace'
import { positionCampaignOrbit } from './campaignOrbit'
import { cameraFov, overviewPose, type SpaceMotion } from './campaignTravel'

const cameraOptions = { position: overviewPose.position, fov: cameraFov, far: 180 }

function GalaxyScene({
  animate,
  spaceMotion,
  onContextLost,
}: {
  animate: boolean
  spaceMotion: RefObject<SpaceMotion>
  onContextLost: () => void
}) {
  const canvas = useThree((state) => state.gl.domElement)

  useEffect(() => {
    canvas.addEventListener('webglcontextlost', onContextLost)
    return () => canvas.removeEventListener('webglcontextlost', onContextLost)
  }, [canvas, onContextLost])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[-10, 12, 9]} intensity={2} />
      <DeepSpace animate={animate} spaceMotion={spaceMotion} />
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
  targetId,
  interactive,
  motionReduced,
  paused,
  onAvailabilityChange,
  onSelect,
  selectedId,
  stepDirection,
}: GalaxyProps) {
  const labels = useRef<HTMLDivElement>(null)
  const spaceMotion = useRef<SpaceMotion>({ offset: 0, streak: 0 })
  const order = useMemo(() => planets.map(({ id }) => id), [planets])
  const slots = useMemo(
    () => (orbitBounds ? positionCampaignOrbit(order, targetId, orbitBounds) : []),
    [orbitBounds, order, targetId],
  )
  const names = useMemo(() => new Map(planets.map(({ id, name }) => [id, name])), [planets])
  const destinations = useMemo(() => slots.map(({ id }) => id), [slots])
  const destinationKey = destinations.join(',')
  const [roster, setRoster] = useState({ key: destinationKey, ids: destinations })
  if (roster.key !== destinationKey) {
    const departing = roster.ids.filter((id) => !destinations.includes(id) && names.has(id))
    setRoster({ key: destinationKey, ids: [...destinations, ...departing.slice(0, 3)] })
  }
  const ids = useMemo(() => roster.ids.filter((id) => names.has(id)), [roster.ids, names])
  const releaseDeparting = useCallback(() => {
    setRoster((current) =>
      current.key === destinationKey && current.ids.length > destinations.length
        ? { key: destinationKey, ids: destinations }
        : current,
    )
  }, [destinationKey, destinations])

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
          onContextLost={handleContextLost}
        />
        <CampaignPlanets
          animate={animate}
          spaceMotion={spaceMotion}
          bounds={orbitBounds}
          ids={ids}
          interactive={interactive}
          labels={labels}
          motionReduced={motionReduced}
          onSelect={onSelect}
          onSettled={releaseDeparting}
          order={order}
          visible={isVisible}
          slots={slots}
          selectedId={selectedId}
          stepDirection={stepDirection}
        />
      </Canvas>
      <div className="galaxy-planet-labels" ref={labels}>
        {ids.map((id) => (
          <span
            className="galaxy-planet-label"
            data-campaign-id={id}
            data-focal={id === slots[0]?.id}
            data-selected={id === selectedId}
            key={id}
            style={orbitBounds ? { maxWidth: `min(12rem, ${orbitBounds.width}px)` } : undefined}
          >
            {names.get(id)}
          </span>
        ))}
      </div>
    </>
  )
}
