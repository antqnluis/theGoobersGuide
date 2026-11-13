import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Euler,
  Matrix4,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  Vector4,
  type Group,
  type InstancedMesh,
  type Mesh,
} from 'three'
import type { RingHighlight } from './OrbitRings'
import {
  arrivalReveal,
  labelClearance,
  mix,
  projectedSphereExtent,
  type ArrivalFlight,
  type SceneBounds,
  type SpaceMotion,
} from './orreryCamera'
import { labelGap, placeLabels, type Box, type LabelAnchor } from './orreryLabels'
import { hearthRadius, orbitPosition, type OrreryWorld } from './orreryLayout'
import { planetAppearance } from './planetModel'
import {
  atmosphereScale,
  moonSurface,
  moonVertex,
  planetAtmosphere,
  planetRing,
  planetSurface,
  planetVertex,
} from './planetShaders'
import { useOrreryCamera, type CameraFocus } from './useOrreryCamera'

// A world's radius in orbit units, for an appearance of size 1.
const worldScale = 0.42
const maxMoons = 6

const globeGeometry = new SphereGeometry(1, 48, 32)
const ringGeometry = new RingGeometry(1.25, 1.67, 64)
const moonGeometry = new SphereGeometry(1, 16, 12)
// Small worlds on the chart are easier to point at than their discs suggest.
const reachGeometry = new SphereGeometry(1.7, 12, 8)

// The hearth at the center of the orbits lights every world.
const sunPosition = { value: new Vector3(0, 0, 0) }
const noRaycast = () => null

// Scratch values for placing moons, reused every frame.
const moonMatrix = new Matrix4()
const moonPosition = new Vector3()
const moonScale = new Vector3()
const upright = new Quaternion()
const tilt = new Quaternion()
const lean = new Quaternion()
const euler = new Euler()

type Appearance = ReturnType<typeof planetAppearance>
type Label = {
  element: HTMLElement
  width: number
  height: number
  transform: string
  shown: boolean
}

/** Radius of the sphere a world's label has to clear, in world radii. */
function restingEnvelope({ ring }: Appearance) {
  return ring ? 1.82 : 1.12
}

/** The same once the world is focused and its moons are out. */
function focusedEnvelope({ ring }: Appearance) {
  return ring ? 2.25 : 1.85
}

// Moons circle in the plane of the world's rings, just outside them.
function moonOrbits({ ring, seed }: Appearance) {
  const [inner, outer] = ring ? [1.85, 2.12] : [1.42, 1.72]
  return Array.from({ length: maxMoons }, (_, index) => {
    const orbit = mix(inner, outer, (seed[0] * 0.37 + index * 0.618034) % 1)
    return {
      orbit,
      phase: seed[1] + index * 2.399963,
      // Closer moons circle faster.
      speed: 0.3 / orbit ** 1.5,
      size: 0.055 + 0.035 * ((seed[2] * 0.53 + index * 0.381966) % 1),
      lift: (((seed[2] + index * 0.754877) % 1) - 0.5) * 0.16,
    }
  })
}

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
    uSunPosition: sunPosition,
  }
}

