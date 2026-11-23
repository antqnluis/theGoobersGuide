/**
 * The roll, performed. A roll's numbers are already known when it arrives; this is the throw that
 * reveals them: every die is tossed onto the plate, tumbles in 3D with its face cycling and slowing,
 * bounces twice, and locks onto its real value. The total counts up as the last die settles.
 *
 * It is a presentation layer only. The faces keep their true values in the DOM the whole time
 * (screen readers and tests read those); the tumbling numbers are CSS pseudo-element content fed
 * from `data-spin`, so they never reach the accessibility tree. Nothing here runs under reduced
 * motion, or where the Web Animations API is missing.
 */

/** How long a die is in the air and bouncing, before the next roll can matter. */
export const flightMs = 1250
/** The moment a die's face locks, as a share of its flight (after the last bounce). */
export const lockAt = 0.8
/** Dice leave the hand one after another; beyond this many they leave together. */
export const staggerMs = 90
export const maxStaggered = 8
/** A result younger than this is "just rolled": the tray plays it, an older one rests. */
export const freshMs = 2000

const totalMs = 560
const totalLeadMs = 80

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** True where the throw can play: the Web Animations API is there and motion is welcome. */
export function motionAvailable(): boolean {
  return (
    typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function' &&
    !prefersReducedMotion()
  )
}

/** A face the die might show mid-tumble: 1..sides, never the one it just showed. */
export function randomFace(sides: number, previous: number, random = Math.random): number {
  const span = Math.max(2, Math.floor(sides))
  let next = 1 + Math.floor(random() * span)
  if (next === previous) next = (next % span) + 1
  return next
}

/** When the tumbling number changes, in ms from the toss: quick at first, slowing toward the lock. */
export function spinSchedule(lockMs: number): number[] {
  const times: number[] = []
  let at = 0
  while (at < lockMs) {
    times.push(at)
    at += 36 + 170 * (at / lockMs) ** 1.8
  }
  return times
}

const impacts = [0.34, 0.56, 0.7] as const

/**
 * One die's flight as sampled keyframes: dropped in from above, two decaying bounces, a spin that
 * bleeds off to nothing, a squash on each impact. It begins and ends at the natural position, so the
 * tile needs no fill once it has landed.
 */
export function flightKeyframes(random: () => number = Math.random): Keyframe[] {
  const fall = 46
  const drift = (random() * 2 - 1) * 20
  const turn = (scale: number) => (random() < 0.5 ? -1 : 1) * (420 + random() * 420) * scale
  const rz = turn(1)
  const rx = turn(0.6)
  const ry = turn(0.6)
  const steps = 48
  const frames: Keyframe[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    let lift = 0
    if (t < impacts[0]) lift = fall * (1 - (t / impacts[0]) ** 2)
    else if (t < impacts[1]) {
      const s = (t - impacts[0]) / (impacts[1] - impacts[0])
      lift = 15 * 4 * s * (1 - s)
    } else if (t < impacts[2]) {
      const s = (t - impacts[1]) / (impacts[2] - impacts[1])
      lift = 5 * 4 * s * (1 - s)
    }
    const spin = 1 - easeOutCubic(Math.min(1, t / 0.74))
    const squash = impacts.reduce(
      (sum, at, index) => sum + Math.exp(-(((t - at) / 0.02) ** 2)) / (index + 1),
      0,
    )
    // Higher is nearer the eye: a thrown die starts large and shrinks onto the plate.
    const near = 1 + 0.35 * (lift / fall)
    const x = drift * (1 - easeOutCubic(Math.min(1, t / 0.72)))
    frames.push({
      offset: t,
      opacity: Math.min(1, t / 0.05),
      transform:
        `translate(${x.toFixed(2)}px, ${(-lift).toFixed(2)}px) perspective(420px) ` +
        `rotateX(${(rx * spin).toFixed(1)}deg) rotateY(${(ry * spin).toFixed(1)}deg) ` +
        `rotateZ(${(rz * spin).toFixed(1)}deg) ` +
        `scale(${((1 + 0.12 * squash) * near).toFixed(3)}, ${((1 - 0.16 * squash) * near).toFixed(3)})`,
    })
  }
  return frames
}

const rings = {
  max: {
    color: 'rgb(242 176 74 / 0.95)',
    reach: 18,
    inset: 'inset 0 0 0 1px #dab98a, ',
    repeat: 2,
  },
  min: { color: 'rgb(122 41 50 / 0.75)', reach: 12, inset: '', repeat: 1 },
  plain: { color: 'rgb(218 185 138 / 0.85)', reach: 12, inset: '', repeat: 1 },
}

