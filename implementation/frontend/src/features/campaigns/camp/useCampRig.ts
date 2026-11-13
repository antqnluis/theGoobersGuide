import { useEffect, useState } from 'react'
import { browserClock, CampRig } from './campRig'

/** Arrivals whose landfall has started, so a remount of the same entry never replays it. */
const playedLandfalls = new Set<string>()

const reducedMotion = '(prefers-reduced-motion: reduce)'

/**
 * The camp's single camera rig for this mount. It follows the page's
 * visibility and the reduced-motion preference, and stops its loop on unmount.
 * `landfallKey` arms the descent before the first frame, so the scene opens on the
 * night sky.
 */
export function useCampRig(landfallKey: string | null) {
  const [rig] = useState(() => {
    const query = window.matchMedia?.(reducedMotion)
    const created = new CampRig(browserClock, { reduced: query?.matches ?? false })
    if (landfallKey && !playedLandfalls.has(landfallKey)) created.armLandfall()
    return created
  })

  useEffect(() => {
    // Marked on mount, not render, so a double render never skips the descent.
    if (landfallKey) playedLandfalls.add(landfallKey)
  }, [landfallKey])

  useEffect(() => {
    const query = window.matchMedia?.(reducedMotion)
    const syncMotion = () => rig.setReduced(query?.matches ?? false)
    const syncVisibility = () => rig.setHidden(document.hidden)
    syncMotion()
    syncVisibility()
    query?.addEventListener('change', syncMotion)
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      query?.removeEventListener('change', syncMotion)
      document.removeEventListener('visibilitychange', syncVisibility)
      // Subscribers remove themselves; this only guarantees nothing is scheduled.
      rig.dispose()
    }
  }, [rig])

  return rig
}
