import { Component, lazy, Suspense, type ReactNode } from 'react'

import type { OrbitBounds } from './campaignOrbit'
import type { CampaignListItem } from './campaignTypes'

export type GalaxyProps = {
  planets: CampaignListItem[]
  orbitBounds: OrbitBounds | null
  targetId: string | null
  interactive: boolean
  onSelect: (id: string) => void
  selectedId: string | null
}

const GalaxyCanvas = lazy(() => import('./GalaxyCanvas'))

class GalaxyRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function GalaxyBackdrop(props: GalaxyProps) {
  return (
    <div aria-hidden="true" className="galaxy-backdrop">
      <GalaxyRenderBoundary>
        <Suspense fallback={null}>
          <GalaxyCanvas {...props} />
        </Suspense>
      </GalaxyRenderBoundary>
    </div>
  )
}
