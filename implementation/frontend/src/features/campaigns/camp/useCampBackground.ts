import { useCallback, useState } from 'react'
import {
  readBackground,
  readHue,
  writeBackground,
  writeHue,
  type CampBackground,
} from './campBackground'

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

/** The player's hue shift (degrees) for one campaign, remembered on this device. */
export function useCampHue(campaignId: string) {
  const [hue, setHue] = useState(() => readHue(browserStorage(), campaignId))
  const choose = useCallback(
    (next: number) => {
      setHue(next)
      writeHue(browserStorage(), campaignId, next)
    },
    [campaignId],
  )
  return [hue, choose] as const
}
