import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AdditiveBlending, type Mesh } from 'three'

import { DeepSpace } from '../campaigns/DeepSpace'
import { setHearthBoost, type HearthBoost } from '../campaigns/hearthBoost'
import { HearthStar } from '../campaigns/HearthStar'
import { OrbitRings, type RingHighlight } from '../campaigns/OrbitRings'
import {
  cameraFov,
  clamp,
  heading,
  starfieldPan,
  type ArrivalFlight,
  type CameraPose,
  type SpaceMotion,
} from '../campaigns/orreryCamera'
import { clearSkyHandoff, publishSkyHandoff } from '../arrival/skyHandoff'
import { galaxyLayout, ringRadius } from '../campaigns/orreryLayout'
import type { AuthSkySignal } from './authSkySignal'

export type AuthSkyProps = {
  motionReduced: boolean
  paused: boolean
  signal: AuthSkySignal
  onAvailabilityChange: (ready: boolean) => void
}

// The sky is the galaxy's own chart, seen from low and far: the same star, orbits and
// deep sky a signed-in player flies into, drawn before any world has been charted.
const cameraOptions = { position: [0, 8, 30] as const, fov: cameraFov, near: 0.1, far: 400 }
const chartRings = galaxyLayout(6).rings
const noFlight: RefObject<ArrivalFlight> = {
  current: { phase: 'off', progress: 1, finished: () => {} },
}
const unclaimed = chartRings.map(() => false)
const noHighlight: RefObject<RingHighlight> = { current: { focus: -1, hover: -1 } }
const travellerRing = 2
const restingAngle = 0.62
const cruise = 0.035
const hurry = 0.42

const distance = 31
const elevation = (21 * Math.PI) / 180
const mobileWidth = 681
// The deep sky's own slow sway (see DeepSpace), which the handoff carries across.
const starDrift = 0.0024

/** Where the hearth should land, in canvas pixels: the middle of the open half on a wide page. */
function hearthTarget(width: number) {
  const open = document.querySelector('.auth-switch')
  if (width >= mobileWidth && open instanceof HTMLElement) {
    const box = open.getBoundingClientRect()
    if (box.width > 0) return { x: box.left + box.width / 2, y: box.top + box.height * 0.36 }
  }
  // Stacked, the star keeps to the brand's row, clear of the form and the header rule.
  return { x: width * 0.82, y: 54 }
}

function pan(motion: SpaceMotion, offset: number) {
  motion.offset = offset
}

