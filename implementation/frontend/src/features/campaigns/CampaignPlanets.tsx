import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  DoubleSide,
  RingGeometry,
  SphereGeometry,
  Vector3,
  Vector4,
  type Group,
  type Mesh,
} from 'three'
import type { OrbitBounds, OrbitSlot } from './campaignOrbit'
import { planetAppearance } from './planetModel'
import { planetRing, planetSurface, planetVertex } from './planetShaders'
import { useGalaxyTravel } from './useGalaxyTravel'

const globeGeometry = new SphereGeometry(1, 48, 32)
const ringGeometry = new RingGeometry(1.25, 1.67, 64)
const selectionGeometry = new RingGeometry(1.77, 1.81, 64)

type Appearance = ReturnType<typeof planetAppearance>

function surfaceUniforms({ type, palette, air, haze, seed }: Appearance) {
  const [low, mid, high, pale] = palette.map((hex) => new Color(hex))
  // Scatter major impacts over the sphere without a texture or a per-frame simulation.
  const impacts =
    type === 5
      ? Array.from({ length: 16 }, (_, i) => {
          const y = 1 - (2 * (i + 0.5)) / 16
          const latitudeRadius = Math.sqrt(1 - y * y)
          const longitude = i * 2.399963 + seed[0]
          const fraction = ((i * 0.618034 + seed[1]) % 1) ** 1.5
          const radius = 0.09 + fraction * 0.29
          return new Vector4(
            latitudeRadius * Math.cos(longitude),
            y,
            latitudeRadius * Math.sin(longitude),
            radius * radius,
          )
        })
      : Array.from({ length: 16 }, () => new Vector4(0, 1, 0, 1))

  return {
    uType: { value: type },
    uLow: { value: low },
    uMid: { value: mid },
    uHigh: { value: high },
    uPale: { value: pale },
    uAir: { value: new Color(air) },
    uHaze: { value: haze },
    uSeed: { value: new Vector3(...seed) },
    uImpacts: { value: impacts },
  }
}

function PlanetaryRing({ appearance }: { appearance: Appearance }) {
  const uniforms = useMemo(
    () => ({
      uDust: { value: new Color(appearance.palette[2]).lerp(new Color('#aa8e7e'), 0.45) },
      uIce: { value: new Color(appearance.palette[3]).lerp(new Color('#e9d9c7'), 0.65) },
      uPhase: { value: appearance.seed[1] },
    }),
    [appearance],
  )

  return (
    <mesh geometry={ringGeometry} rotation={[appearance.ringInclination, 0, 0]}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={planetVertex}
        fragmentShader={planetRing}
        side={DoubleSide}
        transparent
        depthWrite={false}
        forceSinglePass
      />
    </mesh>
  )
}

function Planet({
  id,
  appearance,
  registerPlanet,
  animate,
  selected,
  onSelect,
}: {
  id: string
  appearance: Appearance
  registerPlanet: (id: string, group: Group | null) => void
  animate: boolean
  selected: boolean
  onSelect: ((id: string) => void) | undefined
}) {
  const globe = useRef<Mesh>(null)
  const canvas = useThree((state) => state.gl.domElement)
  const register = useCallback(
    (group: Group | null) => registerPlanet(id, group),
    [registerPlanet, id],
  )
  const uniforms = useMemo(() => surfaceUniforms(appearance), [appearance])

  useEffect(
    () => () => {
      canvas.removeAttribute('data-planet-hover')
    },
    [canvas, onSelect],
  )

  useFrame((_, delta) => {
    if (animate && globe.current) globe.current.rotation.y += Math.min(delta, 0.1) * appearance.spin
  })

  return (
    <group
      ref={register}
      visible={false}
      onClick={
        onSelect &&
        ((event) => {
          if (!event.eventObject.visible) return
          event.stopPropagation()
          onSelect(id)
        })
      }
      onPointerOver={
        onSelect &&
        ((event) => {
          if (!event.eventObject.visible) return
          event.stopPropagation()
          canvas.setAttribute('data-planet-hover', '')
        })
      }
      onPointerOut={
        onSelect &&
        (() => {
          canvas.removeAttribute('data-planet-hover')
        })
      }
    >
      <group rotation={[0, 0, appearance.tilt]}>
        <mesh geometry={globeGeometry} ref={globe}>
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={planetVertex}
            fragmentShader={planetSurface}
          />
        </mesh>
        {appearance.ring && <PlanetaryRing appearance={appearance} />}
      </group>
      {selected && (
        <mesh geometry={selectionGeometry} position={[0, 0, -0.06]}>
          <meshBasicMaterial color="#f5d3ae" toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

export function CampaignPlanets({
  slots,
  ids,
  order,
  bounds,
  labels,
  animate,
  interactive,
  visible,
  motionReduced,
  selectedId,
  stepDirection,
  backgroundOffset,
  onSelect,
  onSettled,
}: {
  slots: OrbitSlot[]
  ids: string[]
  order: string[]
  bounds: OrbitBounds | null
  labels: RefObject<HTMLDivElement | null>
  animate: boolean
  interactive: boolean
  visible: boolean
  motionReduced: boolean
  selectedId: string | null
  stepDirection?: -1 | 1
  backgroundOffset: RefObject<number>
  onSelect: (id: string) => void
  onSettled: () => void
}) {
  const appearances = useMemo(() => new Map(ids.map((id) => [id, planetAppearance(id)])), [ids])
  const registerPlanet = useGalaxyTravel({
    slots,
    bounds,
    order,
    labels,
    appearances,
    selectedId,
    stepDirection,
    backgroundOffset,
    visible,
    interactive,
    motionReduced,
    onSettled,
  })

  return ids.map((id) => (
    <Planet
      key={id}
      id={id}
      appearance={appearances.get(id)!}
      registerPlanet={registerPlanet}
      animate={animate}
      selected={id === selectedId}
      onSelect={interactive ? onSelect : undefined}
    />
  ))
}
