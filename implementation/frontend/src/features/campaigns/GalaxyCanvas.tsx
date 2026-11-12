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
import { DeepSpace } from './DeepSpace'
import { HearthStar } from './HearthStar'
import { OrbitRings, type RingHighlight } from './OrbitRings'
import { OrreryWorlds } from './OrreryWorlds'
import { cameraFov, type SpaceMotion } from './orreryCamera'
import { catalogueNumeral, orreryLayout } from './orreryLayout'

// The rig places the camera before the first frame is drawn.
const cameraOptions = { position: [0, 12, 30] as const, fov: cameraFov, near: 0.1, far: 400 }

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
      <DeepSpace animate={animate} spaceMotion={spaceMotion} />
      <HearthStar animate={animate} />
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
  memberCount,
}: GalaxyProps) {
  const labels = useRef<HTMLDivElement>(null)
  const spaceMotion = useRef<SpaceMotion>({ offset: 0, streak: 0 })
  const highlight = useRef<RingHighlight>({ focus: -1, hover: -1 })
  const layout = useMemo(() => orreryLayout(planets.map(({ id }) => id)), [planets])

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
        <OrbitRings highlight={highlight} rings={layout.rings} />
        <OrreryWorlds
          animate={animate}
          bounds={orbitBounds}
          extent={layout.extent}
          highlight={highlight}
          interactive={interactive}
          labels={labels}
          moonCount={memberCount}
          motionReduced={motionReduced}
          onSelect={onSelect}
          selectedId={selectedId}
          spaceMotion={spaceMotion}
          visible={isVisible}
          worlds={layout.worlds}
        />
      </Canvas>
      <div className="galaxy-planet-labels" ref={labels}>
        {planets.map(({ id, name }, index) => (
          <span
            className="galaxy-planet-label"
            data-campaign-id={id}
            data-catalogue={catalogueNumeral(index)}
            data-focal={id === targetId}
            data-selected={id === selectedId}
            key={id}
            style={orbitBounds ? { maxWidth: `min(12rem, ${orbitBounds.width}px)` } : undefined}
          >
            {name}
          </span>
        ))}
      </div>
    </>
  )
}
