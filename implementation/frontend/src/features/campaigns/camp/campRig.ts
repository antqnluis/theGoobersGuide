// The camp's one camera rig. It owns the camera position, the pan and landfall
// animations, and the frame loop, and hands frames to whoever draws. It knows
// nothing about React or the DOM: time and scheduling are injected, so tests
// drive it with a fake clock.
//
// Rules it keeps:
// - One rig, one pan. A new target restarts from where the camera is, so rapid
//   clicks only ever change the destination; nothing queues.
// - It emits a frame only when something changed: the integer camera x or y,
//   or the sprite clock. A hidden page runs no loop at all, and reduced motion
//   runs none either (it emits one frame per change).
// - The camera x is always an integer, so motion snaps to the pixel grid.

import {
  clampCameraX,
  descentOffset,
  panFinished,
  panPosition,
  startPan,
  type Pan,
} from './campCamera'

export type RigClock = {
  now: () => number
  request: (callback: (time: number) => void) => number
  cancel: (handle: number) => void
}

export const browserClock: RigClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export type LandfallState = 'armed' | 'playing' | 'done'

export type RigFrame = {
  cameraX: number
  cameraY: number
  /** Milliseconds on the rig's clock. */
  time: number
  /** The sprite clock: steps `fxFps` times a second. */
  tick: number
  /** How strongly the fire flares, 0 to 1, for the end of the landfall. */
  flare: number
  /** Whether the camera x or y changed since the previous frame. */
  moved: boolean
  animating: boolean
  landfall: LandfallState | null
}

/** The sprite clock: the fire, embers, and particles step this many times a second. */
export const fxFps = 12

export const landfallDuration = 1100
const flareDuration = 600
/** The fire starts to swell this far through the descent. */
const flareStart = 0.7

/** The time the party's breathing frame changes, in milliseconds. */
export const breathMs = 500

export class CampRig {
  cameraX = 0
  cameraY = 0
  private visible = 480
  private visibleHeight = 270
  private pan: Pan | null = null
  private landfall: { state: LandfallState; start: number; duration: number } | null = null
  private flareUntil = 0
  private reduced: boolean
  private hidden = false
  private panelOpen = false
  private handle: number | null = null
  private lastTick = -1
  private animating = false
  private readonly listeners = new Set<(frame: RigFrame) => void>()

  private readonly clock: RigClock

  constructor(clock: RigClock, options: { reduced?: boolean } = {}) {
    this.clock = clock
    this.reduced = options.reduced ?? false
  }

  /** Where the camera is heading: the end of a pan in progress, else where it is. */
  get targetX() {
    return this.pan?.to ?? this.cameraX
  }

  get isReduced() {
    return this.reduced
  }

  get landfallState(): LandfallState | null {
    return this.landfall?.state ?? null
  }

  get isAnimating() {
    return this.animating
  }

  /** Called when the scene is measured: how much of the panorama the view shows. */
  configure({ visible, visibleHeight }: { visible: number; visibleHeight: number }) {
    this.visible = visible
    this.visibleHeight = visibleHeight
    this.cameraX = clampCameraX(this.cameraX, visible)
    if (this.pan) this.pan = { ...this.pan, to: clampCameraX(this.pan.to, visible) }
    if (this.landfall?.state === 'armed') this.cameraY = Math.round(visibleHeight)
    this.emit(this.clock.now(), true)
  }

  /** Starts the camera high in the sky, so the first frame is the night overhead. */
  armLandfall(duration = landfallDuration) {
    if (this.reduced || this.landfall) return
    this.landfall = { state: 'armed', start: 0, duration }
    this.cameraY = Math.round(this.visibleHeight)
  }

  /** Begins the descent; call once the first frame is on screen. */
  beginLandfall() {
    if (!this.landfall || this.landfall.state !== 'armed') return
    const now = this.clock.now()
    this.landfall = { ...this.landfall, state: 'playing', start: now }
    this.refreshAnimating()
    this.ensureRunning()
    this.emit(now, true)
  }

  /** Jumps with no animation. */
  jumpTo(x: number) {
    this.pan = null
    this.cameraX = clampCameraX(x, this.visible)
    this.refreshAnimating()
    this.emit(this.clock.now(), true)
  }

  /** Eases the camera to a column; retargets from the current position. */
  panTo(x: number, duration: number) {
    const to = clampCameraX(x, this.visible)
    if (this.reduced || duration <= 0) {
      this.jumpTo(to)
      return
    }
    if (to === this.cameraX && !this.pan) return
    this.pan = startPan(this.cameraX, to, this.clock.now(), duration)
    this.refreshAnimating()
    this.ensureRunning()
    this.emit(this.clock.now(), true)
  }

