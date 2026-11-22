import { Component, lazy, Suspense, useSyncExternalStore, type ReactNode } from 'react'

import type { AuthSkyProps } from './AuthSkyCanvas'

const AuthSkyCanvas = lazy(() => import('./AuthSkyCanvas'))

class SkyRenderBoundary extends Component<
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

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

const canMatchMedia = () => typeof window.matchMedia === 'function'

function subscribeToMotion(onChange: () => void) {
  const query = canMatchMedia() ? window.matchMedia(reducedMotionQuery) : null
  if (typeof query?.addEventListener !== 'function') return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const prefersReducedMotion = () => canMatchMedia() && window.matchMedia(reducedMotionQuery).matches

/** Three needs WebGL 2, and the canvas needs to measure itself. Without them the page keeps its painted night and a CSS glow. */
const canDrawSky = () =>
  typeof window !== 'undefined' &&
  'WebGL2RenderingContext' in window &&
  typeof ResizeObserver !== 'undefined'

/**
 * The night behind the account pages: the galaxy's own deep sky, hearth star and
 * orbits. Decorative, so it is hidden from assistive technology, and the page
 * is complete without it.
 */
export function AuthSky(props: Omit<AuthSkyProps, 'motionReduced'>) {
  const motionReduced = useSyncExternalStore(subscribeToMotion, prefersReducedMotion, () => false)

  return (
    <div aria-hidden="true" className="auth-sky">
      {canDrawSky() && (
        <SkyRenderBoundary onFailure={() => props.onAvailabilityChange(false)}>
          <Suspense fallback={null}>
            <AuthSkyCanvas {...props} motionReduced={motionReduced} />
          </Suspense>
        </SkyRenderBoundary>
      )}
    </div>
  )
}
