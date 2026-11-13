import type { ArrivalFlight } from '../campaigns/orreryCamera'
import type { ArrivalStage, LoginSnapshot } from './arrivalContext'

export const arrivalTiming = {
  /** The login page leaves and the dusk falls. */
  departMs: 1000,
  /** Longest the galaxy scene is waited for before the flight is dropped. */
  sceneWaitMs: 2600,
  /** Longest the flight may run if the camera never reports back. */
  flightLimitMs: 4500,
  /** Controls arriving after the flight. */
  settleMs: 650,
  /** The reduced-motion crossfade. */
  fadeMs: 250,
  /** Nothing about the arrival may outlast this. */
  totalLimitMs: 9000,
}

type Environment = {
  onStage: (stage: ArrivalStage) => void
  onSnapshot: (snapshot: LoginSnapshot | null) => void
  prefetch: (userId: string) => void
}

/**
 * The arrival's timeline. It holds no React state: the provider mirrors the
 * stage, and the camera rig reads and finishes the shared `flight`.
 */
export function createArrivalController({ onStage, onSnapshot, prefetch }: Environment) {
  const flight: ArrivalFlight = { phase: 'off', progress: 1, finished: () => {} }
  let stage: ArrivalStage = 'idle'
  let stageTimer: ReturnType<typeof setTimeout> | undefined
  let gateTimers: ReturnType<typeof setTimeout>[] = []
  let departed = false
  let sceneReady = false
  let sceneWaitOver = false

  function clearTimers() {
    clearTimeout(stageTimer)
    gateTimers.forEach(clearTimeout)
    gateTimers = []
  }

  function enter(next: ArrivalStage) {
    stage = next
    clearTimeout(stageTimer)
    if (next === 'flying') {
      stageTimer = setTimeout(() => {
        flight.phase = 'off'
        flight.progress = 1
        enter('settling')
      }, arrivalTiming.flightLimitMs)
    } else if (next === 'settling') {
      stageTimer = setTimeout(() => enter('idle'), arrivalTiming.settleMs)
    } else if (next === 'fading') {
      stageTimer = setTimeout(() => enter('idle'), arrivalTiming.fadeMs)
    } else if (next === 'idle') {
      clearTimers()
      flight.phase = 'off'
      flight.progress = 1
      onSnapshot(null)
    }
    onStage(next)
  }

  // Takes off once the page has gone and the scene can draw; gives up on the
  // flight, never on the arrival, if the scene is slow or missing.
  function evaluate() {
    if (stage !== 'departing' || !departed) return
    if (sceneReady) {
      flight.phase = 'flying'
      flight.progress = 0
      enter('flying')
    } else if (sceneWaitOver) {
      flight.phase = 'off'
      flight.progress = 1
      enter('settling')
    }
  }

  flight.finished = () => {
    if (stage === 'flying') enter('settling')
  }

  return {
    /** Shared with the camera rig, which flies it and reports back when it lands. */
    flight,
    begin({
      userId,
      snapshot,
      reducedMotion,
    }: {
      userId: string
      snapshot: LoginSnapshot | null
      reducedMotion: boolean
    }) {
      if (stage !== 'idle') return
      prefetch(userId)
      if (reducedMotion) {
        if (!snapshot) return
        onSnapshot(snapshot)
        enter('fading')
        return
      }
      onSnapshot(snapshot)
      departed = false
      sceneReady = false
      sceneWaitOver = false
      flight.phase = 'waiting'
      flight.progress = 0
      enter('departing')
      gateTimers.push(
        setTimeout(() => {
          departed = true
          evaluate()
        }, arrivalTiming.departMs),
        setTimeout(() => {
          sceneWaitOver = true
          evaluate()
        }, arrivalTiming.sceneWaitMs),
        setTimeout(() => enter('idle'), arrivalTiming.totalLimitMs),
      )
    },
    reportGalaxy(ready: boolean) {
      sceneReady = ready
      if (!ready && stage === 'flying') {
        flight.phase = 'off'
        flight.progress = 1
        enter('settling')
      } else {
        evaluate()
      }
    },
    skip() {
      if (stage === 'departing' || stage === 'flying') {
        flight.phase = 'skipping'
        enter('settling')
      } else if (stage === 'fading') {
        enter('idle')
      }
    },
    getStage: () => stage,
    dispose() {
      clearTimers()
    },
  }
}