  /** Follows a finger or pointer exactly. */
  dragTo(x: number) {
    this.pan = null
    const next = clampCameraX(x, this.visible)
    if (next === this.cameraX) return
    this.cameraX = next
    this.refreshAnimating()
    this.emit(this.clock.now(), true)
  }

  setReduced(reduced: boolean) {
    if (reduced === this.reduced) return
    this.reduced = reduced
    if (reduced) {
      this.stopLoop()
      if (this.pan) this.cameraX = this.pan.to
      this.pan = null
      if (this.landfall) this.landfall = { ...this.landfall, state: 'done' }
      this.cameraY = 0
      this.flareUntil = 0
    } else {
      this.ensureRunning()
    }
    this.refreshAnimating()
    this.emit(this.clock.now(), true)
  }

  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return
    this.hidden = hidden
    if (hidden) this.stopLoop()
    else this.ensureRunning()
  }

  /** While a panel is open the fire and particles run at half rate. */
  setPanelOpen(open: boolean) {
    this.panelOpen = open
  }

  /** Receives frames; the first subscriber starts the loop. Returns the unsubscribe. */
  subscribe(listener: (frame: RigFrame) => void) {
    this.listeners.add(listener)
    this.ensureRunning()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stopLoop()
    }
  }

  /** The current frame, for drawing once on demand. */
  frame(moved = true): RigFrame {
    return this.build(this.clock.now(), moved)
  }

  /** Stops the loop and drops every listener. */
  dispose() {
    this.stopLoop()
    this.listeners.clear()
  }

  /** Whether anything is scheduled; used to verify cleanup. */
  get isRunning() {
    return this.handle !== null
  }

  private ensureRunning() {
    if (this.handle !== null || this.hidden || this.reduced || this.listeners.size === 0) return
    this.handle = this.clock.request(this.step)
  }

  private stopLoop() {
    if (this.handle === null) return
    this.clock.cancel(this.handle)
    this.handle = null
  }

  private readonly step = (time: number) => {
    this.handle = null
    this.advance(time)
    this.ensureRunning()
  }

  /** Moves the animations to `now`, then emits when something changed. */
  private advance(now: number) {
    const previousX = this.cameraX
    const previousY = this.cameraY
    if (this.pan) {
      this.cameraX = panPosition(this.pan, now)
      if (panFinished(this.pan, now)) this.pan = null
    }
    if (this.landfall?.state === 'playing') {
      const progress = Math.min(1, (now - this.landfall.start) / this.landfall.duration)
      this.cameraY = descentOffset(progress, this.visibleHeight)
      if (progress >= 1) {
        this.landfall = { ...this.landfall, state: 'done' }
        this.cameraY = 0
        this.flareUntil = now + flareDuration
      }
    }
    const moved = this.cameraX !== previousX || this.cameraY !== previousY
    const tick = Math.floor((now * fxFps) / 1000)
    const ticked = tick !== this.lastTick && (!this.panelOpen || tick % 2 === 0)
    if (moved || ticked) {
      if (ticked) this.lastTick = tick
      this.emit(now, moved)
    }
    this.setAnimating(this.pan !== null || this.landfall?.state === 'playing')
  }

  private emit(now: number, moved: boolean) {
    if (this.listeners.size === 0) return
    const frame = this.build(now, moved)
    for (const listener of [...this.listeners]) listener(frame)
  }

  /** Brings the animating flag in line with the state before a frame goes out. */
  private refreshAnimating() {
    this.animating = this.pan !== null || this.landfall?.state === 'playing'
  }

  private setAnimating(value: boolean) {
    if (value === this.animating) return
    this.animating = value
    // Listeners learn about the change on the next emitted frame; force one now.
    this.emit(this.clock.now(), false)
  }

  private build(now: number, moved: boolean): RigFrame {
    return {
      cameraX: this.cameraX,
      cameraY: this.cameraY,
      time: this.reduced ? 0 : now,
      tick: this.reduced ? 0 : Math.floor((now * fxFps) / 1000),
      flare: this.reduced ? 0 : this.flareAt(now),
      moved,
      animating: this.animating,
      landfall: this.landfall?.state ?? null,
    }
  }

  private flareAt(now: number) {
    if (!this.landfall) return 0
    if (this.landfall.state === 'playing') {
      const progress = (now - this.landfall.start) / this.landfall.duration
      return Math.max(0, Math.min(1, (progress - flareStart) / (1 - flareStart)))
    }
    if (this.landfall.state === 'done' && now < this.flareUntil) {
      return Math.max(0, (this.flareUntil - now) / flareDuration)
    }
    return 0
  }
}