function SkyRig({
  animate,
  signal,
  spaceMotion,
  boost,
}: {
  animate: boolean
  signal: AuthSkySignal
  spaceMotion: RefObject<SpaceMotion>
  boost: RefObject<HearthBoost>
}) {
  const invalidate = useThree((state) => state.invalidate)
  const lead = useRef({ x: 0, y: 0, ready: false })
  const lean = useRef({ target: 0, now: 0 })
  const traveller = useRef<Mesh>(null)
  const angle = useRef(restingAngle)
  const speed = useRef(cruise)
  const clock = useRef(0)

  useEffect(() => clearSkyHandoff, [])

  useEffect(() => {
    const redraw = () => invalidate()
    window.addEventListener('resize', redraw)
    window.addEventListener('scroll', redraw, { passive: true })
    return () => {
      window.removeEventListener('resize', redraw)
      window.removeEventListener('scroll', redraw)
    }
  }, [invalidate])

  useEffect(() => {
    if (!animate) return
    const move = (event: PointerEvent) => {
      lean.current.target = clamp(event.clientX / window.innerWidth - 0.5, -0.5, 0.5)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [animate])

  useFrame(({ camera, size }, delta) => {
    const step = Math.min(delta, 0.1)
    const goal = hearthTarget(size.width)
    const follow = animate && lead.current.ready ? 1 - Math.exp(-step * 7) : 1
    lead.current.x += (goal.x - lead.current.x) * follow
    lead.current.y += (goal.y - lead.current.y) * follow
    lead.current.ready = true
    lean.current.now +=
      (lean.current.target - lean.current.now) * (animate ? 1 - Math.exp(-step * 3) : 1)

    // The camera leans a little with the pointer and looks at the star; the view
    // offset then slides the star to where the page keeps its open half.
    const around = lean.current.now * 0.16
    camera.position.set(
      Math.sin(around) * distance * Math.cos(elevation),
      Math.sin(elevation) * distance,
      Math.cos(around) * distance * Math.cos(elevation),
    )
    camera.lookAt(0, 0, 0)
    if ('setViewOffset' in camera) {
      const perspective = camera as typeof camera & {
        setViewOffset: (a: number, b: number, c: number, d: number, e: number, f: number) => void
      }
      perspective.setViewOffset(
        size.width,
        size.height,
        size.width / 2 - lead.current.x,
        size.height / 2 - lead.current.y,
        size.width,
        size.height,
      )
    }
    // The stars pan with the camera's heading, as the galaxy's do, and slide a little more as
    // the star moves between the two halves of the page, each depth by its own amount.
    const pose: CameraPose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [0, 0, 0],
      principal: [lead.current.x, lead.current.y],
    }
    if (animate) clock.current += step
    const slide = (lead.current.x - size.width * 0.5) * -0.00004
    pan(spaceMotion.current, heading(pose) * starfieldPan + slide)
    // Signing in hands this exact view to the galaxy, drift included, so nothing jumps.
    publishSkyHandoff({ pose, carry: slide + Math.sin(clock.current * 0.15) * starDrift })

    // The hearth answers the form: it dims on a refusal and flares when an account is made.
    // Under reduced motion it keeps its resting light, and the words carry the news.
    const now = performance.now()
    setHearthBoost(boost.current, animate ? signal.glow(now) : 1)
    const hurrying = signal.pending
    speed.current +=
      ((hurrying ? hurry : cruise) - speed.current) * (animate ? 1 - Math.exp(-step * 2.4) : 1)
    if (animate) angle.current += step * speed.current * signal.pace(now)
    const orbit = ringRadius(travellerRing)
    traveller.current?.position.set(
      Math.cos(angle.current) * orbit,
      0,
      Math.sin(angle.current) * orbit,
    )
    if (
      animate &&
      (Math.abs(goal.x - lead.current.x) > 0.5 || Math.abs(goal.y - lead.current.y) > 0.5)
    )
      invalidate()
  })

  return (
    <>
      <OrbitRings
        arrival={noFlight}
        claimedRings={unclaimed}
        highlight={noHighlight}
        rings={chartRings}
      />
      <mesh ref={traveller}>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshBasicMaterial color="#f5d3ae" toneMapped={false} />
        <mesh scale={3.2}>
          <sphereGeometry args={[0.17, 16, 12]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#f5d3ae"
            depthWrite={false}
            opacity={0.16}
            toneMapped={false}
            transparent
          />
        </mesh>
      </mesh>
    </>
  )
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

export default function AuthSkyCanvas({
  motionReduced,
  paused,
  signal,
  onAvailabilityChange,
}: AuthSkyProps) {
  const spaceMotion = useRef<SpaceMotion>({ offset: 0, streak: 0, radial: 0 })
  const boost = useRef<HearthBoost>({ value: 1 })
  const [hidden, setHidden] = useState(() => document.hidden)
  const [lost, setLost] = useState(false)

  useEffect(() => subscribeToVisibility(() => setHidden(document.hidden)), [])

  const animate = !hidden && !motionReduced && !paused
  const handleLost = useCallback(() => {
    setLost(true)
    onAvailabilityChange(false)
  }, [onAvailabilityChange])

  if (lost) return null

  return (
    <Canvas
      camera={cameraOptions}
      dpr={[1, 1.5]}
      frameloop={hidden ? 'never' : animate ? 'always' : 'demand'}
      // The sign-in arrival copies this frame, so the buffer has to survive the draw and be opaque:
      // the corona adds light with no alpha, which a transparent canvas would drop from a copy.
      gl={{
        alpha: false,
        antialias: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute('data-auth-sky-ready', '')
        gl.domElement.addEventListener('webglcontextlost', handleLost)
        onAvailabilityChange(true)
      }}
    >
      <color attach="background" args={['#080714']} />
      <DeepSpace animate={animate} spaceMotion={spaceMotion} />
      <HearthStar animate={animate} boost={boost} />
      <SkyRig animate={animate} boost={boost} signal={signal} spaceMotion={spaceMotion} />
    </Canvas>
  )
}
