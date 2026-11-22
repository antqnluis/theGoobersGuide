import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginSnapshot } from './arrivalContext'
import { arrivalTiming, createArrivalController } from './arrivalController'

const snapshot = { node: document.createElement('div') } as unknown as LoginSnapshot

function setup() {
  const stages: string[] = []
  const prefetch = vi.fn()
  const controller = createArrivalController({
    onStage: (stage) => stages.push(stage),
    onSnapshot: vi.fn(),
    prefetch,
  })
  return { controller, stages, prefetch }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('arrival timeline', () => {
  it('departs, flies once the scene is ready, then settles and ends', () => {
    const { controller, stages, prefetch } = setup()
    controller.begin({ userId: 'u1', snapshot, reducedMotion: false })
    expect(prefetch).toHaveBeenCalledWith('u1')
    expect(controller.flight.phase).toBe('waiting')

    controller.reportGalaxy(true)
    expect(controller.getStage()).toBe('departing')
    vi.advanceTimersByTime(arrivalTiming.departMs)
    expect(controller.getStage()).toBe('flying')
    expect(controller.flight.phase).toBe('flying')

    // The controls come in while the camera is still gliding.
    vi.advanceTimersByTime(arrivalTiming.landMs)
    expect(controller.getStage()).toBe('landing')
    expect(controller.flight.phase).toBe('flying')

    controller.flight.finished()
    expect(controller.getStage()).toBe('settling')
    vi.advanceTimersByTime(arrivalTiming.settleMs)
    expect(stages).toEqual(['departing', 'flying', 'landing', 'settling', 'idle'])
    expect(controller.flight.phase).toBe('off')
  })

  it('glides from the sky the page showed, and lets go of it at the end', () => {
    const { controller } = setup()
    const pose = { position: [0, 8, 28], target: [0, 0, 0], principal: [900, 300] }
    const sky = { pose, carry: 0.002 }
    controller.begin({
      userId: 'u1',
      snapshot: { ...snapshot, sky } as unknown as LoginSnapshot,
      reducedMotion: false,
    })
    expect(controller.flight.from).toBe(pose)
    expect(controller.flight.carry).toBe(0.002)
    controller.skip()
    vi.advanceTimersByTime(arrivalTiming.settleMs)
    expect(controller.getStage()).toBe('idle')
    expect(controller.flight.from).toBeNull()
  })

  it('can be skipped while the controls are coming in', () => {
    const { controller } = setup()
    controller.begin({ userId: 'u1', snapshot, reducedMotion: false })
    controller.reportGalaxy(true)
    vi.advanceTimersByTime(arrivalTiming.departMs + arrivalTiming.landMs)
    expect(controller.getStage()).toBe('landing')
    controller.skip()
    expect(controller.getStage()).toBe('settling')
    expect(controller.flight.phase).toBe('skipping')
  })

  it('drops the flight, not the arrival, when the scene never becomes ready', () => {
    const { controller } = setup()
    controller.begin({ userId: 'u1', snapshot, reducedMotion: false })
    vi.advanceTimersByTime(arrivalTiming.sceneWaitMs)
    expect(controller.getStage()).toBe('settling')
    expect(controller.flight.phase).toBe('off')
    vi.advanceTimersByTime(arrivalTiming.settleMs)
    expect(controller.getStage()).toBe('idle')
  })

  it('skips to the settle and hands the camera the remainder', () => {
    const { controller } = setup()
    controller.begin({ userId: 'u1', snapshot, reducedMotion: false })
    controller.skip()
    expect(controller.getStage()).toBe('settling')
    expect(controller.flight.phase).toBe('skipping')
    vi.advanceTimersByTime(arrivalTiming.settleMs)
    expect(controller.getStage()).toBe('idle')
  })

  it('crossfades without a flight when motion is reduced', () => {
    const { controller } = setup()
    controller.begin({ userId: 'u1', snapshot, reducedMotion: true })
    expect(controller.getStage()).toBe('fading')
    expect(controller.flight.phase).toBe('off')
    vi.advanceTimersByTime(arrivalTiming.fadeMs)
    expect(controller.getStage()).toBe('idle')
  })

  it('does nothing in reduced motion when there is no page to fade from', () => {
    const { controller } = setup()
    controller.begin({ userId: 'u1', snapshot: null, reducedMotion: true })
    expect(controller.getStage()).toBe('idle')
  })

  it('ends if the scene is lost mid-flight', () => {
    const { controller } = setup()
    controller.begin({ userId: 'u1', snapshot, reducedMotion: false })
    controller.reportGalaxy(true)
    vi.advanceTimersByTime(arrivalTiming.departMs)
    controller.reportGalaxy(false)
    expect(controller.getStage()).toBe('settling')
  })
})
