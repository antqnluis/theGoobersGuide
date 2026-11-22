import { createContext, type RefObject } from 'react'
import type { ArrivalFlight } from '../campaigns/orreryCamera'
import type { SkyHandoff } from './skyHandoff'

/**
 * Where the sign-in arrival is. `departing` lifts the login page away, `flying`
 * glides the camera from the doorway's view to the chart, `landing` brings the controls in
 * while the camera finishes, `settling` lets the last of it land, and `fading` is the
 * reduced-motion crossfade.
 */
export type ArrivalStage = 'idle' | 'departing' | 'flying' | 'landing' | 'settling' | 'fading'

/** The login page as the person last saw it, kept to leave from. */
export type LoginSnapshot = {
  node: HTMLElement
  scrollY: number
  width: number
  height: number
  /** The sky's view when the page was left, if it drew one. */
  sky?: SkyHandoff | null
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