/** A ring of light that leaves the tile as it locks. A natural 20 sends two. */
function lockRing(face: HTMLElement): Animation[] {
  const ring =
    rings[face.dataset.mark === 'max' ? 'max' : face.dataset.mark === 'min' ? 'min' : 'plain']
  return Array.from({ length: ring.repeat }, (_, index) =>
    face.animate(
      [
        { boxShadow: `${ring.inset}0 0 0 0 ${ring.color}` },
        { boxShadow: `${ring.inset}0 0 0 ${ring.reach}px transparent` },
      ],
      { duration: 460, delay: index * 150, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    ),
  )
}

/**
 * Counts `el` up to `value` (ease-out), showing the number through `data-spin`. Returns a cancel
 * that puts the real number back at once.
 */
export function countUp(el: HTMLElement, value: number, duration = totalMs, onDone?: () => void) {
  const span = Math.max(8, Math.round(Math.abs(value) * 0.7))
  // A positive total counts up from zero or above, never through a negative it can't be.
  const from = value >= 0 ? Math.max(0, value - span) : value - span
  const began = performance.now()
  let frame = 0
  let animation: Animation | null = null
  el.dataset.spin = String(from)
  const tick = (now: number) => {
    const progress = Math.min(1, (now - began) / duration)
    el.dataset.spin = String(Math.round(from + (value - from) * easeOutCubic(progress)))
    if (progress < 1) {
      frame = requestAnimationFrame(tick)
      return
    }
    delete el.dataset.spin
    animation = el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.16)', offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
    onDone?.()
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    animation?.cancel()
    delete el.dataset.spin
  }
}

export type RollMotion = {
  /** Jump to the end: every die locked, the total shown, the flourish played. */
  skip: () => void
  /** Stop and put everything back as it is at rest. */
  cancel: () => void
}

/** Throws every die on `plate` (a `.dice-result` holding faces and a total). Null: nothing to play. */
export function playRollMotion(plate: HTMLElement): RollMotion | null {
  if (!motionAvailable()) return null
  const total = plate.querySelector<HTMLElement>('.dice-result__total')
  if (!total) return null
  const faces = Array.from(plate.querySelectorAll<HTMLElement>('.dice-face[data-sides]'))
  const value = Number(total.dataset.value)
  if (!Number.isFinite(value)) return null

  const timers: number[] = []
  const animations: Animation[] = []
  let stopTotal: (() => void) | null = null
  const later = (fn: () => void, ms: number) => {
    timers.push(window.setTimeout(fn, ms))
  }

  const rest = () => {
    timers.forEach((timer) => window.clearTimeout(timer))
    timers.length = 0
    stopTotal?.()
    stopTotal = null
    animations.forEach((animation) => animation.cancel())
    animations.length = 0
    faces.forEach((face) => {
      delete face.dataset.rolling
      delete face.dataset.spin
    })
    delete total.dataset.spin
    delete plate.dataset.rolling
  }

  plate.dataset.rolling = ''
  total.dataset.spin = ''
  let lastLock = 0
  const lockMs = flightMs * lockAt
  faces.forEach((face, index) => {
    const delay = Math.min(index, maxStaggered) * staggerMs
    const sides = Number(face.dataset.sides)
    lastLock = Math.max(lastLock, delay + lockMs)
    face.dataset.rolling = ''
    face.dataset.spin = ''
    animations.push(
      face.animate(flightKeyframes(), {
        duration: flightMs,
        delay,
        easing: 'linear',
        fill: 'backwards',
      }),
    )
    let shown = 0
    for (const at of spinSchedule(lockMs)) {
      later(() => {
        shown = randomFace(sides, shown)
        face.dataset.spin = String(shown)
      }, delay + at)
    }
    later(() => {
      delete face.dataset.rolling
      delete face.dataset.spin
      animations.push(...lockRing(face))
    }, delay + lockMs)
  })

  later(() => {
    plate.dataset.landed = ''
  }, lastLock)
  later(
    () => {
      stopTotal = countUp(total, value, totalMs, () => {
        stopTotal = null
        delete plate.dataset.rolling
      })
    },
    Math.max(0, lastLock - totalLeadMs),
  )

  return {
    skip: () => {
      rest()
      plate.dataset.landed = ''
    },
    cancel: rest,
  }
}
