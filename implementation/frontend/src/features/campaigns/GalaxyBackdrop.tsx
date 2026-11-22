import { Component, lazy, Suspense, type ReactNode, type RefObject } from 'react'

import { loadGalaxyCanvas } from './loadGalaxyCanvas'
import type { GalaxyPlanet } from './galaxyModel'
import type { ArrivalFlight, SceneBounds } from './orreryCamera'

export type GalaxyProps = {
  /** Every planet by slot, claimed or uncharted: the order of the orbits, outward from the hearth. */
  planets: GalaxyPlanet[]
  /** The part of the screen the controls leave clear, or null for all of it. */
  orbitBounds: SceneBounds | null
  /** The planet the scene treats as focal while nothing is selected. */
  targetSlot: number | null
  interactive: boolean
  motionReduced: boolean
  paused: boolean
  onAvailabilityChange: (ready: boolean) => void
  onSelect: (slot: number) => void
  selectedSlot: number | null
  /** Members of the selected campaign, shown as its moons once known. Uncharted planets have none. */
  memberCount: number | undefined
  /** The sign-in arrival, when the camera flies in rather than appearing on the chart. */
  arrival: RefObject<ArrivalFlight>
}

const GalaxyCanvas = lazy(loadGalaxyCanvas)

class GalaxyRenderBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFailure()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function GalaxyBackdrop(props: GalaxyProps) {
  return (
    <div aria-hidden="true" className="galaxy-backdrop">
      <GalaxyRenderBoundary onFailure={() => props.onAvailabilityChange(false)}>
        <Suspense fallback={null}>
          <GalaxyCanvas {...props} />
        </Suspense>
      </GalaxyRenderBoundary>
    </div>
  )
}
