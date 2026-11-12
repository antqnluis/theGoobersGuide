import { Component, lazy, Suspense, type ReactNode } from 'react'

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

export function GalaxyBackdrop() {
  return (
    <div aria-hidden="true" className="galaxy-backdrop">
      <GalaxyRenderBoundary>
        <Suspense fallback={null}>
          <GalaxyCanvas />
        </Suspense>
      </GalaxyRenderBoundary>
    </div>
  )
}
