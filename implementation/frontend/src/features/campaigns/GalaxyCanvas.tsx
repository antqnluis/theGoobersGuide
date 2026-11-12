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
import { AdditiveBlending, Color, type Group, type ShaderMaterial } from 'three'

import type { GalaxyProps } from './GalaxyBackdrop'
import { CampaignPlanets } from './CampaignPlanets'
import { positionCampaignOrbit } from './campaignOrbit'
import { cameraFov, overviewPose } from './campaignTravel'

const cameraOptions = { position: overviewPose.position, fov: cameraFov, far: 120 }
const starfieldDefines = { SCROLLING_STARFIELD: 1 }
const initialGalaxyRotation = -0.24

const vertexShader = /* glsl */ `
  attribute float diameter;
  attribute float intensity;
  attribute float phase;
  attribute vec3 tint;
  uniform float pixelRatio;
  uniform float backgroundOffset;
  varying float vPhase;
  varying vec3 vTint;
  varying float vIntensity;

  void main() {
    vec3 point = position;
    #ifdef SCROLLING_STARFIELD
      // Wrap stars beyond the visible edges, including on wide viewports.
      float depth = ${overviewPose.position[2].toFixed(1)} - point.z;
      float span = max(2.1, 2.0 / projectionMatrix[0][0] + 0.75);
      point.x = (fract(point.x + 0.5 - backgroundOffset) - 0.5) * span * depth;
    #endif
    vec4 view = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(diameter * pixelRatio * 40.0 / -view.z, 1.0, 192.0);
    vTint = tint;
    vIntensity = intensity;
    vPhase = phase;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vTint;
  varying float vIntensity;
  varying float vPhase;
  uniform float uTime;
  void main() {
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float light = exp(-4.8 * radius * radius) * (1.0 - smoothstep(0.55, 1.0, radius));
    float brightStar = smoothstep(0.54, 0.92, vIntensity);
    float shimmer = mix(1.0, 0.88 + 0.12 * sin(uTime * 0.7 + vPhase * 6.28318), brightStar);
    gl_FragColor = vec4(vTint, light * vIntensity * shimmer);
  }
`

type Layer = 'field' | 'spiral' | 'nebula'

function makePoints(layer: Layer) {
  const count = { field: 4400, spiral: 9800, nebula: 630 }[layer]
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const diameters = new Float32Array(count)
  const intensities = new Float32Array(count)
  const phases = new Float32Array(count)
  const palette = ['#a2b5ff', '#7277de', '#f1a89c', '#ffdcc0', '#ecf2ff'].map((hex) =>
    new Color(hex).convertLinearToSRGB(),
  )
  let seed = { field: 9011, spiral: 1477, nebula: 6817 }[layer]
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = 0; i < count; i++) {
    let color: Color
    const index = i * 3
    if (layer === 'field') {
      const depth = 9 + random() * 82
      positions[index] = random() - 0.5
      positions[index + 1] = (random() - 0.5) * depth
      positions[index + 2] = overviewPose.position[2] - depth
      const bright = random() > 0.982
      diameters[i] = bright ? 3 + random() * 3 : 0.65 + random() * 1.5
      intensities[i] = bright ? 0.86 : 0.24 + random() * 0.32
      color = palette[random() > 0.25 ? 4 : 0]
    } else {
      const haze = layer === 'nebula'
      const radius = Math.pow(random(), 1.35) * 23
      const arm = (i % 3) * ((2 * Math.PI) / 3)
      const scatter = (random() + random() + random() - 1.5) * (haze ? 1.05 : 0.75)
      const angle = arm + 1.75 * Math.log(1 + radius * 0.62) + scatter
      positions[index] = Math.cos(angle) * radius
      positions[index + 1] = Math.sin(angle) * radius
      positions[index + 2] = (random() - 0.5) * (2.3 - radius * 0.07)
      const bright = random() > 0.975
      diameters[i] = haze ? 28 + random() * 98 : bright ? 3.5 + random() * 3 : 1 + random()
      intensities[i] = (1 - radius / 27) * (haze ? 0.037 : bright ? 0.95 : 0.29 + random() * 0.4)
      color = palette[radius < 3 ? 3 : radius < 8 ? 2 : random() > 0.48 ? 0 : 1]
    }
    colors.set([color.r, color.g, color.b], index)
    phases[i] = random()
  }

  return { positions, colors, diameters, intensities, phases }
}

function StarLayer({
  layer,
  animate,
  backgroundOffset,
}: {
  layer: Layer
  animate: boolean
  backgroundOffset?: RefObject<number>
}) {
  const data = useMemo(() => makePoints(layer), [layer])
  const pixelRatio = useThree((state) => state.viewport.dpr)
  const uniforms = useMemo(
    () => ({
      pixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      backgroundOffset: { value: 0 },
    }),
    [pixelRatio],
  )

  const material = useRef<ShaderMaterial>(null)

  const time = useRef(0)
  useFrame((_, delta) => {
    if (animate) time.current += Math.min(delta, 0.1)
    if (material.current) {
      material.current.uniforms.uTime.value = time.current
      if (backgroundOffset)
        material.current.uniforms.backgroundOffset.value = backgroundOffset.current % 1
    }
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-tint" args={[data.colors, 3]} />
        <bufferAttribute attach="attributes-diameter" args={[data.diameters, 1]} />
        <bufferAttribute attach="attributes-intensity" args={[data.intensities, 1]} />
        <bufferAttribute attach="attributes-phase" args={[data.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        blending={AdditiveBlending}
        defines={backgroundOffset ? starfieldDefines : undefined}
        depthWrite={false}
        fragmentShader={fragmentShader}
        toneMapped={false}
        transparent
        uniforms={uniforms}
        vertexShader={vertexShader}
      />
    </points>
  )
}

function GalaxyScene({
  animate,
  backgroundOffset,
  onContextLost,
}: {
  animate: boolean
  backgroundOffset: RefObject<number>
  onContextLost: () => void
}) {
  const canvas = useThree((state) => state.gl.domElement)
  const aspect = useThree((state) => state.size.width / state.size.height)
  const galaxy = useRef<Group>(null)
  const ambientRotation = useRef(0)

  useFrame((_, delta) => {
    if (animate) ambientRotation.current += Math.min(delta, 0.1) * 0.006
    if (galaxy.current) {
      galaxy.current.rotation.z =
        initialGalaxyRotation +
        ambientRotation.current -
        (backgroundOffset.current % 1) * 2 * Math.PI
    }
  })

  useEffect(() => {
    canvas.addEventListener('webglcontextlost', onContextLost)
    return () => canvas.removeEventListener('webglcontextlost', onContextLost)
  }, [canvas, onContextLost])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[-10, 12, 9]} intensity={2} />
      <StarLayer animate={animate} backgroundOffset={backgroundOffset} layer="field" />
      <group
        ref={galaxy}
        position={[aspect > 1 ? 2.5 : 0, aspect > 1 ? 0 : 1, 0]}
        rotation={[0.94, 0.09, initialGalaxyRotation]}
        scale={Math.min(1, Math.max(0.52, aspect * 0.8))}
      >
        <StarLayer animate={animate} layer="nebula" />
        <StarLayer animate={animate} layer="spiral" />
      </group>
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
  const backgroundOffset = useRef(0)
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
          backgroundOffset={backgroundOffset}
          onContextLost={handleContextLost}
        />
        <CampaignPlanets
          animate={animate}
          backgroundOffset={backgroundOffset}
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