function Atmosphere({ appearance }: { appearance: Appearance }) {
  const uniforms = useMemo(
    () => ({
      uAir: { value: new Color(appearance.air) },
      uHaze: { value: appearance.haze },
      uSunPosition: sunPosition,
    }),
    [appearance],
  )

  return (
    <mesh geometry={globeGeometry} raycast={noRaycast} scale={atmosphereScale}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={planetVertex}
        fragmentShader={planetAtmosphere}
        blending={AdditiveBlending}
        premultipliedAlpha
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

function PlanetaryRing({ appearance }: { appearance: Appearance }) {
  const uniforms = useMemo(
    () => ({
      uDust: { value: new Color(appearance.palette[2]).lerp(new Color('#aa8e7e'), 0.45) },
      uIce: { value: new Color(appearance.palette[3]).lerp(new Color('#e9d9c7'), 0.65) },
      uPhase: { value: appearance.seed[1] },
      uSunPosition: sunPosition,
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

function World({
  id,
  appearance,
  registerWorld,
  animate,
  onSelect,
  onHover,
}: {
  id: string
  appearance: Appearance
  registerWorld: (id: string, group: Group | null) => void
  animate: boolean
  onSelect: ((id: string) => void) | undefined
  onHover: (id: string | null) => void
}) {
  const globe = useRef<Mesh>(null)
  const register = useCallback(
    (group: Group | null) => registerWorld(id, group),
    [registerWorld, id],
  )
  const uniforms = useMemo(() => surfaceUniforms(appearance), [appearance])

  useFrame((_, delta) => {
    if (animate && globe.current) globe.current.rotation.y += Math.min(delta, 0.1) * appearance.spin
  })

  return (
    <group
      ref={register}
      scale={appearance.size * worldScale}
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
          onHover(id)
        })
      }
      onPointerOut={onSelect && (() => onHover(null))}
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
      {appearance.haze > 0 && <Atmosphere appearance={appearance} />}
      <mesh geometry={reachGeometry}>
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

function setData(element: HTMLElement, key: string, value: string | undefined) {
  if (element.dataset[key] === value) return
  if (value === undefined) delete element.dataset[key]
  else element.dataset[key] = value
}

function showLabels(
  labels: ReadonlyMap<string, Label>,
  placed: ReadonlyMap<string, { left: number; top: number }>,
) {
  // Whole device pixels keep the lettering crisp as the worlds drift.
  const density = window.devicePixelRatio || 1
  for (const [id, label] of labels) {
    const spot = placed.get(id)
    if (spot) {
      const transform = `translate(${Math.round(spot.left * density) / density}px, ${
        Math.round(spot.top * density) / density
      }px)`
      if (label.transform !== transform) {
        label.element.style.transform = transform
        label.transform = transform
      }
    }
    if (label.shown !== Boolean(spot)) {
      label.element.style.visibility = spot ? 'visible' : 'hidden'
      label.shown = Boolean(spot)
    }
  }
}

/**
 * The campaigns as worlds on their orbits, the focused world's moons, and the
 * engraved labels that follow them. It also drives the camera, because the
 * camera follows a world that is moving.
 */
export function OrreryWorlds({
  worlds,
  extent,
  bounds,
  labels,
  highlight: highlightRef,
  animate,
  interactive,
  visible,
  motionReduced,
  selectedId,
  moonCount,
  spaceMotion: spaceMotionRef,
  arrival: arrivalRef,
  onSelect,
}: {
  worlds: readonly OrreryWorld[]
  extent: number
  bounds: SceneBounds | null
  labels: RefObject<HTMLDivElement | null>
  highlight: RefObject<RingHighlight>
  animate: boolean
  interactive: boolean
  visible: boolean
  motionReduced: boolean
  selectedId: string | null
  /** Members of the selected campaign, once known. Each one is a moon. */
  moonCount: number | undefined
  spaceMotion: RefObject<SpaceMotion>
  arrival: RefObject<ArrivalFlight>
  onSelect: (id: string) => void
}) {
  const invalidate = useThree((state) => state.invalidate)
  const canvas = useThree((state) => state.gl.domElement)
  const appearances = useMemo(
    () => new Map(worlds.map(({ id }) => [id, planetAppearance(id)])),
    [worlds],
  )
  const moonPaths = useMemo(() => {
    const appearance = selectedId ? appearances.get(selectedId) : undefined
    return appearance ? moonOrbits(appearance) : []
  }, [appearances, selectedId])
  const moonUniforms = useMemo(
    () => ({ uRock: { value: new Color('#a59d94') }, uSunPosition: sunPosition }),
    [],
  )
  const groups = useRef(new Map<string, Group>())
  const registerWorld = useCallback((id: string, group: Group | null) => {
    if (group) groups.current.set(id, group)
    else groups.current.delete(id)
  }, [])
  const moons = useRef<InstancedMesh>(null)
  const labelSizesRef = useRef(new Map<string, Label>())
  const clock = useRef(0)
  const hovered = useRef<string | null>(null)
  const updateCamera = useOrreryCamera({
    bounds,
    extent,
    visible,
    motionReduced,
    spaceMotion: spaceMotionRef,
    arrival: arrivalRef,
  })

  const setHovered = useCallback(
    (id: string | null) => {
      hovered.current = id
      canvas.toggleAttribute('data-planet-hover', id !== null)
      invalidate()
    },
    [canvas, invalidate],
  )

  // A world that leaves while the pointer is on it never reports the pointer leaving.
  useEffect(() => () => setHovered(null), [setHovered, interactive, worlds])

  // Keep each label's measured size at hand so placing them never reads layout.
  useLayoutEffect(() => {
    const container = labels.current
    if (!container) return
    const sizes = labelSizesRef.current
    const resize = new ResizeObserver((entries) => {
      for (const { target, borderBoxSize } of entries) {
        const element = target as HTMLElement
        const label = sizes.get(element.dataset.campaignId!)
        if (!label || label.element !== element) continue
        label.width = borderBoxSize[0]?.inlineSize ?? element.offsetWidth
        label.height = borderBoxSize[0]?.blockSize ?? element.offsetHeight
      }
      invalidate()
    })

    function syncLabels() {
      if (!container) return
      const children = new Set(Array.from(container.children))
      for (const [id, { element }] of sizes) {
        if (children.has(element)) continue
        resize.unobserve(element)
        sizes.delete(id)
      }
      for (const child of children) {
        const element = child as HTMLElement
        const id = element.dataset.campaignId!
        if (sizes.has(id)) continue
        sizes.set(id, {
          element,
          width: element.offsetWidth,
          height: element.offsetHeight,
          transform: '',
          shown: false,
        })
        resize.observe(element)
      }
      invalidate()
    }

    const mutations = new MutationObserver(syncLabels)
    mutations.observe(container, { childList: true })
    syncLabels()
    return () => {
      resize.disconnect()
      mutations.disconnect()
      sizes.clear()
    }
  }, [labels, invalidate])

  // Most frames are drawn on demand, so anything that changes the picture asks for one.
  useLayoutEffect(() => {
    invalidate()
  })

  useFrame((root, delta) => {
    if (animate) clock.current += Math.min(delta, 0.1)
    const seconds = clock.current
    const spots = worlds.map((world) => orbitPosition(world, seconds))
    const flight = arrivalRef.current
    // During the arrival each world grows as the drawn-in orbits reach its ring.
    const reach =
      flight.phase === 'off' ? Infinity : arrivalReveal(flight.progress, 1) * (extent + 3)
    worlds.forEach(({ id, radius }, index) => {
      const group = groups.current.get(id)
      if (!group) return
      group.position.set(...spots[index])
      const size = (appearances.get(id)?.size ?? 1) * worldScale
      const grown = Math.min(1, Math.max(0, (reach - radius) / 2.5))
      group.scale.setScalar(Math.max(size * grown * grown * (3 - 2 * grown), 1e-4))
    })

    const focusIndex = worlds.findIndex(({ id }) => id === selectedId)
    const focusAppearance = focusIndex < 0 ? undefined : appearances.get(worlds[focusIndex].id)
    const focused: CameraFocus | null = focusAppearance
      ? {
          id: worlds[focusIndex].id,
          position: spots[focusIndex],
          radius: focusAppearance.size * worldScale,
          envelope: focusedEnvelope(focusAppearance),
          clearance: Math.max(
            labelClearance,
            (labelSizesRef.current.get(worlds[focusIndex].id)?.height ?? 0) + labelGap + 1,
          ),
        }
      : null
    const { view, scene } = updateCamera(root, delta, focused)

    const satellites = moons.current
    if (satellites) {
      const count = focused ? Math.min(moonCount ?? 0, maxMoons) : 0
      satellites.visible = count > 0
      if (focused && focusAppearance && count > 0) {
        satellites.count = count
        satellites.position.set(...focused.position)
        satellites.scale.setScalar(focused.radius)
        tilt.setFromEuler(euler.set(0, 0, focusAppearance.tilt))
        lean.setFromEuler(euler.set(focusAppearance.ringInclination, 0, 0))
        satellites.quaternion.copy(tilt).multiply(lean)
        for (let index = 0; index < count; index++) {
          const { orbit, phase, speed, size, lift } = moonPaths[index]
          const angle = phase + seconds * speed
          moonPosition.set(Math.cos(angle) * orbit, Math.sin(angle) * orbit, lift)
          satellites.setMatrixAt(
            index,
            moonMatrix.compose(moonPosition, upright, moonScale.setScalar(size)),
          )
        }
        satellites.instanceMatrix.needsUpdate = true
      }
    }

    const hoveredWorld = worlds.find(({ id }) => id === hovered.current)
    highlightRef.current.focus = focusIndex < 0 ? -1 : worlds[focusIndex].ring
    highlightRef.current.hover = hoveredWorld?.ring ?? -1

    const anchors: (LabelAnchor & { rank: number })[] = []
    worlds.forEach((world, index) => {
      const label = labelSizesRef.current.get(world.id)
      const appearance = appearances.get(world.id)
      if (!label || !appearance) return
      const selected = world.id === selectedId
      const radius = appearance.size * worldScale
      // A focused world claims room for its moons; its label only clears the world itself.
      const reach = radius * (selected ? focusedEnvelope(appearance) : restingEnvelope(appearance))
      const { x, y, depth, across, up } = view.project(spots[index])
      const { element } = label
      setData(element, 'hovered', world.id === hovered.current ? 'true' : undefined)
      if (depth <= reach * 1.05) {
        setData(element, 'planetX', undefined)
        setData(element, 'planetY', undefined)
        setData(element, 'planetExtent', undefined)
        return
      }
      const spread = (size: number) =>
        Math.max(
          projectedSphereExtent(across, depth, size, view.focal),
          projectedSphereExtent(up, depth, size, view.focal),
        )
      setData(element, 'planetX', x.toFixed(2))
      setData(element, 'planetY', y.toFixed(2))
      setData(element, 'planetExtent', spread(reach).toFixed(2))
      if (!interactive) return
      anchors.push({
        id: world.id,
        x,
        y,
        extent: spread(radius * restingEnvelope(appearance)),
        width: label.width,
        height: label.height,
        pinned: selected,
        rank: selected ? -2 : world.id === hovered.current ? -1 : index,
      })
    })
    anchors.sort((a, b) => a.rank - b.rank)

    const obstacles: Box[] = []
    const hearth = view.project([0, 0, 0])
    if (hearth.depth > hearthRadius) {
      const glow = (view.focal * hearthRadius * 1.2) / hearth.depth
      obstacles.push({
        left: hearth.x - glow,
        right: hearth.x + glow,
        top: hearth.y - glow,
        bottom: hearth.y + glow,
      })
    }
    const placed = new Map(placeLabels(anchors, scene, obstacles).map((label) => [label.id, label]))
    showLabels(labelSizesRef.current, placed)
  }, -1)

  return (
    <>
      {worlds.map(({ id }) => (
        <World
          key={id}
          id={id}
          appearance={appearances.get(id)!}
          registerWorld={registerWorld}
          animate={animate}
          onSelect={interactive ? onSelect : undefined}
          onHover={setHovered}
        />
      ))}
      <instancedMesh
        args={[moonGeometry, undefined, maxMoons]}
        frustumCulled={false}
        raycast={noRaycast}
        ref={moons}
        visible={false}
      >
        <shaderMaterial
          fragmentShader={moonSurface}
          uniforms={moonUniforms}
          vertexShader={moonVertex}
        />
      </instancedMesh>
    </>
  )
}
