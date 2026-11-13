import { createContext, type RefObject } from 'react'
import type { ArrivalFlight } from '../campaigns/orreryCamera'

/**
 * Where the sign-in arrival is. `departing` takes the login page away,
 * `flying` runs the camera in, `settling` brings the controls back, and
 * `fading` is the reduced-motion crossfade.
 */
export type ArrivalStage = 'idle' | 'departing' | 'flying' | 'settling' | 'fading'

/** The login page as the person last saw it, kept to leave from. */
export type LoginSnapshot = {
  node: HTMLElement
  scrollY: number
  width: number
  height: number
}

export type ArrivalContextValue = {
  stage: ArrivalStage
  snapshot: LoginSnapshot | null
  flight: RefObject<ArrivalFlight>
  /** Starts the arrival for someone who has just signed in. */
  begin: (arrival: { userId: string; snapshot: LoginSnapshot | null }) => void
  /** The galaxy scene reports whether it can draw. */
  reportGalaxy: (ready: boolean) => void
  skip: () => void
}

const inertFlight: ArrivalFlight = { phase: 'off', progress: 1, finished: () => {} }

export const ArrivalContext = createContext<ArrivalContextValue>({
  stage: 'idle',
  snapshot: null,
  flight: { current: inertFlight },
  begin: () => {},
  reportGalaxy: () => {},
  skip: () => {},
})
