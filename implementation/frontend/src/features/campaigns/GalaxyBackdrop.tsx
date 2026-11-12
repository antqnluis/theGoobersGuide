import { Component, lazy, Suspense, type ReactNode } from 'react'

import type { OrbitBounds } from './campaignOrbit'
import type { CampaignListItem } from './campaignTypes'

export type GalaxyProps = {
  planets: CampaignListItem[]
  orbitBounds: OrbitBounds | null
  targetId: string | null
  interactive: boolean
  motionReduced: boolean
  paused: boolean
  onAvailabilityChange: (ready: boolean) => void
  onSelect: (id: string) => void
  selectedId: string | null
  stepDirection?: -1 | 1
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
