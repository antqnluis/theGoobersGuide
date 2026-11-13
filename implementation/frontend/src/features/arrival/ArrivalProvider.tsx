import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { campaignListOptions } from '../campaigns/campaignQueries'
import { loadGalaxyCanvas } from '../campaigns/loadGalaxyCanvas'
import { useAuth } from '../auth/useAuth'
import { ArrivalContext, type ArrivalStage, type LoginSnapshot } from './arrivalContext'
import { createArrivalController } from './arrivalController'

const reducedMotion = '(prefers-reduced-motion: reduce)'

export function ArrivalProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { isLoading, session } = useAuth()
  const [stage, setStage] = useState<ArrivalStage>('idle')
  const [snapshot, setSnapshot] = useState<LoginSnapshot | null>(null)
  const [controller] = useState(() =>
    createArrivalController({
      onStage: setStage,
      onSnapshot: setSnapshot,
      prefetch: (userId) => void queryClient.prefetchQuery(campaignListOptions(userId)),
    }),
  )

  useEffect(() => () => controller.dispose(), [controller])

  // While someone is on the login page the galaxy loads in the background.
  const signedOut = !isLoading && !session
  useEffect(() => {
    if (!signedOut) return
    const load = () => void loadGalaxyCanvas().catch(() => undefined)
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(load)
      return () => window.cancelIdleCallback(handle)
    }
    const handle = window.setTimeout(load, 300)
    return () => window.clearTimeout(handle)
  }, [signedOut])

  const begin = useCallback(
    ({ userId, snapshot }: { userId: string; snapshot: LoginSnapshot | null }) =>
      controller.begin({
        userId,
        snapshot,
        reducedMotion: window.matchMedia?.(reducedMotion).matches ?? false,
      }),
    [controller],
  )

  const flight = useMemo(() => ({ current: controller.flight }), [controller])

  const value = useMemo(
    () => ({
      stage,
      snapshot,
      flight,
      begin,
      reportGalaxy: controller.reportGalaxy,
      skip: controller.skip,
    }),
    [stage, snapshot, flight, begin, controller],
  )

  return <ArrivalContext.Provider value={value}>{children}</ArrivalContext.Provider>
}
