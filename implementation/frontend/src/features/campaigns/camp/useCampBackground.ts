import { useCallback, useState } from 'react'
import { readBackground, writeBackground, type CampBackground } from './campBackground'

function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The player's background choice for one campaign, remembered on this device. */
export function useCampBackground(campaignId: string) {
  const [background, setBackground] = useState<CampBackground>(() =>
    readBackground(browserStorage(), campaignId),
  )
  const choose = useCallback(
    (next: CampBackground) => {
      setBackground(next)
      writeBackground(browserStorage(), campaignId, next)
    },
    [campaignId],
  )
  return [background, choose] as const
}
