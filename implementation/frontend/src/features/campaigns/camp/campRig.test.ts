import { describe, expect, it } from 'vitest'
import { CampRig, fxFps, landfallDuration, type RigClock, type RigFrame } from './campRig'

/** A clock the test steps by hand: requested callbacks run only on `advance`. */
function fakeClock() {
  let time = 1000
  let next = 1
  const pending = new Map<number, (time: number) => void>()
  const clock: RigClock = {
    now: () => time,
    request: (callback) => {
      const handle = next++
      pending.set(handle, callback)
      return handle
    },
    cancel: (handle) => {
      pending.delete(handle)
    },
  }
  return {
    clock,
    get pending() {
      return pending.size
    },
    /** Runs frames every 16 ms until `ms` have passed. */
    advance(ms: number) {
      const end = time + ms
      while (time < end) {
        time = Math.min(end, time + 16)
        for (const [handle, callback] of [...pending]) {
          pending.delete(handle)
          callback(time)
        }
      }
    },
  }
}

function setup(options: { reduced?: boolean } = {}) {
  const fake = fakeClock()
  const rig = new CampRig(fake.clock, options)
  rig.configure({ visible: 480, visibleHeight: 300 })
  rig.jumpTo(144)
  const frames: RigFrame[] = []
  rig.subscribe((frame) => frames.push(frame))
  return { fake, rig, frames }
}

describe('CampRig panning', () => {
  it('eases to the target in whole pixels and reports when it is animating', () => {
    const { fake, rig, frames } = setup()
    rig.panTo(336, 350)
    fake.advance(400)
    expect(rig.cameraX).toBe(336)
    expect(rig.isAnimating).toBe(false)
    const xs = frames.map(({ cameraX }) => cameraX)
    expect(xs.every(Number.isInteger)).toBe(true)
    expect(xs.some((x) => x > 144 && x < 336)).toBe(true)
    expect(xs).toEqual(xs.toSorted((a, b) => a - b))
    expect(frames.some(({ animating }) => animating)).toBe(true)
    expect(frames.at(-1)?.animating).toBe(false)
  })

  it('reports animating as soon as a pan starts, before any frame runs', () => {
    const { rig, frames } = setup()
    expect(rig.isAnimating).toBe(false)
    rig.panTo(336, 350)
    expect(rig.isAnimating).toBe(true)
    expect(frames.at(-1)?.animating).toBe(true)
    rig.dragTo(200)
    expect(rig.isAnimating).toBe(false)
  })

  it('retargets from where it is and never queues', () => {
    const { fake, rig } = setup()
    rig.panTo(336, 350)
    fake.advance(120)
    const middle = rig.cameraX
    expect(middle).toBeGreaterThan(144)
    expect(middle).toBeLessThan(336)
    rig.panTo(144, 300)
    rig.panTo(250, 300)
    rig.panTo(200, 300)
    fake.advance(16)
    // Each new target starts from the current position: no jump back to a start.
    expect(Math.abs(rig.cameraX - middle)).toBeLessThan(25)
    fake.advance(400)
    expect(rig.cameraX).toBe(200)
  })

  it('reports where it is heading, so a caller can remember the settled place', () => {
    const { fake, rig } = setup()
    expect(rig.targetX).toBe(144)
    rig.panTo(336, 350)
    fake.advance(100)
    expect(rig.cameraX).toBeLessThan(336)
    expect(rig.targetX).toBe(336)
  })

  it('clamps to the panorama and follows a drag exactly', () => {
    const { rig } = setup()
    rig.dragTo(-50)
    expect(rig.cameraX).toBe(0)
    rig.dragTo(9999)
    expect(rig.cameraX).toBe(960 - 480)
    rig.dragTo(301.4)
    expect(rig.cameraX).toBe(301)
  })

  it('stops a pan when dragged', () => {
    const { fake, rig } = setup()
    rig.panTo(400, 350)
    fake.advance(50)
    rig.dragTo(200)
    fake.advance(500)
    expect(rig.cameraX).toBe(200)
  })

  it('jumps instead of animating under reduced motion, with no frame loop', () => {
    const { fake, rig, frames } = setup({ reduced: true })
    rig.panTo(336, 350)
    expect(rig.cameraX).toBe(336)
    expect(rig.isAnimating).toBe(false)
    expect(fake.pending).toBe(0)
    expect(frames.at(-1)?.tick).toBe(0)
  })

  it('finishes an animation in place when reduced motion turns on', () => {
    const { fake, rig } = setup()
    rig.panTo(336, 350)
    fake.advance(60)
    rig.setReduced(true)
    expect(rig.cameraX).toBe(336)
    expect(fake.pending).toBe(0)
  })
})

