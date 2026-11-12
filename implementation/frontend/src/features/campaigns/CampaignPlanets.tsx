import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Color,
  DoubleSide,
  MathUtils,
  RingGeometry,
  SphereGeometry,
  Vector3,
  Vector4,
  type Mesh,
} from 'three'
import type { OrbitSlot } from './campaignOrbit'
import { planetAppearance } from './planetModel'
import { planetRing, planetSurface, planetVertex } from './planetShaders'

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

const planeZ = 5
const center = new Vector3(0, 0, planeZ)

type PlanetPlacement = {
  id: string
  position: [number, number, number]
  radius: number
  appearance: Appearance
}

type Bounds = { left: number; top: number; right: number; bottom: number }

function overlaps(a: Bounds, b: Bounds) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function Planet({
  planet,
  animate,
  selected,
  onSelect,
}: {
  planet: PlanetPlacement
  animate: boolean
  selected: boolean
  onSelect: ((id: string) => void) | undefined
}) {
  const globe = useRef<Mesh>(null)
  const canvas = useThree((state) => state.gl.domElement)
  const { id, position, radius, appearance } = planet
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
      position={position}
      scale={radius}
      onClick={
        onSelect &&
        ((event) => {
          event.stopPropagation()
          onSelect(id)
        })
      }
      onPointerOver={
        onSelect &&
        ((event) => {
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
  labels,
  animate,
  selectedId,
  onSelect,
}: {
  slots: OrbitSlot[]
  labels: RefObject<HTMLDivElement | null>
  animate: boolean
  selectedId: string | null
  onSelect: ((id: string) => void) | undefined
}) {
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)
  const viewport = useThree((state) => state.viewport)
  const invalidate = useThree((state) => state.invalidate)
  const placements = useMemo(() => {
    const { width, height } = size
    const view = viewport.getCurrentViewport(camera, center, size)
    const worldPerPixel = view.height / Math.max(1, height)
    return slots.map(({ id, x, y, radius }): PlanetPlacement => {
      const appearance = planetAppearance(id)
      return {
        id,
        appearance,
        position: [(x - width / 2) * worldPerPixel, (height / 2 - y) * worldPerPixel, planeZ],
        radius: radius * worldPerPixel * appearance.size,
      }
    })
  }, [camera, slots, size, viewport])

  const projected = useRef(false)
  useEffect(() => {
    projected.current = false
    invalidate()
    let active = true
    void document.fonts.ready.then(() => {
      if (!active) return
      projected.current = false
      invalidate()
    })
    return () => {
      active = false
    }
  }, [placements, selectedId, invalidate])

  useFrame(() => {
    if (projected.current || !labels.current || size.width === 0 || size.height === 0) return
    const elements = new Map(
      Array.from(labels.current.children, (element) => {
        const label = element as HTMLElement
        return [label.dataset.campaignId, label] as const
      }),
    )
    if (placements.some(({ id }) => !elements.has(id))) return
    projected.current = true
    const point = new Vector3()
    const anchors = placements.map(({ id, position, radius, appearance }) => {
      const [x, y, z] = position
      point.set(x, y, z).project(camera)
      const pixelX = ((point.x + 1) * size.width) / 2
      const pixelY = ((1 - point.y) * size.height) / 2
      point.set(x, y + radius, z).project(camera)
      const pixelRadius = pixelY - ((1 - point.y) * size.height) / 2
      const extent = pixelRadius * (appearance.ring || id === selectedId ? 1.82 : 1.08)
      const element = elements.get(id)!
      element.dataset.planetX = String(pixelX)
      element.dataset.planetY = String(pixelY)
      element.dataset.planetExtent = String(extent)
      const width = element.offsetWidth
      const height = element.offsetHeight
      const left = Math.round(MathUtils.clamp(pixelX - width / 2, 8, size.width - width - 8))
      const top = Math.round(
        MathUtils.clamp(pixelY - extent - height - 6, 8, size.height - height - 8),
      )
      return {
        id,
        element,
        label: { left, top, right: left + width, bottom: top + height },
        planet: {
          left: pixelX - extent,
          top: pixelY - extent,
          right: pixelX + extent,
          bottom: pixelY + extent,
        },
      }
    })
    const occupied: Bounds[] = []
    for (const { id, label, element } of anchors) {
      const occluded = anchors.some((other) => other.id !== id && overlaps(label, other.planet))
      const visible =
        (element.dataset.focal === 'true' || !occluded) &&
        !occupied.some((box) => overlaps(label, box))
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (!visible) continue
      element.style.transform = `translate(${label.left}px, ${label.top}px)`
      occupied.push(label)
    }
  })

  return placements.map((planet) => (
    <Planet
      key={planet.id}
      planet={planet}
      animate={animate}
      selected={planet.id === selectedId}
      onSelect={onSelect}
    />
  ))
}
