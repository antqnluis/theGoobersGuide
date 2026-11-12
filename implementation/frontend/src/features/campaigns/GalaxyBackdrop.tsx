import { Component, lazy, Suspense, type ReactNode } from 'react'

import type { CampaignListItem } from './campaignTypes'
import type { SceneBounds } from './orreryCamera'

export type GalaxyProps = {
  /** Campaigns oldest first: the order of their orbits, outward from the hearth. */
  planets: CampaignListItem[]
  /** The part of the screen the controls leave clear, or null for all of it. */
  orbitBounds: SceneBounds | null
  targetId: string | null
  interactive: boolean
  motionReduced: boolean
  paused: boolean
  onAvailabilityChange: (ready: boolean) => void
  onSelect: (id: string) => void
  selectedId: string | null
  /** Members of the selected campaign, shown as its moons once known. */
  memberCount: number | undefined
}

const GalaxyCanvas = lazy(() => import('./GalaxyCanvas'))

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