describe('CampRig frame loop', () => {
  it('emits the sprite clock at its own rate and nothing in between', () => {
    const { fake, frames } = setup()
    frames.length = 0
    fake.advance(1000)
    expect(frames.length).toBeGreaterThanOrEqual(fxFps - 1)
    expect(frames.length).toBeLessThanOrEqual(fxFps + 1)
    expect(frames.every(({ moved }) => !moved)).toBe(true)
    const ticks = frames.map(({ tick }) => tick)
    expect(new Set(ticks).size).toBe(ticks.length)
  })

  it('runs at half rate while a panel is open', () => {
    const { fake, rig, frames } = setup()
    rig.setPanelOpen(true)
    frames.length = 0
    fake.advance(1000)
    expect(frames.length).toBeLessThanOrEqual(fxFps / 2 + 1)
    expect(frames.length).toBeGreaterThan(2)
  })

  it('schedules nothing while hidden and resumes when shown', () => {
    const { fake, rig, frames } = setup()
    rig.setHidden(true)
    expect(fake.pending).toBe(0)
    frames.length = 0
    fake.advance(1000)
    expect(frames).toHaveLength(0)
    rig.setHidden(false)
    expect(fake.pending).toBe(1)
    fake.advance(500)
    expect(frames.length).toBeGreaterThan(0)
  })

  it('cleans up: no pending frame after dispose, and none without subscribers', () => {
    const { fake, rig } = setup()
    expect(fake.pending).toBe(1)
    rig.dispose()
    expect(fake.pending).toBe(0)
    expect(rig.isRunning).toBe(false)

    const lone = fakeClock()
    const idle = new CampRig(lone.clock)
    idle.panTo(300, 200)
    expect(lone.pending).toBe(0)
    const unsubscribe = idle.subscribe(() => {})
    expect(lone.pending).toBe(1)
    unsubscribe()
    expect(lone.pending).toBe(0)
  })
})

describe('CampRig landfall', () => {
  it('starts high in the sky, descends to rest, and flares the fire at the end', () => {
    const { fake, rig, frames } = setup()
    rig.armLandfall()
    expect(rig.cameraY).toBe(300)
    expect(rig.landfallState).toBe('armed')
    rig.beginLandfall()
    expect(rig.landfallState).toBe('playing')
    frames.length = 0
    fake.advance(landfallDuration + 700)
    expect(rig.cameraY).toBe(0)
    expect(rig.landfallState).toBe('done')
    expect(rig.isAnimating).toBe(false)
    const ys = frames.map(({ cameraY }) => cameraY)
    expect(ys).toEqual(ys.toSorted((a, b) => b - a))
    expect(ys.some((y) => y > 0 && y < 300)).toBe(true)
    const flares = frames.map(({ flare }) => flare)
    expect(Math.max(...flares)).toBeGreaterThan(0.8)
    expect(flares.at(-1)).toBe(0)
  })

  it('does not wait on anything: it plays only after begin', () => {
    const { fake, rig } = setup()
    rig.armLandfall()
    fake.advance(2000)
    expect(rig.cameraY).toBe(300)
    expect(rig.landfallState).toBe('armed')
  })

  it('is skipped under reduced motion', () => {
    const { rig } = setup({ reduced: true })
    rig.armLandfall()
    rig.beginLandfall()
    expect(rig.landfallState).toBeNull()
    expect(rig.cameraY).toBe(0)
  })

  it('is cut short when reduced motion turns on mid-descent', () => {
    const { fake, rig } = setup()
    rig.armLandfall()
    rig.beginLandfall()
    fake.advance(300)
    rig.setReduced(true)
    expect(rig.cameraY).toBe(0)
    expect(rig.landfallState).toBe('done')
  })

  it('only arms once', () => {
    const { rig } = setup()
    rig.armLandfall()
    rig.beginLandfall()
    rig.armLandfall()
    expect(rig.landfallState).toBe('playing')
  })
})
